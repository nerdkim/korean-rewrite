/* 설치 전후 비교 이미지를 만드는 script의 test입니다. Chrome이 있어야 하는 PNG 생성은 test하지 않습니다. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { outputPaths, validateAnnotations } from '../scripts/render-compare.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'render-compare.mjs');
const fixture = (name) => join(ROOT, 'test', 'fixtures', 'render-compare', name);

/* 임시 directory입니다. 모든 test가 끝나면 지웁니다. */
const temporary = [];
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'render-compare-test-'));
  temporary.push(dir);
  return dir;
};
after(() => temporary.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/* Script를 child process로 띄웁니다. */
function run(args) {
  const env = { ...process.env };
  delete env.KOREAN_STYLE_RULES;
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf-8', cwd: ROOT, env });
}

/* Test용 요청과 두 답변을 넘기는 option입니다. */
const INPUTS = ['--request', fixture('request.json'), '--left', fixture('left.json'), '--right', fixture('right.json')];

/* Test용 비교 항목 파일을 읽어 `change`로 고친 내용을 돌려줍니다. */
function annotations(change = () => {}) {
  const data = JSON.parse(readFileSync(fixture('annotations.json'), 'utf-8'));
  change(data);
  return data;
}

/* 비교 항목을 임시 파일에 저장하고 `--check`로 검사합니다. 문자열을 주면 JSON으로 바꾸지 않고 그대로 저장합니다. */
function check(data) {
  const path = join(scratch(), 'annotations.json');
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return run([...INPUTS, '--annotations', path, '--check']);
}

/* 결과 파일에 든 두 답변입니다. 비교 항목 파일을 검증하는 함수에 직접 넘깁니다. */
const answerIn = (name) => JSON.parse(readFileSync(fixture(name), 'utf-8')).results[0].answers[0].text;
const SOURCES = { left: answerIn('left.json'), right: answerIn('right.json') };
const errorsOf = (data) => validateAnnotations(data, SOURCES).errors;

test('--self-check는 Chrome 없이 자체 검사를 통과한다', () => {
  /* 없는 Chrome 경로를 주어도 통과해야 합니다. */
  const r = run(['--self-check', '--chrome', join(scratch(), 'chrome')]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /자체 검사를 모두 통과했습니다/);
  assert.doesNotMatch(r.stdout, /실패/);
});

test('--check는 올바른 비교 항목 파일을 통과시키고 이미지를 만들지 않는다', () => {
  const out = join(scratch(), 'compare.png');
  const r = run([...INPUTS, '--annotations', fixture('annotations.json'), '--check', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /비교 항목 3개에 적은 구절 5개를 모두 답변에서 찾았습니다/);
  assert.match(r.stdout, /검사기가 찾은 오류와 경고가 없습니다/);
  assert.ok(!existsSync(out), '--check를 주었는데 PNG를 만들었습니다');
});

test('답변에서 찾지 못한 구절이 있으면 --check가 실패하고 항목 번호와 구절을 알린다', () => {
  const r = check(annotations((data) => {
    data.items[0].left[0] = '## 원인';
  }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /1번 항목, 왼쪽 답변의 1번째 구절 "## 원인": 답변에서 찾지 못했습니다/);
});

test('답변에 여러 번 나오는 구절이 있으면 --check가 실패하고 나온 횟수를 알린다', () => {
  const r = check(annotations((data) => {
    data.items[1].right[0] = 'query';
  }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /2번 항목, 오른쪽 답변의 1번째 구절 "query": 답변에 4번 나옵니다/);
});

test('구절 문제가 여러 건이면 모두 모아 한 번에 알린다', () => {
  const r = check(annotations((data) => {
    data.items[0].left[0] = '## 원인';
    data.items[1].right[0] = 'query';
  }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /비교 항목 파일에 문제가 2건 있습니다/);
});

test('여러 번 나오는 낱말도 `in`으로 범위를 좁히면 찾는다', () => {
  /* Test용 비교 항목 파일의 2번 항목은 `in`으로 범위를 좁혔습니다. 같은 낱말을 `in` 없이 적으면 실패합니다. */
  assert.deepEqual(errorsOf(annotations()), []);
  const bare = errorsOf(annotations((data) => {
    data.items[1].left[0] = '쿼리';
  }));
  assert.ok(bare.some((error) => /"쿼리": 답변에 3번 나옵니다/.test(error)), bare.join('\n'));
});

test('구절은 답변마다 따로 찾으므로 다른 답변에도 나오는 구절은 문제가 되지 않는다', () => {
  const errors = errorsOf(annotations((data) => {
    data.items[2].left = ['1.2초'];
    data.items[2].right = ['1.2초'];
  }));
  assert.deepEqual(errors, []);
});

test('설명을 적으면 빈 구절 목록도 통과한다', () => {
  /* Test용 비교 항목 파일의 3번 항목은 오른쪽 구절 목록이 비어 있고 `rightNote`에 설명이 있습니다. */
  const { items, errors } = validateAnnotations(annotations(), SOURCES);
  assert.deepEqual(errors, []);
  assert.deepEqual(items[2].ranges.right, []);
});

test('`excerpt`를 생략하면 `sentence` 방식으로 본다', () => {
  /* Test용 비교 항목 파일의 1번 항목에는 `excerpt`가 없습니다. */
  const { items } = validateAnnotations(annotations(), SOURCES);
  assert.equal(items[0].excerpt, 'sentence');
});

test('비교 항목 파일의 형식 오류를 찾아 알린다', () => {
  const cases = [
    ['`number`가 겹친다', (data) => (data.items[1].number = 1), /1번 항목: `number` 값이 다른 항목과 겹칩니다/],
    ['`number`가 정수가 아니다', (data) => (data.items[0].number = '1'), /1번째 항목: `number` 값은 1 이상의 정수여야 합니다/],
    ['`what`이 없다', (data) => delete data.items[0].what, /1번 항목: `what` 값은 비어 있지 않은 문자열이어야 합니다/],
    ['구절 목록이 없다', (data) => delete data.items[0].left, /1번 항목: `left` 배열이 없습니다/],
    ['빈 구절 목록에 설명이 없다', (data) => delete data.items[2].rightNote, /3번 항목: `right` 배열이 비어 있으면 `rightNote` 값을 적어 주십시오/],
    ['설명이 공백뿐이다', (data) => (data.items[2].rightNote = ' '), /3번 항목: `rightNote` 값은 비어 있지 않은 문자열이어야 합니다/],
    ['`excerpt` 값이 잘못되었다', (data) => (data.items[2].excerpt = 'word'), /3번 항목: `excerpt` 값은 `sentence`나 `phrase`여야 합니다/],
    ['비교 항목에 알 수 없는 key가 있다', (data) => (data.items[0].exerpt = 'phrase'), /1번 항목: 알 수 없는 key가 있습니다\(exerpt\)\./],
    ['구절 객체에 알 수 없는 key가 있다', (data) => (data.items[1].left[0].inside = '쿼리 수'), /2번 항목, 왼쪽 답변의 1번째 구절: 알 수 없는 key가 있습니다\(inside\)\./],
    ['구절이 문자열이 아니다', (data) => (data.items[0].left[0] = 3), /구절이 비어 있거나 문자열이 아닙니다/],
    ['구절이 코드 블록을 여는 줄만 가리킨다', (data) => (data.items[0].left[0] = '```sql'), /화면에 보이는 글자가 없습니다/],
    ['최상위 객체에 알 수 없는 key가 있다', (data) => (data.title = '비교'), /최상위 객체에 알 수 없는 key가 있습니다\(title\)\./],
    ['`items` 배열이 비었다', (data) => (data.items = []), /`items` 배열이 없거나 비어 있습니다/],
  ];
  for (const [label, change, pattern] of cases) {
    const errors = errorsOf(annotations(change));
    assert.ok(errors.some((error) => pattern.test(error)), `${label}: ${errors.join('\n') || '문제를 찾지 못했습니다'}`);
  }
  assert.deepEqual(errorsOf([]), ['최상위 값은 `items` 배열을 담은 객체여야 합니다.']);
});

test('형식 오류가 있거나 JSON 형식이 아니면 --check가 종료 코드 1로 끝난다', () => {
  const duplicated = check(annotations((data) => {
    data.items[1].number = 1;
  }));
  assert.equal(duplicated.status, 1);
  assert.match(duplicated.stderr, /비교 항목 파일에 문제가 1건 있습니다/);
  const broken = check('{ "items": [');
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /JSON 형식이 아닙니다/);
});

test('이미지에 들어갈 문장에서 검사기가 오류를 찾으면 --check가 실패하고 항목 번호와 key를 알린다', () => {
  const r = check(annotations((data) => {
    data.items[0].why = '제목에 그 절의 내용을 써 주세요.';
    data.items[1].name = '테스트 결과';
    data.items[2].rightNote = '굵은 글씨가 없어요.';
  }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[wrong-register\] 1번 항목의 `why`/);
  assert.match(r.stderr, /\[transliteration\] 2번 항목의 `name`/);
  assert.match(r.stderr, /\[wrong-register\] 3번 항목의 `rightNote`/);
});

test('백틱으로 감싼 인용 안의 음차와 해요체는 잡지 않는다', () => {
  const r = check(annotations((data) => {
    data.items[0].what = '왼쪽은 `쿼리 로그를 확인해 보세요`처럼 씁니다.';
  }));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /검사기가 찾은 오류와 경고가 없습니다/);
});

test('검사기가 경고만 찾으면 --check는 경고를 출력만 하고 실패하지 않는다', () => {
  const r = check(annotations((data) => {
    data.items[0].why = 'API로 확인하는 것이 가능합니다.';
  }));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /경고 1건/);
  assert.match(r.stdout, /\[translationese\] 1번 항목의 `why`/);
});

test('필수 option이 없거나 option 값이 잘못되면 종료 코드 2로 끝난다', () => {
  const missing = run([]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--request option이 필요합니다/);
  const badRun = run([...INPUTS, '--run', '0', '--check']);
  assert.equal(badRun.status, 2);
  assert.match(badRun.stderr, /--run 값은 1 이상의 정수여야 합니다/);
  /* `--only`처럼 없는 option을 주면 종료 코드 2로 끝나야 합니다. */
  const unknown = run([...INPUTS, '--only', 'cards']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /명령줄 option을 읽지 못했습니다/);
});

test('`--run`으로 고른 결과가 없거나 두 답변의 요청 id가 다르면 실패한다', () => {
  const noRun = run([...INPUTS, '--annotations', fixture('annotations.json'), '--check', '--run', '2']);
  assert.equal(noRun.status, 1);
  assert.match(noRun.stderr, /`results`에서 `run` 값이 2인 결과가 0개입니다/);

  const other = JSON.parse(readFileSync(fixture('right.json'), 'utf-8'));
  other.results[0].answers[0].id = 'other';
  const right = join(scratch(), 'right.json');
  writeFileSync(right, JSON.stringify(other));
  const r = run(['--request', fixture('request.json'), '--left', fixture('left.json'), '--right', right, '--annotations', fixture('annotations.json'), '--check']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /두 답변의 요청 id가 다릅니다\(sample, other\)/);
});

test('비교 항목 파일을 주지 않으면 docs/images/readme-compare.json을 읽는다', () => {
  /* 이 파일의 구절은 README에 싣는 답변에서 고른 것이므로 test용 답변에서는 찾지 못합니다. */
  const r = run([...INPUTS, '--check']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^docs\/images\/readme-compare\.json: 비교 항목 파일에 문제가 \d+건 있습니다/m);
});

test('--out이 .png로 끝나지 않으면 directory로 보고 HTML은 --keep-html을 줄 때만 남긴다', () => {
  const dir = join(tmpdir(), 'compare');
  assert.deepEqual(outputPaths(join(dir, 'a.png'), false), { png: join(dir, 'a.png'), html: null });
  assert.deepEqual(outputPaths(join(dir, 'a.PNG'), true), { png: join(dir, 'a.PNG'), html: join(dir, 'a.html') });
  assert.deepEqual(outputPaths(dir, true), { png: join(dir, 'readme-compare.png'), html: join(dir, 'readme-compare.html') });
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /기본값은 docs\/images\/readme-compare\.png입니다/);
});
