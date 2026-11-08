/* 동사를 명사처럼 쓴 꼴로 끝나는 Markdown 제목을 잡는 `heading-form` 규칙의 회귀 test입니다. 잡아야 할 제목과 잡으면 안 되는 제목을 함께 둡니다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRules, parseRuleBlock } from '../scripts/lib/rules.mjs';
import { checkText, checkToolCall } from '../scripts/lib/check.mjs';
import { newErrors } from '../scripts/hooks/pretooluse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = loadRules(join(ROOT, 'docs', 'rules.md'));

/* `heading-form` 규칙에 걸린 위반만 돌려줍니다. */
const caught = (text, target = 'doc', rules = RULES) => checkText(text, rules, target).filter((v) => v.rule === 'heading-form');

/* 제목 하나와 본문 한 줄로 된 글에서 이 규칙에 걸린 위반을 돌려줍니다. */
const caughtHeading = (heading, target = 'doc', rules = RULES) => caught(`${heading}\n\n본문입니다.`, target, rules);

/* ---------------------------------------------------------------------------  잡아야 할 제목  --------------------------------------------------------------------------- */

/*
 * 이 repository의 Markdown 문서에서 고치기로 한 제목과 그 제목을 잡는 꼴입니다. 제목은 commit `84d3da9`의 원문을 그대로 옮겼습니다.
 * 고치기로 한 제목 가운데 `## 쓰는 순서`와 `## 다시 설치할 때 직접 고친 규칙을 그대로 두는 방식`은 `법`, `것`, `때`, `일`이 아닌 명사로 끝나므로 이 규칙이 잡지 않습니다. 그래서 두 제목은 잡지 않는 제목을 확인하는 test에 두었습니다.
 */
const REPO_HEADINGS = [
  /* README.md */
  ['## 빠르게 시작하기', '-하기'],
  ['### Claude Code에게 설치 맡기기', '-맡기기'],
  ['### 직접 설치하기', '-하기'],
  ['### 써 보기', '-보기'],
  ['## 쓰는 법', '-는 법'],
  ['## 설치하면 바뀌는 것', '-ㄴ 것'],
  ['## 다시 설치하기', '-하기'],
  ['## 기여하기', '-하기'],
  /* docs/usage.md(`## 쓰는 법`은 README.md에도 있습니다) */
  ['### Hook이 하는 일', '-ㄴ 일'],
  ['## 규칙 바꾸기', '-바꾸기'],
  ['## 다시 설치하기와 팀에서 쓰기', '-쓰기'],
  /* docs/examples.md */
  ['## 1. Chrome 확장 프로그램을 고친 뒤 반영되지 않을 때 할 일 묻기', '-묻기'],
  ['## 2. 메모로 README 첫 단락 쓰기', '-쓰기'],
  ['## 3. 영어 README 문단을 한국어로 옮기기', '-옮기기'],
  ['## 4. 장애 메모로 팀 Slack에 공유할 요약 쓰기', '-쓰기'],
  ['## 5. 메모로 PR 설명 쓰기', '-쓰기'],
  ['## 6. Deploy 뒤 502가 날 때 어디부터 볼지 묻기', '-묻기'],
  ['## 7. 번역투가 든 문단 다듬기', '-다듬기'],
  ['## 8. PR review comment 쓰기', '-쓰기'],
  ['## 9. Commit 메시지 쓰기', '-쓰기'],
  ['## 10. 함수에 한국어 주석 달기', '-달기'],
  ['## 11. Kubernetes Pod가 Pending인 이유 묻기', '-묻기'],
  ['## 12. 이용자에게 보낼 점검 공지 쓰기', '-쓰기'],
  ['## 다시 실행하기', '-하기'],
  /* docs/rules.md, docs/writing.md */
  ['## 규칙을 바꿀 때', '-ㄹ 때'],
  ['## 처음부터 한국어로 쓰기', '-쓰기'],
  ['## 내용 고르기', '-고르기'],
  /* skill/korean-rewrite/SKILL.md(`## 내용 고르기`는 docs/writing.md에도 있습니다) */
  ['# 한국어로 쓰기', '-쓰기'],
  ['## 처음부터 한국어로 생각하기', '-하기'],
  ['## 옮기거나 고칠 때', '-ㄹ 때'],
  /* .claude/agents/korean-reviewer.md, CLAUDE.md */
  ['## 읽을 것', '-ㄹ 것'],
  ['## 지킬 것', '-ㄹ 것'],
  ['## 한국어로 생각하고 쓰기', '-쓰기'],
];

/* 위 목록과 합쳐 기본값의 꼴마다 그 꼴로 끝나는 제목이 하나 이상 있게 합니다. 기본값에 꼴을 추가하면 이 목록에도 예를 추가합니다. */
const FORM_EXAMPLES = [
  ['## 알아보기', '-보기'],
  ['### 기여자 되기', '-되기'],
  ['## 검사 통과시키기', '-시키기'],
  ['## 새 프로젝트 만들기', '-만들기'],
  ['## 오류 고치기', '-고치기'],
  ['## 설정 파일 읽기', '-읽기'],
  ['## 원인 찾기', '-찾기'],
  ['## IT 용어 검사 끄기', '-끄기'],
  ['## 검토 hook 켜기', '-켜기'],
  ['## 규칙 문서에 키 넣기', '-넣기'],
  ['## Cache 지우기', '-지우기'],
  ['## 경고 없애기', '-없애기'],
  ['## 응답 시간 줄이기', '-줄이기'],
  ['## Timeout 늘리기', '-늘리기'],
  ['## 원인 범위 좁히기', '-좁히기'],
  ['## 오류 다루기', '-다루기'],
  ['## Log 남기기', '-남기기'],
  ['## 설정 파일 합치기', '-합치기'],
  ['## Node.js 버전 맞추기', '-맞추기'],
  ['## 주석 붙이기', '-붙이기'],
  ['## 도움 받기', '-받기'],
  ['## 1. 프로그램 내려받기', '-받기'],
  ['## 알림 보내기', '-보내기'],
  ['## CSV로 내보내기', '-보내기'],
  ['## 데이터 가져오기', '-가져오기'],
  ['## 설정 불러오기', '-불러오기'],
  ['## 기본 문법 배우기', '-배우기'],
  ['## 단축키 익히기', '-익히기'],
  ['## Cache 비우기', '-비우기'],
  ['## Test 돌리기', '-돌리기'],
  ['## Local server 띄우기', '-띄우기'],
  ['## 메모리 누수 잡기', '-잡기'],
  ['## 압축 풀기', '-풀기'],
  ['## 버전 올리기', '-올리기'],
  ['## 바뀐 것', '-ㄴ 것'],
  ['## 남은 것', '-ㄴ 것'],
  ['## 접속이 되지 않을 때', '-ㄹ 때'],
  ['## 남은 일', '-ㄴ 일'],
  ['## 할 일', '-ㄹ 일'],
  ['## Deploy 전에 확인할 일', '-ㄹ 일'],
];

/* 제목마다 파일과 commit 메시지에서 오류 한 건이 나오고 보고에 제목과 꼴이 들어 있는지 확인합니다. */
function assertCaughtAsError(cases) {
  for (const [heading, form] of cases) {
    for (const target of ['doc', 'commit']) {
      const found = caughtHeading(heading, target);
      assert.equal(found.length, 1, `${target}: ${heading}`);
      assert.equal(found[0].severity, 'error', `${target}: ${heading}`);
      assert.equal(found[0].line, 1, `${target}: ${heading}`);
      assert.ok(found[0].detail.includes(`${JSON.stringify(heading)}. ${JSON.stringify(form)} 꼴 대신`), found[0].detail);
      assert.ok(found[0].detail.includes('"설치 방법"'), found[0].detail);
    }
  }
}

test('이 repository의 문서에서 고치기로 한 제목 가운데 이 규칙의 꼴로 끝나는 제목은 파일과 commit 메시지에서 오류로 막고 찾은 제목과 꼴을 알린다', () => {
  assert.equal(REPO_HEADINGS.length, 33, '이 규칙이 잡는 고칠 제목은 35곳에 있지만 각각 두 파일에 있는 `## 쓰는 법`과 `## 내용 고르기`는 한 번씩만 적었습니다');
  assertCaughtAsError(REPO_HEADINGS);
});

test('기본값의 꼴마다 그 꼴로 끝나는 제목을 잡는다', () => {
  assertCaughtAsError(FORM_EXAMPLES);
  const covered = new Set([...REPO_HEADINGS, ...FORM_EXAMPLES].map(([, form]) => form));
  for (const form of RULES.headingFormEndings) assert.ok(covered.has(form), `${form} 꼴로 끝나는 예가 없습니다`);
});

test('끝의 `:`과 `?`, 굵은 글씨와 기울임 표시, 끝에 붙은 괄호 설명, 인라인 코드, 닫는 `#`은 떼고 판단한다', () => {
  for (const heading of [
    '## 다시 설치하기:',
    '### 기여하기?',
    '## **써 보기**',
    '## *기여하기*',
    '## 다시 설치하기 (선택)',
    '## `npm`으로 설치하기',
    '## 다시 설치하기 `--force`',
    '## 다시 설치하기 ##',
    '## 1. 설치하기',
    '## 규칙을 바꿀 때:',
    '## **메모로 PR 설명 쓰기** (예시)',
  ]) {
    assert.equal(caught(heading).length, 1, heading);
  }
});

test('제목마다 줄 번호를 붙여 따로 알린다', () => {
  const found = caught('## 다시 설치하기\n\n본문입니다.\n\n## 기여하기\n\n본문입니다.\n\n## 규칙을 바꿀 때\n\n본문입니다.');
  assert.deepEqual(found.map((v) => v.line), [1, 5, 9]);
});

test('줄 끝이 CRLF인 글에서도 제목을 찾는다', () => {
  const found = caught('## 다시 설치하기\r\n\r\n본문입니다.\r\n');
  assert.equal(found.length, 1);
  assert.ok(found[0].detail.includes('"## 다시 설치하기"'), found[0].detail);
});

/* ---------------------------------------------------------------------------  잡으면 안 되는 제목  --------------------------------------------------------------------------- */

/* 이 repository의 Markdown 문서에서 그대로 두기로 한 제목 88개입니다. Commit `84d3da9`의 원문을 파일 순서대로 옮겼습니다. */
const KEEP_HEADINGS = [
  /* README.md */
  '## 설치 전후 비교',
  '## 특징',
  '## 측정 결과',
  '## 동작 원리',
  '## 구조',
  '## 제약',
  '## 문서',
  '## 라이선스',
  /* docs/usage.md */
  '# 설치와 사용',
  '## 설치',
  '### 설치 option',
  '### 설치되는 파일',
  '### 검사기 CLI',
  '## 제거',
  '## 문제 해결',
  '## 다른 코딩 agent',
  /* docs/examples.md */
  '# 설치 전후 예시',
  '## Skill 예문과 겹치는 요청',
  /* docs/how-it-works.md */
  '# 동작 원리',
  '## Skill을 건너뛰지 못하게 하는 방식',
  '## 한글이 많은 글을 작성 agent에게 맡기게 하는 방식',
  '## 요청을 마친 뒤 검토 model이 다시 읽게 하는 방식',
  '## Output style이 적용되는 방식',
  '## 검사 순서',
  '## 규칙 module',
  '## Hook이 검사하는 부분',
  '## Server가 요약한 진행 보고',
  '## 규칙 문서를 읽는 방식',
  /* docs/limits.md */
  '# 제약',
  '## Skill과 output style',
  '## 작성 agent',
  '## 검토 hook',
  '## 검사기',
  '## Hook',
  '## 설정과 설치',
  '## 평가',
  /* docs/rules.md */
  '# 검사 규칙',
  '## 오류와 경고',
  '## 한국어를 쓰기 전에 부르는 skill',
  '## 한글이 많은 글을 맡기는 agent',
  '## 요청을 마친 뒤 다시 읽는 검토 model',
  '## IT 용어 표기',
  '## 첫머리의 영어 낱말과 금액 표기',
  '## 번역투',
  '## 격식 있는 문어체',
  '## 접속 부사',
  '## 일부 규칙을 경고로만 두고 영어 용어 수를 제한하지 않는 이유',
  '## 설정',
  '## 키 설명',
  '## 보고에 나오는 규칙 이름',
  /* docs/writing.md */
  '# 한국어 작성 원칙',
  '## 번역투',
  '### 정의',
  '### 판단 기준',
  '### 금지하는 번역투',
  '### 번역투가 아닌 정상 용법',
  '### 고칠 문장과 고친 문장',
  '## 격식 있는 문어체',
  '## 말투',
  '## IT 용어 표기',
  '### 이 repository의 규칙',
  '### 영어로 쓸 말을 고르는 기준',
  '### 조사와 용언',
  '### 일반 독자가 읽는 글',
  '### 반대 근거',
  '## 문장',
  '## 접속 부사',
  '## 낱말',
  '## 문장 부호',
  '## 글 종류별 관례',
  '## 출처',
  /* skill/korean-rewrite/SKILL.md */
  '## 번역투',
  '## 격식 있는 문어체',
  '## 용어 표기',
  '## 고칠 표현',
  '### 낱말',
  '### 문장',
  '### 번역투가 아닌 표현',
  '### AI가 자주 쓰는 습관',
  '## 글 종류별 관례',
  /* skill/korean-style/SKILL.md */
  '# 한국어 검사 규칙 확인',
  /* .claude/agents/korean-reviewer.md */
  '## 점검 목록',
  '## 지적하지 않는 표현',
  '## 보고 형식',
  /* CLAUDE.md */
  '# 작업 지침',
  '## 검사와 규칙',
  '## 문서와 측정',
  '## Commit',
];

test('이 repository의 문서에서 그대로 두기로 한 제목 88개는 잡지 않는다', () => {
  assert.equal(KEEP_HEADINGS.length, 88);
  for (const heading of KEEP_HEADINGS) assert.deepEqual(caughtHeading(heading), [], heading);
});

test('업무 문서식 명사구로 쓴 제목, 끝 글자가 `기`인 명사로 끝나는 제목, 영어로만 쓴 제목은 잡지 않는다', () => {
  for (const heading of [
    '## 설치 방법',
    '## 사용 방법',
    '## 재설치',
    '## 기여 방법',
    '## 설치 후 변경 사항',
    '## 규칙 변경 절차',
    '## 글쓰기 규칙',
    '## 측정 주기',
    '## 화면 크기',
    '## 검사기',
    '## IT 용어 표기',
    '## 동작 원리',
    '## 쓰기 권한',
    '## 읽기 전용',
    '## 미리보기 설정',
    '# 사용법',
    '## Getting started',
    '## Quick start',
    '## 문법',
    '## 그것',
  ]) {
    assert.deepEqual(caughtHeading(heading), [], heading);
  }
  assert.ok(!RULES.headingFormEndings.some((form) => form.replace(/^-/u, '').trim() === '기'), '끝 글자 `기`만 적은 항목은 `## 측정 주기`도 잡습니다');
});

test('관형절 뒤에 `순서`, `이유`, `방식`, `파일`처럼 `법`, `것`, `때`, `일`이 아닌 명사가 오는 제목은 잡지 않는다', () => {
  for (const heading of [
    '## 쓰는 순서',
    '## 다시 설치할 때 직접 고친 규칙을 그대로 두는 방식',
    '## 마감이 늦어진 이유',
    '## 설치되는 파일',
    '### 설치되는 파일',
    '## 규칙 문서를 읽는 방식',
    '### 영어로 쓸 말을 고르는 기준',
    '## 한국어를 쓰기 전에 부르는 skill',
  ]) {
    assert.deepEqual(caughtHeading(heading), [], heading);
  }
});

test('기본값의 예외 낱말 하나로 된 제목과 원래 명사나 기능 이름인 예외 낱말로 끝나는 제목은 잡지 않는다', () => {
  for (const entry of RULES.headingFormExempt) {
    const word = entry.replace(/^_/u, '');
    assert.deepEqual(caughtHeading(`## ${word}`), [], word);
  }
  for (const heading of [
    '## 덧셈과 더하기',
    '## 뺄셈과 빼기',
    '## 곱셈과 곱하기',
    '## 나눗셈과 나누기',
    '## 맞춤법과 띄어쓰기',
    '## 음성 받아쓰기',
    '## 기술 글쓰기',
    '## 코드 들여쓰기',
    '## 들여쓰기와 내어쓰기',
    '## 가로쓰기와 세로쓰기',
    '## 놀이와 끝말잇기',
    '## 브라우저 즐겨찾기',
    '## 지도 길찾기',
    '## 복사와 붙여넣기',
    '## 문서 미리보기',
    '## 화면 돋보기',
  ]) {
    assert.deepEqual(caughtHeading(heading), [], heading);
  }
});

test('코드 블록, 문서의 인용 구간, `>`로 시작하는 인용 줄, 제목이 아닌 줄은 보지 않는다', () => {
  for (const text of [
    '아래처럼 씁니다.\n\n```md\n## 다시 설치하기\n```',
    '아래를 실행합니다.\n\n```sh\n# 다시 설치하기\nnpm run gate\n```',
    '받은 글입니다.\n<!-- korean-style-quote -->\n## 다시 설치하기\n<!-- /korean-style-quote -->',
    '> ## 다시 설치하기',
    '> ## 상품 정보를 한 번에 조회하기',
    '#다시 설치하기',
    '    ## 다시 설치하기',
    '설치하기 전에 확인합니다.',
    '제목을 `## 다시 설치하기`처럼 쓰지 않습니다.',
    '제목을 `## Staging에 deploy하기`처럼 쓰지 않습니다.',
  ]) {
    assert.deepEqual(caught(text), [], text);
  }
});

test('제목이 아닌 문장, 목록 항목, 굵은 글씨 항목 이름, 표 칸에 쓴 같은 꼴은 잡지 않는다', () => {
  for (const text of [
    '규칙을 바꿀 때는 test도 함께 고칩니다.',
    'Hook이 하는 일은 아래 표에 정리했습니다.',
    '메모로 PR 설명 쓰기를 작성 agent에게 맡깁니다.',
    '남은 일은 cache를 언제 지울지 정하는 것입니다.',
    '- 규칙 바꾸기',
    '1. 설정 파일 읽기',
    '**규칙 바꾸기.** 규칙 문서의 값을 고칩니다.',
    '**IT 용어 검사 끄기.** `banned-transliteration` 값을 비웁니다.',
    '| 할 일 | 담당 |\n| --- | --- |\n| 규칙 바꾸기 | 운영팀 |',
  ]) {
    assert.deepEqual(caught(text), [], text);
  }
});

test('소스 파일에서 `#`으로 시작하는 주석은 제목으로 보지 않는다', () => {
  for (const path of ['scripts/setup.sh', 'tools/build.py']) {
    const found = checkText('# 다시 설치하기\n# 규칙을 바꿀 때\nnpm run gate\n', RULES, 'comment', { path }).filter((v) => v.rule === 'heading-form');
    assert.deepEqual(found, [], path);
  }
});

test('`보기`처럼 잡을 꼴과 글자가 같은 예외 낱말은 제목이 그 낱말 하나뿐일 때만 잡지 않는다', () => {
  assert.deepEqual(caught('## 보기'), []);
  assert.equal(caught('## 써 보기').length, 1, '앞에 다른 낱말이 있으면 `보기`를 동사로 쓴 것으로 봅니다');
  assert.equal(caught('## 코드 보기').length, 1, '앞에 다른 낱말이 있으면 `보기`를 동사로 쓴 것으로 봅니다');
  const noExempt = parseRuleBlock('register: 합니다체\nheading-form-endings: -보기\n');
  assert.equal(caught('## 보기', 'doc', noExempt).length, 1, '예외 키가 없으면 `보기`도 잡습니다');
  const plain = parseRuleBlock('register: 합니다체\nheading-form-endings: -보기, -쓰기\nheading-form-exempt: 보기, 쓰기\n');
  assert.deepEqual(caught('## 쓰기', 'doc', plain), [], '`_`를 붙이지 않아도 제목이 그 낱말 하나뿐이면 잡지 않습니다');
  assert.equal(caught('## 문서 쓰기', 'doc', plain).length, 1, '`_`를 붙이지 않아도 앞에 다른 낱말이 있으면 잡습니다');
});

test('앞에 `_`를 붙인 예외 낱말은 제목이 그 낱말 하나뿐일 때만 잡지 않는다', () => {
  for (const word of ['내려받기', '내보내기', '가져오기', '불러오기', '읽기', '쓰기']) {
    assert.ok(RULES.headingFormExempt.includes(`_${word}`), word);
    assert.deepEqual(caught(`## ${word}`), [], word);
  }
  assert.equal(caught('### 1. 프로그램 내려받기').length, 1);
  assert.equal(caught('## CSV로 내보내기').length, 1);
  assert.equal(caught('## 데이터 가져오기').length, 1);
  assert.equal(caught('## 설정 불러오기').length, 1);
  assert.equal(caught('## 문서 쓰기').length, 1);
  const own = parseRuleBlock('register: 합니다체\nheading-form-endings: -받기\nheading-form-exempt: _내려받기, 주고받기\n');
  assert.deepEqual(caught('## 내려받기', 'doc', own), []);
  assert.equal(caught('## 소스 코드 내려받기', 'doc', own).length, 1, '`_`를 붙인 낱말은 앞에 다른 낱말이 있으면 잡습니다');
  assert.deepEqual(caught('## 메시지 주고받기', 'doc', own), [], '`_`를 붙이지 않은 낱말은 앞에 다른 낱말이 있어도 잡지 않습니다');
  const without = parseRuleBlock('register: 합니다체\nheading-form-endings: -받기\nheading-form-exempt: 내려받기\n');
  assert.deepEqual(caught('## 소스 코드 내려받기', 'doc', without), [], '`_`가 없으면 앞에 다른 낱말이 있어도 잡지 않습니다');
});

test('예외 키에 띄어 쓴 구절을 적으면 제목 끝의 같은 구절을 예외로 본다', () => {
  const own = parseRuleBlock('register: 합니다체\nheading-form-endings: -보기, -ㄴ 것\nheading-form-exempt: 보기, 정답과 보기, 이번 것\n');
  assert.deepEqual(caught('## 정답과 보기', 'doc', own), []);
  assert.deepEqual(caught('## 시험 정답과 보기', 'doc', own), []);
  assert.deepEqual(caught('## 이번 것', 'doc', own), []);
  assert.equal(caught('## 써 보기', 'doc', own).length, 1);
  assert.equal(caught('## 바뀐 것', 'doc', own).length, 1);
});

test('제약 문서에 적은 대로 목록에 없는 꼴, 부사어나 물음으로 끝나는 제목, 동사로 쓴 예외 낱말은 잡지 못한다', () => {
  for (const heading of ['## 공백 빼기', '## 문서 나누기', '## 시작하기 전에', '## 마치며', '## 캐시는 언제 지울까', '## 값 더하기']) {
    assert.deepEqual(caughtHeading(heading), [], heading);
  }
});

test('명사로 쓴 제목도 받침만 보는 꼴로 끝나거나, 제목이 그 낱말 하나뿐일 때만 예외인 낱말로 끝나거나, 예외 목록에 없는 명사로 끝나면 잡는다', () => {
  /* `docs/limits.md`에 적은 검사기의 한계입니다. */
  for (const heading of ['## 이번 것', '## 오늘 일', '## 정답과 보기', '## 읽기와 쓰기', '## 숨은그림찾기']) {
    assert.equal(caughtHeading(heading).length, 1, heading);
  }
});

/* ---------------------------------------------------------------------------  답변과 도구에 넘기는 글  --------------------------------------------------------------------------- */

test('답변과 도구에 넘기는 글에서는 경고로만 알린다', () => {
  const text = '## 다시 설치하기\n\n설치 script를 다시 실행합니다.';
  assert.deepEqual(caught(text, 'chat').map((v) => v.severity), ['warning']);
  assert.deepEqual(caught('## 규칙을 바꿀 때\n\n규칙 문서를 고칩니다.', 'chat').map((v) => v.severity), ['warning']);
  const question = checkToolCall('AskUserQuestion', { questions: [{ question: text }] }, RULES).filter((v) => v.rule === 'heading-form');
  assert.deepEqual(question.map((v) => v.severity), ['warning']);
  const prompt = checkToolCall('Agent', { prompt: text }, RULES, 'doc').filter((v) => v.rule === 'heading-form');
  assert.deepEqual(prompt.map((v) => v.severity), ['warning']);
});

/* ---------------------------------------------------------------------------  파일 편집  --------------------------------------------------------------------------- */

test('PreToolUse hook은 원래 있던 제목 때문에 다른 줄을 고치는 편집을 막지 않고 새로 쓴 제목만 막는다', () => {
  const before = '# 안내\n\n## 쓰는 법\n\n명령을 실행합니다.\n';
  assert.deepEqual(newErrors(before, before.replace('명령을 실행합니다.', '명령을 한 번 실행합니다.'), RULES, 'doc', 'docs/guide.md'), []);
  assert.deepEqual(newErrors(before, before.replace('## 쓰는 법', '## 사용 방법'), RULES, 'doc', 'docs/guide.md'), []);
  const added = newErrors(before, `${before}\n## 다시 설치하기\n\n다시 설치합니다.\n`, RULES, 'doc', 'docs/guide.md');
  assert.deepEqual(added.map((v) => [v.rule, v.line]), [['heading-form', 7]]);
});

test('PreToolUse hook은 인라인 코드가 든 새 제목도 오류 한 건으로 보고한다', () => {
  /* Hook은 바뀐 줄에서 인라인 코드를 지운 뒤 다시 검사합니다. 이때 큰따옴표 안에 든 말까지 같아야 두 검사의 보고를 같은 오류로 봅니다. 그래서 보고에 원문 제목을 그대로 보여 주면 같은 제목이 오류 두 건으로 나옵니다. */
  const before = '# 안내\n\n설명입니다.\n';
  const found = newErrors(before, `${before}\n## \`npm\`으로 설치하기\n\n설치합니다.\n`, RULES, 'doc', 'docs/guide.md');
  assert.equal(found.filter((v) => v.rule === 'heading-form').length, 1, JSON.stringify(found));
});

/* ---------------------------------------------------------------------------  규칙 문서의 키  --------------------------------------------------------------------------- */

test('기본 규칙은 잡을 꼴과 예외 낱말의 기본값을 담고 `chat-advisory-rules`에도 이 규칙을 담는다', () => {
  for (const form of [
    '-하기', '-되기', '-시키기', '-보기',
    '-쓰기', '-묻기', '-고르기', '-맡기기', '-바꾸기', '-옮기기', '-다듬기', '-달기',
    '-만들기', '-고치기', '-읽기', '-찾기', '-끄기', '-켜기',
    '-는 법', '-ㄴ 것', '-ㄹ 것', '-ㄹ 때', '-ㄴ 일', '-ㄹ 일',
  ]) {
    assert.ok(RULES.headingFormEndings.includes(form), form);
  }
  for (const word of ['글쓰기', '띄어쓰기', '받아쓰기', '더하기', '곱하기', '빼기', '나누기', '끝말잇기', '_보기']) {
    assert.ok(RULES.headingFormExempt.includes(word), word);
  }
  assert.ok(RULES.chatAdvisoryRules.includes('heading-form'));
  assert.ok(!RULES.advisoryRules.includes('heading-form'), '파일에서는 오류여야 합니다');
});

test('규칙 문서의 제목 형식 절은 규칙 블록과 같은 기본값을 적는다', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'rules.md'), 'utf-8');
  const ticks = (list) => list.map((item) => `\`${item}\``).join(', ');
  const verbForms = RULES.headingFormEndings.filter((form) => !/\s/u.test(form));
  const nounForms = RULES.headingFormEndings.filter((form) => /\s/u.test(form));
  assert.ok(doc.includes(`\`-기\` 꼴 ${verbForms.length}가지는 ${ticks(verbForms)}입니다.`), '`-기` 꼴 목록');
  assert.ok(doc.includes(`관형형 꼴 ${nounForms.length}가지는 ${ticks(nounForms)}입니다.`), '관형형 꼴 목록');
  assert.ok(doc.includes(`예외 기본값은 ${RULES.headingFormExempt.length}개입니다.`), '예외 개수');
  const alone = RULES.headingFormExempt.filter((word) => word.startsWith('_'));
  assert.ok(doc.includes(`기본값의 \`_\` 낱말은 ${ticks(alone)}입니다.`), '`_` 낱말 목록');
  for (const word of RULES.headingFormExempt) assert.ok(doc.includes(`\`${word}\``), word);
});

test('`heading-form-endings` 키가 없거나 값을 비운 규칙에서는 검사하지 않는다', () => {
  assert.deepEqual(caught('## 다시 설치하기', 'doc', parseRuleBlock('register: 합니다체\n')), []);
  assert.deepEqual(caught('## 다시 설치하기', 'doc', parseRuleBlock('register: 합니다체\nheading-form-endings:\n')), []);
});

test('잡을 꼴과 예외 낱말은 규칙 문서에서 바꿀 수 있고 자음 하나로 적은 어미는 받침으로 본다', () => {
  const own = parseRuleBlock('register: 합니다체\nheading-form-endings: -쓰기, -(으)ㄹ 것, -ㄹ 때\nheading-form-exempt: 글쓰기\n');
  assert.equal(caught('## 문서 쓰기', 'doc', own).length, 1);
  assert.deepEqual(caught('## 기술 글쓰기', 'doc', own), [], '끝 낱말이 예외 낱말이면 잡지 않습니다');
  assert.deepEqual(caught('## 다시 설치하기', 'doc', own), [], '키에 적지 않은 꼴은 잡지 않습니다');
  assert.equal(caught('## 읽을 것', 'doc', own).length, 1, '괄호 안의 글자는 떼고 받침을 봅니다');
  assert.equal(caught('## 확인할 것', 'doc', own).length, 1);
  assert.deepEqual(caught('## 바뀐 것', 'doc', own), [], '`-ㄹ 것`은 받침이 ㄴ인 낱말을 잡지 않습니다');
  assert.equal(caught('## 규칙을 바꿀 때', 'doc', own).length, 1);
  assert.deepEqual(caught('## 바뀐 때', 'doc', own), [], '`-ㄹ 때`는 받침이 ㄴ인 낱말을 잡지 않습니다');
  assert.deepEqual(caught('## 저녁 때', 'doc', own), [], '`-ㄹ 때`는 받침이 ㄹ이 아닌 낱말을 잡지 않습니다');
});

test('`--explain heading-form`은 규칙 문서에서 이 규칙의 설명을 찾아 보여 준다', () => {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT };
  delete env.KOREAN_STYLE_RULES;
  const r = spawnSync('node', [join(ROOT, 'scripts', 'check-korean.mjs'), '--explain', 'heading-form'], { encoding: 'utf-8', cwd: ROOT, env });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /동사를 명사처럼 쓴 꼴로 끝나는 Markdown 제목입니다/);
});
