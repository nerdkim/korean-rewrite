/* 규칙을 하나씩 실행하고 위반을 경고와 오류로 나눕니다. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fenceRules, RULE_FENCE } from './rules.mjs';
import { blankQuoteRegions, onlyFenced, stripCode } from './text.mjs';
import { koreanCommentsOf } from './comments.mjs';
import { isDocPath, isGeneralReaderPath, isSourcePath, TARGETS, targetForPath, toProjectRelative } from './targets.mjs';
import { charViolations } from './rules/chars.mjs';
import { registerViolations } from './rules/register.mjs';
import { punctuationViolations } from './rules/punctuation.mjs';
import { structureViolations } from './rules/structure.mjs';
import { translationeseViolations } from './rules/translationese.mjs';
import { vocabularyViolations } from './rules/vocabulary.mjs';
import { connectiveViolations } from './rules/connectives.mjs';
import { densityViolations } from './rules/density.mjs';
import { attributionViolations } from './rules/attribution.mjs';

/* 문서가 일반 독자가 읽는 글이라고 밝히는 줄입니다. 코드 블록 밖에 이 줄이 있으면 파일 전체에 IT 용어 표 규칙을 적용하지 않습니다. */
export const GENERAL_READER_MARK = /^[ \t]*<!--[ \t]*korean-style:[ \t]*general-reader[ \t]*-->[ \t]*$/mu;

/* 일반 독자가 읽는 글인지 봅니다. 경로가 `general-reader-globs`에 들었거나 문서에 일반 독자용 표시 줄이 있으면 일반 독자가 읽는 글로 봅니다. */
function isGeneralReader(text, target, path, rules) {
  if (isGeneralReaderPath(path, rules)) return true;
  return target === 'doc' && GENERAL_READER_MARK.test(stripCode(text));
}

/*
 * 텍스트 하나를 검사해 위반 목록을 돌려줍니다.
 * `options.path`는 파일 경로입니다. 소스 파일에서 주석을 뽑을 때와 일반 독자용 경로를 가릴 때 씁니다.
 * `options.toolInput`이 true이면 도구에 넘기는 글로 봅니다. 이때는 답변과 마찬가지로 `chat-advisory-rules`에 든 규칙에 걸린 표현을 경고로 보고합니다.
 */
export function checkText(input, rules, target = 'chat', options = {}) {
  if (typeof input !== 'string' || input.trim().length === 0) return [];
  if (!TARGETS.includes(target)) throw new Error(`알 수 없는 검사 종류입니다: ${target}`);

  /* 한글 자모를 완성형 음절로 합칩니다. 인용 구간은 문서에서만 건너뜁니다. 답변이나 commit 메시지를 인용 표시로 감싸 검사를 피하지 못하게 합니다. */
  const normalized = input.normalize('NFC');
  const rawText = target === 'doc' ? blankQuoteRegions(normalized, rules.quoteMarker) : normalized;

  const inFence = options.inFence === true;
  const toolInput = options.toolInput === true;
  const generalReader = options.generalReader ?? isGeneralReader(rawText, target, options.path, rules);

  /* 소스 파일은 주석만 봅니다. */
  if (target === 'comment' && !inFence) {
    if (typeof options.path !== 'string') return [];
    const comments = koreanCommentsOf(rawText, options.path);
    if (comments.trim().length === 0) return [];
    /* 뽑아낸 주석은 문서와 같은 규칙(`doc`)으로 다시 검사합니다. */
    return checkText(comments, rules, 'doc', { inFence: false, generalReader });
  }

  /* 도구에 넘기는 글과 답변에서는 `chat-advisory-rules`에 든 규칙에 걸린 표현도 경고로 보고합니다. */
  const advisory = new Set(rules.advisoryRules ?? []);
  const relaxed = new Set(target === 'chat' || toolInput ? rules.chatAdvisoryRules ?? [] : []);
  const blocking = (rule) => !advisory.has(rule) && !relaxed.has(rule);

  const text = stripCode(rawText);
  const violations = [
    ...charViolations(text, rules),
    ...registerViolations(text, rules, target, inFence),
    ...punctuationViolations(text, rules),
    ...structureViolations(text, rules),
    ...translationeseViolations(text, rules),
    ...vocabularyViolations(text, rules, target, {
      terms: !generalReader,
      termsBlocking: blocking('transliteration'),
      hint: target === 'doc' && !toolInput && !inFence,
    }),
    ...connectiveViolations(text, rules),
    ...densityViolations(text, rules),
    ...attributionViolations(text, rules),
  ];

  if (!inFence) {
    const fenced = onlyFenced(rawText, [RULE_FENCE]);
    if (fenced.trim().length > 0) {
      for (const v of checkText(fenced, fenceRules(rules), target, { inFence: true, toolInput, generalReader })) {
        violations.push({
          ...v,
          detail: `${v.detail} 코드 블록 안에서 찾은 위반입니다.`,
        });
      }
    }
  }

  violations.sort((a, b) => a.line - b.line);
  return violations.map(v => ({ ...v, severity: blocking(v.rule) ? 'error' : 'warning' }));
}

export const blockingViolations = violations => violations.filter(v => v.severity !== 'warning');

/* 도구 호출 하나에서 검사할 필드 값을 경로와 함께 모읍니다. */
export function toolFieldTexts(toolName, input, rules, which = 'chatToolFields') {
  const wanted = rules[which].get(toolName);
  if (wanted === undefined || wanted.size === 0) return [];
  const out = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      const at = `${path}.${key}`;
      if (typeof v === 'string') {
        if (wanted.has(key) && v.trim().length > 0) out.push({ path: at, text: v });
        continue;
      }
      walk(v, at);
    }
  };
  walk(input, toolName);
  return out;
}

/* 도구 호출의 필드 값을 하나씩 검사합니다. 사용자에게 보여 주는 글과 agent에게 주는 prompt에서도 답변과 마찬가지로 `chat-advisory-rules`에 든 규칙에 걸린 표현을 경고로 보고합니다. agent에게 주는 prompt에는 사용자가 준 글이나 이용자 공지에 담을 사실이 들어 있을 때가 많기 때문입니다. */
export function checkToolCall(toolName, input, rules, target = 'chat') {
  const which = target === 'chat' ? 'chatToolFields' : 'agentToolFields';
  const problems = [];
  for (const { path, text } of toolFieldTexts(toolName, input, rules, which)) {
    for (const v of checkText(text, rules, target, { toolInput: true })) problems.push({ ...v, where: path });
  }
  return problems;
}

/* 보고 맨 아래에 붙이는 규칙 출처입니다. */
function sourceNote(rules) {
  if (rules.source === null) {
    return `  ${rules.reason}\n  그래서 금지 문자와 생성 표시만 검사했고 답변이면 금지 호칭을 썼는지와 영어로만 썼는지도 검사했습니다.`;
  }
  return `  규칙 문서: ${rules.source}`;
}

export function formatViolations(violations, rules, where) {
  const errors = blockingViolations(violations).length;
  const head = `한국어 검사: 오류 ${errors}건, 경고 ${violations.length - errors}건${where === undefined ? '' : ` (${where})`}`;
  const body = violations.map((v) => v.severity === 'warning'
    ? `  [${v.rule}] ${v.line}줄: ${v.detail} (경고: 문맥에 맞으면 그대로 두어도 됩니다)`
    : `  [${v.rule}] ${v.line}줄: ${v.detail}`);
  return [head, ...body, sourceNote(rules)].join('\n');
}

export function formatToolViolations(problems, rules) {
  const head = `한국어 검사: 오류 ${problems.length}건 (이 도구에 넘긴 글)`;
  const body = problems.map((p) => `  [${p.rule}] ${p.where}: ${p.detail}`);
  return [head, ...body, sourceNote(rules)].join('\n');
}

export function checkFile(absPath, rules, projectRoot, forcedTarget) {
  const rel = toProjectRelative(absPath, projectRoot) ?? absPath;
  const target = forcedTarget ?? targetForPath(rel, rules);
  if (target === null) return { rel, target: null, violations: [] };
  const violations = checkText(readFileSync(absPath, 'utf-8'), rules, target, { path: rel });
  return { rel, target, violations };
}

/* 검사할 파일 전부입니다. */
export function listCheckableFiles(root, rules) {
  const out = [];
  const skip = new Set(rules.sweepSkipDirs);
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue;
        walk(p);
        continue;
      }
      const rel = relative(root, p);
      if (isDocPath(rel) || isSourcePath(rel)) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}
