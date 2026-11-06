import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REVIEWER_PROMPT, answerReminder, collectPieces, koreanSpan, parseVerdict, reviewInput, reviewMessage, saveAnswerIssues, splitIssues, takeAnswerIssues, writtenLines,
} from '../scripts/lib/review.mjs';
import { loadRules } from '../scripts/lib/rules.mjs';
import { attribute, summarizeReviewer } from '../scripts/eval-reviewer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = join(ROOT, 'scripts', 'hooks', 'review.mjs');
const RULES = loadRules(join(ROOT, 'docs', 'rules.md'));

/* 검토 model 대신 정해 둔 답을 돌려주는 명령을 만듭니다. 받은 argument와 입력은 파일에 남깁니다. */
function fakeReviewer(dir, verdict, status = 0) {
  const path = join(dir, 'fake-reviewer.mjs');
  writeFileSync(path, [
    '#!/usr/bin/env node',
    "import { appendFileSync, readFileSync } from 'node:fs';",
    "const input = readFileSync(0, 'utf-8');",
    `appendFileSync(${JSON.stringify(join(dir, 'calls.jsonl'))}, JSON.stringify({ args: process.argv.slice(2), input, reviewing: process.env.KOREAN_STYLE_REVIEWING }) + '\\n');`,
    `process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: ${JSON.stringify(JSON.stringify(verdict))}, total_cost_usd: 0.01, duration_api_ms: 1000 }));`,
    `process.exit(${status});`,
  ].join('\n'));
  chmodSync(path, 0o755);
  return path;
}

function calls(dir) {
  const file = join(dir, 'calls.jsonl');
  return existsSync(file) ? readFileSync(file, 'utf-8').trim().split('\n').map((line) => JSON.parse(line)) : [];
}

function assistant(content, uuid) {
  return { type: 'assistant', uuid, message: { role: 'assistant', content } };
}

function result(id, isError = false) {
  return { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: isError ? '실패' : 'ok', is_error: isError }] } };
}

/* 임시 directory에 프로젝트 directory를 만들고 주어진 파일을 넣습니다. */
function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'korean-review-'));
  const proj = join(dir, 'proj');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(proj, rel)), { recursive: true });
    writeFileSync(join(proj, rel), text);
  }
  mkdirSync(proj, { recursive: true });
  return { dir, proj };
}

function runHook({ dir, proj, entries, input = {}, verdict = { ok: true }, status = 0, rules = null, env = {} }) {
  const transcript = join(dir, 'transcript.jsonl');
  writeFileSync(transcript, [{ type: 'user', message: { role: 'user', content: '화면 문구를 고쳐 주세요.' } }, ...entries]
    .map((entry) => JSON.stringify(entry)).join('\n'));
  const fake = fakeReviewer(dir, verdict, status);
  const childEnv = {
    ...process.env, CLAUDE_PROJECT_DIR: proj, KOREAN_STYLE_REVIEWER_COMMAND: fake, ...env,
  };
  delete childEnv.KOREAN_STYLE_REVIEWING;
  if (env.KOREAN_STYLE_REVIEWING) childEnv.KOREAN_STYLE_REVIEWING = env.KOREAN_STYLE_REVIEWING;
  if (rules !== null) {
    const path = join(dir, 'rules.md');
    writeFileSync(path, rules);
    childEnv.KOREAN_STYLE_RULES = path;
  } else {
    childEnv.KOREAN_STYLE_RULES = join(ROOT, 'docs', 'rules.md');
  }
  return spawnSync('node', [HOOK], {
    input: JSON.stringify({ session_id: `test-${Date.now()}-${Math.random()}`, transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false, ...input }),
    env: childEnv,
    encoding: 'utf-8',
  });
}

const SCREEN = '      <p>항목 {total}개 가운데 최근 {shown}개를 표시했습니다. 앞선 항목은 journal 원문에 있습니다.</p>\n';
const VIEW = `export function View() {\n  return (\n${SCREEN}  );\n}\n`;
const FLAGGED = { ok: false, issues: [{ where: 'src/View.tsx 3', text: '앞선 항목', fix: '이전 항목', why: '시간순으로 오래된 항목은 이전 항목이라고 씁니다' }] };

test('파일 쓰기 도구가 새로 쓴 줄 가운데 한글이 든 줄만 모은다', () => {
  assert.deepEqual(writtenLines('Write', { content: 'const a = 1;\n// 설정을 읽습니다.\n' }), ['// 설정을 읽습니다.']);
  assert.deepEqual(writtenLines('Edit', { old_string: '// 설정을 읽습니다.\nx();', new_string: '// 설정을 읽습니다.\n// 값을 검사합니다.\nx();' }), ['// 값을 검사합니다.']);
  assert.deepEqual(writtenLines('MultiEdit', { edits: [{ old_string: 'a', new_string: '첫 줄' }, { old_string: 'b', new_string: 'b' }] }), ['첫 줄']);
  assert.deepEqual(writtenLines('Read', { file_path: 'a.md' }), []);
});

test('source code 줄에서는 한국어 문구만 잘라 낸다', () => {
  assert.equal(koreanSpan(SCREEN.trim(), 'src/View.tsx'), '항목 {total}개 가운데 최근 {shown}개를 표시했습니다. 앞선 항목은 journal 원문에 있습니다.');
  assert.equal(koreanSpan("const label = '저장';", 'src/a.ts'), '저장');
  assert.equal(koreanSpan('// 값을 읽습니다.', 'src/a.ts'), '값을 읽습니다.');
  assert.equal(koreanSpan('- 문서 줄은 `코드`까지 그대로 둡니다.', 'docs/a.md'), '- 문서 줄은 `코드`까지 그대로 둡니다.');
});

test('파일, commit 메시지, 답변을 조각으로 모으고 오류로 끝난 호출과 이미 검토한 호출은 뺀다', () => {
  const { proj } = project({ 'src/View.tsx': VIEW, 'docs/a.md': '# 제목\n\n오류로 끝난 쓰기입니다.\n' });
  const entries = [
    assistant([{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: join(proj, 'src/View.tsx'), content: VIEW } }], 'a1'),
    result('w1'),
    assistant([{ type: 'tool_use', id: 'w2', name: 'Write', input: { file_path: join(proj, 'docs/a.md'), content: '# 제목\n\n오류로 끝난 쓰기입니다.\n' } }], 'a2'),
    result('w2', true),
    assistant([{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: "git commit -m 'feat: 화면 문구 추가' -m '앞선 항목을 보여 주는 안내를 넣었습니다.'" } }], 'a3'),
    result('b1'),
    assistant([{ type: 'tool_use', id: 'w3', name: 'Write', input: { file_path: '/etc/outside.md', content: '프로젝트 밖 파일입니다.' } }], 'a4'),
    result('w3'),
  ];
  const answer = '화면 문구를 바꿨습니다. 최근 항목만 보여 주고 앞선 항목은 journal 원문에서 볼 수 있다고 안내합니다.';
  const { pieces, ids } = collectPieces(entries, { projectRoot: proj, rules: RULES, answer });
  assert.deepEqual(pieces.map((piece) => piece.label), ['src/View.tsx', 'commit 메시지', '답변']);
  assert.deepEqual(pieces[0].lines, ['3: 항목 {total}개 가운데 최근 {shown}개를 표시했습니다. 앞선 항목은 journal 원문에 있습니다.']);
  assert.ok(ids.includes('w1') && ids.includes('b1') && !ids.includes('w2'));

  const again = collectPieces(entries, { projectRoot: proj, rules: RULES, answer, reviewed: new Set(ids) });
  assert.equal(again.pieces.length, 0);
});

test('commit 메시지 조각과 PR이나 issue에 올린 글 조각의 이름은 PreToolUse hook처럼 commit과 issue를 영어로 적는다', () => {
  const { proj } = project();
  const entries = [
    assistant([{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: "git commit -m 'fix: 안내 문구 수정'" } }], 'a1'),
    result('b1'),
    assistant([{ type: 'tool_use', id: 'b2', name: 'Bash', input: { command: "gh pr create --title '안내 문구 수정' --body '앞선 항목을 보여 주는 안내를 고쳤습니다.'" } }], 'a2'),
    result('b2'),
  ];
  const { pieces } = collectPieces(entries, { projectRoot: proj, rules: RULES, answer: null });
  assert.deepEqual(pieces, [
    { label: 'commit 메시지', lines: ['fix: 안내 문구 수정'] },
    { label: 'PR이나 issue에 올린 글', lines: ['안내 문구 수정', '', '앞선 항목을 보여 주는 안내를 고쳤습니다.'] },
  ]);
});

test('문서의 코드 블록 안 줄, 검사 제외 경로, 기준보다 짧은 답변은 검토하지 않는다', () => {
  const doc = '# 사용법\n\n```sh\necho "코드 블록 안 한국어"\n```\n\n설치한 뒤 다시 시작합니다.\n';
  const { proj } = project({ 'docs/a.md': doc, 'vendor/b.md': '외부 문서입니다.\n' });
  const entries = [
    assistant([{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: join(proj, 'docs/a.md'), content: doc } }], 'a1'),
    result('w1'),
    assistant([{ type: 'tool_use', id: 'w2', name: 'Write', input: { file_path: join(proj, 'vendor/b.md'), content: '외부 문서입니다.\n' } }], 'a2'),
    result('w2'),
  ];
  const rules = { ...RULES, skipGlobs: ['vendor/**'] };
  const { pieces } = collectPieces(entries, { projectRoot: proj, rules, answer: '고쳤습니다.' });
  assert.deepEqual(pieces, [{ label: 'docs/a.md', lines: ['1: # 사용법', '7: 설치한 뒤 다시 시작합니다.'] }]);

  const off = collectPieces(entries, { projectRoot: proj, rules: { ...rules, reviewerAnswerMinHangul: 0 }, answer: '답변이 길어도 0이면 검토하지 않습니다. '.repeat(5) });
  assert.ok(off.pieces.every((piece) => piece.label !== '답변'));
});

test('Claude가 사용자 문장의 숫자를 자리 표시로 바꿔 넣어도 그 문장은 검토하지 않고 Claude가 덧붙인 문장만 검토한다', () => {
  const extra = '      <p>항목 {total}개 가운데 최근 {shown}개를 표시했습니다. 앞선 항목은 journal 원문에 있습니다. 새로 고치면 다시 불러옵니다.</p>\n';
  const { proj } = project({ 'src/View.tsx': `${VIEW}${extra}` });
  const entries = [assistant([{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: join(proj, 'src/View.tsx'), content: `${VIEW}${extra}` } }], 'a1'), result('w1')];
  const prompt = '안내 문구는 다음 문장을 글자 그대로 넣어 주세요: 항목 942개 가운데 최근 200개를 표시했습니다. 앞선 항목은 journal 원문에 있습니다.';
  const { pieces } = collectPieces(entries, { projectRoot: proj, rules: RULES, answer: null, prompt });
  assert.deepEqual(pieces, [{ label: 'src/View.tsx', lines: ['6: 새로 고치면 다시 불러옵니다.'] }]);

  const untouched = collectPieces(entries, { projectRoot: proj, rules: RULES, answer: null, prompt: '화면을 만들어 주세요.' });
  assert.equal(untouched.pieces[0].lines.length, 2);

  const answer = '컴포넌트를 만들었습니다. 이렇게 쓰면 "항목 942개 가운데 최근 200개를 표시했습니다. 앞선 항목은 journal 원문에 있습니다."가 화면에 나옵니다. 숫자는 props로 받습니다.';
  const said = collectPieces([], { projectRoot: proj, rules: { ...RULES, reviewerAnswerMinHangul: 1 }, answer, prompt });
  assert.deepEqual(said.pieces, [{ label: '답변', lines: ['컴포넌트를 만들었습니다. 숫자는 props로 받습니다.'] }]);
});

test('검토 model에 보낼 한글이 상한을 넘으면 뒤 조각은 보내지 않는다', () => {
  const { proj } = project({ 'a.md': '가나다라마바사아자차\n', 'b.md': '카타파하가나다라마바\n' });
  const entries = ['a.md', 'b.md'].map((name, i) => assistant([{ type: 'tool_use', id: `w${i}`, name: 'Write', input: { file_path: join(proj, name), content: readFileSync(join(proj, name), 'utf-8') } }], `a${i}`));
  const { pieces, hangul } = collectPieces(entries, { projectRoot: proj, rules: { ...RULES, reviewerMaxHangul: 15 }, answer: null });
  assert.deepEqual(pieces.map((piece) => piece.label), ['a.md']);
  assert.equal(hangul, 10);
  assert.equal(reviewInput(pieces), '[a.md]\n1: 가나다라마바사아자차');
});

test('검토 지시는 skill이 허용하는 `돌리다`와 일반 원칙을 담고 평가 예문에 든 표현은 예로 넣지 않는다', () => {
  /* 일반 원칙을 빼고 고칠 표현의 예를 늘린 지시로 측정하자 Sonnet과 Opus는 사용자가 알려 준 `앞선 항목` 문장과 `승인을 묻습니다` 문장을 한 번도 지적하지 못했습니다. */
  assert.match(REVIEWER_PROMPT, /낱말 하나하나는 맞는데 한국 사람이라면 그 문맥에서 쓰지 않을 말/);
  assert.match(REVIEWER_PROMPT, /한국어를 모국어로 쓰는 개발자라면 같은 내용을 이렇게 쓰지 않았을 표현/);
  assert.match(REVIEWER_PROMPT, /흔히 쓰는 `돌리다`/);
  /* 지시에 평가 예문의 표현이 들어 있으면 검토 model이 처음 보는 문장을 어떻게 판단하는지 측정할 수 없습니다. 아래는 번역투가 든 예문에서 고칠 곳으로 본 표현입니다. */
  for (const phrase of ['앞선', '승인을 묻', '여실', '어떤 근거로', '응답 모양', '돕니다', '밖에서', '허용합니다', '내보내는 것']) {
    assert.ok(!REVIEWER_PROMPT.includes(phrase), phrase);
  }
  /* 예문의 다른 부분도 지시에 들어 있지 않은지 확인합니다. 공백을 지운 예문에서 시작 위치를 한 글자씩 옮기며 6글자를 자르고 한글이 5글자 이상인 조각만 지시에서 찾습니다. */
  const fixture = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'eval', 'reviewer.json'), 'utf-8'));
  const prompt = REVIEWER_PROMPT.replace(/\s+/g, '');
  for (const line of fixture.batches.flatMap((batch) => batch.pieces.flatMap((piece) => piece.lines))) {
    const text = line.text.replace(/\s+/g, '');
    for (let i = 0; i + 6 <= text.length; i += 1) {
      const part = text.slice(i, i + 6);
      if ((part.match(/[가-힣]/g) ?? []).length >= 5) assert.ok(!prompt.includes(part), `${line.id}: ${part}`);
    }
  }
});

test('검토 model의 답에서 지적만 꺼내고 형식이 맞지 않으면 버린다', () => {
  assert.deepEqual(parseVerdict('{"ok": true}'), { ok: true, issues: [] });
  assert.deepEqual(parseVerdict(`설명 ${JSON.stringify(FLAGGED)}`).issues.map((issue) => issue.fix), ['이전 항목']);
  assert.equal(parseVerdict('답할 수 없습니다'), null);
  assert.equal(parseVerdict('{"ok": "maybe"}'), null);
  assert.deepEqual(parseVerdict('{"ok": false, "issues": [{"text": "같은 말", "fix": "같은 말"}]}'), { ok: true, issues: [] });
});

/* 검토 model이 문제가 없다고 판단한 문장을 지적 형식으로 돌려준 실제 사례입니다. 고친 표현은 원문 끝에 `(문제 없음)`만 붙인 것입니다. */
const NOT_AN_ISSUE = {
  where: 'scripts/gate.mjs 줄 109',
  text: '건너뛰었다는 사실을 반드시 출력합니다.',
  fix: '건너뛰었다는 사실을 반드시 출력합니다. (문제 없음)',
  why: '문제 없음',
};

test('고친 표현이 괄호 메모를 빼면 원문과 같거나 이유에 고칠 것이 없다고 밝힌 항목은 지적으로 보지 않는다', () => {
  const verdict = (issue) => parseVerdict(JSON.stringify({ ok: false, issues: [issue] }));
  const skipped = [
    NOT_AN_ISSUE,
    { ...NOT_AN_ISSUE, why: '' },
    { where: 'a.md 1', text: '설정을 읽습니다.', fix: '설정을  읽습니다.', why: '' },
    { where: 'a.md 2', text: '요청에 대한 응답', fix: '요청에 대한 응답 (정상 용법) (수정 불필요)', why: '' },
    ...['문제 없음', '(수정 불필요)', '문제가 없습니다. 이전 항목이라고 써도 됩니다.', '정상 용법이므로 고칠 필요 없음', '수정할 필요가 없습니다', '지적 대상이 아닙니다', '그대로 두어도 됩니다', 'No issue']
      .map((why) => ({ where: 'a.md 3', text: '앞선 항목', fix: '이전 항목', why })),
  ];
  for (const issue of skipped) assert.deepEqual(verdict(issue), { ok: true, issues: [] }, JSON.stringify(issue));
});

test('원문의 괄호를 지운 항목과 이유에서 고칠 것이 없다고 밝히지 않은 항목은 지적으로 남긴다', () => {
  const issues = [
    FLAGGED.issues[0],
    { where: 'a.md 1', text: '결제(checkout) 요청', fix: '결제 요청', why: '같은 뜻을 두 번 썼습니다' },
    { where: 'a.md 2', text: '설정 파일(config.json)', fix: '설정 파일', why: '' },
    { where: 'a.md 3', text: '성능에 대해 개선했습니다', fix: '성능을 개선했습니다', why: '정상 용법이 아니라 목적어 자리의 `~에 대해`입니다' },
    { where: 'a.md 4', text: '검사 결과 문제 없음', fix: '검사 결과 문제가 없었습니다', why: '문제없음을 서술어 없이 메모처럼 썼습니다' },
    { where: 'a.md 5', text: '문제가 없다는 것이 확인됐습니다', fix: '문제가 없습니다', why: '문제 없다고 보기 어렵습니다. `~것이 확인되다`는 번역투입니다' },
    { where: 'a.md 6', text: '설정하는 것이 가능합니다', fix: '설정할 수 있습니다', why: '문법상 문제는 없으나 `~것이 가능하다`는 번역투입니다' },
  ];
  const parsed = parseVerdict(JSON.stringify({ ok: false, issues }));
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.issues.map((issue) => issue.fix), issues.map((issue) => issue.fix));
});

test('알림에는 지적을 정해 둔 수까지만 싣고 나머지는 개수만 적는다', () => {
  const issues = Array.from({ length: 10 }, (_, i) => ({ where: `a.md ${i + 1}`, text: `표현${i}`, fix: `고친 표현${i}`, why: '' }));
  const message = reviewMessage(issues, 'opus');
  assert.match(message, /^한국어 검토: /);
  assert.equal((message.match(/^- a\.md/gm) ?? []).length, 8);
  assert.match(message, /그 밖에 2곳이 더 있습니다/);
});

test('검토 model이 파일 문구를 지적하면 hook이 종료 코드 2로 끝나 Claude에게 알린다', () => {
  const { dir, proj } = project({ 'src/View.tsx': VIEW });
  const entries = [
    assistant([{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: join(proj, 'src/View.tsx'), content: VIEW } }], 'a1'),
    result('w1'),
  ];
  const r = runHook({ dir, proj, entries, input: { last_assistant_message: '고쳤습니다.' }, verdict: FLAGGED });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /`앞선 항목` → `이전 항목`/);
  const [call] = calls(dir);
  assert.equal(call.reviewing, '1');
  for (const flag of ['-p', '--system-prompt', '--tools', '--setting-sources', '--strict-mcp-config', '--no-session-persistence']) assert.ok(call.args.includes(flag), flag);
  assert.equal(call.args[call.args.indexOf('--tools') + 1], '');
  assert.equal(call.args[call.args.indexOf('--model') + 1], 'sonnet');
  assert.match(call.input, /^\[src\/View\.tsx\]\n3: 항목/);
});

test('검토 model이 문제를 찾지 못하거나 검토 model을 실행하지 못하면 hook은 알리지 않는다', () => {
  for (const [verdict, status] of [[{ ok: true }, 0], [FLAGGED, 1]]) {
    const { dir, proj } = project({ 'src/View.tsx': VIEW });
    const entries = [assistant([{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: join(proj, 'src/View.tsx'), content: VIEW } }], 'a1'), result('w1')];
    const r = runHook({ dir, proj, entries, verdict, status });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
  }
});

test('검토 model이 고칠 것이 없다고 판단한 항목만 돌려주면 hook은 Claude에게 지적을 전하지 않는다', () => {
  const { dir, proj } = project({ 'src/View.tsx': VIEW });
  const entries = [assistant([{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: join(proj, 'src/View.tsx'), content: VIEW } }], 'a1'), result('w1')];
  const r = runHook({ dir, proj, entries, verdict: { ok: false, issues: [NOT_AN_ISSUE] } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(calls(dir).length, 1);
});

test('알림을 받고 고친 뒤의 Stop, 검토 model의 session, 검토를 끈 규칙에서는 검토 model을 부르지 않는다', () => {
  const cases = [
    { input: { stop_hook_active: true } },
    { env: { KOREAN_STYLE_REVIEWING: '1' } },
    { rules: '```korean-style-rules\nreviewer-model:\n```\n' },
  ];
  for (const extra of cases) {
    const { dir, proj } = project({ 'src/View.tsx': VIEW });
    const entries = [assistant([{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: join(proj, 'src/View.tsx'), content: VIEW } }], 'a1'), result('w1')];
    const r = runHook({ dir, proj, entries, verdict: FLAGGED, ...extra });
    assert.equal(r.status, 0, JSON.stringify(extra));
    assert.equal(calls(dir).length, 0, JSON.stringify(extra));
  }
});

test('같은 session에서 이미 검토한 글은 다시 보내지 않는다', () => {
  const { dir, proj } = project({ 'src/View.tsx': VIEW });
  const entries = [assistant([{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: join(proj, 'src/View.tsx'), content: VIEW } }], 'a1'), result('w1')];
  const session = `test-repeat-${Date.now()}`;
  runHook({ dir, proj, entries, input: { session_id: session }, verdict: { ok: true } });
  runHook({ dir, proj, entries, input: { session_id: session }, verdict: { ok: true } });
  assert.equal(calls(dir).length, 1);
});

test('subagent가 끝나면 그 subagent가 쓴 파일만 검토하고 마지막 보고는 보내지 않는다', () => {
  const { dir, proj } = project({ 'src/View.tsx': VIEW });
  const agentTranscript = join(dir, 'agent.jsonl');
  writeFileSync(agentTranscript, [
    { type: 'user', message: { role: 'user', content: '화면을 만들어 주세요.' } },
    assistant([{ type: 'tool_use', id: 's1', name: 'Write', input: { file_path: join(proj, 'src/View.tsx'), content: VIEW } }], 'b1'),
    result('s1'),
    assistant([{ type: 'text', text: '화면을 만들었고 안내 문구도 넣었습니다. 메인 세션에 보내는 보고입니다.' }], 'b2'),
  ].map((entry) => JSON.stringify(entry)).join('\n'));
  const r = runHook({
    dir, proj, entries: [], verdict: FLAGGED,
    input: { hook_event_name: 'SubagentStop', agent_id: 'abc', agent_transcript_path: agentTranscript, last_assistant_message: '화면을 만들었고 안내 문구도 넣었습니다.' },
  });
  assert.equal(r.status, 2, r.stderr);
  const [call] = calls(dir);
  assert.match(call.input, /^\[src\/View\.tsx\]/);
  assert.doesNotMatch(call.input, /\[답변\]/);
});

test('답변에 검사기가 막는 오류가 있으면 Stop hook이 다시 쓰게 하므로 답변은 검토에서 뺀다', () => {
  const { dir, proj } = project();
  const answer = '설정을 바꿨습니다 · 다시 시작해 주십시오. 그 다음에는 로그를 확인해 주십시오. 문제가 없으면 배포합니다.';
  const r = runHook({ dir, proj, entries: [assistant([{ type: 'text', text: answer }], 'a1')], input: { last_assistant_message: answer }, verdict: FLAGGED });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(calls(dir).length, 0);
});

test('지적은 답변에 대한 것과 파일, commit 메시지, PR과 issue 글에 대한 것으로 나눈다', () => {
  const pieces = [
    { label: 'src/View.tsx', lines: ['3: 앞선 항목은 원문에 있습니다.'] },
    { label: 'commit 메시지', lines: ['앞선 기록을 고쳤습니다.'] },
    { label: '답변', lines: ['승인을 묻습니다. 앞선 항목도 고쳤습니다.'] },
  ];
  const issues = [
    { where: 'src/View.tsx 3', text: '앞선 항목은', fix: '이전 항목은', why: '' },
    { where: '답변 1번째 줄', text: '승인을 묻습니다', fix: '승인을 요청합니다', why: '' },
    { where: '', text: '앞선 기록을', fix: '이전 기록을', why: '' },
    { where: '', text: '앞선 항목도', fix: '이전 항목도', why: '' },
  ];
  const { answer, work } = splitIssues(issues, pieces);
  assert.deepEqual(answer.map((issue) => issue.fix), ['승인을 요청합니다', '이전 항목도']);
  assert.deepEqual(work.map((issue) => issue.fix), ['이전 항목은', '이전 기록을']);
});

test('파일과 commit 메시지에 대한 알림은 답변을 다시 보여 주라고 하지 않고 사용자에게 무엇을 하라고 요청하지 말라고 한다', () => {
  const message = reviewMessage([{ where: 'a.md 1', text: '앞선 항목', fix: '이전 항목', why: '' }], 'opus');
  assert.doesNotMatch(message, /답변이면/);
  assert.match(message, /사용자에게 무엇을 읽거나 하라고 요청하지 마십시오/);
  assert.match(answerReminder([{ where: '답변', text: '승인을 묻습니다', fix: '승인을 요청합니다', why: '' }]), /사용자에게 말하지 마십시오\.\n- `승인을 묻습니다` → `승인을 요청합니다`/);
});

test('답변에 대한 지적만 있으면 Claude에게 바로 전달하지 않고 다음 요청 때 알릴 지적으로 저장한다', () => {
  const { dir, proj } = project();
  const answer = '설정 파일을 고쳤습니다. 미리 계산하지 못한 unit이 있으면 승인을 묻습니다. 다음 배포 때 확인하겠습니다.';
  const session = `test-answer-${Date.now()}`;
  const verdict = { ok: false, issues: [{ where: '답변 1번째 줄', text: '승인을 묻습니다', fix: '승인을 요청합니다', why: 'ask for approval을 옮긴 말' }] };
  const r = runHook({ dir, proj, entries: [assistant([{ type: 'text', text: answer }], 'a1')], input: { session_id: session, last_assistant_message: answer }, verdict });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.deepEqual(takeAnswerIssues(session).map((issue) => issue.fix), ['승인을 요청합니다']);
  assert.deepEqual(takeAnswerIssues(session), []);
});

test('파일과 답변에 대한 지적이 함께 있으면 파일 지적만 알리고 답변 지적은 저장한다', () => {
  const { dir, proj } = project({ 'src/View.tsx': VIEW });
  const answer = '화면을 만들었습니다. 미리 계산하지 못한 unit이 있으면 승인을 묻습니다. 다음 배포 때 확인하겠습니다.';
  const session = `test-both-${Date.now()}`;
  const verdict = { ok: false, issues: [...FLAGGED.issues, { where: '답변', text: '승인을 묻습니다', fix: '승인을 요청합니다', why: '' }] };
  const entries = [
    assistant([{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: join(proj, 'src/View.tsx'), content: VIEW } }], 'a1'),
    result('w1'),
    assistant([{ type: 'text', text: answer }], 'a2'),
  ];
  const r = runHook({ dir, proj, entries, input: { session_id: session, last_assistant_message: answer }, verdict });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /`앞선 항목` → `이전 항목`/);
  assert.doesNotMatch(r.stderr, /승인을 묻습니다/);
  assert.deepEqual(takeAnswerIssues(session).map((issue) => issue.fix), ['승인을 요청합니다']);
});

test('UserPromptSubmit hook은 저장해 둔 답변 지적을 Claude에게 한 번만 알린다', () => {
  const session = `test-reminder-${Date.now()}`;
  saveAnswerIssues(session, [{ where: '답변', text: '승인을 묻습니다', fix: '승인을 요청합니다', why: '' }]);
  const prompt = () => {
    const r = spawnSync('node', [join(ROOT, 'scripts', 'hooks', 'userprompt.mjs')], {
      input: JSON.stringify({ session_id: session, hook_event_name: 'UserPromptSubmit', prompt: '다음 작업을 해 주십시오.' }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, KOREAN_STYLE_RULES: join(ROOT, 'docs', 'rules.md') },
      encoding: 'utf-8',
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  };
  assert.match(prompt(), /앞 답변을 검토 model이 따로 읽고[\s\S]*`승인을 묻습니다` → `승인을 요청합니다`/);
  assert.doesNotMatch(prompt(), /앞 답변을 검토 model이/);
});

test('평가 script는 지적한 표현이 든 문장을 찾아 집계한다', () => {
  const fixture = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/eval/reviewer.json'), 'utf-8'));
  const screen = fixture.batches.find((batch) => batch.id === 'screen');
  assert.equal(attribute(screen, { where: 'src/JournalView.tsx 12', text: '앞선 항목', fix: '이전 항목' }), 'source-1');
  assert.equal(attribute(screen, { where: '답변 1번째 줄', text: '승인을 묻습니다', fix: '승인을 요청합니다' }), 'answer-1');
  assert.equal(attribute(screen, { where: '어딘가', text: '없는 표현', fix: '고친 표현' }), null);
  const summary = summarizeReviewer(fixture, [{ batch: 'screen', parsed: true, flagged: ['source-1', 'source-3'], unknown: 1, cost: 0.02, apiMs: 4000 }]);
  assert.deepEqual(summary.english, { flagged: 1, judged: 3 });
  assert.deepEqual(summary.natural, { flagged: 1, judged: 3 });
  assert.equal(summary.unknown, 1);
});
