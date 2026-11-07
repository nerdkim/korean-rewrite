/* 첫머리에 쓴 영어 낱말의 첫 글자와 금액 표기를 봅니다. 두 규칙 모두 문법이 아니라 이 도구가 정한 표기입니다. */
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

/* 두 표기 규칙의 위반을 모읍니다. `rawText`는 인라인 코드를 지우기 전의 글입니다. */
export function notationViolations(text, rules, rawText) {
  return [...lowercaseStartViolations(text, rules, rawText), ...currencyViolations(text, rules)];
}
