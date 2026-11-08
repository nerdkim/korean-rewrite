#!/usr/bin/env node
/* 사용자가 prompt를 보낼 때마다 Claude에게 한국어를 쓰는 절차를 알립니다. 이 session에서 skill을 아직 부르지 않았으면 한국어를 쓰기 전에 부르라고 하고, 이미 불렀으면 다시 부르지 말고 그 절차를 따르라고 합니다. 한글이 많은 글은 작성 agent에게 맡기라고도 알립니다. 규칙 문서에 적힌 skill이 프로젝트에 없으면 알리지 않습니다. */
import { readFileSync } from 'node:fs';
import { isEntryPoint, projectRoot, rulesDocPath } from '../lib/paths.mjs';
import { loadRules } from '../lib/rules.mjs';
import { answerReminder, takeAnswerIssues } from '../lib/review.mjs';
import { agentInstalled, loadedSkill, skillInstalled } from '../lib/skill.mjs';

const PROJECT_ROOT = projectRoot();

/* Claude에게 전하는 안내입니다. `loaded` argument가 참이면 이 session에서 이미 불렀다는 뜻이므로 skill을 다시 부르지 말라고 안내합니다. 작성 agent가 설치되어 있으면 한글이 많은 글을 그 agent에게 맡기라는 안내도 붙입니다. 기준을 0으로 정한 글 종류는 안내에서 뺍니다. */
export function skillReminder(name, writer = '', minHangul = 0, answerMinHangul = 0, loaded = false) {
  const targets = [];
  if (minHangul > 0) targets.push(`파일, commit 메시지, PR과 issue에 올리는 글은 한 번에 쓰는 한글이 ${minHangul}자 이상이면`);
  if (answerMinHangul > 0) targets.push(`답변은 한글이 ${answerMinHangul}자 이상이면`);
  return (
    (loaded
      ? `이 프로젝트에서는 ${name} skill을 이 session에서 이미 불렀으므로 Skill 도구로 다시 부르지 마십시오. ` +
        '한국어로 답하거나 한국어가 들어간 파일, 주석, commit 메시지, PR 설명을 쓸 때 그 skill의 절차를 따르십시오. '
      : `이 프로젝트에서 한국어로 답하거나 한국어가 들어간 파일, 주석, commit 메시지, PR 설명을 쓰려면 먼저 Skill 도구로 ${name} skill을 부르고 그 절차를 따르십시오. `) +
    '무엇을 쓸지 구상할 때부터 한국어로 생각하고 영어로 떠올린 문장을 한국어로 옮기지 마십시오.' +
    (writer && targets.length > 0
      ? ` ${targets.join(', ')} 직접 쓰지 말고 Agent 도구로 ${writer}에게 독자, 글 종류, 말투, 담을 사실, 사실 사이의 관계를 적은 메모를 넘기십시오. ` +
        '돌려받은 글에서 `빠진 정보:` 줄은 빼고 그 내용은 사용자에게 알리십시오. 나머지는 고치지 말고 쓰십시오. hook이 오류를 알리면 그 부분만 고치십시오.'
      : '')
  );
}

function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function run() {
  let input;
  try {
    input = JSON.parse(readStdin());
  } catch {
    process.exit(0);
  }
  const rules = loadRules(rulesDocPath(PROJECT_ROOT));
  if (!skillInstalled(PROJECT_ROOT, rules.writingSkill)) process.exit(0);
  const writer = agentInstalled(PROJECT_ROOT, rules.writerAgent) ? rules.writerAgent : '';
  const loaded = loadedSkill(input?.transcript_path, rules.writingSkill);
  let context = skillReminder(rules.writingSkill, writer, rules.writerAgentMinHangul, rules.writerAgentAnswerMinHangul, loaded);
  /* 앞 답변에 대한 검토 지적이 남아 있으면 Claude에게만 알리고 지웁니다. */
  const answered = typeof input?.session_id === 'string' ? takeAnswerIssues(input.session_id) : [];
  if (answered.length > 0) context += `\n${answerReminder(answered)}`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }));
  process.exit(0);
}

/* 직접 실행할 때만 동작합니다. */
if (isEntryPoint(import.meta.url)) {
  try {
    run();
  } catch {
    /* 예외가 나면 안내 없이 끝냅니다. */
    process.exit(0);
  }
}
