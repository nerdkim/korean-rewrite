/* IT 용어 표기, 번역투 목록, `세다`, 한자어와 구어 낱말 규칙의 회귀 test입니다. 잡아야 할 문장과 잡으면 안 되는 문장을 함께 둡니다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRules, parseRuleBlock } from '../scripts/lib/rules.mjs';
import { blockingViolations, checkText, checkToolCall } from '../scripts/lib/check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = loadRules(join(ROOT, 'docs', 'rules.md'));
const TERM_RULES = ['transliteration', 'ambiguous-transliteration', 'loose-translation'];

/* 지정한 규칙에 걸린 위반만 돌려줍니다. */
const caught = (text, rules, target = 'doc', options = {}) => checkText(text, RULES, target, options).filter((v) => rules.includes(v.rule));

/* ---------------------------------------------------------------------------  IT 용어 표기  --------------------------------------------------------------------------- */

test('개발자가 읽는 문서와 commit 메시지에 쓴 IT 용어의 한글 음차는 오류로 막고 영어 원어를 알린다', () => {
  const cases = [
    ['커밋하기 전에 확인합니다.', 'commit'], ['머지한 뒤 확인합니다.', 'merge'], ['리포지토리를 만들었습니다.', 'repository'],
    ['브랜치를 나눴습니다.', 'branch'], ['빌드가 끝났습니다.', 'build'], ['캐시를 비웠습니다.', 'cache'],
    ['파이프라인을 고쳤습니다.', 'pipeline'], ['스크립트를 실행합니다.', 'script'], ['디렉터리를 만듭니다.', 'directory'],
    ['회귀 테스트를 추가합니다.', 'test'], ['서버를 띄웁니다.', 'server'], ['데이터를 옮겼습니다.', 'data'],
    ['브라우저에서 엽니다.', 'browser'], ['폴더를 지웠습니다.', 'folder'], ['모델을 바꿨습니다.', 'model'],
    ['프롬프트를 고쳤습니다.', 'prompt'], ['세션이 끊겼습니다.', 'session'], ['토큰이 만료됐습니다.', 'token'],
    ['로그를 읽었습니다.', 'log'], ['옵션을 켰습니다.', 'option'],
  ];
  for (const [text, english] of cases) {
    for (const target of ['doc', 'commit']) {
      const found = checkText(text, RULES, target).filter((v) => v.rule === 'transliteration');
      assert.equal(found.length, 1, `${target}: ${text}`);
      assert.equal(found[0].severity, 'error', `${target}: ${text}`);
      assert.ok(found[0].detail.includes(`"${english}"`), `${text}: ${found[0].detail}`);
    }
  }
});

test('음차 뒤에 조사, `-하다`, `-되다`, 접미사가 붙어도 잡고 영어 낱말 바로 뒤에 붙은 음차도 잡는다', () => {
  for (const text of ['main에 커밋했습니다.', '머지되면 알립니다.', '테스트용 data를 올렸습니다.', 'server별로 서버별 설정을 나눕니다.', '토큰화된 문장입니다.', 'API서버를 다시 띄웠습니다.', '로그상으로는 정상입니다.']) {
    assert.ok(caught(text, ['transliteration']).length > 0, text);
  }
});

test('다른 낱말에 든 음차, 뒤에 다른 말이 이어진 음차, 숫자 바로 뒤의 낱말은 잡지 않는다', () => {
  for (const text of [
    '나머지 파일은 지웠습니다.',
    '머지않아 새 버전이 나옵니다.',
    '캐시백 혜택을 받았습니다.',
    '주간 리포트를 보냈습니다.',
    '레포트를 제출했습니다.',
    '빌드업 축구를 합니다.',
    '블로그에 글을 올렸습니다.',
    '로그라이크 게임입니다.',
    '캐시미어 소재입니다.',
    '모델하우스를 둘러봤습니다.',
    '폴더폰을 샀습니다.',
    '커밋먼트가 필요합니다.',
    '1분기 매출을 정리했습니다.',
  ]) {
    assert.deepEqual(caught(text, TERM_RULES), [], text);
  }
});

test('`term-exempt`에 적은 구절 안의 낱말은 잡지 않는다', () => {
  for (const text of ['푸시 알림을 껐습니다.', '분기별 실적을 냅니다.', '이번 분기 목표입니다.', '플러그인 하이브리드 차량입니다.']) {
    assert.deepEqual(caught(text, TERM_RULES), [], text);
  }
  /* 예외 구절 밖에서 다시 나오면 잡습니다. */
  assert.equal(caught('푸시 알림을 끈 뒤 main에 푸시했습니다.', ['transliteration']).length, 1);
  const own = parseRuleBlock('banned-transliteration: 테스트=test\nterm-exempt: 적성 테스트');
  assert.equal(checkText('적성 테스트를 봤습니다.', own, 'doc').length, 0);
  assert.equal(checkText('회귀 테스트를 봤습니다.', own, 'doc').length, 1);
});

test('한 자리에서 여러 항목이 맞으면 가장 긴 항목 하나만 잡는다', () => {
  assert.deepEqual(caught('로그인 화면을 고쳤습니다.', TERM_RULES).map((v) => v.detail.match(/"[^"]+"/)[0]), ['"로그인"']);
  assert.deepEqual(caught('데이터베이스를 옮겼습니다.', TERM_RULES).map((v) => v.detail.match(/"[^"]+"/)[0]), ['"데이터베이스"']);
  /* `코드 리뷰`는 오류 항목이고 `리뷰`는 경고 항목이지만 같은 자리를 두 번 보고하지 않습니다. */
  assert.deepEqual(caught('코드 리뷰를 부탁드립니다.', TERM_RULES).map((v) => v.rule), ['transliteration']);
});

test('일반 뜻도 있는 음차와 일반 뜻과 겹치는 번역어는 경고로만 알린다', () => {
  for (const [text, rule] of [
    ['이슈를 정리했습니다.', 'ambiguous-transliteration'],
    ['리뷰를 부탁드립니다.', 'ambiguous-transliteration'],
    ['보도자료를 배포했습니다.', 'loose-translation'],
    ['저장소에 올렸습니다.', 'loose-translation'],
    ['변경을 main에 병합했습니다.', 'loose-translation'],
    ['조건마다 분기를 나눴습니다.', 'loose-translation'],
  ]) {
    const found = checkText(text, RULES, 'doc');
    assert.ok(found.some((v) => v.rule === rule && v.severity === 'warning'), text);
    assert.equal(blockingViolations(found).length, 0, text);
  }
});

test('코드 블록, 인라인 코드, 따옴표 안에 쓴 음차는 잡지 않는다', () => {
  for (const text of [
    '아래를 확인합니다.\n```\n테스트 서버 로그\n```',
    '`테스트` 대신 `test`라고 씁니다.',
    '사용자가 "서버 점검"이라고 적었습니다.',
  ]) {
    assert.deepEqual(caught(text, TERM_RULES), [], text);
  }
});

test('도구에 넘기는 글과 답변에서는 IT 용어의 한글 음차를 경고로만 알린다', () => {
  /* 답변과 도구 입력에는 이용자 공지 초안이나 사용자가 준 글을 다듬은 결과가 들어 있을 때가 많습니다. */
  const answer = checkText('서버를 다시 띄웠습니다.', RULES, 'chat');
  assert.ok(answer.some((v) => v.rule === 'transliteration' && v.severity === 'warning'));
  assert.equal(blockingViolations(answer).length, 0);
  for (const [tool, input, target] of [
    ['AskUserQuestion', { questions: [{ question: '서버를 다시 띄울까요?' }] }, 'chat'],
    ['Agent', { prompt: '서버 점검 동안 로그인할 수 없다는 이용자 공지 초안을 써 주십시오.' }, 'doc'],
  ]) {
    const problems = checkToolCall(tool, input, RULES, target);
    assert.ok(problems.some((v) => v.rule === 'transliteration' && v.severity === 'warning'), tool);
    assert.equal(blockingViolations(problems).length, 0, tool);
  }
});

test('`chat-advisory-rules`를 비우면 답변에서도 음차를 오류로 막는다', () => {
  const strict = { ...RULES, chatAdvisoryRules: [] };
  assert.equal(blockingViolations(checkText('서버를 다시 띄웠습니다.', strict, 'chat')).length, 1);
  /* 키가 없는 예전 규칙도 비운 것과 같습니다. */
  assert.deepEqual(parseRuleBlock('banned-transliteration: 서버=server').chatAdvisoryRules, []);
});

test('일반 독자가 읽는 글에는 IT 용어 표 규칙을 적용하지 않고 다른 규칙은 그대로 적용한다', () => {
  const notice = '<!-- korean-style: general-reader -->\n# 점검 안내\n\n서버 점검 동안 로그인할 수 없습니다. 배포는 내일 마칩니다.';
  assert.deepEqual(caught(notice, TERM_RULES), []);
  assert.ok(caught(`${notice}\n\n향후 일정은 따로 알립니다.`, ['hanja-word']).length > 0, '어려운 한자어 규칙은 그대로 적용합니다');
  /* 코드 블록 안에 적은 표시 줄은 이 파일이 일반 독자용이라는 뜻이 아닙니다. */
  assert.ok(caught('```\n<!-- korean-style: general-reader -->\n```\n\n서버 점검입니다.', ['transliteration']).length > 0);
  /* 경로 pattern으로도 정할 수 있습니다. */
  const globbed = { ...RULES, generalReaderGlobs: ['notices/**'] };
  assert.equal(checkText('서버 점검 동안 로그인할 수 없습니다.', globbed, 'doc', { path: 'notices/2026-11.md' }).length, 0);
  assert.ok(checkText('서버 점검 동안 로그인할 수 없습니다.', globbed, 'doc', { path: 'docs/a.md' }).length > 0);
  assert.equal(checkText('// 서버 점검 안내 문구입니다.\nconst a = 1;\n', globbed, 'comment', { path: 'notices/a.js' }).length, 0);
});

test('일반 독자용 파일에서 규칙을 끄는 방법은 처음 나온 음차의 설명 하나에만 덧붙이고 답변에서는 덧붙이지 않는다', () => {
  const doc = checkText('테스트와 서버와 로그를 봤습니다.', RULES, 'doc');
  assert.equal(doc.filter((v) => v.detail.includes('general-reader')).length, 1);
  assert.equal(checkText('테스트와 서버를 봤습니다.', RULES, 'chat').filter((v) => v.detail.includes('general-reader')).length, 0);
});

test('`loanword-spelling`과 IT 용어 표가 같은 낱말을 서로 다르게 고치라고 하지 않는다', () => {
  /* 개발자가 읽는 문서에서는 영어 원어 하나만 알립니다. */
  assert.deepEqual(checkText('워크플로우를 고쳤습니다.', RULES, 'doc').map((v) => v.rule), ['transliteration']);
  /* 일반 독자가 읽는 글과 코드 블록에서는 IT 용어 표 규칙이 꺼지므로 외래어 표기를 알립니다. */
  assert.deepEqual(checkText('<!-- korean-style: general-reader -->\n워크플로우를 고쳤습니다.', RULES, 'doc').map((v) => v.rule), ['loanword-spelling']);
  assert.deepEqual(checkText('아래를 봅니다.\n```\n워크플로우\n```', RULES, 'doc').map((v) => v.rule), ['loanword-spelling']);
  /* 답변에서는 음차가 경고이므로 틀린 표기는 계속 오류로 막습니다. */
  assert.deepEqual(checkText('워크플로우를 고쳤습니다.', RULES, 'chat').map((v) => `${v.rule}/${v.severity}`).sort(), ['loanword-spelling/error', 'transliteration/warning']);
  /* 일반 뜻도 있는 음차는 경고이므로 틀린 표기를 함께 알립니다. */
  assert.deepEqual(checkText('타겟을 정했습니다.', RULES, 'doc').map((v) => v.rule).sort(), ['ambiguous-transliteration', 'loanword-spelling']);
});

/* ---------------------------------------------------------------------------  번역투 목록  --------------------------------------------------------------------------- */

test('정상 용법인 `~에 대한`, 경로를 뜻하는 `~을 통해`, 근거를 뜻하는 `~에 의해`, 모임을 치르는 `가지다`, `말해지다`는 잡지 않는다', () => {
  for (const text of [
    '요청에 대한 응답 형식입니다.',
    '기존 model ID에 대한 요청은 그대로 처리합니다.',
    'VPN을 통해 사내망에 접속합니다.',
    '로그인은 SSO를 통하여 처리합니다.',
    '개인정보는 법에 의해 보호받습니다.',
    '이 요청은 약관에 의하여 거절됩니다.',
    '어제 간담회를 가졌습니다.',
    '어제 설계 회의를 가졌습니다.',
    '생각이나 이야기 따위가 말해지다.',
  ]) {
    assert.deepEqual(caught(text, ['translationese', 'double-passive']), [], text);
  }
});

test('필요성을 말하는 `~할 필요가 있다`, 조건을 말하는 `~할 경우`, `에서의`도 정상 용법이므로 잡지 않는다', () => {
  /* Skill이 고치지 말라고 한 표현입니다. 검사기가 이 표현에 경고를 내면 PreToolUse hook이 Claude에게 다시 살펴보라고 알립니다. */
  for (const text of ['오류가 발생할 경우에는 API로 확인합니다.', '확인할 필요가 있습니다.', '운영 환경에서의 부하']) {
    assert.deepEqual(caught(text, ['translationese']), [], text);
  }
});

test('동작 명사에 붙은 `~을 통해`와 행위자를 붙인 `~에 의해`는 경고로 알린다', () => {
  const action = caught('cache 초기화 진행을 통해 해결했습니다.', ['translationese']);
  assert.equal(action.length, 1);
  assert.equal(action[0].severity, 'warning');
  const agent = caught('설정 값은 server에 의해 결정됩니다.', ['translationese']);
  assert.equal(agent.length, 1);
  assert.match(agent[0].detail, /번역투일 수 있습니다: "에 의해"\. .*능동문으로 고칩니다\. 근거를 뜻하는 말이면 그대로 둡니다\./);
  /* 근거를 뜻하는 구절 밖에서 다시 나오면 잡습니다. */
  assert.equal(caught('법에 의해 보호받는 값을 server에 의해 지웁니다.', ['translationese']).length, 1);
});

test('`translationese-exempt`에 적은 구절은 규칙 문서에서 바꿀 수 있다', () => {
  const own = parseRuleBlock('translationese-patterns: 에 의해=~가\ntranslationese-exempt: 법에 의해');
  assert.equal(checkText('법에 의해 보호받습니다.', own, 'doc').length, 0);
  assert.equal(checkText('규정에 의해 보호받습니다.', own, 'doc').length, 1);
  assert.equal(checkText('규정에 의해 보호받습니다.', parseRuleBlock('translationese-patterns: 에 의해=~가'), 'doc').length, 1);
});

test('번역투 안내에서 대신 쓸 말이 여럿이면 따로 인용하고 test를 옮긴 `시험` 안내는 영어 원어를 권한다', () => {
  assert.match(caught('어떤 모양으로 정리할지 정합니다.', ['translationese'])[0].detail, /"어떻게", "어떤 형식으로" 가운데 문맥에 맞는 말로/);
  assert.match(caught('시험용 APK를 올렸습니다.', ['translationese'])[0].detail, /"test용"처럼/);
});

/* ---------------------------------------------------------------------------  `세다`  --------------------------------------------------------------------------- */

test('개수를 구하는 일을 `세다`로 쓴 문장은 경고로 알리고 문맥에 맞는 말을 고르게 한다', () => {
  for (const text of ['답변 수를 셉니다.', '글자를 하나씩 셌습니다.', '오류 건수를 셀 수 있습니다.', '항목을 세어 보니 열 개였습니다.', '요청은 매일 세는 값입니다.', '검사기가 센 값은 12입니다.']) {
    const found = caught(text, ['literal-verb']);
    assert.equal(found.length, 1, text);
    assert.equal(found[0].severity, 'warning', text);
    assert.match(found[0].detail, /"집계합니다", "계산합니다", "확인합니다" 가운데 문맥에 맞는 말로|"집계한", "계산한", "확인한" 가운데 문맥에 맞는 말로/, text);
  }
});

test('힘이 세다는 뜻의 `세다`, `셀 수 없이`, 수 관형사 `세`는 알리지 않는다', () => {
  for (const text of ['힘이 셉니다.', '바람이 세게 붑니다.', '고집이 센 편입니다.', '머리가 하얗게 셌습니다.', '셀 수 없이 많은 요청이 왔습니다.', '세 개를 골랐습니다.', '항목을 세 보고서로 나눴습니다.']) {
    assert.deepEqual(caught(text, ['literal-verb']), [], text);
  }
});

/* ---------------------------------------------------------------------------  격식 있는 문어체  --------------------------------------------------------------------------- */

test('한자 관형사와 어려운 한자어, 구어 표현은 경고로 알린다', () => {
  for (const [text, rule] of [
    ['향후 일정을 정리했습니다.', 'hanja-word'],
    ['익일 오전에 반영합니다.', 'hanja-word'],
    ['금번 변경을 정리했습니다.', 'hanja-word'],
    ['응답 속도를 제고합니다.', 'hanja-word'],
    ['두 값이 상이합니다.', 'hanja-word'],
    ['제반 사항을 확인합니다.', 'hanja-word'],
    ['소정의 양식으로 제출합니다.', 'hanja-word'],
    ['규정에 의거하여 처리합니다.', 'hanja-word'],
    ['본 PR은 오류를 고칩니다.', 'hanja-word'],
    ['이 함수는 타 module에서 부릅니다.', 'hanja-word'],
    ['동 함수를 다시 부릅니다.', 'hanja-word'],
    ['확인했구요 정리했습니다.', 'colloquial'],
    ['값이 비었길래 다시 넣었습니다.', 'colloquial'],
    ['응답이 되게 빠릅니다.', 'colloquial'],
    ['근데 값이 비었습니다.', 'colloquial'],
  ]) {
    const found = checkText(text, RULES, 'doc');
    assert.ok(found.some((v) => v.rule === rule && v.severity === 'warning'), text);
    assert.equal(blockingViolations(found).length, 0, text);
  }
});

test('관형사가 아닌 `본`, `타`, `동`, 어려운 한자어와 글자만 겹치는 낱말, 다른 뜻의 `되게`는 알리지 않는다', () => {
  for (const text of [
    '앞에서 본 문서입니다.',
    '본인 확인을 마쳤습니다.',
    '본 적이 없습니다.',
    '불이 타는 냄새가 납니다.',
    '버스를 타 보니 편했습니다.',
    '점검 동안 기다립니다.',
    '세상이 바뀌었습니다.',
    '상이군인을 기렸습니다.',
    '그렇게 되게 하려면 설정을 바꿉니다.',
    '자동으로 실행되게 했습니다.',
  ]) {
    assert.deepEqual(caught(text, ['hanja-word', 'colloquial']), [], text);
  }
});
