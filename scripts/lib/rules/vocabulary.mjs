/* 낱말 선택을 봅니다. */
import { escapeRe, lineOf, stripQuoted } from '../text.mjs';
import { findTableWords, quoteChoices, reportFirstPerEntry, tableCatchesWord } from './terms.mjs';

/* 한국어로 용어를 정의하거나 풀이하는 표현입니다. */
const KOREAN_DEFINING = /(이란|란\s|뜻|가리킵니다|가리키는|말합니다|의미합니다|이라고 부르|라고 부르|풀어 쓰면|즉)/u;

export function hasGlossNear(text, index, termLength) {
  const from = Math.max(0, index - 80);
  const to = Math.min(text.length, index + termLength + 260);
  const win = text.slice(from, to);
  if (/\([^)]*[가-힣][^)]*\)/u.test(win)) return true;
  return KOREAN_DEFINING.test(win);
}

/* 찾을 표현과 대신 쓸 표현을 짝지은 규칙들을 같은 방식으로 글에 적용합니다. 찾을 표현이 글에 있으면 대신 쓸 표현으로 바꾸라고 알립니다. `skip`이 true를 돌려주는 항목은 건너뜁니다. */
function substitutionViolations(text, map, rule, describe, skip = () => false) {
  const out = [];
  for (const [wrong, right] of map) {
    if (skip(wrong)) continue;
    const idx = text.indexOf(wrong);
    if (idx === -1) continue;
    out.push({ rule, detail: describe(wrong, right), line: lineOf(text, idx) });
  }
  return out;
}

/* 이용자 공지처럼 일반 독자가 읽는 파일에서 IT 용어 표 규칙을 끄는 방법입니다. 문서와 주석에서 처음 찾은 `transliteration` 위반의 설명 하나에만 덧붙입니다. */
const GENERAL_READER_HINT =
  ' 이용자 공지처럼 일반 독자가 읽는 파일이면 규칙 문서의 `general-reader-globs`에 경로를 적습니다. 문서 파일은 첫머리에 `<!-- korean-style: general-reader -->` 줄을 넣어도 됩니다. 경로를 적거나 이 줄을 넣은 파일에는 이 규칙을 적용하지 않습니다.';

/* 대신 쓸 말이 마침표로 끝나는 문장이면 그 문장을 그대로 보여 주고 아니면 대신 쓸 말을 따옴표로 감싸 보여 줍니다. */
function replacement(shown, right) {
  if (right.length === 0) return `${JSON.stringify(shown)}.`;
  if (right.endsWith('.')) return `${JSON.stringify(shown)}. ${right}`;
  return `${JSON.stringify(shown)} → ${quoteChoices(right)}.`;
}

/* 낱말 표 규칙의 설명입니다. */
const TABLE_DETAIL = {
  transliteration: (shown, right) => `IT 용어를 한글 음차로 썼습니다: ${replacement(shown, right)} 개발자가 읽는 글에서는 IT 용어를 영어 원어로 씁니다.`,
  'ambiguous-transliteration': (shown, right) =>
    `IT 용어의 한글 음차일 수 있습니다: ${replacement(shown, right)} IT 용어로 썼으면 영어 원어로 쓰고 일반 뜻으로 썼으면 그대로 둡니다.`,
  'loose-translation': (shown, right) =>
    `IT 용어를 번역어로 썼을 수 있습니다: ${replacement(shown, right)} IT 용어로 썼으면 영어 원어로 쓰고 일반 뜻으로 썼으면 그대로 둡니다.`,
  'hanja-word': (shown, right) => `한자 관형사나 어려운 한자어를 썼습니다: ${replacement(shown, right)}`,
  colloquial: (shown, right) => `구어 표현을 썼습니다: ${replacement(shown, right)} 격식 있는 문어체로 씁니다.`,
};

/*
 * `options.terms`가 false이면 IT 용어 표 규칙(`transliteration`, `ambiguous-transliteration`, `loose-translation`)을 건너뜁니다. 일반 독자가 읽는 글을 검사할 때는 이 값이 false입니다.
 * `options.termsBlocking`은 호출하는 함수가 `transliteration` 위반을 오류로 보고할 때 true입니다. 이때는 같은 낱말을 고치라는 `loanword-spelling` 항목을 건너뛰어 대신 쓸 말을 하나만 알립니다.
 * `options.hint`가 true이면 처음 찾은 `transliteration` 위반의 설명에 일반 독자용 파일에서 이 규칙을 끄는 방법을 덧붙입니다.
 */
export function vocabularyViolations(text, rules, target, options = {}) {
  const { terms = true, termsBlocking = true, hint = false } = options;
  const out = [];
  const human = target === 'chat';
  const blockingTable = [{ map: rules.bannedTransliteration, rule: 'transliteration' }];
  const dedupe = terms && termsBlocking && rules.bannedTransliteration.size > 0;

  /* 1) 외래어 표기입니다. */
  out.push(
    ...substitutionViolations(
      text,
      rules.loanwordSpelling,
      'loanword-spelling',
      (wrong, right) =>
        `이 프로젝트에서 정한 외래어 표기와 다릅니다: ${JSON.stringify(wrong)} → ${JSON.stringify(right)}.`,
      (wrong) => dedupe && tableCatchesWord(wrong, blockingTable),
    ),
  );

  /* 2) IT 용어 표입니다. 음차, 일반 뜻도 있는 음차, 번역어를 한꺼번에 찾아 한 자리에서 가장 긴 항목 하나만 고릅니다. 따옴표 안에 옮겨 적은 말은 보지 않습니다. */
  if (terms) {
    const tables = [
      ...blockingTable,
      { map: rules.ambiguousTransliteration ?? new Map(), rule: 'ambiguous-transliteration' },
      { map: rules.bannedTranslation, rule: 'loose-translation' },
    ];
    let hinted = !hint;
    out.push(
      ...reportFirstPerEntry(text, findTableWords(text, tables, rules.termExempt ?? []), (hit) => {
        let detail = TABLE_DETAIL[hit.rule](hit.form, hit.right);
        if (!hinted && hit.rule === 'transliteration') {
          detail += GENERAL_READER_HINT;
          hinted = true;
        }
        return detail;
      }),
    );
  }

  /* 3) 틀리지는 않았지만 이 프로젝트에서 쓰는 표기가 아닌 것입니다. */
  if (human) {
    out.push(
      ...substitutionViolations(
        text,
        rules.requiredSpelling,
        'required-spelling',
        (wrong, right) => `이 프로젝트에서 쓰는 표기가 아닙니다: ${JSON.stringify(wrong)} → ${JSON.stringify(right)}.`,
      ),
    );
  }

  /* 4) 한자 관형사, 어려운 한자어, 구어 표현입니다. 일반 독자가 읽는 글에도 적용합니다. */
  const styleTables = [
    { map: rules.hanjaWords ?? new Map(), rule: 'hanja-word' },
    { map: rules.colloquialWords ?? new Map(), rule: 'colloquial' },
  ];
  out.push(
    ...reportFirstPerEntry(text, findTableWords(text, styleTables, rules.termExempt ?? []), (hit) =>
      TABLE_DETAIL[hit.rule](hit.form, hit.right),
    ),
  );

  /* 5) 낱말이 아닌 철자입니다. */
  out.push(
    ...substitutionViolations(
      stripQuoted(text),
      rules.knownTypos,
      'known-typo',
      (wrong, right) =>
        `오타입니다: ${JSON.stringify(wrong)} → ${JSON.stringify(right)}.`,
    ),
  );

  /* 6) 차별 소지가 있는 용어입니다. */
  for (const [wrong, right] of rules.inclusiveTerms) {
    const re = new RegExp(`(^|[^0-9A-Za-z_])${escapeRe(wrong)}(?![0-9A-Za-z_])`, 'iu');
    const m = re.exec(text);
    if (m === null) continue;
    out.push({
      rule: 'inclusive-term',
      detail: `차별 소지가 있는 용어입니다: ${JSON.stringify(m[0].slice(m[1].length))} → ${JSON.stringify(right)}.`,
      line: lineOf(text, m.index + m[1].length),
    });
  }

  /* 7) 설명 없이 쓴 용어입니다. */
  for (const term of rules.needsGloss) {
    const re = new RegExp(`(^|[^0-9A-Za-z_-])${escapeRe(term)}([^0-9A-Za-z_-]|$)`, 'iu');
    const m = re.exec(text);
    if (m === null) continue;
    const at = m.index + m[1].length;
    if (hasGlossNear(text, at, term.length)) continue;
    out.push({
      rule: 'unexplained-term',
      detail: `설명 없이 쓴 용어입니다: ${JSON.stringify(term)}. 처음 나올 때 괄호나 한 문장으로 뜻을 설명하십시오.`,
      line: lineOf(text, at),
    });
  }

  /* 8) 한글 부정 접두사를 영어 어간에 붙인 것입니다. */
  if (rules.negationPrefixes.length > 0) {
    const cls = rules.negationPrefixes.join('');
    const re = new RegExp(`(^|[^\\uAC00-\\uD7A3])([${cls}])-?([A-Za-z])`, 'u');
    const m = re.exec(text);
    if (m !== null) {
      out.push({
        rule: 'hybrid-negation',
        detail: `한글 부정 접두사를 영어 어간에 붙였습니다: ${JSON.stringify(m[2] + m[3])}. 접두사까지 포함해 용어를 영어로 쓰십시오. 예: non-blocking.`,
        line: lineOf(text, m.index + m[1].length),
      });
    }
  }

  /* 9) 영어를 낱말 단위로 옮겨 만든 말입니다. 따옴표 안에 옮겨 적은 남의 말은 보지 않습니다. 앞 글자가 한글이면 다른 낱말의 일부로 보고 건너뜁니다. 코드 블록 안쪽을 다시 볼 때는 `fenceRules`가 이 목록을 비웁니다. */
  if (rules.calques.size > 0) {
    const unquoted = stripQuoted(text);
    for (const [wrong, right] of rules.calques) {
      const m = new RegExp(`(?<![\\uAC00-\\uD7A3])${escapeRe(wrong)}`, 'u').exec(unquoted);
      if (m === null) continue;
      out.push({
        rule: 'calque',
        detail: `영어를 낱말 단위로 옮겨 만든 말입니다: ${JSON.stringify(wrong)} → ${JSON.stringify(right)}. 독자가 영어로 되옮겨야 뜻을 아는 말은 풀어 씁니다.`,
        line: lineOf(unquoted, m.index),
      });
    }
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}
