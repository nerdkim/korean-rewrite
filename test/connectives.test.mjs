/* 이유를 밝힌 문장 바로 뒤에 이은 접속 부사 규칙의 회귀 test입니다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRules, parseRuleBlock } from '../scripts/lib/rules.mjs';
import { blockingViolations, checkText } from '../scripts/lib/check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = loadRules(join(ROOT, 'docs', 'rules.md'));
const RULE = 'adverb-after-reason';
const caught = (text, rules = RULES, target = 'doc') => checkText(text, rules, target).filter((v) => v.rule === RULE);

/* skill에 고칠 문장으로 든 예문입니다. 결론의 근거인 첫 문장과 결론 사이에 이유 문장이 끼었습니다. */
const SPEC_EXAMPLE = 'Haiku 4.5 ID로 보낸 요청도 Sonnet 5로 호출합니다. 서울에는 Haiku model이 없기 때문입니다. 그래서 서비스는 model ID를 바꾸지 않아도 됩니다.';

test('이유 문장 바로 뒤 문장을 `그래서`로 시작하면 경고로 알리고 `따라서`로 잇는 방법을 안내한다', () => {
  for (const target of ['doc', 'chat', 'commit']) {
    const found = checkText(SPEC_EXAMPLE, RULES, target);
    const hit = found.filter((v) => v.rule === RULE);
    assert.equal(hit.length, 1, target);
    assert.equal(hit[0].severity, 'warning', target);
    assert.match(hit[0].detail, /"그래서"입니다\. .*"따라서"로 잇습니다/);
    assert.equal(blockingViolations(found).length, 0, target);
  }
});

test('이유를 앞 문장 안으로 옮기고 `따라서`로 이은 글은 알리지 않는다', () => {
  assert.deepEqual(caught('서울에는 Haiku model이 없으므로 Haiku 4.5 ID로 보낸 요청도 Sonnet 5로 호출합니다. 따라서 서비스는 model ID를 변경하지 않아도 됩니다.'), []);
});

test('`때문이다`, `때문이에요`로 끝난 이유 문장과 쉼표를 찍은 `그래서`도 잡는다', () => {
  assert.equal(caught('값이 비었다. 설정을 읽지 못했기 때문이다. 그래서 다시 읽는다.').length, 1);
  assert.equal(caught('값이 비었어요. 설정을 읽지 못했기 때문이에요. 그래서, 다시 읽어요.').length, 1);
});

test('실제 원인과 결과를 잇는 `그래서`도 이유 문장 바로 뒤에 오면 경고는 나오지만 막지는 않는다', () => {
  const found = checkText('test server가 멈췄기 때문입니다. 그래서 deploy가 하루 늦어졌습니다.', RULES, 'doc');
  assert.equal(found.filter((v) => v.rule === RULE).length, 1);
  assert.equal(blockingViolations(found).length, 0);
});

test('이유 문장 바로 뒤가 아니거나 다른 문단에 있는 `그래서`는 알리지 않고 `그래서인지`도 알리지 않는다', () => {
  for (const text of [
    'test server가 멈췄습니다. 그래서 deploy가 하루 늦어졌습니다.',
    '설정을 읽지 못했기 때문입니다. 값을 다시 넣었습니다. 그래서 오류가 사라졌습니다.',
    '설정을 읽지 못했기 때문입니다.\n\n그래서 다음 절에서 읽는 순서를 설명합니다.',
    '- 설정을 읽지 못했기 때문입니다.\n- 그래서 값을 다시 넣었습니다.',
    '설정을 읽지 못했기 때문입니다. 그래서인지 오류가 한 번 더 났습니다.',
    '설정을 읽지 못한 것은 권한 때문입니다',
  ]) {
    assert.deepEqual(caught(text), [], text);
  }
});

test('줄을 바꿔 쓴 문단에서도 `그래서`로 시작한 문장의 줄을 보고한다', () => {
  const text = '# 제목\n\nHaiku 4.5 ID로 보낸 요청도 Sonnet 5로 호출합니다.\n서울에는 Haiku model이 없기 때문입니다.\n그래서 서비스는 model ID를 바꾸지 않아도 됩니다.';
  assert.deepEqual(caught(text).map((v) => v.line), [5]);
});

test('코드 블록과 인용 구간에 옮겨 적은 글은 보지 않는다', () => {
  assert.deepEqual(caught(`아래는 예시입니다.\n\n\`\`\`\n${SPEC_EXAMPLE}\n\`\`\``), []);
  assert.deepEqual(caught(`받은 답변입니다.\n<!-- korean-style-quote -->\n${SPEC_EXAMPLE}\n<!-- /korean-style-quote -->`), []);
});

test('이유 문장을 끝내는 말과 알릴 접속 부사는 규칙 문서에서 정하고 값을 비우면 알리지 않는다', () => {
  const own = parseRuleBlock('reason-endings: 까닭입니다\nresult-adverbs: 그러니까');
  assert.equal(caught('값이 비었습니다. 설정을 읽지 못한 까닭입니다. 그러니까 다시 읽습니다.', own).length, 1);
  assert.deepEqual(caught(SPEC_EXAMPLE, own), []);
  assert.deepEqual(caught(SPEC_EXAMPLE, parseRuleBlock('reason-endings:\nresult-adverbs: 그래서')), []);
  assert.deepEqual(caught(SPEC_EXAMPLE, parseRuleBlock('register: 합니다체')), [], '키가 없는 예전 규칙에서는 알리지 않습니다');
});

test('hook은 이 규칙의 경고를 Claude에게 알린다', () => {
  assert.ok(RULES.advisoryRules.includes(RULE));
  assert.ok(RULES.reviewRules.includes(RULE));
});
