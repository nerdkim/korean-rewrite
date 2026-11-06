/* 문장을 잇는 접속 부사를 봅니다. */
import { endsWithAny, escapeRe, unitsOf } from '../text.mjs';

/* 문장이 끝나는 자리입니다. 굵게 표시한 강조를 닫는 기호가 마침표 뒤에 올 수 있습니다. */
const SENTENCE_END = /[.!?]\*{0,2}\s+/gu;

/* 문단 하나를 문장으로 나눕니다. 줄바꿈은 공백으로 보고 문장마다 문단 안에서 시작하는 위치를 함께 돌려줍니다. */
function sentencesIn(unitText) {
  const flat = unitText.replace(/\n/g, ' ');
  const starts = [0, ...[...flat.matchAll(SENTENCE_END)].map((m) => m.index + m[0].length)];
  return starts
    .map((start, i) => ({ start, text: flat.slice(start, starts[i + 1] ?? flat.length).trim() }))
    .filter((sentence) => sentence.text.length > 0);
}

/*
 * 같은 문단에서 `reason-endings`에 적은 말로 끝난 이유 문장 바로 다음 문장이 `result-adverbs`에 적은 접속 부사로 시작하면 알립니다.
 * `A입니다. B이기 때문입니다. 그래서 C입니다.`처럼 결론 C의 근거인 A와 C 사이에 이유 문장이 끼면 C가 무엇을 근거로 하는지 흐려집니다.
 * 앞 문장의 일 때문에 뒤 문장의 일이 일어난 글도 같은 꼴이므로 경고로만 알립니다.
 */
export function connectiveViolations(text, rules) {
  const endings = rules.reasonEndings ?? [];
  const adverbs = rules.resultAdverbs ?? [];
  if (endings.length === 0 || adverbs.length === 0) return [];
  const opener = new RegExp(`^[*_]*(${adverbs.map(escapeRe).join('|')})(?![가-힣])`, 'u');
  const out = [];
  for (const unit of unitsOf(text)) {
    const sentences = sentencesIn(unit.text);
    for (let i = 1; i < sentences.length; i += 1) {
      const m = opener.exec(sentences[i].text);
      if (m === null || !endsWithAny(sentences[i - 1].text, endings)) continue;
      out.push({
        rule: 'adverb-after-reason',
        detail:
          `이유를 밝힌 문장 바로 뒤 문장의 첫 낱말이 ${JSON.stringify(m[1])}입니다. ` +
          '결론의 근거가 이유 문장보다 앞 문장에 있으면 이유를 그 앞 문장 안으로 옮기고 "따라서"로 잇습니다. ' +
          '앞 문장의 일 때문에 뒤 문장의 일이 일어났으면 그대로 둡니다.',
        line: unit.line + (unit.text.slice(0, sentences[i].start).match(/\n/g) ?? []).length,
      });
    }
  }
  return out;
}
