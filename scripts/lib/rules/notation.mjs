/* 첫머리에 쓴 영어 낱말의 첫 글자, 금액 표기, 제목 형식을 봅니다. 세 규칙 모두 문법이 아니라 이 도구가 정한 기준입니다. */
import { escapeRe, lineOf, stripQuoted } from '../text.mjs';
import { isSentenceStart } from './terms.mjs';

/* 소문자로 시작하는 영어 낱말입니다. 앞에 영어 글자, 숫자, 경로나 식별자에 쓰는 기호가 붙은 자리는 낱말 중간으로 봅니다. */
const LOWER_WORD = /(?<![A-Za-z0-9_.\/@:\-#$%&+=~'’\\])[a-z][A-Za-z0-9_.\/@:\-]*/gu;

/* 경로, URL, 파일 이름, 식별자에 쓰는 기호와 숫자입니다. 이런 글자가 든 낱말은 코드로 보고 잡지 않습니다. */
const IDENTIFIER_CHAR = /[0-9_.\/@:\-]/u;

/*
 * 인라인 코드를 지운 자리를 `x`로 채운 글입니다. 첫머리인지 가릴 때 인라인 코드 바로 뒤의 낱말을 줄의 첫머리로 잘못 보지 않게 합니다.
 * 코드 블록처럼 줄 전체를 지운 줄은 빈 줄로 둡니다.
 */
function shapeOf(text, rawText) {
  if (typeof rawText !== 'string' || rawText.length !== text.length) return text;
  const rawLines = rawText.split('\n');
  return text
    .split('\n')
    .map((line, i) => {
      if (line.trim().length === 0) return line;
      const raw = rawLines[i] ?? '';
      let out = '';
      for (let j = 0; j < line.length; j += 1) out += line[j] === ' ' && raw[j] !== undefined && /\S/u.test(raw[j]) ? 'x' : line[j];
      return out;
    })
    .join('\n');
}

/* 이 자리가 든 줄에 한글이 있는지 봅니다. 영어로만 쓴 줄은 이 규칙으로 보지 않습니다. */
function lineHasHangul(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return /[가-힣]/u.test(text.slice(start, end === -1 ? text.length : end));
}

/*
 * 문장, 제목, 목록 항목, 표 칸의 첫머리와 굵은 글씨로 쓴 항목 이름 바로 뒤에서 소문자로 시작한 영어 낱말을 찾습니다.
 * 인라인 코드, 코드 블록, 따옴표 안, 경로와 식별자, `macOS`처럼 첫 글자가 아닌 자리에 대문자가 든 이름, `lowercase-start-exempt`에 적은 이름은 잡지 않습니다.
 * `lowercase-start-exempt` 키가 없는 규칙에서는 검사하지 않습니다.
 */
function lowercaseStartViolations(text, rules, rawText) {
  if (!Array.isArray(rules.lowercaseStartExempt)) return [];
  const exempt = new Set(rules.lowercaseStartExempt);
  const shape = shapeOf(text, rawText);
  const scan = stripQuoted(text);
  const out = [];
  for (const m of scan.matchAll(LOWER_WORD)) {
    let word = m[0];
    /* 문장 끝의 마침표는 낱말에서 뗍니다. `e.g.`처럼 마침표가 여럿인 낱말은 그대로 둡니다. */
    if (word.endsWith('.') && !IDENTIFIER_CHAR.test(word.slice(0, -1))) word = word.slice(0, -1);
    if (word.length < 2 || IDENTIFIER_CHAR.test(word) || /[A-Z]/u.test(word.slice(1)) || exempt.has(word)) continue;
    if (!lineHasHangul(shape, m.index) || !isSentenceStart(shape, m.index, { strict: true })) continue;
    const fixed = word[0].toUpperCase() + word.slice(1);
    out.push({
      rule: 'lowercase-start',
      detail: `문장 첫머리의 영어 낱말은 첫 글자를 대문자로 씁니다: ${JSON.stringify(word)} → ${JSON.stringify(fixed)}.`,
      line: lineOf(text, m.index),
    });
  }
  return out;
}

/*
 * 숫자 바로 뒤에 `currency-symbols`에 적은 통화 단위를 붙인 금액을 찾습니다. 숫자와 단위 사이에는 공백 하나까지 둘 수 있습니다.
 * `달러화`, `미국 달러`처럼 앞에 숫자가 없는 말, `1억 달러`처럼 숫자와 통화 단위 사이에 다른 글자가 낀 금액, 따옴표 안에 옮겨 적은 금액은 잡지 않습니다.
 */
function currencyViolations(text, rules) {
  const symbols = rules.currencySymbols ?? new Map();
  if (symbols.size === 0) return [];
  const scan = stripQuoted(text);
  const out = [];
  for (const [unit, symbol] of symbols) {
    if (unit.length === 0 || symbol.length === 0) continue;
    const re = new RegExp(`(?<![0-9.,$\\p{Sc}])(\\d{1,3}(?:,\\d{3})+|\\d+)(\\.\\d+)? ?${escapeRe(unit)}`, 'gu');
    for (const m of scan.matchAll(re)) {
      out.push({
        rule: 'currency-notation',
        detail: `금액은 통화 기호를 숫자 앞에 붙여 씁니다: ${JSON.stringify(m[0])} → ${JSON.stringify(`${symbol}${m[1]}${m[2] ?? ''}`)}.`,
        line: lineOf(text, m.index),
      });
    }
  }
  return out;
}

/* 받침으로 쓰는 자음을 Unicode 한글 음절 영역의 받침 순서대로 늘어놓았습니다. 첫 칸은 받침이 없는 음절에 해당합니다. */
const FINAL_CONSONANTS = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/* 자음 하나로 적은 어미가 가리키는 받침 번호입니다. 자음 하나가 아니면 0입니다. 호환용 자모(`ㄴ`)와 받침용 자모(`ᆫ`)를 모두 받습니다. */
function finalIndexOf(letter) {
  if (letter.length !== 1) return 0;
  const compat = FINAL_CONSONANTS.indexOf(letter);
  if (compat > 0) return compat;
  const code = letter.charCodeAt(0);
  return code >= 0x11a8 && code <= 0x11c2 ? code - 0x11a7 : 0;
}

/* 낱말 마지막 음절의 받침 번호입니다. 마지막 글자가 한글 음절이 아니면 -1입니다. */
function finalOf(word) {
  const code = word.charCodeAt(word.length - 1);
  return code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : -1;
}

/*
 * `heading-form-endings` 항목을 해석합니다. 앞의 `-`는 어미라는 표시이므로 떼고 `-(으)ㄴ 것`의 `(으)`처럼 괄호 안에 적은 글자도 뗍니다.
 * 항목을 공백으로 나눈 첫 조각은 낱말 끝에 오는 글자이고 그 뒤의 조각은 제목 끝에 그대로 와야 하는 낱말입니다. 첫 조각이 자음 하나이면 받침으로 봅니다.
 */
function parseHeadingEndings(entries) {
  const out = [];
  for (const entry of entries ?? []) {
    const label = entry.trim();
    const [tail = '', ...words] = label.replace(/^-/u, '').replace(/\([^()]*\)/gu, '').trim().split(/\s+/u);
    if (tail.length === 0) continue;
    out.push({ label, tail, final: finalIndexOf(tail), words });
  }
  return out;
}

/* 낱말로 나눈 제목이 항목의 꼴로 끝나는지 봅니다. 항목에 띄어 쓴 낱말이 있으면 그 낱말이 제목 끝 낱말과 같고 항목의 첫 조각이 그 앞 낱말의 끝에 와야 합니다. */
function endsWithForm(words, ending) {
  const k = ending.words.length;
  if (words.length <= k) return false;
  for (let j = 0; j < k; j += 1) {
    if (words[words.length - k + j] !== ending.words[j]) return false;
  }
  const word = words[words.length - k - 1];
  return ending.final > 0 ? finalOf(word) === ending.final : word.endsWith(ending.tail);
}

/*
 * `heading-form-exempt` 항목을 해석합니다. `alone`이 참인 낱말은 제목이 그 낱말 하나뿐일 때만 예외로 봅니다.
 * 앞에 `_`를 붙인 낱말과 `보기`처럼 잡을 꼴 가운데 띄어 쓰지 않은 꼴과 글자가 같은 낱말이 여기에 듭니다.
 */
function parseHeadingExempt(entries, bare) {
  const out = [];
  for (const entry of entries ?? []) {
    const alone = entry.trim().startsWith('_');
    const word = entry.trim().replace(/^_/u, '').trim().split(/\s+/u).join(' ');
    if (word.length === 0) continue;
    out.push({ word, alone: alone || bare.has(word) });
  }
  return out;
}

/* 제목 줄입니다. 줄 앞에 공백을 세 칸까지 두고 `#`을 한 개부터 여섯 개까지 쓴 뒤 공백을 둡니다. 따라서 `>`로 시작하는 인용 줄은 제목으로 보지 않습니다. */
const HEADING_LINE = /^ {0,3}#{1,6}[ \t]+(.*)\r?$/u;

/*
 * 제목을 낱말로 나눕니다. 판단에 쓰지 않는 표시는 먼저 뗍니다. 제목 끝에 닫는 표시로 붙인 `#`, 굵은 글씨와 기울임 표시, 끝의 `:`이나 `?` 같은 부호, 끝에 붙은 괄호 설명이 여기에 듭니다.
 * 인라인 코드는 `stripCode`가 이미 공백으로 바꿨으므로 따로 떼지 않습니다.
 */
function headingWords(content) {
  let s = content.replace(/(?:^|[ \t])#+[ \t]*$/u, '').replace(/\*\*|__/gu, '');
  let before;
  do {
    before = s;
    s = s.trim().replace(/^[*_]+|[*_]+$/gu, '').replace(/[.:!?。：！？]+$/u, '').replace(/(?:\([^()]*\)|（[^（）]*）)$/u, '');
  } while (s !== before);
  return s.split(/\s+/u).filter((word) => word.length > 0);
}

/*
 * Markdown 제목의 끝이 `heading-form-endings`에 적은 꼴이면 잡습니다. 코드 블록과 문서의 인용 구간은 `checkText`가 이미 공백으로 바꿨습니다.
 * 제목 끝이 `heading-form-exempt`에 적은 낱말이면 잡지 않습니다. 다만 `_보기`처럼 제목이 그 낱말 하나뿐일 때만 예외로 보는 낱말도 있습니다. 앞에 다른 낱말이 있으면 `## 써 보기`, `## 코드 보기`처럼 `보기`를 동사로 쓴 것으로 봅니다.
 * `heading-form-endings` 키가 없거나 값이 비어 있으면 검사하지 않습니다.
 */
function headingFormViolations(text, rules) {
  const endings = parseHeadingEndings(rules.headingFormEndings);
  if (endings.length === 0) return [];
  const bare = new Set(endings.filter((ending) => ending.words.length === 0 && ending.final === 0).map((ending) => ending.tail));
  const exempt = parseHeadingExempt(rules.headingFormExempt, bare);
  const out = [];
  text.split('\n').forEach((line, i) => {
    const m = HEADING_LINE.exec(line);
    if (m === null) return;
    const words = headingWords(m[1]);
    if (words.length === 0) return;
    const heading = words.join(' ');
    if (exempt.some(({ word, alone }) => heading === word || (!alone && heading.endsWith(` ${word}`)))) return;
    const ending = endings.find((candidate) => endsWithForm(words, candidate));
    if (ending === undefined) return;
    /*
     * 보고에는 인라인 코드를 지운 제목 줄을 보여 줍니다. PreToolUse hook은 바뀐 줄에서 인라인 코드를 지운 뒤 다시 검사하고 큰따옴표 안의 말로 같은 오류인지 가립니다.
     * 따라서 원문 제목을 보여 주면 인라인 코드가 든 제목 하나를 오류 두 건으로 보고합니다.
     */
    const shown = line.trim().replace(/\s+/gu, ' ');
    out.push({
      rule: 'heading-form',
      detail: `제목은 업무 문서식 명사구로 씁니다: ${JSON.stringify(shown)}. ${JSON.stringify(ending.label)} 꼴 대신 "설치 방법", "재설치", "설치 후 변경 사항"처럼 "법", "것", "때", "일"이 아닌 명사로 끝냅니다.`,
      line: i + 1,
    });
  });
  return out;
}

/* 세 규칙의 위반을 모읍니다. `rawText`는 인라인 코드를 지우기 전의 글입니다. */
export function notationViolations(text, rules, rawText) {
  return [...lowercaseStartViolations(text, rules, rawText), ...currencyViolations(text, rules), ...headingFormViolations(text, rules)];
}
