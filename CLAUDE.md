# 작업 지침

이 repository는 다른 프로젝트에 한국어 작성 skill과 문체 검사기를 설치하는 도구입니다.
Claude Code, Codex, Gemini CLI가 이 파일을 함께 읽습니다. `AGENTS.md`와 `GEMINI.md`는 `CLAUDE.md`를 가리키는 symlink이므로 `CLAUDE.md`만 고치고 symlink는 그대로 둡니다.

## 한국어로 생각하고 쓰기

- 처음부터 한국어로 생각합니다. 계획, 메모, 추론도 한국어로 하고 영어로 떠올린 문장을 한국어로 옮기지 않습니다.
- Model이 읽는 지시문(output style, skill, 말투별 문구, `korean-reviewer`, 이 파일)도 한국어로 씁니다. 사람이 읽는 문서, 메시지, commit 메시지, release note도 한국어로 씁니다.
- 답변을 포함한 모든 글을 업무 문서처럼 격식 있는 문어체로 씁니다. 말투는 합니다체이며 서술은 `~합니다`, 요청은 `~해 주십시오`로 끝냅니다.
- 목표는 뜻을 지키는 자연스러운 한국어입니다. 문체 취향을 문법 오류처럼 다루지 않습니다.
- 작성 규칙은 `korean-rewrite` skill(`skill/korean-rewrite/SKILL.md`)에 있고 그 근거와 출처는 `docs/writing.md`에 있습니다. Output style(`output-styles/korean-style.md`)에는 말투와 기본 원칙만 둡니다.
- Claude Code에서는 session에서 처음 한국어를 쓰기 전에 skill을 부릅니다. 대화를 압축한 뒤 context에 skill 본문이 없으면 한국어를 쓰기 전에 다시 부릅니다. Skill을 거치지 않은 한국어 파일과 commit은 hook이 막습니다. 다른 agent는 한국어를 쓰기 전에 skill 파일을 읽습니다.
- Claude Code에서는 파일, commit 메시지, PR과 issue에 올리는 글에 한글을 한 번에 200자 이상 쓰려면 그 글을 직접 쓰지 않고 `korean-writer` agent(`agents/korean-writer.md`)에게 맡깁니다. 맡길 때는 독자, 글 종류, 말투, 담을 사실을 적은 메모를 넘깁니다. 같은 요청에서 이 agent를 부르지 않고 쓴 글도 hook이 막습니다. Claude Code가 아닌 agent는 글을 맡기지 않고 skill 파일을 읽은 뒤 직접 씁니다.
- Claude Code에서는 요청을 마칠 때 검토 hook이 그 요청에서 쓴 한국어를 검토 model(기본값 Sonnet)에게 다시 읽혀 지적을 돌려줍니다. 파일에 대한 지적이 맞고 고쳐도 뜻이 바뀌지 않으면 그 줄을 고칩니다. Commit 메시지는 push하기 전에만 고칩니다. 답변에 대한 지적은 다음 답변부터 반영하고 앞 답변을 고쳐 다시 보여 주지 않습니다. 다른 agent에는 이 hook이 적용되지 않습니다.
- 번역투는 외국어 원문의 낱말, 문장 구조, 표현 방식을 그대로 따라 쓴 표현입니다. 같은 뜻의 자연스러운 한국어 표현이 있는데도 원문의 흔적이 드러납니다. 번역투는 쓰지 않습니다. 사전에 오른 정상 용법(`요청에 대한 응답`, `VPN을 통해 사내망에 접속합니다`)은 번역투로 보지 않으며 이런 표현을 피하려고 명사를 나열하지 않습니다.
- 영어를 낱말 단위로 옮기지 않습니다. 내가 영어로 한 생각과 프로젝트 개념의 영어 이름도 마찬가지입니다. 누가 무엇을 하는지 쉬운 한국어로 쓰고 내부 동작의 이름 대신 독자가 화면에서 보는 것을 설명합니다. 다 쓴 문장을 영어로 되옮겨 낱말 단위로 맞아떨어지면 다시 씁니다.
- 개발자가 읽는 글에서는 IT와 공학 용어를 영어 원어로 씁니다(commit, repository, branch, merge, deploy, test, server, directory, shell, hook, skill). 음차(`커밋`, `머지`)와 번역어(`저장소`, `병합`, `배포`)를 모두 쓰지 않습니다. 일반 어휘(확인, 설정, 알림, 경로)와 완전히 정착한 말(파일, 프로젝트, 버전, 메시지)은 한국어로 씁니다. 문장, 제목, 목록 항목, 표 칸이 영어 낱말로 시작하면 `Commit하기 전에`처럼 첫 글자를 대문자로 씁니다. 달러 금액은 `$0.095`처럼 씁니다. 웹 페이지와 이용자 공지처럼 일반 독자가 읽는 글에서는 개발 용어를 풀어 쓰고 사전에 오른 외래어를 한글로 적습니다. 용어 목록과 예외는 skill의 '용어 표기' 절에 있고 검사기가 쓰는 IT 용어 표는 `docs/rules.md`에 있습니다.
- `영어식 표현` 대신 `번역투`라고 쓰고 합니다체나 해요체를 가리킬 때는 `어투` 대신 `말투`라고 씁니다.
- 답변과 문서 산문에 가운뎃점, 줄표, emoji를 쓰지 않습니다.

## 검사와 규칙

- Claude Code hook은 파일 쓰기와 답변을 자동으로 검사합니다. 다른 agent에서는 Claude Code hook이 실행되지 않으므로 일을 마치기 전에 `node scripts/check-korean.mjs --file <경로>`나 `--stdin`으로 한국어를 확인합니다. Git의 `commit-msg` hook은 `npm run doctor -- --install-commit-hook`으로 설치하면 어느 agent로 commit하든 실행됩니다.
- 검사 규칙과 그 가운데 무엇을 막을지는 `docs/rules.md`에서 정합니다. 정책 값을 코드에 숨기지 않습니다.
- 뜻이 모호할 수 있는 표현은 경고로만 알립니다. Hook은 오류만 막고 답변을 다시 쓰라는 요구는 한 번만 합니다.
- 동작을 변경하면 회귀 test를 추가하고 `npm run gate`를 통과시킵니다. 회귀 test에는 검사기가 잡으면 안 되는 문장도 넣습니다.

## 문서와 측정

- README와 예시 문서에는 측정한 결과만 씁니다. 숫자는 `npm run eval -- --summary`로 다시 집계할 수 있어야 하고 인용한 답변은 저장된 답변과 글자 하나 다르지 않아야 합니다. 사람이 읽고 판단한 내용은 그 기준을 함께 적습니다.
- 실제 model로 하는 평가는 `npm run eval -- --run`으로 실행합니다. 유료 API를 쓰므로 일반 test에 넣지 않습니다. 요청과 답변은 함께 놓고 검토합니다.
- 필요 없는 파일과 설명은 줄이되 test, 근거, 실행할 수 있는 사용법은 남깁니다.
- 실행 결과, 보고서, 개인 메모, local 설정은 Git에 넣지 않습니다. 평가 입력과 회귀 test는 repository에 둡니다.
- 공개 repository입니다. 개인 설정, 비공개 프로젝트 이름, local 경로는 Git이 추적하는 파일에 넣지 않습니다.

## Commit

- Commit 메시지와 release note도 문서와 같은 한국어 규칙을 따릅니다. 제목은 짧은 명사구로 쓰고 본문은 목록까지 완결된 합니다체 문장으로 씁니다. 서술어 없는 조각, 괄호 약식, 형식이 섞인 목록을 남기지 않습니다.
- Commit과 PR에 `Co-Authored-By: Claude`나 `Generated with [Claude Code]` 같은 생성 표시를 넣지 않습니다.
- 한국어 산문(문서, 메시지, 주석, test 제목, release note)을 새로 쓰거나 고쳤으면 commit하기 전에 `korean-reviewer` agent로 diff와 commit 메시지를 검토합니다. 지적은 모두 반영합니다. `.claude/agents`를 쓰지 못하는 agent는 `.claude/agents/korean-reviewer.md`의 점검 목록으로 직접 검토합니다.

설치 script는 `scripts/install.mjs`, 검사기 코드는 `scripts/lib/`, hook은 `scripts/hooks/`에 있습니다.
사용법은 `README.md`와 `docs/usage.md`에, 제약은 `docs/limits.md`에 있습니다. 평가 입력은 `test/fixtures/eval/`에 두고 결과는 `.eval/`에만 둡니다.
