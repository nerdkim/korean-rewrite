/* 번역투를 찾는 규칙입니다. */
import { lineOf } from '../text.mjs';
import { quoteChoices } from './terms.mjs';

/* `@latin:` 규칙에서 목적어로 보는 영어 낱말입니다. */
const LATIN_WORD = "[A-Za-z][A-Za-z0-9'’]*(?:[-.][A-Za-z0-9]+)*";

/* 목적어에 붙는 조사입니다. */
const OBJECT_PARTICLE = '[을를]';

/* `object-verbs` 항목은 `효과는 재지 않았습니다`처럼 목적어를 `은`, `는`으로 앞에 내세운 문장도 봅니다. */
const OBJECT_OR_TOPIC_PARTICLE = '[을를은는]';

const LATIN_PREFIX = '@latin:';

/* 목적어와 조사 사이에 넣은 괄호 설명입니다. `저장소(docs/wiki)를`처럼 씁니다. */
const PAREN_NOTE = '(?:\\s*\\([^()\\n]{0,80}\\))?';

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* 세로줄로 나눈 대안을 정규식 하나로 만듭니다. */
function alternation(left) {
  return left
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(escape)
    .join('|');
}

/* 대신 쓸 말을 안내합니다. 마침표로 끝나는 문장이면 그 문장을 그대로 보여 줍니다. `또는`으로 나눈 말이 여럿이면 따로 인용하고 문맥에 맞는 말을 고르게 합니다. */
function advise(right) {
  if (right.length === 0) return '';
  if (right.endsWith('.')) return ` ${right}`;
  const choices = right.split(/\s+또는\s+/u).filter((choice) => choice.trim().length > 0);
  if (choices.length < 2) return ` ${quoteChoices(right)}처럼 고칠 수도 있습니다.`;
  return ` ${choices.map((choice) => JSON.stringify(choice.trim())).join(', ')} 가운데 문맥에 맞는 말로 고칠 수도 있습니다.`;
}

/* `translationese-exempt`에 적은 구절이 차지하는 구간입니다. */
function exemptSpans(text, phrases) {
  const spans = [];
  for (const phrase of phrases ?? []) {
    if (phrase.length === 0) continue;
    for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) spans.push([at, at + phrase.length]);
  }
  return spans;
}

/* 구절이 나온 자리 가운데 예외 구절 안에 들지 않은 첫 자리를 돌려줍니다. 없으면 -1입니다. */
function firstOutside(text, wrong, spans) {
  for (let at = text.indexOf(wrong); at !== -1; at = text.indexOf(wrong, at + 1)) {
    if (!spans.some(([from, to]) => from <= at && at + wrong.length <= to)) return at;
  }
  return -1;
}

/* 굵은 글씨 표시입니다. */
const BOLD = '(?:\\*\\*|__)';

/* 줄 앞의 목록 표시입니다. */
const LIST = '(?:[-*+][ \\t]+|\\d+[.)][ \\t]+)?';

/* 표 머리글 바로 아래에 두는 구분 줄인지 봅니다. */
function isTableRule(line) {
  return line.includes('|') && line.includes('-') && /^[\s|:-]+$/u.test(line);
}

/* 표 줄을 칸으로 나눕니다. */
function tableCells(line) {
  return line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|');
}

/* 칸에서 공백, 굵은 글씨 표시, 끝의 물음표나 콜론 하나를 뗍니다. */
function bareCell(cell) {
  return cell.trim().replace(/^(?:\*\*|__)|(?:\*\*|__)$/gu, '').trim().replace(/[?？:：]$/u, '').trim();
}

/* 제목이나 항목 이름이 그 낱말 하나뿐인 첫 줄의 번호를 돌려줍니다. 없으면 0입니다. */
function headingLineOf(lines, word) {
  const w = escape(word);
  /* `## 왜`, `### 왜?`, `## **왜**`처럼 제목 전체가 그 낱말인 줄입니다. */
  const heading = new RegExp(`^ {0,3}#{1,6}[ \\t]+${BOLD}?${w}[ \\t]*[?？:：]?${BOLD}?[ \\t]*#*[ \\t]*$`, 'u');
  /* `**왜**`처럼 굵은 글씨만 쓴 줄과 `왜:`, `**왜:**`, `**왜**:`처럼 콜론 앞에 둔 항목 이름입니다. */
  const label = new RegExp(
    `^[ \\t]*${LIST}(?:${BOLD}${w}[ \\t]*[?？]?${BOLD}[ \\t]*$|${BOLD}${w}[ \\t]*[:：]${BOLD}|${BOLD}${w}${BOLD}[ \\t]*[:：]|${w}[ \\t]*[:：])`,
    'u',
  );
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (heading.test(line) || label.test(line)) return i + 1;
    /* 표에서는 구분 줄 바로 위에 있는 머리글 칸만 봅니다. */
    if (i + 1 < lines.length && line.includes('|') && isTableRule(lines[i + 1]) && tableCells(line).some((cell) => bareCell(cell) === word)) {
      return i + 1;
    }
  }
  return 0;
}

/* 대신 쓸 이름이 여럿이면 `또는`으로 나눠 따로 인용합니다. 그래야 `문제 및 원인 또는 배경`에서 `및`과 `또는`이 무엇을 묶는지 헷갈리지 않습니다. */
function adviseNames(right) {
  const names = right.split(/\s+또는\s+/u).map((name) => name.trim()).filter((name) => name.length > 0);
  const like = names.length > 0 ? `${names.map((name) => JSON.stringify(name)).join(' 또는 ')}처럼 ` : '';
  return ` 그 절이나 항목에 담은 내용이 드러나게 ${like}고칠 수도 있습니다.`;
}

export function translationeseViolations(text, rules) {
  const out = [];

  /* 1) 번역투 구절입니다. `translationese-exempt`에 적은 구절 안에 든 자리는 건너뜁니다. 그래서 근거를 뜻하는 `법에 의해`는 잡지 않습니다. */
  const spans = exemptSpans(text, rules.translationeseExempt);
  for (const [wrong, right] of rules.translationesePatterns) {
    const idx = firstOutside(text, wrong, spans);
    if (idx === -1) continue;
    out.push({
      rule: 'translationese',
      detail: `번역투일 수 있습니다: ${JSON.stringify(wrong)}.${advise(right)}`,
      line: lineOf(text, idx),
    });
  }

  /* 2) 영어 동사를 직역한 동사입니다. */
  for (const [key, right] of rules.literalVerbs) {
    if (key.startsWith(LATIN_PREFIX)) {
      const stems = alternation(key.slice(LATIN_PREFIX.length));
      if (stems.length === 0) continue;
      /* 영어 낱말과 목적격 조사 뒤에 동사가 오는 문장을 찾습니다. 조사와 동사 사이에는 낱말이 두 개까지 올 수 있습니다. 숫자 바로 뒤의 `cm`, `%p` 같은 단위는 목적어로 보지 않습니다. */
      const re = new RegExp(`(?<![0-9%A-Za-z])(${LATIN_WORD})${PAREN_NOTE}\\s*${OBJECT_PARTICLE}\\s+(?:\\S+\\s+){0,2}(?:${stems})`, 'gu');
      /* `literal-verb-exempt`에 든 영어 낱말은 건너뜁니다. */
      const exempt = new Set(rules.literalVerbExempt.map((w) => w.toLowerCase()));
      const exemptRe =
        exempt.size === 0 ? null : new RegExp(`\\b(?:${[...exempt].map(escape).join('|')})\\b`, 'iu');
      let m = null;
      for (const candidate of text.matchAll(re)) {
        if (exempt.has(candidate[1].toLowerCase())) continue;
        /* 첫 낱말과 동사 사이에 예외 낱말이 있으면 건너뜁니다. */
        if (exemptRe !== null && exemptRe.test(candidate[0].slice(candidate[1].length))) continue;
        m = candidate;
        break;
      }
      if (m === null) continue;
      out.push({
        rule: 'literal-verb',
        detail: `영어 목적어 ${JSON.stringify(m[1])} 뒤에 직역 동사를 썼습니다: ${JSON.stringify(m[0].trim().slice(0, 40))}.${advise(right)}`,
        line: lineOf(text, m.index),
      });
      continue;
    }
    const forms = alternation(key);
    if (forms.length === 0) continue;
    const m = new RegExp(`(?:${forms})`, 'u').exec(text);
    if (m === null) continue;
    out.push({
      rule: 'literal-verb',
      detail: `직역 표현을 썼습니다: ${JSON.stringify(m[0])}.${advise(right)}`,
      line: lineOf(text, m.index),
    });
  }

  /* 3) 정해 둔 낱말이 목적어일 때만 잡는 직역 동사입니다. `>` 앞에 목적어 낱말을, 뒤에 동사 활용형을 적습니다. 낱말 앞에 한글이 붙어 있으면 `목표`, `실행`처럼 다른 낱말의 일부로 보고 잡지 않습니다. */
  for (const [key, right] of rules.objectVerbs ?? []) {
    const [nouns, verbs = ''] = key.split('>');
    const objects = alternation(nouns);
    const stems = alternation(verbs);
    if (objects.length === 0 || stems.length === 0) continue;
    /* 적어 둔 낱말과 조사 뒤에 동사가 오는 문장을 찾습니다. `literal-verbs`의 `@latin:` 항목처럼 조사와 동사 사이에 낱말이 두 개까지 올 수 있습니다. */
    const m = new RegExp(`(?<![가-힣])(${objects})${PAREN_NOTE}\\s*${OBJECT_OR_TOPIC_PARTICLE}\\s+(?:\\S+\\s+){0,2}(?:${stems})`, 'u').exec(text);
    if (m === null) continue;
    out.push({
      rule: 'literal-verb',
      detail: `목적어 ${JSON.stringify(m[1])} 뒤에 직역 동사를 썼습니다: ${JSON.stringify(m[0].trim().slice(0, 40))}.${advise(right)}`,
      line: lineOf(text, m.index),
    });
  }

  /* 4) 제목이나 항목 이름을 영어 낱말 그대로 옮긴 것입니다. 제목이나 항목 이름이 `translationese-headings`에 적은 낱말 하나뿐인 줄을 잡습니다. `## 왜 이런 일이 생기나`처럼 다른 말이 붙은 제목과 `>`로 시작하는 인용 줄은 잡지 않습니다. */
  let lines = null;
  for (const [word, right] of rules.translationeseHeadings ?? []) {
    lines ??= text.split('\n');
    const line = headingLineOf(lines, word);
    if (line === 0) continue;
    out.push({
      rule: 'translationese',
      detail: `제목이나 항목 이름을 영어 낱말 그대로 옮겼을 수 있습니다: ${JSON.stringify(word)}.${adviseNames(right)}`,
      line,
    });
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}
