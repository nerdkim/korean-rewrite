/* 첫머리에 소문자로 쓴 영어 낱말과 숫자 뒤에 붙인 달러를 잡는 규칙의 회귀 test입니다. 잡아야 할 문장과 잡으면 안 되는 문장을 함께 둡니다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRules, parseRuleBlock } from '../scripts/lib/rules.mjs';
import { checkText, checkToolCall } from '../scripts/lib/check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = loadRules(join(ROOT, 'docs', 'rules.md'));
const NOTATION_RULES = ['lowercase-start', 'currency-notation'];

/* 두 표기 규칙에 걸린 위반만 돌려줍니다. */
const caught = (text, target = 'doc', rules = RULES) => checkText(text, rules, target).filter((v) => NOTATION_RULES.includes(v.rule));

/* ---------------------------------------------------------------------------  첫머리의 영어 낱말  --------------------------------------------------------------------------- */

test('문장, 제목, 목록 항목, 표 칸의 첫머리와 굵은 글씨로 쓴 항목 이름 바로 뒤에 소문자로 쓴 영어 낱말은 오류로 막고 대문자로 고친 낱말을 알린다', () => {
  const cases = [
    ['commit하기 전에 test를 실행합니다.', ['commit']],
    ['bug와 제안은 Issues에 남겨 주십시오. pull request를 환영합니다.', ['bug', 'pull']],
    ['- skill 지시: 새로 넣었습니다.', ['skill']],
    ['## skill 목록', ['skill']],
    ['| 종류 | 하는 일 |\n| --- | --- |\n| subagent | 글을 맡습니다. |', ['subagent']],
    ['- **README:** hook이 막습니다.', ['hook']],
    ['**원인**: cache가 비었습니다.', ['cache']],
    ['- **번역투를 쓰지 않게 합니다.** skill에는 고친 예가 있습니다.', ['skill']],
    ['아래를 실행합니다.\n\n```sh\nnpm test\n```\n\ncommit하기 전에 확인합니다.', ['commit']],
  ];
  for (const [text, words] of cases) {
    for (const target of ['doc', 'commit']) {
      const found = caught(text, target).filter((v) => v.rule === 'lowercase-start');
      assert.equal(found.length, words.length, `${target}: ${text}`);
      words.forEach((word, i) => {
        assert.equal(found[i].severity, 'error', `${target}: ${text}`);
        assert.ok(found[i].detail.includes(`"${word}" → "${word[0].toUpperCase()}${word.slice(1)}"`), `${text}: ${found[i].detail}`);
      });
    }
  }
});

test('같은 낱말이 여러 줄의 첫머리에 나오면 줄마다 알린다', () => {
  const found = caught('commit을 마쳤습니다.\n\ncommit을 다시 했습니다.');
  assert.deepEqual(found.map((v) => v.line), [1, 3]);
});

test('인라인 코드, 코드 블록, 따옴표 안의 낱말과 인라인 코드 바로 뒤의 낱말은 잡지 않는다', () => {
  for (const text of [
    '`commit`하기 전에 확인합니다.',
    '`korean-rewrite` skill은 이렇게 씁니다.',
    '"commit하기 전에"라고 적었습니다.',
    '아래를 실행합니다.\n```\ncommit하기 전에\n```',
  ]) {
    assert.deepEqual(caught(text), [], text);
  }
});

test('경로, URL, 파일 이름, 식별자, 첫 글자가 아닌 자리에 대문자가 든 이름, `lowercase-start-exempt`에 적은 이름은 잡지 않는다', () => {
  for (const text of [
    'package.json을 고쳤습니다.',
    'check-korean.mjs는 검사기입니다.',
    'https://github.com/nerdkim 주소입니다.',
    'user@example.com으로 보냅니다.',
    'v2로 옮겼습니다.',
    'macOS에서 실행합니다. iOS도 됩니다.',
    'iPhone, eBay, gRPC, jQuery는 이름입니다.',
    'npm은 Node.js와 함께 설치됩니다. npx로 실행합니다. pnpm도 됩니다.',
  ]) {
    assert.deepEqual(caught(text), [], text);
  }
});

test('문장 가운데의 영어 낱말, 문장이 이어지는 줄, 한글이 없는 줄, YAML frontmatter의 키, commit 제목의 접두사, 한 글자 낱말은 잡지 않는다', () => {
  const cases = [
    ['설치한 뒤 commit하고 push합니다.', 'doc'],
    ['이 문장은 줄을 바꿔\ncommit 메시지까지 이어집니다.', 'doc'],
    ['ok', 'chat'],
    ['update readme', 'commit'],
    ['---\nname: korean-writer\ndescription: 한국어 글을 씁니다.\n---\n본문입니다.', 'doc'],
    ['docs: README에 빠른 시작 추가', 'commit'],
    ['n번 반복합니다.', 'doc'],
  ];
  for (const [text, target] of cases) assert.deepEqual(caught(text, target), [], `${target}: ${text}`);
});

test('`lowercase-start-exempt` 키가 없는 규칙에서는 검사하지 않고 값을 비우면 예외 없이 검사한다', () => {
  assert.deepEqual(caught('commit하기 전에 확인합니다.', 'doc', parseRuleBlock('register: 합니다체\n')), []);
  const strict = parseRuleBlock('register: 합니다체\nlowercase-start-exempt:\n');
  assert.equal(caught('npm은 Node.js와 함께 설치됩니다.', 'doc', strict).length, 1);
});

/* ---------------------------------------------------------------------------  금액 표기  --------------------------------------------------------------------------- */

test('숫자 바로 뒤나 공백 하나 뒤에 붙인 달러는 오류로 막고 숫자 앞에 `$`를 붙인 금액을 알린다', () => {
  const cases = [
    ['비용은 0.095달러였습니다.', '"0.095달러" → "$0.095"'],
    ['묶음 하나에 0.0114달러가 들었습니다.', '"0.0114달러" → "$0.0114"'],
    ['예산은 1,200 달러입니다.', '"1,200 달러" → "$1,200"'],
  ];
  for (const [text, shown] of cases) {
    for (const target of ['doc', 'commit']) {
      const found = caught(text, target).filter((v) => v.rule === 'currency-notation');
      assert.equal(found.length, 1, `${target}: ${text}`);
      assert.equal(found[0].severity, 'error', `${target}: ${text}`);
      assert.ok(found[0].detail.includes(shown), `${text}: ${found[0].detail}`);
    }
  }
});

test('앞에 숫자가 없거나 숫자와 사이에 다른 글자가 낀 달러, 코드와 따옴표 안의 금액, 숫자 앞에 `$`를 붙인 금액은 잡지 않는다', () => {
  for (const text of [
    '달러화가 강세입니다.',
    '미국 달러로 냅니다.',
    '1억 달러 규모입니다.',
    '`0.5달러` 문자열입니다.',
    '"3달러"라고 적었습니다.',
    '비용은 $0.095였습니다.',
  ]) {
    assert.deepEqual(caught(text), [], text);
  }
});

test('`currency-symbols`의 통화 단위와 기호는 규칙 문서에서 바꿀 수 있고 값을 비우면 검사하지 않는다', () => {
  const euro = caught('비용은 10유로입니다.', 'doc', parseRuleBlock('register: 합니다체\ncurrency-symbols: 유로=€\n'));
  assert.equal(euro.length, 1);
  assert.ok(euro[0].detail.includes('"€10"'), euro[0].detail);
  assert.deepEqual(caught('비용은 0.095달러였습니다.', 'doc', parseRuleBlock('register: 합니다체\ncurrency-symbols:\n')), []);
});

/* ---------------------------------------------------------------------------  답변과 도구에 넘기는 글  --------------------------------------------------------------------------- */

test('답변과 도구에 넘기는 글에서는 두 규칙을 경고로만 알린다', () => {
  const text = 'commit을 마쳤습니다. 0.5달러가 들었습니다.';
  const answer = caught(text, 'chat');
  assert.deepEqual(answer.map((v) => [v.rule, v.severity]), [['lowercase-start', 'warning'], ['currency-notation', 'warning']]);
  const tool = checkToolCall('AskUserQuestion', { questions: [{ question: text }] }, RULES).filter((v) => NOTATION_RULES.includes(v.rule));
  assert.deepEqual(tool.map((v) => v.severity), ['warning', 'warning']);
});
