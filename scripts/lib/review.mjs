/* 검토 model이 한국어 글에서 고칠 표현을 찾게 합니다. 검토 model에게는 Claude가 요청 하나에서 쓴 한국어만 따로 보냅니다. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { commitMessagesIn, pullRequestTextsIn } from '../hooks/pretooluse.mjs';
import { hangulCount } from './skill.mjs';
import { matchesAny, toProjectRelative } from './targets.mjs';

/*
 * 검토 model에게 system prompt로 주는 지시입니다. 기준은 `skill/korean-rewrite/SKILL.md`의 '번역투', '격식 있는 문어체', '용어 표기', '고칠 표현' 절을 따릅니다.
 * 검토 model 평가 예문(`test/fixtures/eval/reviewer.json`)의 문장과 그 문장에서 고칠 표현은 예로 넣지 않습니다. 예문을 지시에 넣으면 검토 model이 처음 보는 문장을 어떻게 판단하는지 측정할 수 없습니다.
 */
export const REVIEWER_PROMPT = [
  '사용자가 보낸 글은 AI가 이번 작업에서 쓴 한국어입니다. 파일, commit 메시지, PR이나 issue에 올린 글, 답변처럼 쓴 곳마다 `[이름]` 줄로 나눠 두었고 파일에서 가져온 줄 앞에는 줄 번호를 붙였습니다.',
  '번역투는 외국어 원문의 낱말, 문장 구조, 표현 방식을 그대로 따라 써서 같은 뜻의 자연스러운 한국어 표현이 있는데도 원문의 흔적이 드러나는 표현입니다. 이중 피동, 행위자를 밝힌 `~에 의해`, `~것이 가능하다`, 영어 동사를 하나씩 옮긴 `더하다`, `재다`, `세다`, 나중으로 넘긴다는 뜻의 `미루다`가 잘 알려진 예이지만 이 목록에 없는 번역투가 더 많습니다.',
  '다음 표현은 사전에 오른 정상 용법이므로 지적하지 마십시오. 명사를 꾸며 대상을 밝히는 `~에 대한`(`요청에 대한 응답`), 경로와 매개를 뜻하는 `~을 통해`(`VPN을 통해 접속합니다`), 근거를 뜻하는 `~에 의해`, 출발점을 뜻하는 `~로부터`, 모임을 치른다는 뜻의 `가지다`, `-게 되다`, `~할 필요가 있다`, `~할 경우`, `에서의`, `~에 있어서`, `말해지다`, 짐작한다는 뜻의 `미루어 보아`가 여기에 듭니다. 한국 개발자가 흔히 쓰는 `돌리다`(`script를 돌립니다`), `추가하다`와 `측정하다` 같은 한자어 동사, 수나 양을 합치는 `더하다`, `비동기`처럼 한국어로 굳은 말도 지적하지 마십시오. 이런 표현을 없애려고 명사를 나열하는 수정안도 내지 마십시오.',
  '문체는 업무 문서처럼 격식 있는 문어체입니다. 문장 끝 말투는 프로젝트마다 다르므로 합니다체나 해요체 자체는 지적하지 말고 한 글 안에서 말투가 섞인 곳만 지적하십시오. 구어 표현(`좀`, `근데`, `되게`), 한자 관형사와 어려운 한자어(`본 PR`, `타 모듈`, `금번`, `제고`), 예스러운 말투(`~하는 바입니다`)는 지적하고 `변경`, `현재`, `확인` 같은 일상 한자어는 지적하지 마십시오. 앞의 일 때문에 뒤의 일이 일어났으면 `그래서`, 앞에서 밝힌 사실을 근거로 판단이나 결론을 이끌어 내면 `따라서`가 맞으므로 둘을 바꿔 쓴 곳을 지적하십시오.',
  'Markdown 제목과 목록 항목 앞에 굵은 글씨로 붙인 항목 이름은 `설치 방법`, `재설치`처럼 업무 문서식 명사구로 씁니다. 동사에 `-기`를 붙인 꼴이나 `-는 법`, `-ㄴ 것`, `-ㄹ 것`, `-ㄹ 때`, `-ㄴ 일`, `-ㄹ 일`로 끝낸 제목과 `Quick start`, `Contributing` 같은 영어 문서의 관례 제목을 낱말 단위로 옮긴 제목을 지적하십시오. PR처럼 항목 이름을 정해 두는 글이 아닌데 `## 문제`, `## 해결 1`처럼 단계 이름만 쓰거나 번호만 붙인 제목도 지적하십시오. 꾸미는 말 뒤에 `것`, `법`, `때`, `일`이 아닌 명사가 오는 제목과 굵은 글씨로 쓴 완결된 문장은 지적하지 마십시오. 사용자가 정한 제목과 인용한 글의 제목도 지적하지 마십시오.',
  '직접 이유가 아니거나 독자가 모르는 중간 단계를 뺀 사실을 `~으므로`로 이은 문장을 지적하십시오. 서로 관계없는 사실을 `~고`, `~며`로 이어 무엇을 알리려는지 드러나지 않는 문장도 지적하십시오. 독자가 모르는 내부 용어를 설명 없이 쓴 문장과 표 아래에 서로 관계없는 단서를 몰아 적은 부분도 지적하십시오.',
  '개발자가 읽는 글에서는 IT와 공학 용어를 영어 원어로 씁니다. `커밋`, `서버` 같은 음차와 `저장소`, `병합` 같은 번역어는 `commit`, `server`, `repository`, `merge`처럼 영어 원어로 고치십시오. 확인, 설정, 경로 같은 일반 어휘와 파일, 버전, 메시지처럼 정착한 말은 한국어가 맞습니다. 제품의 기능과 메뉴 이름은 그 제품 화면에 나오는 대로 둡니다. 앱 문구, 이용자 공지, 웹 페이지처럼 일반 독자가 읽는 글에서는 개발 용어를 풀어 쓰고 `브라우저` 같은 외래어를 한글로 적는 것이 맞습니다.',
  'AI는 영어로 구상한 내용을 한국어로 옮겨 쓰는 일이 많아서 낱말 하나하나는 맞는데 한국 사람이라면 그 문맥에서 쓰지 않을 말이 섞입니다. 줄을 하나도 건너뛰지 말고 문장마다 따지십시오. 한국어를 모국어로 쓰는 개발자라면 같은 내용을 이렇게 쓰지 않았을 표현을 모두 찾으십시오. 영어 낱말을 사전에 나오는 대응어로 옮겨 이 문맥에서 어색해지거나 무엇을 가리키는지 흐려진 말, 영어 문장 구조를 그대로 따른 문장, 누가 무엇을 하는지 흐린 문장이 여기에 듭니다. 낱말이 사전에 있고 뜻이 통해도 한국 개발자가 그 자리에 쓰지 않는 말이면 지적하십시오. 맞춤법이 맞고 한국 개발자가 실제로 쓰는 표현은 지적하지 마십시오.',
  '화면 문구와 주석은 source code에서 한국어 부분만 잘라 왔으므로 `{count}` 같은 자리 표시는 값이 들어갈 자리로 읽으십시오. 변수 이름, 백틱 안의 코드, 경로, 제품 이름은 고치지 말고 한국어 문구만 보십시오.',
  'JSON 한 줄로만 답하십시오. 문제가 없으면 {"ok": true}, 있으면 {"ok": false, "issues": [{"where": "이름과 줄 번호", "text": "고칠 표현", "fix": "고친 표현", "why": "짧은 이유"}]}입니다.',
].join('\n');

/* Claude에게 보내는 알림에는 지적을 이 수까지만 보여 줍니다. 이 수를 넘는 지적은 개수만 알립니다. */
export const MAX_ISSUES = 8;

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/* 파일 쓰기 도구 호출 하나가 새로 쓴 줄 가운데 한글이 든 줄을 돌려줍니다. `Edit` 호출에서는 바꾸기 전 문자열에 없던 줄만 고릅니다. */
export function writtenLines(name, input) {
  const pairs = [];
  if (name === 'Write') pairs.push(['', input?.content]);
  else if (name === 'Edit') pairs.push([input?.old_string, input?.new_string]);
  else if (name === 'MultiEdit' && Array.isArray(input?.edits)) {
    for (const edit of input.edits) pairs.push([edit?.old_string, edit?.new_string]);
  } else if (name === 'NotebookEdit') pairs.push(['', input?.new_source]);
  const lines = [];
  for (const [before, after] of pairs) {
    if (typeof after !== 'string') continue;
    const old = new Set(String(before ?? '').split('\n').map((line) => line.trim()));
    for (const line of after.split('\n')) {
      const trimmed = line.trim();
      if (hangulCount(trimmed) > 0 && !old.has(trimmed)) lines.push(trimmed);
    }
  }
  return lines;
}

/* 줄마다 코드 블록 안에 있는지 표시한 배열을 돌려줍니다. */
export function fencedLines(lines) {
  const fenced = new Array(lines.length).fill(false);
  let open = false;
  lines.forEach((line, i) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced[i] = true;
      open = !open;
    } else {
      fenced[i] = open;
    }
  });
  return fenced;
}

/* 지금 파일에서 그 줄이 몇째 줄인지 찾습니다. 문서의 코드 블록 안에 있는 줄과 쓴 뒤에 지워진 줄은 뺍니다. */
export function locateLines(filePath, wanted) {
  let text;
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const lines = text.split('\n');
  const fenced = /\.(?:md|mdx|markdown)$/i.test(filePath) ? fencedLines(lines) : null;
  const want = new Set(wanted);
  const found = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (want.has(trimmed) && !(fenced !== null && fenced[i])) found.push({ no: i + 1, text: trimmed });
  });
  return found;
}

/* Source code 한 줄에서 첫 한글부터 마지막 한글 뒤 문장 부호까지 잘라 돌려줍니다. 문서 파일의 줄은 그대로 돌려줍니다. */
export function koreanSpan(line, filePath) {
  if (/\.(?:md|mdx|markdown|txt)$/i.test(filePath)) return line;
  const first = line.search(/[가-힣]/u);
  if (first === -1) return line;
  let last = first;
  for (let i = first; i < line.length; i += 1) if (/[가-힣]/u.test(line[i])) last = i;
  const tail = line.slice(last + 1).match(/^[.!?)\]」』]*/u)[0];
  return line.slice(first, last + 1 + tail.length);
}

/* 코드 블록을 뺀 글을 돌려줍니다. */
export function withoutCodeBlocks(text) {
  const lines = text.split('\n');
  const fenced = fencedLines(lines);
  return lines.filter((_, i) => !fenced[i]).join('\n').trim();
}

/* 숫자와 `{count}` 같은 자리 표시를 같은 기호로 바꾸고 공백을 지웁니다. 사용자가 준 문장에서 숫자만 바꿔 넣은 줄도 같은 문장으로 알아보려는 것입니다. */
function normalized(text) {
  return text.replace(/\$?\{[^}]*\}|\d+(?:[.,]\d+)*/g, '#').replace(/\s+/g, '');
}

/* 사용자가 요청에 쓴 글을 비교할 형태로 바꿉니다. 요청 전체와 함께 문장, 콜론 뒤, 따옴표 안을 따로 떼어 둡니다. */
export function quotedFrom(prompt) {
  const parts = String(prompt).split(/(?<=[.!?:])\s+|["“”‘’「」『』\n]/).map(normalized).filter((part) => part.length >= 8);
  return { whole: normalized(String(prompt)), parts };
}

/* 사용자가 요청에 직접 쓴 문장을 뺀 줄을 돌려줍니다. Claude가 따옴표로 감싸 다시 보여 준 사용자 문장도 뺍니다. 사용자가 준 문장은 사용자가 고치라고 하지 않았으면 Claude가 바꾸면 안 되므로 검토 model에게 보내지 않습니다. */
export function withoutQuoted(line, quoted) {
  if (quoted.whole.length === 0) return line;
  const kept = line.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const key = normalized(sentence);
    if (hangulCount(sentence) === 0 || key.length < 8) return true;
    return !quoted.whole.includes(key) && !quoted.parts.some((part) => key.includes(part));
  });
  return kept.join(' ').trim();
}

function textKey(text) {
  return `text:${createHash('sha1').update(text.trim()).digest('hex')}`;
}

/* 이번 요청에서 쓴 파일의 줄, commit 메시지, PR이나 issue에 올린 글, 답변을 검토 model에게 보낼 조각으로 모읍니다. 결과가 오류로 끝난 도구 호출, 규칙 문서에서 검사하지 않기로 한 경로, 프로젝트 밖 파일, 이미 검토한 항목은 뺍니다. 조각의 한글 글자 수를 앞에서부터 더해 합계가 `reviewer-max-hangul`을 넘으면 그 조각부터는 보내지 않습니다. 첫 조각은 이 수를 넘어도 보냅니다. */
export function collectPieces(entries, { projectRoot, rules, answer = null, reviewed = new Set(), prompt = '' }) {
  const quoted = quotedFrom(prompt);
  const unquoted = (text) => text.split('\n').map((line) => withoutQuoted(line, quoted)).join('\n').trim();
  const failed = new Set();
  for (const entry of entries) {
    if (entry?.type !== 'user' || !Array.isArray(entry.message?.content)) continue;
    for (const part of entry.message.content) {
      if (part?.type === 'tool_result' && part.is_error === true) failed.add(part.tool_use_id);
    }
  }

  const files = new Map();
  const messages = [];
  const said = [];
  const ids = new Set();
  for (const entry of entries) {
    if (entry?.type !== 'assistant' || !Array.isArray(entry.message?.content)) continue;
    for (const part of entry.message.content) {
      if (part?.type === 'text') {
        if (answer === null || typeof part.text !== 'string' || part.text.trim().length === 0) continue;
        const key = textKey(part.text);
        if (reviewed.has(key)) continue;
        said.push(part.text);
        ids.add(key);
        continue;
      }
      if (part?.type !== 'tool_use' || typeof part.id !== 'string') continue;
      if (failed.has(part.id) || reviewed.has(part.id)) continue;
      if (FILE_TOOLS.has(part.name)) {
        const target = part.input?.file_path ?? part.input?.notebook_path;
        if (typeof target !== 'string' || target.length === 0) continue;
        ids.add(part.id);
        const absolute = isAbsolute(target) ? target : resolve(projectRoot, target);
        const rel = toProjectRelative(absolute, projectRoot);
        if (rel === null || matchesAny(rel, rules.skipGlobs)) continue;
        const lines = writtenLines(part.name, part.input);
        if (lines.length === 0) continue;
        const known = files.get(absolute);
        files.set(absolute, { rel, lines: [...(known?.lines ?? []), ...lines] });
      } else if (part.name === 'Bash') {
        ids.add(part.id);
        const command = part.input?.command;
        /* `git commit -m`을 여러 번 쓰면 git이 문단으로 이어 붙이므로 메시지 하나로 봅니다. */
        const commit = commitMessagesIn(command);
        if (commit.length > 0) messages.push({ label: 'commit 메시지', text: commit.join('\n\n') });
        const posted = pullRequestTextsIn(command);
        if (posted.length > 0) messages.push({ label: 'PR이나 issue에 올린 글', text: posted.join('\n\n') });
      }
    }
  }

  const pieces = [];
  for (const [absolute, { rel, lines }] of files) {
    const located = locateLines(absolute, lines)
      .map(({ no, text }) => ({ no, text: withoutQuoted(koreanSpan(text, rel), quoted) }))
      .filter(({ text }) => hangulCount(text) > 0);
    if (located.length > 0) pieces.push({ label: rel, lines: located.map(({ no, text }) => `${no}: ${text}`) });
  }
  for (const { label, text } of messages) {
    const body = unquoted(withoutCodeBlocks(String(text)));
    if (hangulCount(body) > 0) pieces.push({ label, lines: body.split('\n') });
  }
  if (answer !== null) {
    const last = typeof answer === 'string' ? answer.trim() : '';
    if (last.length > 0 && !reviewed.has(textKey(last)) && !said.some((text) => text.trim() === last)) {
      said.push(last);
      ids.add(textKey(last));
    }
    const body = unquoted(withoutCodeBlocks(said.join('\n\n')));
    const min = rules.reviewerAnswerMinHangul;
    if (min > 0 && hangulCount(body) >= min) pieces.push({ label: '답변', lines: body.split('\n') });
  }

  const kept = [];
  let hangul = 0;
  for (const piece of pieces) {
    const count = hangulCount(piece.lines.join('\n'));
    if (kept.length > 0 && hangul + count > rules.reviewerMaxHangul) break;
    kept.push(piece);
    hangul += count;
  }
  return { pieces: kept, ids: [...ids], hangul };
}

/* 조각마다 `[이름]` 줄을 붙여 검토 model에게 보낼 글로 잇습니다. */
export function reviewInput(pieces) {
  return pieces.map((piece) => `[${piece.label}]\n${piece.lines.join('\n')}`).join('\n\n');
}

/*
 * 검토 model은 고칠 것이 없다고 판단한 항목도 지적 형식으로 돌려줄 때가 있습니다. 이유가 다음 말로 시작하고 그 뒤에 글자가 바로 이어지지 않으면 지적으로 보지 않습니다.
 * `정상 용법이 아니라`, `문제 없다고 보기 어렵습니다`처럼 글자가 바로 이어지면 지적으로 봅니다.
 */
const NO_CHANGE_PHRASES = [
  String.raw`문제\s*(?:가\s*)?(?:없(?:음|습니다|다)|되지\s*않(?:음|습니다|는다))`,
  String.raw`이상\s*(?:이\s*)?없(?:음|습니다|다)`,
  String.raw`(?:수정|변경)\s*(?:이\s*)?(?:불필요(?:함|합니다)?|필요\s*(?:가\s*)?없(?:음|습니다|다))`,
  String.raw`(?:수정할|고칠|바꿀|변경할)\s*(?:필요|것)\s*(?:[이가]\s*)?없(?:음|습니다|다)`,
  String.raw`(?:수정하지|고치지|바꾸지)\s*않아도\s*(?:됨|됩니다|된다)`,
  String.raw`그대로\s*(?:둠|둡니다|두어도\s*(?:됨|됩니다|된다))`,
  String.raw`지적\s*(?:대상|할\s*것)\s*(?:[이가]\s*)?(?:아님|아닙니다|아니다|없음|없습니다)`,
  String.raw`정상\s*용법(?:임|입니다|이다|이므로)?`,
  String.raw`no\s+(?:issues?|problems?|changes?)`,
  String.raw`not\s+an?\s+issue`,
];
const NO_CHANGE_REASON = new RegExp(`^[\\s(\\[（「『"'\`]*(?:${NO_CHANGE_PHRASES.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

/* 공백을 모두 지운 글을 돌려줍니다. */
const compact = (text) => text.replace(/\s+/g, '');

/* 고친 표현이 원문과 같거나 원문 뒤에 `(문제 없음)` 같은 괄호 메모만 덧붙인 것인지 봅니다. 공백은 무시합니다. */
function unchanged(text, fix) {
  const before = compact(text);
  const after = compact(fix);
  return after.startsWith(before) && /^(?:[(（][^()（）]*[)）])*$/u.test(after.slice(before.length));
}

/* 검토 model이 고칠 것이 없다고 판단한 항목인지 봅니다. */
function notAnIssue(issue) {
  return unchanged(issue.text, issue.fix) || NO_CHANGE_REASON.test(String(issue.why ?? '').trim());
}

/* 검토 model의 답에서 JSON을 꺼냅니다. 고칠 것이 없다고 판단한 항목은 뺍니다. 형식이 맞지 않으면 null을 돌려줍니다. */
export function parseVerdict(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let verdict;
  try {
    verdict = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (verdict?.ok === true) return { ok: true, issues: [] };
  if (verdict?.ok !== false) return null;
  const issues = (Array.isArray(verdict.issues) ? verdict.issues : [])
    .filter((issue) => typeof issue?.text === 'string' && typeof issue?.fix === 'string' && !notAnIssue(issue))
    .map((issue) => ({ where: String(issue.where ?? ''), text: issue.text, fix: issue.fix, why: String(issue.why ?? '') }));
  return { ok: issues.length === 0, issues };
}

/* `claude -p`로 검토 model을 부릅니다. 이 session은 도구와 MCP server를 쓰지 않고 설정 파일도 읽지 않습니다. 빈 임시 directory에서 실행하므로 프로젝트의 hook과 CLAUDE.md가 끼어들지 않습니다. 실행에 실패하거나 시간을 넘기면 null을 돌려줍니다. */
export function runReviewer(input, options) {
  const outer = callReviewer(input, options);
  return outer === null ? null : parseVerdict(outer.result);
}

/* 검토 model을 부르고 `claude -p`가 출력한 JSON을 그대로 돌려줍니다. `runReviewer`도 이 함수로 검토 model을 부릅니다. 평가 script는 여기에 든 비용과 시간을 집계합니다. */
export function callReviewer(input, { model, timeoutSeconds }) {
  const command = process.env.KOREAN_STYLE_REVIEWER_COMMAND || 'claude';
  const cwd = join(tmpdir(), 'korean-style-review', 'cwd');
  try {
    mkdirSync(cwd, { recursive: true });
  } catch {
    return null;
  }
  /* 검토 model의 session 안에서 검토 hook이 다시 실행되면 바로 끝나도록 이 환경 변수를 `1`로 정합니다. */
  const env = { ...process.env, KOREAN_STYLE_REVIEWING: '1' };
  delete env.CLAUDE_PROJECT_DIR;
  const args = [
    '-p', '--model', model, '--system-prompt', REVIEWER_PROMPT,
    '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence',
    '--output-format', 'json',
  ];
  const result = spawnSync(command, args, {
    input, cwd, env, encoding: 'utf-8', timeout: Math.max(1, timeoutSeconds) * 1000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return null;
  let outer;
  try {
    outer = JSON.parse(result.stdout);
  } catch {
    return null;
  }
  return outer !== null && typeof outer === 'object' && outer.is_error !== true ? outer : null;
}

/* 이미 검토한 도구 호출과 답변을 session마다 임시 directory에 기록합니다. 같은 요청에서 Claude가 여러 번 멈춰도 같은 글을 검토 model에게 다시 보내지 않으려는 것입니다. */
function statePath(key) {
  return join(tmpdir(), 'korean-style-review', `${String(key).replace(/[^\w-]/g, '_')}.json`);
}

export function loadReviewed(key) {
  try {
    return new Set(JSON.parse(readFileSync(statePath(key), 'utf-8')));
  } catch {
    return new Set();
  }
}

export function saveReviewed(key, ids) {
  try {
    mkdirSync(dirname(statePath(key)), { recursive: true });
    writeFileSync(statePath(key), JSON.stringify([...ids].slice(-2000)));
  } catch {
    /* 기록하지 못하면 다음에 같은 글을 다시 보낼 뿐입니다. */
  }
}

/* 검토 model의 지적을 답변에 대한 것과 파일, commit 메시지, PR과 issue 글에 대한 것으로 나눕니다. 위치에 `답변`이 적혀 있거나 고칠 표현이 답변 조각에만 들어 있으면 답변에 대한 지적으로 봅니다. */
export function splitIssues(issues, pieces) {
  const textOf = (wanted) => pieces.filter((piece) => (piece.label === '답변') === wanted).map((piece) => piece.lines.join('\n')).join('\n');
  const said = textOf(true);
  const written = textOf(false);
  const answer = [];
  const work = [];
  for (const issue of issues) {
    const quoted = issue.text.trim();
    const answerOnly = quoted.length > 0 && said.includes(quoted) && !written.includes(quoted);
    (issue.where.includes('답변') || answerOnly ? answer : work).push(issue);
  }
  return { answer, work };
}

function issueLines(issues, withWhere) {
  const shown = issues.slice(0, MAX_ISSUES).map((issue) => {
    const where = withWhere && issue.where ? `${issue.where}: ` : '';
    const why = issue.why ? ` (${issue.why})` : '';
    return `- ${where}\`${issue.text}\` → \`${issue.fix}\`${why}`;
  });
  if (issues.length > MAX_ISSUES) shown.push(`- 그 밖에 ${issues.length - MAX_ISSUES}곳이 더 있습니다.`);
  return shown.join('\n');
}

/* 파일, commit 메시지, PR과 issue 글에 대한 지적을 Claude에게 알리는 문구를 만듭니다. 답변에 대한 지적은 넣지 않습니다. */
export function reviewMessage(issues, model) {
  return (
    `한국어 검토: 이번 요청에서 파일, commit 메시지, PR과 issue 글에 쓴 한국어를 검토 model(${model})이 따로 읽었습니다. ` +
    '검토 model이 고칠 표현으로 본 곳은 아래와 같습니다. ' +
    '지적이 맞고 고쳐도 뜻이 바뀌지 않으면 파일은 그 줄을 고치고 commit 메시지는 아직 push하지 않았을 때만 고쳐서 다시 commit하십시오. PR과 issue에 올린 글은 고치지 말고 지적만 사용자에게 알리십시오. ' +
    '고쳤으면 무엇을 고쳤는지, 고치지 않았으면 그 이유를 사용자에게 한 문장으로 알리십시오. 사용자에게 무엇을 읽거나 하라고 요청하지 마십시오.\n' +
    issueLines(issues, true)
  );
}

/* 답변에 대한 지적은 session마다 임시 directory의 파일에 모아 둡니다. 다음 요청 때 UserPromptSubmit hook이 그 지적을 Claude에게만 알리고 파일을 지웁니다. 답변은 이미 화면에 나왔으므로 Claude가 고친 답변을 다시 보여 주지 않도록 지적을 바로 전달하지 않습니다. */
function answerIssuesPath(sessionId) {
  return statePath(`${sessionId}-answer`);
}

export function saveAnswerIssues(sessionId, issues) {
  const path = answerIssuesPath(sessionId);
  try {
    let kept = [];
    try {
      kept = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      kept = [];
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify([...kept, ...issues].slice(-MAX_ISSUES)));
  } catch {
    /* 기록하지 못하면 다음 요청 때 그 지적을 알리지 못할 뿐입니다. */
  }
}

export function takeAnswerIssues(sessionId) {
  const path = answerIssuesPath(sessionId);
  let issues;
  try {
    issues = JSON.parse(readFileSync(path, 'utf-8'));
    rmSync(path, { force: true });
  } catch {
    return [];
  }
  return Array.isArray(issues) ? issues.filter((issue) => typeof issue?.text === 'string' && typeof issue?.fix === 'string') : [];
}

/* 앞 답변에 대한 지적을 다음 요청 때 Claude에게 알리는 문구를 만듭니다. */
export function answerReminder(issues) {
  return (
    '앞 답변을 검토 model이 따로 읽고 아래 표현을 고쳐야 한다고 지적했습니다. 이번 답변부터 같은 표현을 쓰지 마십시오. ' +
    '앞 답변을 고쳐 다시 보여 주거나 이 지적을 사용자에게 말하지 마십시오.\n' +
    issueLines(issues, false)
  );
}
