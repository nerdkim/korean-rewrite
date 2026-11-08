#!/usr/bin/env node
/*
 * README에 싣는 설치 전후 비교 이미지를 만드는 script입니다.
 * 요청 원문, 두 답변, 비교 항목 파일을 읽어 HTML을 만듭니다. HTML에는 비교 항목마다 카드를 한 장씩 그립니다. 그다음 headless Chrome으로 이 HTML을 PNG로 저장합니다.
 * 이미지를 만들기 전에 비교 항목 파일의 형식을 확인하고 파일에 적은 구절을 답변에서 찾습니다. 이미지에 들어갈 문장도 검사기로 검사합니다.
 * 외부 package 없이 Node.js 표준 module과 이 repository의 `scripts/lib/` module만 씁니다.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { blockingViolations, checkText } from './lib/check.mjs';
import { isEntryPoint, rulesDocPath } from './lib/paths.mjs';
import { loadRules } from './lib/rules.mjs';

/* 이 도구의 repository root directory입니다. 기본 경로는 이 directory를 기준으로 정합니다. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* 비교 항목 파일과 PNG의 기본 경로입니다. */
const DEFAULT_ANNOTATIONS = 'docs/images/readme-compare.json';
const DEFAULT_OUT = 'docs/images/readme-compare.png';

/* `--out`에 `.png`로 끝나지 않는 경로를 주면 그 경로를 directory로 보고 이 이름으로 PNG를 저장합니다. */
const PNG_NAME = 'readme-compare.png';

const DEFAULT_CHROME = '/usr/bin/google-chrome';

/* 페이지의 CSS 폭과 device scale factor입니다. PNG의 폭은 WIDTH * SCALE px가 됩니다. */
const WIDTH = 900;
const SCALE = 2;

/* 카드의 두 열에 붙이는 이름과 오류 메시지에서 두 답변을 부르는 이름입니다. */
const LABELS = { left: '이 도구가 없는 프로젝트', right: '이 도구를 설치한 프로젝트' };
const SIDE_NAMES = { left: '왼쪽 답변', right: '오른쪽 답변' };

/* 이미지에 쓰는 글꼴입니다. 글꼴이 설치되지 않은 컴퓨터에서는 Chrome이 대체 글꼴로 그립니다. 그래서 이 script는 PNG를 저장한 뒤 실제로 쓰인 글꼴을 확인합니다. */
const FONTS = { sans: 'Noto Sans CJK KR', mono: 'Noto Sans Mono CJK KR' };

/* 비교 항목 번호마다 쓰는 글자 색과 배경색입니다. 항목 번호가 10을 넘으면 처음 색부터 다시 씁니다. */
const PALETTE = [
  ['#1f5fa8', '#dce9f8'],
  ['#6b3fa0', '#ece2f7'],
  ['#a34e00', '#fbe5cf'],
  ['#00756f', '#d2efeb'],
  ['#3949ab', '#e2e6f8'],
  ['#a3326b', '#f8dfeb'],
  ['#5a6a00', '#ecf0cc'],
  ['#8a5300', '#f5e8cc'],
  ['#0b6e8f', '#d5edf5'],
  ['#555f6b', '#e6e9ed'],
];

const USAGE = `사용법: node scripts/render-compare.mjs --request <경로> --left <경로> --right <경로> [option]
       node scripts/render-compare.mjs --self-check

  --request <경로>      요청 원문이 든 평가 입력 파일입니다.
  --left <경로>         이 도구가 없는 프로젝트에서 받은 답변의 results.json입니다.
  --right <경로>        이 도구를 설치한 프로젝트에서 받은 답변의 results.json입니다.
  --annotations <경로>  비교 항목 파일입니다. 기본값은 ${DEFAULT_ANNOTATIONS}입니다.
  --out <경로>          PNG 파일의 경로입니다. 기본값은 ${DEFAULT_OUT}입니다.
                        .png로 끝나지 않는 경로는 directory로 보고 그 안에 ${PNG_NAME} 파일을 저장합니다.
  --keep-html           PNG로 캡처한 HTML 파일을 지우지 않고 PNG와 같은 directory에 남깁니다.
                        파일 이름은 PNG 파일 이름에서 확장자만 .html로 바꾼 이름입니다.
  --run <번호>          results.json에서 읽을 run 번호입니다. 기본값은 1입니다.
  --check               비교 항목 파일만 검사하고 이미지는 만들지 않습니다.
  --chrome <경로>       Chrome 실행 파일입니다. 기본값은 ${DEFAULT_CHROME}입니다.
  --self-check          Chrome 없이 이 script의 자체 검사를 실행합니다.
  -h, --help            이 사용법을 보여 줍니다.

기본 경로는 이 도구의 repository root directory를 기준으로 정하고 option으로 준 상대 경로는 현재 directory를 기준으로 정합니다.`;

/* 사용법이 틀렸거나 입력과 검사 결과에 문제가 있어 멈출 때 던지는 오류입니다. Script는 이 오류를 받으면 stack trace 없이 메시지만 출력하고 `code` 값을 종료 코드로 씁니다. 사용법 오류는 2, 그 밖의 오류는 1입니다. */
class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

function readJson(path, shown = path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new CliError(`${shown}: 파일을 읽지 못했습니다. ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`${shown}: JSON 형식이 아닙니다. ${error.message}`);
  }
}

/* results.json의 `results`에서 `run` 값이 argument `run`과 같은 결과를 찾아 그 결과의 첫 답변을 돌려줍니다. */
function answerOf(data, run, shown) {
  const hits = (Array.isArray(data?.results) ? data.results : []).filter((result) => result?.run === run);
  if (hits.length !== 1) throw new CliError(`${shown}: \`results\`에서 \`run\` 값이 ${run}인 결과가 ${hits.length}개입니다. 정확히 하나여야 합니다.`);
  const answer = hits[0].answers?.[0];
  if (typeof answer?.text !== 'string') throw new CliError(`${shown}: \`run\` 값이 ${run}인 결과에 \`answers[0].text\` 값이 없습니다.`);
  return { id: answer.id, text: answer.text };
}

/* 평가 입력 파일에서 두 답변과 id가 같은 요청을 찾아 원문을 돌려줍니다. */
function requestOf(data, ids, shown) {
  if (ids[0] !== ids[1]) throw new CliError(`두 답변의 요청 id가 다릅니다(${ids.join(', ')}).`);
  const cases = Array.isArray(data) ? data : [data];
  const found = cases.find((item) => item?.id === ids[0]);
  if (typeof found?.prompt !== 'string') throw new CliError(`${shown}: \`id\` 값이 ${ids[0]}인 요청을 찾지 못했습니다.`);
  return found.prompt;
}

/* `needle`이 `haystack`에서 시작하는 위치를 모두 돌려줍니다. */
function occurrences(haystack, needle) {
  const found = [];
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) found.push(i);
  return found;
}

/*
 * 답변에서 구절의 위치를 찾습니다. 구절은 답변에 정확히 한 번 나와야 합니다.
 * 여러 번 나오는 낱말은 `{ "text": 낱말, "in": 그 낱말이 든 긴 구절 }`처럼 적으면 긴 구절 안에서 찾습니다.
 * 찾으면 `{ start, end }`를, 찾지 못하면 `{ error }`를 돌려줍니다.
 */
function locate(source, phrase) {
  const spec = typeof phrase === 'string' ? { text: phrase } : (phrase ?? {});
  const { text, in: scope } = spec;
  if (typeof text !== 'string' || text.length === 0) return { error: '구절이 비어 있거나 문자열이 아닙니다.' };
  let base = 0;
  let haystack = source;
  if (scope !== undefined) {
    if (typeof scope !== 'string' || scope.length === 0) return { error: '`in` 값이 비어 있거나 문자열이 아닙니다.' };
    const hits = occurrences(source, scope);
    if (hits.length === 0) return { error: `\`in\`에 적은 ${JSON.stringify(scope)} 구절을 답변에서 찾지 못했습니다.` };
    if (hits.length > 1) return { error: `\`in\`에 적은 ${JSON.stringify(scope)} 구절이 답변에 ${hits.length}번 나옵니다.` };
    base = hits[0];
    haystack = scope;
  }
  const where = scope === undefined ? '답변' : '`in` 구절';
  const hits = occurrences(haystack, text);
  if (hits.length === 0) return { error: `${where}에서 찾지 못했습니다.` };
  if (hits.length > 1) return { error: `${where}에 ${hits.length}번 나옵니다. 구절을 더 길게 적거나 \`in\`으로 범위를 좁혀 주십시오.` };
  return { start: base + hits[0], end: base + hits[0] + text.length };
}

/* 비교 항목과 구절 객체에 쓸 수 있는 key입니다. 철자가 틀린 key를 놓치지 않으려고 이 밖의 key는 오류로 봅니다. */
const ITEM_KEYS = new Set(['number', 'name', 'what', 'why', 'excerpt', 'left', 'right', 'leftNote', 'rightNote']);
const PHRASE_KEYS = new Set(['text', 'in']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/*
 * 비교 항목 파일의 내용을 검증하고 구절마다 답변에서의 위치를 찾습니다.
 * 문제를 하나 찾아도 멈추지 않고 모두 모아 `errors`로 돌려줍니다. `errors`가 비어 있을 때만 `items`를 그릴 수 있습니다.
 */
export function validateAnnotations(data, sources) {
  if (!isObject(data)) return { items: [], errors: ['최상위 값은 `items` 배열을 담은 객체여야 합니다.'] };
  const errors = Object.keys(data)
    .filter((key) => key !== 'items')
    .map((key) => `최상위 객체에 알 수 없는 key가 있습니다(${key}).`);
  if (!Array.isArray(data.items) || data.items.length === 0) return { items: [], errors: [...errors, '`items` 배열이 없거나 비어 있습니다.'] };
  const blocks = { left: parseBlocks(sources.left), right: parseBlocks(sources.right) };
  const numbers = new Set();
  const items = data.items.map((item, index) => {
    const number = item?.number;
    const where = Number.isInteger(number) ? `${number}번 항목` : `${index + 1}번째 항목`;
    if (!isObject(item)) {
      errors.push(`${where}: 비교 항목은 객체여야 합니다.`);
      return null;
    }
    for (const key of Object.keys(item)) if (!ITEM_KEYS.has(key)) errors.push(`${where}: 알 수 없는 key가 있습니다(${key}).`);
    if (!Number.isInteger(number) || number < 1) errors.push(`${where}: \`number\` 값은 1 이상의 정수여야 합니다.`);
    else if (numbers.has(number)) errors.push(`${where}: \`number\` 값이 다른 항목과 겹칩니다.`);
    numbers.add(number);
    for (const key of ['name', 'what', 'why']) {
      if (typeof item[key] !== 'string' || item[key].trim() === '') errors.push(`${where}: \`${key}\` 값은 비어 있지 않은 문자열이어야 합니다.`);
    }
    const excerpt = item.excerpt ?? 'sentence';
    if (!['sentence', 'phrase'].includes(excerpt)) errors.push(`${where}: \`excerpt\` 값은 \`sentence\`나 \`phrase\`여야 합니다.`);
    const ranges = { left: [], right: [] };
    for (const side of ['left', 'right']) {
      const note = item[`${side}Note`];
      if (note !== undefined && (typeof note !== 'string' || note.trim() === '')) {
        errors.push(`${where}: \`${side}Note\` 값은 비어 있지 않은 문자열이어야 합니다.`);
      }
      const phrases = item[side];
      if (!Array.isArray(phrases)) {
        errors.push(`${where}: \`${side}\` 배열이 없습니다.`);
        continue;
      }
      if (phrases.length === 0 && note === undefined) errors.push(`${where}: \`${side}\` 배열이 비어 있으면 \`${side}Note\` 값을 적어 주십시오.`);
      phrases.forEach((phrase, i) => {
        const label = `${where}, ${SIDE_NAMES[side]}의 ${i + 1}번째 구절`;
        if (isObject(phrase)) {
          for (const key of Object.keys(phrase)) if (!PHRASE_KEYS.has(key)) errors.push(`${label}: 알 수 없는 key가 있습니다(${key}).`);
        }
        const shown = JSON.stringify(typeof phrase === 'string' ? phrase : phrase?.text);
        const found = locate(sources[side], phrase);
        if (found.error) errors.push(`${label} ${shown}: ${found.error}`);
        else if (!visible(blocks[side], found)) errors.push(`${label} ${shown}: 화면에 보이는 글자가 없습니다.`);
        else ranges[side].push({ start: found.start, end: found.end, num: number });
      });
    }
    return { number, name: item.name, what: item.what, why: item.why, excerpt, leftNote: item.leftNote, rightNote: item.rightNote, ranges };
  });
  return { items, errors };
}

/* 구절이 화면에 글자로 보이는 범위와 겹치는지 봅니다. 제목의 `#`이나 코드 블록을 여닫는 줄만 가리키는 구절은 카드에 아무것도 칠하지 못합니다. */
function visible(blocks, range) {
  return blocks.some((block) => block.segments.some((seg) => seg.start < range.end && range.start < seg.end));
}

/* ---------- Markdown ---------- */

/* 이 script가 알아보는 Markdown 문법입니다. 답변에 자주 나오는 제목, 목록, 코드 블록, 표, 인용, 가로줄만 다룹니다. */
const RE = {
  fence: /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/,
  heading: /^ {0,3}(#{1,6})[ \t]+/,
  setext: /^ {0,3}(=+|-+)\s*$/,
  hr: /^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/,
  item: /^(\s*)([-*+]|\d{1,9}[.)])[ \t]+/,
  tableSep: /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/,
  quote: /^ {0,3}>[ \t]?/,
};

/* 줄마다 원문에서 시작하는 위치와 끝나는 위치를 함께 기록합니다. */
function splitLines(src) {
  const lines = [];
  let start = 0;
  for (;;) {
    const nl = src.indexOf('\n', start);
    const end = nl === -1 ? src.length : nl;
    lines.push({ start, end, text: src.slice(start, end) });
    if (nl === -1) return lines;
    start = nl + 1;
  }
}

const blank = (line) => line.text.trim() === '';

/* 줄이 새 블록을 시작하는지 봅니다. 문단과 목록 항목은 이런 줄을 만나면 끝납니다. */
function startsBlock(lines, i) {
  const t = lines[i].text;
  return (
    RE.fence.test(t) ||
    RE.heading.test(t) ||
    RE.hr.test(t) ||
    RE.item.test(t) ||
    RE.quote.test(t) ||
    (t.includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1].text))
  );
}

/* 표의 한 줄을 칸으로 나눕니다. 앞에 `\`가 붙은 `|`는 칸을 나누는 기호로 보지 않습니다. */
function tableRow(line) {
  const t = line.text;
  let i = 0;
  while (i < t.length && /\s/.test(t[i])) i++;
  if (t[i] === '|') i++;
  let j = t.length;
  while (j > i && /\s/.test(t[j - 1])) j--;
  if (j > i && t[j - 1] === '|' && t[j - 2] !== '\\') j--;
  const cells = [];
  let cellStart = i;
  for (let k = i; k <= j; k++) {
    if (k === j || (t[k] === '|' && t[k - 1] !== '\\')) {
      let a = cellStart;
      let b = k;
      while (a < b && /\s/.test(t[a])) a++;
      while (b > a && /\s/.test(t[b - 1])) b--;
      cells.push({ kind: 'cell', start: line.start + a, end: line.start + b });
      cellStart = k + 1;
    }
  }
  return cells;
}

/*
 * Markdown 글을 블록으로 나눕니다. 블록마다 원문 범위와 화면에 글자로 보이는 범위(`segments`)를 함께 기록합니다.
 * 제목의 `#`, 목록 기호, 코드 블록을 여닫는 줄은 `segments`에 넣지 않습니다.
 */
function parseBlocks(src) {
  const lines = splitLines(src);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) {
      i++;
      continue;
    }
    let m;
    if ((m = RE.fence.exec(line.text))) {
      const marker = m[1];
      const body = [];
      i++;
      while (i < lines.length && !lines[i].text.trim().startsWith(marker)) body.push(lines[i++]);
      const closing = i < lines.length ? lines[i++] : null;
      const start = body.length > 0 ? body[0].start : line.end;
      const end = body.length > 0 ? body[body.length - 1].end : line.end;
      blocks.push({ type: 'code', start: line.start, end: (closing ?? line).end, segments: [{ kind: 'code', start, end }] });
      continue;
    }
    if ((m = RE.heading.exec(line.text))) {
      const level = m[1].length;
      blocks.push({ type: 'heading', level, start: line.start, end: line.end, segments: [{ kind: 'heading', level, start: line.start + m[0].length, end: line.end }] });
      i++;
      continue;
    }
    if (RE.hr.test(line.text)) {
      blocks.push({ type: 'hr', start: line.start, end: line.end, segments: [] });
      i++;
      continue;
    }
    if (line.text.includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1].text)) {
      const rows = [tableRow(line)];
      i += 2;
      while (i < lines.length && !blank(lines[i]) && lines[i].text.includes('|')) rows.push(tableRow(lines[i++]));
      blocks.push({ type: 'table', rows, start: line.start, end: lines[i - 1].end, segments: rows.flat() });
      continue;
    }
    if ((m = RE.item.exec(line.text))) {
      const ordered = /\d/.test(m[2]);
      const first = ordered ? parseInt(m[2], 10) : 1;
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const mm = RE.item.exec(l.text);
        if (mm && /\d/.test(mm[2]) === ordered && !RE.hr.test(l.text)) {
          items.push({ kind: 'item', marker: mm[2], start: l.start + mm[0].length, end: l.end });
          i++;
        } else if (items.length > 0 && !blank(l) && !startsBlock(lines, i)) {
          items[items.length - 1].end = l.end;
          i++;
        } else break;
      }
      blocks.push({ type: 'list', ordered, first, start: line.start, end: lines[i - 1].end, segments: items });
      continue;
    }
    if (RE.quote.test(line.text)) {
      const parts = [];
      while (i < lines.length && RE.quote.test(lines[i].text)) {
        const l = lines[i++];
        parts.push({ kind: 'para', start: l.start + RE.quote.exec(l.text)[0].length, end: l.end });
      }
      blocks.push({ type: 'quote', start: line.start, end: lines[i - 1].end, segments: parts });
      continue;
    }
    const start = line.start;
    let end = line.end;
    i++;
    let setext = 0;
    while (i < lines.length && !blank(lines[i])) {
      if ((m = RE.setext.exec(lines[i].text))) {
        setext = m[1][0] === '=' ? 1 : 2;
        i++;
        break;
      }
      if (startsBlock(lines, i)) break;
      end = lines[i++].end;
    }
    if (setext > 0) blocks.push({ type: 'heading', level: setext, start, end: lines[i - 1].end, segments: [{ kind: 'heading', level: setext, start, end }] });
    else blocks.push({ type: 'para', start, end, segments: [{ kind: 'para', start, end }] });
  }
  return blocks;
}

/* 원문의 `a`부터 `b`까지에서 인라인 코드, 굵은 글씨, 기울임꼴, link를 찾아 node 목록으로 돌려줍니다. */
function parseInline(src, a, b) {
  const nodes = [];
  let i = a;
  let textStart = a;
  const flush = (end) => {
    if (end > textStart) nodes.push({ type: 'text', start: textStart, end });
  };
  while (i < b) {
    const c = src[i];
    if (c === '`') {
      let n = 1;
      while (src[i + n] === '`') n++;
      const close = src.indexOf('`'.repeat(n), i + n);
      if (close !== -1 && close + n <= b) {
        flush(i);
        nodes.push({ type: 'code', start: i + n, end: close });
        i = close + n;
        textStart = i;
        continue;
      }
      i += n;
      continue;
    }
    if (c === '*' && src[i + 1] === '*') {
      const close = src.indexOf('**', i + 2);
      if (close > i + 2 && close + 2 <= b) {
        flush(i);
        nodes.push({ type: 'strong', children: parseInline(src, i + 2, close) });
        i = close + 2;
        textStart = i;
        continue;
      }
    }
    if (c === '*' && src[i + 1] !== '*' && src[i + 1] !== undefined && !/\s/.test(src[i + 1])) {
      let close = src.indexOf('*', i + 1);
      while (close !== -1 && close < b && src[close + 1] === '*') close = src.indexOf('*', close + 2);
      if (close !== -1 && close < b && !/\s/.test(src[close - 1])) {
        flush(i);
        nodes.push({ type: 'em', children: parseInline(src, i + 1, close) });
        i = close + 1;
        textStart = i;
        continue;
      }
    }
    if (c === '[') {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(src.slice(i, b));
      if (m) {
        flush(i);
        nodes.push({ type: 'link', children: parseInline(src, i + 1, i + 1 + m[1].length) });
        i += m[0].length;
        textStart = i;
        continue;
      }
    }
    i++;
  }
  flush(b);
  return nodes;
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/* 비교 항목 번호를 보여 주는 배지입니다. */
const badge = (num, extra = '') => `<span class="badge c${num}${extra}">${num}</span>`;

/*
 * 원문의 `start`부터 `end`까지를 HTML로 바꾸고 구절에 든 글자는 그 비교 항목의 색으로 칠합니다.
 * `ctx`는 `{ src, ranges, clip, quotes }`입니다. 구절이 겹치면 더 짧은 구절의 색을 씁니다. `clip`이 있으면 그 범위 밖의 글자는 버립니다.
 */
function paintText(ctx, start, end) {
  if (ctx.clip) {
    start = Math.max(start, ctx.clip[0]);
    end = Math.min(end, ctx.clip[1]);
  }
  if (end <= start) return '';
  const cuts = new Set([start, end]);
  for (const r of ctx.ranges) {
    if (r.start > start && r.start < end) cuts.add(r.start);
    if (r.end > start && r.end < end) cuts.add(r.end);
  }
  const points = [...cuts].sort((x, y) => x - y);
  let html = '';
  for (let k = 0; k < points.length - 1; k++) {
    const p = points[k];
    const q = points[k + 1];
    const top = ctx.ranges
      .filter((r) => r.start <= p && q <= r.end)
      .reduce((best, r) => (best === null || r.end - r.start < best.end - best.start ? r : best), null);
    const text = escapeHtml(ctx.src.slice(p, q));
    html += top ? `<span class="hl c${top.num}">${text}</span>` : text;
  }
  return html;
}

/* 같은 비교 항목의 구절이 같은 줄에서 공백만 두고 이어지면 구절 하나로 합칩니다. 구절 사이의 공백도 함께 칠하므로 칠한 부분이 끊겨 보이지 않습니다. */
function mergeAdjacent(src, ranges) {
  const sorted = [...ranges].sort((x, y) => x.start - y.start);
  const merged = [];
  for (const r of sorted) {
    const prev = merged.findLast((m) => m.num === r.num);
    if (prev && prev.end <= r.start && /^[ \t]*$/.test(src.slice(prev.end, r.start))) prev.end = r.end;
    else merged.push({ ...r });
  }
  return merged;
}

function paintNodes(ctx, nodes) {
  return nodes
    .map((node) => {
      if (node.type === 'text') return paintText(ctx, node.start, node.end);
      if (node.type === 'code') {
        const inner = paintText(ctx, node.start, node.end);
        const quote = ctx.quotes && /[가-힣]/.test(ctx.src.slice(node.start, node.end));
        return inner ? `<code${quote ? ' class="q"' : ''}>${inner}</code>` : '';
      }
      const inner = paintNodes(ctx, node.children);
      if (!inner) return '';
      if (node.type === 'strong') return `<strong>${inner}</strong>`;
      if (node.type === 'em') return `<em>${inner}</em>`;
      return `<span class="link">${inner}</span>`;
    })
    .join('');
}

const paintInline = (ctx, start, end) => paintNodes(ctx, parseInline(ctx.src, start, end));

function paintBlock(ctx, block) {
  const seg = block.segments;
  switch (block.type) {
    case 'heading':
      return `<h${block.level}>${paintInline(ctx, seg[0].start, seg[0].end)}</h${block.level}>`;
    case 'para':
      return `<p>${paintInline(ctx, seg[0].start, seg[0].end)}</p>`;
    case 'code':
      return `<pre><code>${paintText(ctx, seg[0].start, seg[0].end)}</code></pre>`;
    case 'hr':
      return '<hr>';
    case 'quote':
      return `<blockquote><p>${seg.map((s) => paintInline(ctx, s.start, s.end)).join('<br>')}</p></blockquote>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const startAttr = block.ordered && block.first !== 1 ? ` start="${block.first}"` : '';
      return `<${tag}${startAttr}>${seg.map((s) => `<li>${paintInline(ctx, s.start, s.end)}</li>`).join('')}</${tag}>`;
    }
    case 'table': {
      const [head, ...rows] = block.rows;
      const row = (cells, tag) => `<tr>${cells.map((c) => `<${tag}>${paintInline(ctx, c.start, c.end)}</${tag}>`).join('')}</tr>`;
      return `<table><thead>${row(head, 'th')}</thead><tbody>${rows.map((r) => row(r, 'td')).join('')}</tbody></table>`;
    }
    default:
      return '';
  }
}

/* 요청 원문처럼 칠할 구절이 없는 Markdown 글 전체를 HTML로 바꿉니다. */
function renderMarkdown(src) {
  const ctx = { src, ranges: [] };
  return parseBlocks(src)
    .map((block) => paintBlock(ctx, block))
    .join('\n');
}

/* 설명 문장에서는 Markdown 문법 가운데 인라인 코드, 굵은 글씨, 기울임꼴, link만 HTML로 바꿉니다. 한글이 든 인라인 코드를 고정폭 글꼴로 보여 주면 글자 사이가 벌어지므로 본문 글꼴로 보여 줍니다. */
const renderPlain = (text) => paintInline({ src: text, ranges: [], quotes: true }, 0, text.length);

/* ---------- 카드에 넣을 발췌 ---------- */

/* `k` 위치의 글자가 문장을 끝내는 부호인지 봅니다. 닫는 따옴표와 괄호는 건너뜁니다. 숫자 바로 뒤의 마침표는 `1.2`의 소수점일 수 있으므로 문장 끝으로 보지 않습니다. */
function endsSentence(src, k, floor) {
  let j = k;
  while (j > floor && /["'”’)\]*`]/.test(src[j])) j--;
  return /[.?!。]/.test(src[j]) && !/\d/.test(src[j - 1] ?? '');
}

/* `seg` 안에서 `pos`가 든 문장이 시작하는 위치입니다. */
function sentenceStart(src, seg, pos) {
  for (let k = pos - 1; k > seg.start; k--) {
    if (/\s/.test(src[k]) && endsSentence(src, k - 1, seg.start)) {
      let s = k;
      while (s < pos && /\s/.test(src[s])) s++;
      return s;
    }
  }
  return seg.start;
}

/* `seg` 안에서 `pos`가 든 문장이 끝나는 위치입니다. */
function sentenceEnd(src, seg, pos) {
  for (let k = Math.max(pos - 1, seg.start); k < seg.end; k++) {
    if (endsSentence(src, k, seg.start) && (k + 1 >= seg.end || /\s/.test(src[k + 1]))) return k + 1;
  }
  return seg.end;
}

/* 코드 블록 안에서 `start`부터 `end`까지에 걸쳐 있는 줄 전체의 범위입니다. */
function lineBounds(src, seg, start, end) {
  const a = Math.max(seg.start, src.lastIndexOf('\n', start - 1) + 1);
  const nl = src.indexOf('\n', Math.max(end - 1, start));
  return [a, Math.min(seg.end, nl === -1 ? src.length : nl)];
}

/* 같은 segment 안에서 앞 발췌의 끝과 다음 발췌의 시작 사이가 이 글자 수 이하이면 두 발췌를 하나로 합칩니다. */
const MERGE_GAP = 400;

/*
 * 구절마다 카드에 보여 줄 발췌 범위를 정합니다.
 * `sentence` 방식은 구절이 든 문장 전체를 보여 줍니다. 구절이 제목이나 표 칸에 있으면 그 제목이나 칸 전체를 보여 줍니다. 코드 블록에 있으면 구절이 든 줄 전체를 보여 줍니다.
 * `phrase` 방식은 구절만 보여 줍니다.
 */
function excerptsFor(src, blocks, ranges, mode) {
  const segments = blocks.flatMap((block) => block.segments.map((seg) => ({ ...seg, block })));
  const segmentAt = (pos) => segments.find((seg) => seg.start <= pos && pos <= seg.end);
  const found = [];
  for (const r of ranges) {
    const first = segmentAt(r.start) ?? segments.find((seg) => seg.end > r.start);
    const last = segmentAt(r.end - 1) ?? first;
    let start = r.start;
    let end = r.end;
    if (mode !== 'phrase') {
      if (first.kind === 'code') start = lineBounds(src, first, r.start, r.end)[0];
      else if (first.kind === 'heading' || first.kind === 'cell') start = first.start;
      else start = sentenceStart(src, first, Math.max(r.start, first.start));
      if (last.kind === 'code') end = lineBounds(src, last, r.start, r.end)[1];
      else if (last.kind === 'heading' || last.kind === 'cell') end = last.end;
      else end = sentenceEnd(src, last, Math.min(r.end, last.end));
    }
    found.push({ first, last, start, end, ranges: [r] });
  }
  found.sort((x, y) => x.start - y.start);
  const merged = [];
  for (const ex of found) {
    const prev = merged[merged.length - 1];
    if (prev && mode !== 'phrase' && prev.last === ex.first && ex.start <= prev.end + MERGE_GAP) {
      prev.end = Math.max(prev.end, ex.end);
      prev.last = ex.last;
      prev.ranges.push(...ex.ranges);
    } else merged.push(ex);
  }
  return { list: merged, segments };
}

/* 발췌 하나를 HTML로 바꿉니다. `bare`가 true이면 제목 기호와 목록 기호 없이 글자만 그립니다. 굵은 글씨 같은 짧은 구절을 chip으로 보여 줄 때 씁니다. */
function renderExcerpt(src, segments, ex, bare = false) {
  const ctx = { src, ranges: ex.ranges, clip: [ex.start, ex.end] };
  const touched = segments.filter((seg) => seg.end > ex.start && seg.start < ex.end);
  return touched
    .map((seg) => {
      if (seg.kind === 'code') {
        const code = paintText(ctx, seg.start, seg.end);
        return bare ? `<code>${code}</code>` : `<pre><code>${code}</code></pre>`;
      }
      const body = paintInline(ctx, seg.start, seg.end);
      if (bare) return body;
      if (seg.kind === 'heading') return `<div class="ex-h"><span class="mk">${'#'.repeat(seg.level)}</span>${body}</div>`;
      if (seg.kind === 'item') return `<div class="ex-li"><span class="mk">${escapeHtml(seg.marker)}</span>${body}</div>`;
      return `<div class="ex-p">${body}</div>`;
    })
    .join(bare ? ' ' : '');
}

/* 카드 한 칸을 그립니다. 칸 이름 아래에 발췌를 놓고 `leftNote`나 `rightNote`가 있으면 그 문장을 덧붙입니다. */
function renderSide(src, blocks, item, side) {
  const ranges = mergeAdjacent(src, item.ranges[side]);
  const label = `<div class="sl">${LABELS[side]}</div>`;
  const text = item[`${side}Note`];
  const note = text ? `<div class="note">${renderPlain(text)}</div>` : '';
  if (ranges.length === 0) return label + note;
  const { list, segments } = excerptsFor(src, blocks, ranges, item.excerpt);
  if (item.excerpt === 'phrase') {
    return `${label}<div class="chips">${list.map((ex) => `<span class="chip">${renderExcerpt(src, segments, ex, true)}</span>`).join('')}</div>${note}`;
  }
  /* 제목만 담은 발췌가 이어지면 상자 하나에 모읍니다. */
  const boxes = [];
  for (const ex of list) {
    const html = renderExcerpt(src, segments, ex);
    const heading = ex.first.kind === 'heading' && ex.last.kind === 'heading';
    const prev = boxes[boxes.length - 1];
    if (heading && prev?.heading) prev.html += html;
    else boxes.push({ heading, html });
  }
  return `${label}${boxes.map((box) => `<div class="ex">${box.html}</div>`).join('')}${note}`;
}

/* ---------- HTML ---------- */

/* 비교 항목 번호마다 글자 색과 배경색을 CSS 변수로 정합니다. */
function paletteCss(items) {
  return items
    .map((item) => {
      const [ink, tint] = PALETTE[(item.number - 1) % PALETTE.length];
      return `.c${item.number}{--ink:${ink};--tint:${tint};}`;
    })
    .join('\n');
}

const BASE_CSS = `
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:#fff;}
body{width:${WIDTH}px;font-family:"${FONTS.sans}",sans-serif;color:#1f2328;font-size:13px;line-height:1.6;-webkit-font-smoothing:antialiased;word-break:keep-all;overflow-wrap:anywhere;}
code,pre{font-family:"${FONTS.mono}",monospace;}
.page{padding:24px 24px 28px;}
.request{background:#f6f8fa;border:1px solid #d8dee4;border-radius:6px;padding:8px 14px 2px;font-size:12px;line-height:1.6;color:#424a53;}
.request .label{font-size:10.5px;font-weight:700;color:#656d76;margin-bottom:2px;}
.request p{margin:0 0 6px;}
.request ul{margin:0 0 6px;padding-left:18px;}
.hl{background:var(--tint);border-bottom:2px solid var(--ink);-webkit-box-decoration-break:clone;box-decoration-break:clone;}
.badge{display:inline-block;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--ink);color:#fff;font:700 10px/16px "${FONTS.sans}",sans-serif;text-align:center;vertical-align:1px;margin:0 3px 0 1px;white-space:nowrap;font-style:normal;letter-spacing:0;}
.text code,.ex code,.chip code,.note code{background:#eff1f3;border-radius:4px;padding:1px 4px;font-size:0.88em;}
code.q{font-family:"${FONTS.sans}",sans-serif;font-size:0.95em;}
`;

const CARD_CSS = `
.card{margin-top:14px;border:1px solid #d0d7de;border-left:5px solid var(--ink);border-radius:6px;padding:10px 14px 12px;}
.card .title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;line-height:1.4;}
.badge.big{min-width:22px;height:22px;border-radius:11px;font-size:12px;line-height:22px;vertical-align:middle;margin:0;}
.pair{display:grid;grid-template-columns:1fr 1fr;column-gap:14px;margin-top:8px;align-items:start;}
.side{display:flex;flex-direction:column;gap:6px;min-width:0;}
.sl{font-size:11px;font-weight:700;color:#8c959f;line-height:1.4;margin-bottom:-2px;}
.ex{background:#f6f8fa;border-radius:5px;padding:6px 9px;font-size:12.5px;line-height:1.7;}
.ex pre{margin:0;font-size:11px;line-height:1.65;white-space:pre-wrap;word-break:normal;}
.ex-h{font-weight:700;}
.ex-h+.ex-h,.ex-p+.ex-p,.ex-li+.ex-li{margin-top:2px;}
.mk{color:#8c959f;font-family:"${FONTS.mono}",monospace;font-size:11px;font-weight:400;margin-right:6px;}
.chips{display:flex;flex-wrap:wrap;gap:6px;}
.chip{background:#f6f8fa;border-radius:5px;padding:3px 8px;font-size:12.5px;line-height:1.7;}
.note{color:#59636e;font-size:12.5px;line-height:1.6;padding:6px 9px;border:1px dashed #c4ccd4;border-radius:5px;}
.explain{display:grid;grid-template-columns:96px 1fr;column-gap:10px;row-gap:4px;margin:10px 0 0;font-size:12.5px;line-height:1.65;}
.explain dt{color:#59636e;font-weight:700;}
.explain dd{margin:0;}
`;

/* 요청 상자 아래에 비교 항목 카드를 차례로 놓은 HTML 문서입니다. 두 칸의 이름은 카드마다 붙이므로 맨 위에는 따로 두지 않습니다. */
function pageHtml(request, sources, items) {
  const blocks = { left: parseBlocks(sources.left), right: parseBlocks(sources.right) };
  const cards = items
    .map(
      (item) => `<section class="card c${item.number}">
<div class="title">${badge(item.number, ' big')}<span>${escapeHtml(item.name)}</span></div>
<div class="pair"><div class="side">${renderSide(sources.left, blocks.left, item, 'left')}</div><div class="side">${renderSide(sources.right, blocks.right, item, 'right')}</div></div>
<dl class="explain"><dt>달라진 점</dt><dd class="text">${renderPlain(item.what)}</dd><dt>달라진 이유</dt><dd class="text">${renderPlain(item.why)}</dd></dl>
</section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>설치 전후 비교</title>
<style>${BASE_CSS}
${paletteCss(items)}
${CARD_CSS}</style>
</head>
<body><main class="page">
<section class="request"><div class="label">요청</div>${renderMarkdown(request)}</section>
${cards}
</main></body>
</html>
`;
}

/* ---------- Chrome ---------- */

/* 글꼴을 모두 불러온 뒤 페이지 높이와 폭, 내용이 넘쳐 잘린 요소 수를 구합니다. */
const MEASURE = `document.fonts.ready.then(() => {
  const de = document.documentElement;
  const height = Math.ceil(Math.max(de.scrollHeight, document.body.scrollHeight, document.querySelector('main').getBoundingClientRect().bottom));
  const clipped = [...document.querySelectorAll('body *')].filter((el) => {
    const style = getComputedStyle(el);
    return style.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
  }).length;
  return { height, width: de.scrollWidth, clipped };
})`;

/* Chrome을 headless로 실행하고 `--remote-debugging-pipe`로 DevTools Protocol 명령을 주고받습니다. */
function startChrome(chromePath) {
  const profile = mkdtempSync(join(tmpdir(), 'render-compare-chrome-'));
  const args = [
    '--headless',
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    'about:blank',
  ];
  const child = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const gone = new Promise((done) => {
    child.once('exit', done);
    child.once('error', done);
  });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d;
  });
  const pending = new Map();
  const listeners = new Set();
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  let dead = null;
  const die = (reason) => {
    dead = reason;
    for (const { reject } of pending.values()) reject(new Error(`${reason}\n${stderr.trim()}`));
    pending.clear();
  };
  child.on('error', (error) => die(`Chrome을 실행하지 못했습니다. ${error.message}`));
  child.on('exit', (code) => die(`Chrome이 종료되었습니다(종료 코드 ${code}).`));
  /* Chrome은 명령의 응답과 event를 JSON 메시지로 보내고 메시지마다 끝에 NUL 문자를 붙입니다. */
  child.stdio[4].on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let zero;
    while ((zero = buffer.indexOf(0)) !== -1) {
      const message = JSON.parse(buffer.subarray(0, zero).toString('utf8'));
      buffer = buffer.subarray(zero + 1);
      if (message.id !== undefined && pending.has(message.id)) {
        const { resolve: done, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else done(message.result);
      } else for (const listener of listeners) listener(message);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((done, reject) => {
      if (dead) return reject(new Error(dead));
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} 응답을 30초 안에 받지 못했습니다.`));
      }, 30000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          done(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });
  const once = (method, sessionId) =>
    new Promise((done, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error(`${method} event를 30초 안에 받지 못했습니다.`));
      }, 30000);
      const listener = (message) => {
        if (message.method === method && message.sessionId === sessionId) {
          clearTimeout(timer);
          listeners.delete(listener);
          done(message.params);
        }
      };
      listeners.add(listener);
    });
  const close = async () => {
    if (!dead) {
      try {
        await send('Browser.close');
      } catch {
        /* 이미 닫혔으면 넘어갑니다. */
      }
    }
    /* Chrome은 종료하는 동안에도 profile directory에 파일을 씁니다. 그래서 profile directory는 Chrome process가 종료된 뒤에 지웁니다. Chrome이 5초 안에 종료되지 않으면 process를 강제로 종료합니다. */
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    await gone;
    clearTimeout(timer);
    rmSync(profile, { recursive: true, force: true });
  };
  return { send, once, close };
}

/* HTML 파일을 열어 페이지 전체를 PNG로 캡처합니다. 창 높이를 페이지 높이에 맞춘 뒤 캡처하므로 잘리는 곳이 없습니다. */
async function screenshot(chrome, htmlPath, pngPath) {
  const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => chrome.send(method, params, sessionId);
  const metrics = (height) => call('Emulation.setDeviceMetricsOverride', { width: WIDTH, height, deviceScaleFactor: SCALE, mobile: false });
  const measure = async () => (await call('Runtime.evaluate', { expression: MEASURE, awaitPromise: true, returnByValue: true })).result.value;

  await call('Page.enable');
  await metrics(1000);
  const loaded = chrome.once('Page.loadEventFired', sessionId);
  await call('Page.navigate', { url: pathToFileURL(htmlPath).href });
  await loaded;

  /* 창 높이를 바꾸면 페이지 높이가 달라질 수 있으므로 높이가 더 바뀌지 않을 때까지 최대 세 번 다시 맞춥니다. */
  let size = await measure();
  for (let tries = 0; tries < 3; tries++) {
    await metrics(size.height);
    const again = await measure();
    if (again.height === size.height) break;
    size = again;
  }
  const fonts = await usedFonts(call);
  const { data } = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(pngPath, Buffer.from(data, 'base64'));
  await chrome.send('Target.closeTarget', { targetId });
  return { ...size, fonts };
}

/* 글꼴을 확인할 요소입니다. 이 요소 안의 inline 요소에 든 글자도 함께 집계됩니다. */
const TEXT_BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,td,th,pre,dt,dd,.label,.title,.text,.ex-h,.ex-p,.ex-li,.chip,.note,.sl';

/* 글자가 든 요소마다 실제로 쓰인 글꼴을 Chrome에 물어 모읍니다. */
async function usedFonts(call) {
  await call('DOM.enable');
  await call('CSS.enable');
  const { root } = await call('DOM.getDocument', { depth: 1 });
  const { nodeIds } = await call('DOM.querySelectorAll', { nodeId: root.nodeId, selector: TEXT_BLOCKS });
  const families = new Set();
  for (const nodeId of nodeIds) {
    const { fonts } = await call('CSS.getPlatformFontsForNode', { nodeId });
    for (const font of fonts) families.add(font.familyName);
  }
  return [...families];
}

/* PNG header에서 폭과 높이를 읽습니다. */
function pngSize(path) {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

/* PNG에 페이지 전체가 지정한 글꼴로 rendering되었는지 확인하고 찾은 문제를 문장으로 돌려줍니다. */
function imageProblems(shot, png) {
  const problems = [];
  if (shot.width > WIDTH) problems.push(`페이지 폭이 ${shot.width}px로 ${WIDTH}px보다 넓어 오른쪽이 잘렸습니다.`);
  if (shot.clipped > 0) problems.push(`내용이 넘쳐 잘린 요소가 ${shot.clipped}개 있습니다.`);
  if (png.width !== WIDTH * SCALE || png.height !== shot.height * SCALE) {
    problems.push(`PNG 크기가 ${png.width}x${png.height}px로 페이지 크기의 ${SCALE}배가 아닙니다.`);
  }
  const others = shot.fonts.filter((family) => !Object.values(FONTS).includes(family));
  if (others.length > 0) problems.push(`지정하지 않은 글꼴이 쓰였습니다(${others.join(', ')}).`);
  if (!shot.fonts.includes(FONTS.sans)) problems.push(`${FONTS.sans} 글꼴이 쓰이지 않았습니다.`);
  return problems;
}

/* ---------- 이미지에 들어갈 문장 검사 ---------- */

/* 이미지에 들어가는 한국어 문장이 든 key입니다. `name`은 카드 제목이므로 앞에 `## ` 기호를 붙여 Markdown 제목으로 검사합니다. 그래서 제목 규칙도 적용됩니다. */
const PROSE_FIELDS = ['name', 'what', 'why', 'leftNote', 'rightNote'];

/* 비교 항목의 문장을 문서와 같은 규칙으로 검사합니다. 위반마다 어느 항목의 어느 key에서 찾았는지 `where`에 적어 돌려줍니다. */
function proseViolations(items, rules) {
  const found = [];
  for (const item of items) {
    for (const field of PROSE_FIELDS) {
      const value = item[field];
      if (typeof value !== 'string') continue;
      const text = field === 'name' ? `## ${value}` : value;
      for (const v of checkText(text, rules, 'doc')) found.push({ ...v, where: `${item.number}번 항목의 \`${field}\`` });
    }
  }
  return found;
}

/* 이미지에 들어갈 문장을 검사기로 검사합니다. 오류가 있으면 멈추고 경고는 출력만 합니다. */
function checkProse(items) {
  const rules = loadRules(rulesDocPath(ROOT));
  if (rules.source === null) throw new CliError(`${rules.reason} 그래서 이미지에 들어갈 문장을 검사하지 못했습니다.`);
  const found = proseViolations(items, rules);
  const errors = blockingViolations(found).length;
  const lines = found.map((v) => `  [${v.rule}] ${v.where}: ${v.detail}${v.severity === 'warning' ? ' (경고: 문맥에 맞으면 그대로 두어도 됩니다)' : ''}`);
  if (errors > 0) {
    throw new CliError([`이미지에 들어갈 문장에서 검사기가 오류 ${errors}건, 경고 ${found.length - errors}건을 찾았습니다.`, ...lines].join('\n'));
  }
  if (found.length > 0) console.log([`이미지에 들어갈 문장에서 검사기가 경고 ${found.length}건을 찾았습니다.`, ...lines].join('\n'));
  else console.log('이미지에 들어갈 문장에서 검사기가 찾은 오류와 경고가 없습니다.');
}

/* ---------- 자체 검사 ---------- */

/* 자체 검사에 쓰는 답변입니다. 제목, 문단, 목록, 코드 블록, 표, 인용, 가로줄이 하나씩 들어 있습니다. */
const SAMPLE = [
  '# 응답 시간 개선',
  '',
  '첫 문장입니다. 응답 시간은 1.2초였습니다. 셋째 문장입니다.',
  '',
  '- **굵은 항목**을 설명합니다.',
  '- 둘째 항목입니다.',
  '',
  '```sql',
  'SELECT * FROM orders;',
  '# 제목처럼 보이는 줄',
  '```',
  '',
  '| 이름 | 값 |',
  '| --- | --- |',
  '| `a<b>` | 2 |',
  '',
  '> 인용한 문장입니다.',
  '',
  '***',
].join('\n');

/* 자체 검사 case 목록을 돌려줍니다. Case마다 붙은 함수는 기대한 결과가 나오면 true를 돌려줍니다. Chrome은 실행하지 않습니다. */
function selfCheckCases() {
  const at = (text) => SAMPLE.indexOf(text);
  const range = (text) => ({ start: at(text), end: at(text) + text.length, num: 1 });
  const excerpts = (texts, mode = 'sentence') =>
    excerptsFor(SAMPLE, parseBlocks(SAMPLE), texts.map(range), mode).list.map((ex) => SAMPLE.slice(ex.start, ex.end));
  const sources = { left: SAMPLE, right: SAMPLE };
  const valid = () => ({
    items: [{ number: 1, name: '수치 표기', left: ['1.2초'], right: [], rightNote: '해당하는 문장이 없습니다.', what: '왼쪽은 수치를 씁니다.', why: '예로 든 항목입니다.' }],
  });
  /* 올바른 비교 항목 하나를 `change`로 고친 뒤 찾은 문제 가운데 `pattern`에 맞는 것이 있는지 봅니다. */
  const reports = (change, pattern) => {
    const data = valid();
    change(data, data.items[0]);
    return validateAnnotations(data, sources).errors.some((error) => pattern.test(error));
  };
  return [
    ['한 번 나오는 구절은 그 위치를 찾는다', () => locate(SAMPLE, '1.2초').start === at('1.2초') && locate(SAMPLE, '1.2초').end === at('1.2초') + 4],
    ['답변에 없는 구절은 찾지 못했다고 알린다', () => /찾지 못했습니다/.test(locate(SAMPLE, '없는 구절').error)],
    ['여러 번 나오는 구절은 나온 횟수를 알린다', () => /2번 나옵니다/.test(locate(SAMPLE, '항목').error)],
    ['`in`으로 범위를 좁히면 여러 번 나오는 구절도 찾는다', () => locate(SAMPLE, { text: '항목', in: '둘째 항목' }).start === at('둘째 항목') + 3],
    ['`in` 구절이 여러 번 나오면 알린다', () => /`in`에 적은 "문장입니다" 구절이 답변에 3번 나옵니다/.test(locate(SAMPLE, { text: '문장', in: '문장입니다' }).error)],
    ['빈 구절은 받지 않는다', () => typeof locate(SAMPLE, '').error === 'string'],
    ['Markdown 블록의 종류를 가린다', () => parseBlocks(SAMPLE).map((block) => block.type).join(',') === 'heading,para,list,code,table,quote,hr'],
    ['코드 블록 안에서 #으로 시작하는 줄은 제목으로 보지 않는다', () => parseBlocks(SAMPLE).filter((block) => block.type === 'heading').length === 1],
    ['굵은 글씨와 인라인 코드를 HTML로 바꾸고 특수 문자를 escape한다', () => {
      const html = renderMarkdown(SAMPLE);
      return html.includes('<strong>굵은 항목</strong>') && html.includes('<code>a&lt;b&gt;</code>');
    }],
    ['설명 문장에서 한글이 든 인라인 코드만 본문 글꼴로 보여 준다', () => renderPlain('`쿼리`와 `query`') === '<code class="q">쿼리</code>와 <code>query</code>'],
    ['문장 가운데의 구절은 소수점에서 끊지 않고 그 문장 전체를 보여 준다', () => excerpts(['1.2']).join('|') === '응답 시간은 1.2초였습니다.'],
    ['제목 안의 구절은 제목 줄 전체를 보여 준다', () => excerpts(['시간 개선']).join('|') === '응답 시간 개선'],
    ['코드 블록 안의 구절은 그 줄 전체를 보여 준다', () => excerpts(['orders']).join('|') === 'SELECT * FROM orders;'],
    ['`phrase` 방식은 구절만 보여 준다', () => excerpts(['1.2초'], 'phrase').join('|') === '1.2초'],
    ['같은 문단의 가까운 구절은 발췌 하나로 합친다', () => excerpts(['첫 문장', '셋째']).join('|') === '첫 문장입니다. 응답 시간은 1.2초였습니다. 셋째 문장입니다.'],
    ['올바른 비교 항목은 통과한다', () => validateAnnotations(valid(), sources).errors.length === 0],
    ['`number`가 겹치면 알린다', () => reports((data, item) => data.items.push({ ...item }), /`number` 값이 다른 항목과 겹칩니다/)],
    ['`what`이 빠지면 알린다', () => reports((data, item) => delete item.what, /`what` 값은 비어 있지 않은 문자열이어야 합니다/)],
    ['빈 구절 목록에 설명이 없으면 알린다', () => reports((data, item) => delete item.rightNote, /`rightNote` 값을 적어 주십시오/)],
    ['`excerpt` 값이 잘못되면 알린다', () => reports((data, item) => (item.excerpt = 'word'), /`excerpt` 값은 `sentence`나 `phrase`여야 합니다/)],
    ['알 수 없는 key를 알린다', () => reports((data, item) => (item.exerpt = 'phrase'), /알 수 없는 key가 있습니다\(exerpt\)/)],
    ['화면에 보이는 글자가 없는 구절을 알린다', () => reports((data, item) => (item.left = ['```sql']), /화면에 보이는 글자가 없습니다/)],
    ['이미지에 들어갈 문장의 오류에 항목 번호와 key를 붙인다', () => {
      const rules = loadRules(join(ROOT, 'docs', 'rules.md'));
      if (rules.source === null) return false;
      const errors = blockingViolations(proseViolations([{ number: 2, name: '말투', what: '왼쪽은 해요체를 씁니다.', why: '말투를 맞춰 주세요.' }], rules));
      return errors.some((v) => v.rule === 'wrong-register' && v.where === '2번 항목의 `why`') && errors.every((v) => v.where === '2번 항목의 `why`');
    }],
  ];
}

function selfCheck() {
  let failed = 0;
  for (const [label, fn] of selfCheckCases()) {
    let ok;
    let reason = '';
    try {
      ok = fn() === true;
    } catch (error) {
      ok = false;
      reason = ` (예외: ${error.message})`;
    }
    if (!ok) failed += 1;
    console.log(`${ok ? '  성공' : '  실패'} ${label}${reason}`);
  }
  console.log(failed === 0 ? '자체 검사를 모두 통과했습니다. Chrome은 실행하지 않았습니다.' : `자체 검사 ${failed}건이 실패했습니다.`);
  return failed === 0;
}

/* ---------- 실행 ---------- */

/* `--out` 값으로 PNG와 HTML의 경로를 정합니다. `.png`로 끝나지 않는 경로는 directory로 봅니다. HTML을 남기지 않으면 `html`은 null입니다. */
export function outputPaths(out, keepHtml) {
  const png = /\.png$/i.test(out) ? out : join(out, PNG_NAME);
  return { png, html: keepHtml ? png.replace(/\.png$/i, '.html') : null };
}

function parseOptions(argv) {
  try {
    return parseArgs({
      args: argv,
      options: {
        request: { type: 'string' },
        left: { type: 'string' },
        right: { type: 'string' },
        annotations: { type: 'string' },
        out: { type: 'string' },
        'keep-html': { type: 'boolean' },
        run: { type: 'string' },
        check: { type: 'boolean' },
        chrome: { type: 'string' },
        'self-check': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    }).values;
  } catch (error) {
    throw new CliError(`명령줄 option을 읽지 못했습니다. ${error.message}\n\n${USAGE}`, 2);
  }
}

/* 명령줄 option대로 실행하고 종료 코드를 돌려줍니다. */
async function main(argv) {
  const values = parseOptions(argv);
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values['self-check']) return selfCheck() ? 0 : 1;
  for (const key of ['request', 'left', 'right']) {
    if (!values[key]) throw new CliError(`--${key} option이 필요합니다.\n\n${USAGE}`, 2);
  }
  const run = Number(values.run ?? '1');
  if (!Number.isInteger(run) || run < 1) throw new CliError('--run 값은 1 이상의 정수여야 합니다.', 2);

  const left = answerOf(readJson(resolve(values.left), values.left), run, values.left);
  const right = answerOf(readJson(resolve(values.right), values.right), run, values.right);
  const request = requestOf(readJson(resolve(values.request), values.request), [left.id, right.id], values.request);
  const sources = { left: left.text, right: right.text };
  const annotationsShown = values.annotations ?? DEFAULT_ANNOTATIONS;
  const annotationsPath = values.annotations ? resolve(values.annotations) : join(ROOT, DEFAULT_ANNOTATIONS);
  const { items, errors } = validateAnnotations(readJson(annotationsPath, annotationsShown), sources);
  if (errors.length > 0) {
    throw new CliError([`${annotationsShown}: 비교 항목 파일에 문제가 ${errors.length}건 있습니다.`, ...errors.map((error) => `  - ${error}`)].join('\n'));
  }
  const phrases = items.reduce((sum, item) => sum + item.ranges.left.length + item.ranges.right.length, 0);
  console.log(`비교 항목 ${items.length}개에 적은 구절 ${phrases}개를 모두 답변에서 찾았습니다.`);
  checkProse(items);
  if (values.check) {
    console.log('--check를 주었으므로 이미지는 만들지 않았습니다.');
    return 0;
  }

  const { png, html } = outputPaths(values.out ? resolve(values.out) : join(ROOT, DEFAULT_OUT), values['keep-html'] === true);
  const chromePath = values.chrome ?? DEFAULT_CHROME;
  if (!existsSync(chromePath)) throw new CliError(`Chrome 실행 파일이 없습니다(${chromePath}).\n--chrome으로 Chrome 실행 파일의 경로를 지정해 주십시오.`);
  mkdirSync(dirname(png), { recursive: true });
  /* HTML을 남기지 않으면 HTML 파일을 임시 directory에 저장하고 PNG로 캡처한 뒤 그 directory를 지웁니다. */
  const work = html === null ? mkdtempSync(join(tmpdir(), 'render-compare-')) : null;
  const htmlPath = html ?? join(work, 'page.html');
  let shot;
  try {
    writeFileSync(htmlPath, pageHtml(request, sources, items));
    const chrome = startChrome(chromePath);
    try {
      shot = await screenshot(chrome, htmlPath, png);
    } finally {
      await chrome.close();
    }
  } finally {
    if (work !== null) rmSync(work, { recursive: true, force: true });
  }
  const size = pngSize(png);
  console.log(`${png}: ${size.width}x${size.height}px (CSS ${WIDTH}x${shot.height}px, ${Math.round(size.bytes / 1024)}KB, 글꼴 ${shot.fonts.join(', ')})`);
  if (html !== null) console.log(`${html}: PNG로 캡처한 HTML 파일입니다.`);
  const problems = imageProblems(shot, size);
  if (problems.length > 0) throw new CliError([`PNG를 만들었지만 문제가 ${problems.length}건 있습니다.`, ...problems.map((problem) => `  - ${problem}`)].join('\n'));
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error instanceof CliError ? error.message : (error?.stack ?? String(error)));
      process.exitCode = error instanceof CliError ? error.code : 1;
    },
  );
}
