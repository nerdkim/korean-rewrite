/* 낱말 표에 적은 말을 글에서 찾는 도구입니다. IT 용어 표기, 어려운 한자어, 구어 낱말 규칙에서 공통으로 사용합니다. */
import { lineOf, stripQuoted } from '../text.mjs';

/* 낱말 바로 뒤에 붙는 접미사입니다. `test용`, `server별`, `token화`처럼 씁니다. */
const SUFFIX = '(?:들|용|별|상|간|내|중|시|화)';

/* 조사입니다. `에서는`, `으로도`처럼 셋까지 이어 붙여도 낱말 끝으로 봅니다. */
const PARTICLE =
  '(?:에게서|한테서|으로부터|로부터|으로서|로서|으로써|로써|이든지|든지|이라도|라도|이나마|나마|이야말로|야말로|이라는|라는|이라고|라고|에게|에서|에다가|에다|한테|께서|까지|부터|보다|처럼|마다|조차|마저|이나|이든|이랑|하고|밖에|대로|같이|끼리|만큼|이며|이고|이란|이요|이|가|을|를|은|는|의|에|께|으로|로|와|과|랑|도|만|나|든|뿐|며|고|란|요)';

/* 서술격 조사 `이다`가 붙은 꼴입니다. */
const COPULA =
  '(?:이?(?:다|고|며|면|라|란|라서|라도|라면|라는|라고|라며|지만|지|야|죠|자|니|니까|므로|나|거나|든|든지|어서|어야|어도|에요|여서|여야|여도)|예요|입니다|입니까|인|인데|인데도|인지|인가|인가요|일|일까|일지|일수록|임|(?:이었|였)[가-힣]{0,3})';

/* `-하다`, `-되다`, `-시키다`가 붙은 꼴입니다. `모델하우스`처럼 `하` 뒤에 어미가 아닌 글자가 오면 다른 낱말로 봅니다. */
const VERB = '(?:(?:하|되)[고는니다며면여였어었자지게기도겠던려시세셔셨십실신므더나든라느거되]|[한할함합해했됨된될됩돼됐]|시[키킨킬켜켰킵킴])[가-힣]*';

/* 낱말 뒤에 이어진 한글이 접미사, 조사, 어미뿐인지 봅니다. `머지않아`, `캐시백`, `빌드업`, `리포트`처럼 다른 낱말이 이어지면 잡지 않습니다. */
const REST = new RegExp(`^${SUFFIX}{0,2}(?:${PARTICLE}{1,3}|${COPULA}|${VERB})?$`, 'u');

/* 한글이나 숫자가 바로 앞에 붙은 자리는 다른 낱말의 일부로 봅니다. `1분기`, `블로그`, `나머지`가 그런 예입니다. */
const WORD_START = /(?<![가-힣0-9])[가-힣]/gu;

/* 항목 앞에 붙이는 표시입니다. `_` 표시를 붙인 항목은 조사나 어미 없이 홀로 쓴 낱말만 잡습니다. `^` 표시를 붙인 항목은 그 가운데 문장 첫머리에 쓴 낱말만 잡습니다. `-` 표시를 붙인 항목은 앞말에 붙여 쓴 어미만 잡습니다. */
const PREFIX_KINDS = { _: 'alone', '^': 'start', '-': 'ending' };

/* 표의 왼쪽 값을 `|`로 나눠 찾을 꼴을 만듭니다. */
function formsOf(key) {
  return key
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const kind = PREFIX_KINDS[part[0]];
      return kind === undefined ? { text: part, kind: 'word' } : { text: part.slice(1).trim(), kind };
    })
    .filter((form) => form.text.length > 0);
}

/* 줄 앞의 목록 표시, checkbox, 제목 표시, 인용 표시입니다. */
const LINE_MARKER = '(?:(?:[-*+]|\\d+[.)])[ \\t]+(?:\\[[ xX]\\][ \\t]+)?|#{1,6}[ \\t]+|>[ \\t]*)';

/* 낱말 바로 앞에 붙는 굵은 글씨, 기울임, link를 여는 표시입니다. */
const OPENER = '(?:\\*\\*|__|\\*|_|\\[)*';

/* 문장을 끝내는 부호와 그 뒤에 붙는 닫는 따옴표, 괄호, 굵은 글씨 표시입니다. */
const SENTENCE_END = '[.!?]["\'”’)\\]*_]*';

/* 문장 끝 부호 뒤의 자리입니다. */
const AFTER_SENTENCE_END = new RegExp(`${SENTENCE_END}[ \\t]+${OPENER}$`, 'u');

/* 표 칸의 첫머리입니다. */
const CELL_START = new RegExp(`\\|[ \\t]*${OPENER}$`, 'u');

/* `- **이름:** `, `**이름**: `처럼 굵은 글씨로 쓴 항목 이름 바로 뒤입니다. */
const AFTER_BOLD_LABEL = new RegExp(`^[ \\t]*${LINE_MARKER}*(?:\\*\\*|__)[^\\n]*?(?:[:：](?:\\*\\*|__)|(?:\\*\\*|__)[:：])[ \\t]+${OPENER}$`, 'u');

/* 줄 앞의 표시와 여는 표시만 있는 자리입니다. 첫 번째 capture group은 줄 앞의 표시입니다. */
const LINE_HEAD = new RegExp(`^[ \\t]*(${LINE_MARKER}*)${OPENER}$`, 'u');

/* 앞 줄이 비었거나 문장, 제목, 표, HTML tag, 가로줄로 끝났는지 봅니다. 그렇지 않으면 이 줄은 앞 문장이 이어지는 줄입니다. */
function previousLineEnds(text, lineStart) {
  if (lineStart === 0) return true;
  const prevStart = text.lastIndexOf('\n', lineStart - 2) + 1;
  const prev = text.slice(prevStart, lineStart - 1).trim();
  if (prev.length === 0) return true;
  if (/^(?:#{1,6}(?:[ \t]|$)|\||<)/u.test(prev) || /[|>]$/u.test(prev) || /^(?:[-*_][ \t]*){3,}$/u.test(prev)) return true;
  return new RegExp(`(?:${SENTENCE_END}|[:：])$`, 'u').test(prev);
}

/*
 * 이 자리가 글, 줄, 문장의 첫머리인지 봅니다. 줄 앞의 목록 표시, 제목 표시, 인용 표시는 건너뜁니다.
 * `options.strict`가 true이면 표 칸의 첫머리, 굵은 글씨로 쓴 항목 이름 바로 뒤, 첫머리에 놓인 굵은 글씨나 link를 여는 표시 바로 뒤도 첫머리로 봅니다. 대신 앞 줄이 문장을 끝내지 않아 문장이 이어지는 줄에서는 줄의 첫머리를 첫머리로 보지 않습니다.
 */
export function isSentenceStart(text, index, options = {}) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const head = text.slice(lineStart, index);
  if (options.strict !== true) {
    if (/^[ \t]*(?:(?:[-*+]|\d+[.)])[ \t]+|#{1,6}[ \t]+|>[ \t]*)*$/u.test(head)) return true;
    return /[.!?]["'”’)\]]*[ \t]+$/u.test(head);
  }
  if (AFTER_SENTENCE_END.test(head)) return true;
  if (/^[ \t]*\|/u.test(head)) return CELL_START.test(head);
  if (AFTER_BOLD_LABEL.test(head)) return true;
  const m = LINE_HEAD.exec(head);
  if (m === null) return false;
  if (m[1].length > 0) return true;
  return previousLineEnds(text, lineStart);
}

/* 따옴표 안을 뺀 글에서 `term-exempt`에 적은 구절이 차지하는 구간입니다. */
function exemptSpans(text, phrases) {
  const spans = [];
  for (const phrase of phrases) {
    if (phrase.length === 0) continue;
    for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) spans.push([at, at + phrase.length]);
  }
  return spans;
}

/*
 * 여러 낱말 표를 한꺼번에 보고 찾은 자리를 돌려줍니다. 표마다 `{ map, rule }`을 넘깁니다.
 * 한 자리에서 여러 항목이 맞으면 가장 긴 항목 하나만 고릅니다. 그래서 `로그인`에서 `로그`를 따로 잡지 않고 `코드 리뷰`에서 `리뷰`를 따로 잡지 않습니다.
 * 따옴표 안과 `term-exempt`에 적은 구절 안에서 찾은 자리는 뺍니다.
 */
export function findTableWords(text, tables, exemptPhrases = []) {
  const plain = stripQuoted(text);
  const words = [];
  const endings = [];
  for (const { map, rule } of tables) {
    for (const [key, right] of map ?? []) {
      for (const form of formsOf(key)) {
        const entry = { key, right, rule, form: form.text, kind: form.kind };
        (form.kind === 'ending' ? endings : words).push(entry);
      }
    }
  }
  /* 첫 글자로 항목을 묶고 긴 항목부터 맞춰 봅니다. */
  const byFirst = new Map();
  for (const entry of words.sort((a, b) => b.form.length - a.form.length)) {
    const list = byFirst.get(entry.form[0]) ?? [];
    list.push(entry);
    byFirst.set(entry.form[0], list);
  }

  const hits = [];
  const tail = /[가-힣]*/uy;
  let next = 0;
  for (const m of plain.matchAll(WORD_START)) {
    const at = m.index;
    if (at < next) continue;
    for (const entry of byFirst.get(plain[at]) ?? []) {
      if (!plain.startsWith(entry.form, at)) continue;
      const end = at + entry.form.length;
      tail.lastIndex = end;
      const rest = tail.exec(plain)[0];
      if (entry.kind === 'alone' || entry.kind === 'start') {
        if (rest.length > 0 || (plain[end] !== ' ' && plain[end] !== '\t')) continue;
        if (entry.kind === 'start' && !isSentenceStart(plain, at)) continue;
      } else if (!REST.test(rest)) continue;
      hits.push({ ...entry, index: at, end });
      next = end;
      break;
    }
  }
  for (const entry of endings) {
    const re = new RegExp(`(?<=[가-힣])${entry.form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![가-힣])`, 'gu');
    for (const m of plain.matchAll(re)) hits.push({ ...entry, index: m.index, end: m.index + m[0].length });
  }

  const spans = exemptSpans(plain, exemptPhrases);
  return hits
    .filter((hit) => !spans.some(([from, to]) => from <= hit.index && hit.end <= to))
    .sort((a, b) => a.index - b.index);
}

/* 대신 쓸 말이 여럿이면 `또는`으로 나눠 따로 인용합니다. */
export function quoteChoices(right) {
  return right
    .split(/\s+또는\s+/u)
    .map((choice) => choice.trim())
    .filter((choice) => choice.length > 0)
    .map((choice) => JSON.stringify(choice))
    .join(' 또는 ');
}

/* 찾은 자리 가운데 항목마다 가장 앞에 나온 자리 하나만 보고합니다. `describe`는 항목과 실제로 쓴 꼴을 받아 설명을 만듭니다. */
export function reportFirstPerEntry(text, hits, describe) {
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    const id = `${hit.rule}\n${hit.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ rule: hit.rule, detail: describe(hit, text.slice(hit.index, hit.end)), line: lineOf(text, hit.index) });
  }
  return out;
}

/* 낱말 하나가 통째로 표의 항목에 걸리는지 봅니다. IT 용어 표에 걸리는 낱말을 `loanword-spelling` 항목에서 건너뛸 때 씁니다. 그래야 두 규칙이 같은 낱말을 서로 다르게 고치라고 알리지 않습니다. */
export function tableCatchesWord(word, tables) {
  const hits = findTableWords(word, tables);
  return hits.some((hit) => hit.index === 0 && hit.end === word.length);
}
