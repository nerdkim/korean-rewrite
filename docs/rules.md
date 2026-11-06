# 검사 규칙

검사기는 이 문서의 `korean-style-rules` 블록에서 규칙을 읽습니다. 설치한 프로젝트에서는 `.korean-style/rules.md`가 이 문서를 대신합니다.
output style은 이 도구 repository의 `output-styles/korean-style.md`에 있고 설치한 프로젝트에서는 `.claude/output-styles/korean-style.md`에 있습니다.
Claude Code는 session을 시작할 때 output style을 system prompt에 넣습니다. hook은 실행될 때마다 이 문서를 새로 읽습니다. 따라서 Claude가 output style과 이 문서를 직접 읽을 필요는 없습니다.

## 오류와 경고

- hook은 commit 메시지나 PR과 issue에 올리는 글에 오류가 있으면 막습니다. 파일은 새로 만들 때 파일 전체의 오류를 막고 기존 파일을 고칠 때는 이번 편집으로 새로 생긴 오류만 막습니다. 기존 파일에 원래 있던 오류는 막지 않으므로 파일에 그대로 남을 수 있습니다. 답변에 오류가 있으면 한 번 다시 쓰게 합니다. 오류로 나눈 규칙은 말투와 표기처럼 프로젝트가 정한 정책입니다.
- 기본 규칙에서는 `banned-char`에 든 문자를 산문에 쓰면 검사기가 오류로 잡습니다. 가운뎃점(U+00B7)과 줄표(U+2014)도 여기에 듭니다. 나열은 쉼표나 조사로 잇고 덧붙이는 설명은 괄호나 다른 문장으로 씁니다.
- 검사기는 Claude Code가 commit 메시지와 PR 설명에 붙이는 생성 표시도 오류로 잡습니다. 막을 문구는 `banned-attribution`에 적습니다.
- 글이 `advisory-rules`에 든 규칙에 걸리면 검사기는 경고로만 보고합니다. CLI는 경고를 보여 줍니다. hook은 경고 때문에 쓰기를 막거나 다시 쓰라고 요구하지 않습니다.
- `chat-advisory-rules`에 든 규칙은 답변과 도구에 넘기는 글에서만 경고로 보고합니다. 도구에 넘기는 글은 `chat-tool-fields`와 `agent-tool-fields`에 적은 필드에 쓰는 글입니다. 사용자에게 묻는 질문, 계획, 사용자에게 보내는 파일 설명, agent에게 주는 prompt가 여기에 듭니다. 파일, commit 메시지, PR과 issue에 올리는 글에서는 오류로 보고합니다. 기본값은 `transliteration` 하나이고 그 이유는 아래 [IT 용어 표기](#it-용어-표기) 절에 있습니다.
- PreToolUse hook은 `review-rules`에 든 규칙의 경고를 Claude에게 알립니다. 이때도 쓰기는 막지 않습니다. hook은 이번에 바꾼 문단에서 새로 생긴 경고만 알립니다. 어색하면 고치고 문맥에 맞으면 그대로 두라는 말도 덧붙입니다.
- CLI의 종료 코드는 오류가 있으면 1, 사용법이 틀리면 2입니다. 경고만 있으면 0이고 `--strict`를 붙이면 경고만 있어도 1입니다.
- CLI는 규칙을 읽지 못하면 실패합니다. hook은 규칙을 읽지 못해도 멈추지 않습니다. 이때 hook은 금지 문자, 금지 호칭, 영어로만 쓴 답변, 생성 표시만 검사하고 `writing-skill`의 기본값인 `korean-rewrite` skill을 요구합니다. 규칙을 읽지 못하는 문제는 `doctor`와 `gate`로 확인합니다.

## 한국어를 쓰기 전에 부르는 skill

- Claude는 한국어를 쓰기 전에 이 session에서 `writing-skill`에 적은 skill을 불러야 합니다. 한 번 부르면 같은 session의 다음 요청에서는 다시 부르지 않아도 됩니다. Claude Code 2.1.310은 이미 불러온 skill을 다시 부르면 본문을 다시 넣지 않고 `Skill /korean-rewrite is already loaded above; instructions unchanged.`라는 안내만 대화에 남기기 때문입니다.
- hook은 transcript에서 마지막으로 대화를 압축한 지점 뒤를 보고, 압축한 적이 없으면 session 처음부터 봅니다. 이번 요청에서 부른 기록은 압축 지점 앞에 있어도 부른 것으로 봅니다. 압축하면 그 앞에서 불러온 skill 본문이 Claude에게 남지 않으므로, 압축 지점 뒤에 부른 기록이 없으면 `invoked_skills` 첨부를 찾습니다. Claude Code가 압축한 뒤 skill 본문을 다시 넣으면 이 첨부가 남습니다. 압축 지점 뒤에 이 첨부가 있고 그 안에 이 skill이 있으면 부른 것으로 봅니다.
- Claude가 이 session에서 skill을 부르지 않은 채 파일을 쓰거나 commit하거나 PR을 올리려 하면 PreToolUse hook이 막습니다. 이번에 쓰는 내용에 한글이 `writing-skill-min-hangul`에 적은 수 이상 들어 있을 때만 막습니다. skill을 부르지 않은 채 한국어 답변을 마치면 Stop hook이 Claude에게 skill을 부른 뒤 답변을 다시 쓰라고 요구합니다.
- UserPromptSubmit hook은 사용자가 prompt를 보낼 때마다 Claude에게 안내합니다. 이 session에서 skill을 이미 불렀으면 다시 부르지 말고 skill에 적힌 절차를 따르라고 하고, 아직 부르지 않았으면 먼저 부르라고 합니다.
- subagent가 파일을 쓸 때는 hook이 그 subagent의 transcript에서 skill을 불렀는지 봅니다.
- hook은 같은 요청에서 skill을 부르지 않았다는 이유로 두 번 막았는데도 Claude가 skill을 부르지 않으면 Skill 도구를 쓸 수 없는 환경이라고 봅니다. 그 뒤로는 이 이유로 막지 않습니다.
- `writing-skill:`처럼 값을 비우거나 그 skill이 `.claude/skills/`에 없으면 hook은 skill을 요구하지 않습니다. 직접 고친 예전 규칙처럼 `writing-skill`과 `writing-skill-min-hangul` 키가 아예 없으면 기본값인 `korean-rewrite`와 20을 씁니다.
- 같은 요청에서 Claude가 작성 agent에게 글을 맡겼으면 hook은 skill을 따로 요구하지 않습니다. 작성 agent의 frontmatter에 이 skill을 미리 불러오도록 적어 두었기 때문입니다.

## 한글이 많은 글을 맡기는 agent

- 파일, commit 메시지, PR과 issue에 올리는 글에 한 번에 쓰는 한글이 `writer-agent-min-hangul`에 적은 수 이상이면 Claude는 그 글을 직접 쓰지 않고 `writer-agent`에 적은 agent에게 맡겨야 합니다. Claude는 독자, 글 종류, 말투, 담을 사실을 적은 메모를 Agent 도구로 넘기고 돌려받은 글을 씁니다. 소스 파일에서는 주석에 든 한글만 계산에 넣습니다. 질문과 계획처럼 대화에 쓰는 글에는 이 agent를 요구하지 않습니다.
- 답변은 한글이 `writer-agent-answer-min-hangul`에 적은 수 이상일 때만 맡깁니다. 이 값이 0이면 답변은 맡기지 않습니다. 기본 규칙은 이 값을 0으로 두었습니다. 답변까지 맡기면 작업하던 Claude가 메모와 돌려받은 글을 한 번씩 더 출력해야 해서 답이 늦어지기 때문입니다.
- 사용자가 prompt를 보낼 때마다 UserPromptSubmit hook이 이 agent에게 글을 맡기라고 Claude에게 알립니다.
- Claude가 그 요청에서 이 agent를 부르지 않은 채 한글이 기준 이상 든 글로 파일을 쓰거나 commit하거나 PR을 올리려 하면 PreToolUse hook이 막습니다. `writer-agent-answer-min-hangul`을 0보다 크게 정했으면 hook은 답변에도 이 agent를 요구합니다. Claude가 이 agent를 부르지 않은 채 한글이 그 수 이상 든 답변을 마치면 Stop hook이 답변을 이 agent에게 맡겨 다시 쓰라고 Claude에게 요구합니다.
- hook은 이 agent를 불렀는지만 확인하고 돌려받은 글을 그대로 썼는지는 확인하지 않습니다. agent를 찾지 못한 경우처럼 결과가 오류로 끝난 호출은 부른 것으로 보지 않습니다.
- subagent가 쓰는 글에는 이 agent를 요구하지 않습니다.
- hook은 같은 요청에서 이 agent를 부르지 않았다는 이유로 두 번 막았는데도 Claude가 이 agent를 부르지 않으면 그 뒤로는 이 이유로 막지 않습니다.
- `writer-agent:`처럼 값을 비우거나 그 agent가 `.claude/agents/`에 없으면 hook은 이 agent를 요구하지 않습니다. 직접 고친 예전 규칙처럼 키가 아예 없으면 기본값인 `korean-writer`, 200, 0을 씁니다.

## 요청을 마친 뒤 다시 읽는 검토 model

- Claude가 요청을 마칠 때(Stop) 검토 hook이 그 요청에서 Claude가 쓴 한국어를 모아 `reviewer-model`에 적은 model에게 보냅니다. 보내는 글은 파일에 새로 쓴 줄, commit 메시지, PR과 issue에 올린 글, 답변입니다. 답변에는 Claude가 도구를 부르는 사이에 쓴 진행 보고도 들어 있습니다.
- subagent가 끝날 때(SubagentStop)는 그 subagent가 쓴 파일, commit 메시지, PR과 issue에 올린 글만 보냅니다. 마지막 보고는 보내지 않습니다.
- 소스 파일에서는 주석뿐 아니라 화면 문구 같은 문자열에 든 한국어도 보냅니다. 검사기는 소스 파일에서 주석만 검사하고 hook은 작성 agent를 요구할지 정할 때 주석의 한글만 계산에 넣습니다.
- 검토 hook이 모은 글 전체의 한글이 `reviewer-min-hangul`에 적은 수보다 적으면 아무것도 보내지 않습니다. 답변은 한글이 `reviewer-answer-min-hangul`에 적은 수보다 적으면 보내지 않습니다. 이 값이 0이면 답변을 늘 보내지 않습니다.
- 한 번에 보내는 한글의 상한은 `reviewer-max-hangul`입니다. 검토 hook은 조각의 한글을 앞에서부터 합쳐 이 수를 넘으면 그 조각부터는 보내지 않습니다. 첫 조각은 이 수를 넘어도 보냅니다.
- 검토에서 빼는 글은 사용자가 요청에 직접 쓴 문장, 문서의 코드 블록, `skip-globs` 경로에 든 파일, 프로젝트 밖 파일, 결과가 오류로 끝난 도구 호출입니다. 검사기가 막는 오류가 있어 Stop hook이 다시 쓰게 하는 답변도 뺍니다.
- 사용자가 쓴 문장은 Stop에서만 빼고 SubagentStop에서는 빼지 않습니다. 검토 hook은 이 문장을 찾을 때 숫자와 `{count}` 같은 자리 표시를 같은 기호로 바꾸고 공백을 지운 뒤 비교합니다. 따라서 Claude가 숫자를 자리 표시로 바꿔 넣었거나 답변에서 따옴표로 다시 보여 줘도 뺍니다.
- `stop_hook_active`가 true인 Stop에서는 검토하지 않습니다.
- 같은 session에서 이미 검토한 도구 호출과 답변은 다시 보내지 않습니다. 검토 hook은 검토 model을 부르기 전에 기록하므로 호출이 실패해도 같은 글을 다시 보내지 않습니다.
- 파일, commit 메시지, PR과 issue에 올린 글에 대한 지적이 있으면 검토 hook이 종료 코드 2로 끝나고 Claude Code가 그 지적을 Claude에게 전달해 작업을 이어 가게 합니다. 알림은 Claude에게 지적이 맞고 고쳐도 뜻이 바뀌지 않으면 파일은 그 줄을 고치라고 합니다. commit 메시지는 아직 push하지 않았을 때만 고쳐 다시 commit하라고 합니다. PR과 issue에 올린 글은 고치지 말고 지적만 사용자에게 알리라고 합니다.
- 알림은 Claude에게 고쳤으면 무엇을 고쳤는지, 고치지 않았으면 그 이유를 사용자에게 한 문장으로 알리라고 합니다. 사용자에게 무엇을 읽거나 하라고 요청하지 말라고도 합니다. 알림에는 지적을 8개까지 싣습니다.
- 답변에 대한 지적은 Claude에게 바로 전달하지 않습니다. 검토 hook이 지적을 session마다 임시 directory에 저장해 두면 다음 요청 때 UserPromptSubmit hook이 그 지적을 Claude에게만 알리고 지웁니다. 이 알림은 Claude에게 이번 답변부터 같은 표현을 쓰지 말라고 합니다. 앞 답변을 고쳐 다시 보여 주거나 지적을 사용자에게 말하지도 말라고 합니다.
- `reviewer-model`의 기본값은 `sonnet`입니다. 값을 비우면 검토하지 않습니다. `reviewer-model` 키가 아예 없는 예전 규칙에서도 기본값으로 검토합니다.
- `reviewer-min-hangul`의 기본값은 10, `reviewer-answer-min-hangul`은 30, `reviewer-max-hangul`은 6000, `reviewer-timeout`은 90초입니다.
- 현재 검토 지시로 세 model의 지적 횟수와 비용을 측정했습니다. 측정 날짜는 2026년 11월 6일이고 Claude Code 버전은 2.1.310입니다. 측정에 쓴 예문은 18개이고 번역투가 든 문장이 8개, 자연스러운 문장이 10개입니다. 예문을 묶음 3개로 나누고 model마다 각 묶음을 여섯 번 보냈습니다. model마다 번역투 문장은 합쳐서 48번, 자연스러운 문장은 합쳐서 60번 보낸 셈입니다. 예문과 판단 기준은 `test/fixtures/eval/reviewer.json`에 있습니다. 검토 지시에는 이 예문의 문장과 그 문장에서 고칠 표현을 예로 넣지 않았습니다.
- Sonnet은 번역투 문장을 48번 가운데 34번 지적했고 자연스러운 문장은 한 번도 잘못 지적하지 않았습니다. 묶음 하나에 평균 0.0114달러가 들었습니다.
- Opus도 번역투 문장을 34번 지적했고 자연스러운 문장은 한 번도 잘못 지적하지 않았습니다. 묶음 하나에 평균 0.0147달러가 들었습니다.
- Haiku는 번역투 문장을 32번 지적했지만 자연스러운 문장을 6번 잘못 지적했습니다. 묶음 하나에 평균 0.0013달러가 들었습니다.
- 기본값은 자연스러운 문장을 한 번도 잘못 지적하지 않은 model 가운데 번역투 문장을 더 많이 지적한 model로 정합니다. 지적 횟수가 같으면 비용이 적은 model을 고릅니다. 이 측정에서 Sonnet과 Opus는 자연스러운 문장을 한 번도 잘못 지적하지 않았고 번역투 문장을 지적한 횟수도 34번으로 같았습니다. 따라서 묶음 하나에 드는 비용이 적은 Sonnet을 기본값으로 둡니다. Haiku는 자연스러운 문장을 6번 잘못 지적했으므로 고르지 않았습니다.
- 0.4.1까지 쓰던 검토 지시로도 지적 횟수를 측정했습니다. 측정 날짜는 2026년 10월 30일이고 Claude Code 버전은 2.1.310입니다. 이때 쓴 예문에서는 자연스러운 문장 10개 가운데 5개에 지금과 달리 IT 용어가 한글로 적혀 있었습니다. 이 측정에서 Sonnet은 번역투 문장을 48번 가운데 32번 지적했고 Opus는 30번 지적했습니다. 두 model 모두 자연스러운 문장을 한 번도 잘못 지적하지 않았습니다. Haiku는 번역투 문장을 39번 지적했지만 자연스러운 문장을 11번 잘못 지적했습니다.

## IT 용어 표기

개발자가 읽는 글에서는 IT와 공학 용어를 영어 원어로 씁니다. `커밋`, `머지`, `리포지토리` 같은 한글 음차와 `저장소`, `병합`, `배포` 같은 번역어를 모두 쓰지 않습니다. 파일, 프로젝트, 버전, 메시지처럼 완전히 정착한 일반어와 확인, 요청, 설정, 경로 같은 일반 어휘는 한국어로 씁니다.
이 표기는 업계 다수 관행이 아니라 이 도구가 정한 기본값입니다. 국내 회사 기술 블로그 194편과 Microsoft, Google, AWS, GitHub의 한국어 문서는 대부분 한글로 표기합니다. 팀이 아래 키의 용어 표를 고치거나 값을 비우면 검사기가 잡는 표기만 바뀝니다. skill과 output style에 든 표기 지시는 바뀌지 않으므로 Claude가 한글 표기를 쓰게 하려면 프로젝트의 `CLAUDE.md`에 그렇게 적어야 합니다. 검토 model은 CLAUDE.md를 읽지 않으므로 한글 표기를 고칠 표현으로 지적할 수 있습니다.

- `banned-transliteration`에 적은 한글 음차는 `transliteration` 오류입니다. 일반 뜻으로 쓸 일이 드문 말을 이 키에 둡니다.
- `ambiguous-transliteration`에 적은 한글 음차는 `ambiguous-transliteration` 경고입니다. `이슈`, `리뷰`, `포크`, `이벤트`처럼 일반 뜻으로도 흔히 쓰는 말을 이 키에 둡니다.
- `banned-translation`에 적은 번역어는 `loose-translation` 경고입니다. `저장소`, `배포`, `병합`, `분기`는 일반 뜻과 겹치므로 경고로만 알립니다.
- 검사기는 표에 적은 말이 낱말 첫머리에 있을 때만 잡습니다. 앞에 한글이나 숫자가 붙은 `나머지`, `블로그`, `1분기`는 다른 낱말로 봅니다. 뒤에 조사, `-하다`, `-되다`나 `-들`, `-용`, `-별` 같은 접미사만 이어지면 잡고 다른 말이 이어진 `머지않아`, `캐시백`, `빌드업`, `리포트`는 잡지 않습니다.
- 한 자리에 여러 항목이 맞으면 가장 긴 항목 하나만 보고합니다. 그래서 `로그인`에서 `로그`를 따로 잡지 않고 `코드 리뷰`에서 `리뷰`를 따로 잡지 않습니다.
- `term-exempt`에 적은 구절 안의 말은 잡지 않습니다. 기본값에는 `푸시 알림`처럼 일반 독자에게도 굳은 말과 `분기별`처럼 IT 뜻이 아닌 구절이 들어 있습니다.
- 따옴표 안, 인라인 코드, 코드 블록에 쓴 말은 보지 않습니다. 사용자가 준 글을 옮겨 적거나 명령 출력을 보여 줄 때는 원래 표기를 지키기 때문입니다.
- PreToolUse hook은 새 파일을 만들 때 파일 전체를 검사합니다. 기존 파일을 고칠 때는 바뀐 줄에 새로 쓴 음차처럼 이번 편집으로 새로 생긴 오류만 막습니다. 파일에서 `<!-- korean-style: general-reader -->` 줄을 지워서 생긴 음차 오류도 새로 생긴 오류로 봅니다. 파일에 원래 있던 음차는 막지 않으므로 한글 음차가 남은 기존 파일도 고칠 수 있습니다. 남은 음차는 `check-korean.mjs --all`로 찾아 따로 고칩니다.

답변과 도구에 넘기는 글에서는 `transliteration`도 경고로만 알립니다(`chat-advisory-rules`). 답변에는 이용자 공지 초안이나 사용자가 준 글을 다듬은 결과가 들어 있을 때가 많은데 검사기는 이런 글을 가려내지 못합니다. 이런 답변을 Stop hook이 다시 쓰게 하면 Claude가 일반 독자가 읽을 글이나 사용자의 원문까지 영어 원어로 바꿀 수 있습니다. agent에게 주는 prompt에도 이용자 공지에 담을 사실이 들어 있을 때가 많아서 같은 기준을 적용합니다. 답변과 도구에 넘기는 글에서도 오류로 보고하게 하려면 `chat-advisory-rules` 값을 비웁니다.

이용자 공지, 웹 페이지, 앱 문구, 개인정보 처리방침, 약관처럼 일반 독자가 읽는 글은 `페이지`, `브라우저`, `쿠키`처럼 한글로 굳은 외래어로 씁니다. 이런 파일에는 IT 용어 표 규칙 세 가지(`transliteration`, `ambiguous-transliteration`, `loose-translation`)를 적용하지 않습니다. 다른 규칙은 그대로 적용합니다. 일반 독자가 읽는 파일은 두 방법으로 정합니다.

- 규칙 문서의 `general-reader-globs`에 경로 pattern을 적습니다. 형식은 `doc-globs`와 같고 기본값은 비어 있습니다.
- 파일 첫머리에 `<!-- korean-style: general-reader -->` 줄을 넣습니다. 검사기는 코드 블록 밖에 이 줄이 있으면 파일 전체를 일반 독자가 읽는 글로 봅니다. 문서 파일에만 쓸 수 있습니다.

`loanword-spelling`에는 `워크플로우=워크플로`, `디렉토리=디렉터리`처럼 이제 영어 원어로 쓰는 말의 한글 표기를 바로잡는 항목도 남겨 둡니다. 일반 독자가 읽는 글과 코드 블록에서는 이 항목이 맞는 한글 표기를 알려 줍니다. 개발자가 읽는 글에서 같은 낱말이 `transliteration` 오류에 걸리면 검사기는 이 항목을 건너뛰고 영어 원어 하나만 알립니다. 답변에서는 `transliteration`이 경고이므로 검사기가 이 항목을 건너뛰지 않고 틀린 한글 표기를 오류로 알립니다.

## 번역투

번역투는 외국어(주로 영어, 일본어) 원문의 낱말, 문장 구조, 표현 방식을 그대로 따라 써서 원문의 흔적이 드러나는 표현입니다. 같은 뜻의 더 자연스러운 한국어 표현이 있으면 번역투로 보고 고칩니다. 사전에 오른 정상 용법으로 관계와 뜻을 밝히는 표현은 번역투로 보지 않습니다.

- `translationese-patterns`에는 고칠 구절을 적습니다. 행위자를 `~에 의해`로 붙인 피동문, 동작을 나타내는 명사에 붙은 `~을 통해`(`진행을 통해`, `수행을 통해`), 사물의 소유를 말하는 `가지다`, `~것이 가능하다`가 여기에 듭니다.
- 검사기는 다음 정상 용법을 잡지 않습니다. 명사를 꾸며 대상을 밝히는 `~에 대한`, 경로와 매개를 뜻하는 `~을 통해`(`VPN을 통해 사내망에 접속합니다`), 모임을 치른다는 뜻의 `가지다`(`간담회를 가졌습니다`), 표준국어대사전 뜻풀이에도 쓰이는 `말해지다`가 여기에 듭니다. 필요성을 말하는 `~할 필요가 있다`, 조건을 말하는 `~할 경우`, `에서의`도 잡지 않습니다.
- 근거를 뜻하는 `~에 의해`(`개인정보는 법에 의해 보호받습니다`)는 `translationese-exempt`로 가려냅니다. 이 키에 적은 구절 안에 든 `translationese-patterns` 구절은 잡지 않습니다. 기본값에는 `법`, `법률`, `규정`, `약관`, `계약`처럼 근거가 되는 낱말에 `에 의해`나 `에 의하여`를 붙인 구절이 들어 있습니다.
- 같은 구절이 정상 용법에도 들어가므로 `translationese`는 경고로만 알립니다.
- 영어 동사를 낱말 그대로 옮긴 `더하다`(add), `재다`(measure), `세다`(count)는 `literal-verb` 경고입니다. `세다`는 `수`, `개수`, `글자`, `항목` 같은 말이 목적어일 때와 `센 값`처럼 쓸 때만 잡습니다. 그래서 `힘이 셉니다`와 `셀 수 없이 많은`은 잡지 않습니다. 안내는 `집계합니다`, `계산합니다`, `확인합니다` 가운데 문맥에 맞는 말을 고르게 합니다.

## 격식 있는 문어체

답변을 포함한 모든 글을 업무 문서처럼 격식 있는 문어체로 씁니다. 검사기는 격식 있는 문어체에 맞지 않는 표현 가운데 낱말로 가려낼 수 있는 것만 경고로 알립니다.

- `hanja-words`에 적은 한자 관형사와 어려운 한자어는 `hanja-word` 경고입니다. 기본값에는 `향후`, `익일`, `금번`, `제고`, `상이`, `제반`, `소정`, `의거`, `당해 연도`와 관형사 `본`, `타`, `동`이 들어 있습니다. `변경`, `동일`, `현재`, `해당`, `기존`처럼 흔히 쓰는 한자어는 그대로 씁니다.
- 관형사 `본`은 문장 첫머리에 홀로 쓴 것만 잡습니다. `앞에서 본 문서`처럼 동사 `보다`의 관형사형 `본`과 구별하기 어렵기 때문입니다. `타`와 `동`은 뒤에 조사나 어미 없이 홀로 쓴 것만 잡습니다.
- `colloquial-words`에 적은 구어 표현은 `colloquial` 경고입니다. 기본값은 `-구요`, `-길래`, `되게`, `근데`입니다. `좀`과 접속 부사 `그러니까`는 기본값에 넣지 않았습니다.

## 접속 부사

앞의 일 때문에 뒤의 일이 일어났으면 `그래서`를 씁니다. 앞에서 밝힌 사실을 근거로 판단이나 결론을 이끌어 내면 `따라서`나 `그러므로`를 씁니다. 결론의 근거는 결론 바로 앞 문장에 둡니다.

- 같은 문단에서 `reason-endings`에 적은 말로 끝난 이유 문장 바로 다음 문장이 `result-adverbs`에 적은 접속 부사로 시작하면 `adverb-after-reason` 경고가 나옵니다. `reason-endings`의 기본값은 `때문입니다`, `때문이다`, `때문이에요`, `때문이죠`이고 `result-adverbs`의 기본값은 `그래서`입니다.
- `A입니다. B이기 때문입니다. 그래서 C입니다.`처럼 이유 문장이 근거와 결론 사이에 끼면 C가 무엇을 근거로 하는지 흐려집니다. 이유를 앞 문장 안으로 옮겨 `B이므로 A입니다. 따라서 C입니다.`처럼 씁니다.
- 앞 문장의 일 때문에 뒤 문장의 일이 일어난 글도 같은 꼴이므로 경고로만 알립니다. 이 규칙은 `review-rules`에 들어 있으므로 PreToolUse hook이 Claude에게 알립니다.

## 일부 규칙을 경고로만 두고 영어 용어 수를 제한하지 않는 이유

글을 고칠 때는 원문의 뜻을 지켜야 합니다. 따라서 자연스러운 표현을 바꾸거나 원문에 없는 사실을 덧붙여야 통과하는 규칙은 오류로 두지 않습니다.

`책을 가지고 있습니다`, `예전에는 서울에 살았었습니다`는 문맥에 맞는 표현인데도 `translationese`에 걸립니다. `디스크에서 자리를 차지하는 파일입니다`와 `사과 세 개에 두 개를 더하면 다섯 개가 됩니다`도 `literal-verb`에 걸립니다.
소유, 시제, 비유, 셈을 나타내는 정상적인 문장에도 같은 구절이 들어가므로 두 규칙은 경고로만 둡니다. IT 용어 표의 경고 두 가지, 한자어, 구어 표현, 접속 부사 규칙도 같은 이유로 경고로만 둡니다.

`transliteration`은 말투처럼 프로젝트가 정한 표기 정책이므로 개발자가 읽는 파일, commit 메시지, PR과 issue에 올리는 글에서는 오류로 둡니다.

쉼표 수, 문장 길이, 굵은 글씨 수, 명사형 종결이나 `~의`가 나오는 빈도는 문법 오류가 아니라 문체 경향을 보여 주는 값입니다.
한도 값은 전에 측정해 정한 그대로 두고 경고를 낼지 정할 때만 씁니다. 기본 규칙은 영어 용어 수를 제한하지 않습니다.
이 도구 repository의 `test/quality.test.mjs`에는 정상 문장과 실제 오류 문장이 함께 들어 있습니다. 이 test로 정상 문장에는 경고만 나오고 실제 오류 문장에는 오류가 나오는지 확인합니다.

긴 문장 경고는 글을 읽기 쉽게 하려고 둔 것입니다. 경고를 없애려고 한 가지 뜻을 담은 문장을 쪼개지 않습니다.

## 설정

목록은 쉼표로 나누고, 고칠 표현은 `원문=후보` 형식으로 씁니다. 목록이나 고칠 표현을 값으로 받는 키는 줄마다 같은 키를 다시 적으면 값을 여러 줄에 나눠 쓸 수 있습니다. 검사기는 값을 쉼표로 나누므로 항목 하나에는 쉼표를 넣을 수 없습니다.
`max-`로 시작하는 한도 값과 `korean-required-min-chars`는 0으로 두면 그 검사가 꺼집니다. `max-contrast-per-1k`는 `ko=0`처럼 언어별 값을 0으로 두면 그 언어의 검사가 꺼집니다.
`register` 값은 `합니다체`, `해요체`, `혼용` 가운데 하나입니다. 합니다체는 국립국어원 문법 용어로 하십시오체입니다. 이 도구는 0.3.0까지 합니다체를 `다나까체`라고 불렀습니다. 검사기와 설치 script는 `하십시오체`와 `다나까체`도 `합니다체`로 읽습니다.
`literal-verbs`에서는 동사 활용형을 `|`로 나열합니다. 목적어가 영어 낱말일 때만 잡으려면 항목 앞에 `@latin:`을 붙입니다. 숫자 바로 뒤에 붙은 `cm`, `%p` 같은 단위는 목적어로 보지 않습니다.
정해 둔 낱말이 목적어일 때만 잡을 직역 동사는 `object-verbs`에 적습니다. 항목마다 `>` 앞에 목적어 낱말을 `|`로 나열하고 `>` 뒤에 동사 활용형을 적습니다. 검사기는 이 키의 항목에 걸린 문장도 `literal-verb` 규칙으로 보고합니다. 이 항목은 목적어에 `을`, `를`이 붙은 문장과 `효과는 재지 않았습니다`처럼 `은`, `는`을 붙여 목적어를 앞에 내세운 문장을 모두 봅니다. 적은 낱말 앞에 한글이 붙어 있으면 다른 낱말로 보고 잡지 않습니다. 그래서 `표`와 `테스트`를 적어도 `목표`와 `통합테스트`는 잡지 않습니다. 검사기는 `@latin:` 항목과 `object-verbs` 항목 모두에서 목적어와 조사 사이에 넣은 괄호 설명을 건너뜁니다.
`translationese-patterns`와 `literal-verbs`에서 대신 쓸 표현이 여럿이면 `또는`으로 나눠 적습니다. 검사기는 나눈 표현을 하나씩 따옴표로 감싸 보여 주고 문맥에 맞는 말을 고르라고 안내합니다. `translationese-patterns` 항목의 `=` 뒤에 마침표로 끝나는 문장을 적으면 검사기는 그 문장을 안내로 그대로 보여 줍니다.
제목이나 항목 이름이 낱말 하나뿐일 때만 잡을 번역투 이름은 `translationese-headings`에 `원문=후보` 형식으로 적습니다. 기본값은 `왜=문제 및 원인 또는 배경`입니다. 대신 쓸 이름이 여럿이면 `또는`으로 나눠 적습니다. 검사기는 나눈 이름을 하나씩 따옴표로 감싸 보여 줍니다. 검사기는 Markdown 제목(`## 왜`, `### 왜?`), 굵은 글씨로 쓴 줄(`**왜**`), 콜론 앞에 둔 항목 이름(`왜:`, `- **왜:**`, `**왜**:`), 표 구분 줄 바로 위에 있는 머리글 칸을 봅니다. 이 가운데 키에 적은 낱말 하나만 쓴 것을 잡습니다. `## 왜 이런 일이 생기나`처럼 `왜` 뒤에 다른 말이 붙은 제목, 문장 속 `왜`, `>`로 시작하는 인용 줄, 코드 블록과 인라인 코드, 표 본문 칸은 잡지 않습니다. 이 키에 걸린 줄은 `translationese` 규칙으로 보고합니다. `translationese-patterns`는 글 어디에서나 구절을 찾으므로 `왜`처럼 문장 안에서는 자연스러운 낱말은 `translationese-headings`에 적습니다.
낱말 표 키(`banned-transliteration`, `ambiguous-transliteration`, `banned-translation`, `hanja-words`, `colloquial-words`)는 `원문=대신 쓸 말` 형식으로 적습니다. 원문을 `|`로 나눠 여러 표기를 한 항목에 적을 수 있습니다(`디렉터리|디렉토리=directory`). 원문 앞에 `_` 기호를 붙이면 조사나 어미 없이 홀로 쓴 낱말만 잡고 `^` 기호를 붙이면 그 가운데 문장 첫머리에 쓴 낱말만 잡습니다. `-` 기호를 붙이면 앞말에 붙여 쓴 어미만 잡습니다(`-구요`).

```korean-style-rules
advisory-rules: translationese, literal-verb, comma-per-sentence, comma-segment-length, comma-after-conjunctive-adverb, comma-after-connective, sentence-too-long, nominalization, demonstrative-density, suffix-jeok-density, particle-ui-density, redundant-plural, bound-english, repeated-gloss, bold-density, contrast-density, inclusive-term, hybrid-negation, korean-required, ambiguous-transliteration, loose-translation, adverb-after-reason, hanja-word, colloquial
review-rules: translationese, literal-verb, redundant-plural, comma-after-conjunctive-adverb, hybrid-negation, inclusive-term, sentence-too-long, adverb-after-reason, hanja-word, colloquial
chat-advisory-rules: transliteration
register: 합니다체
banned-address: 당신
imperative-endings: 하십시오, 하시오, 해라, 하라, 해줘, 해봐, 하세요, 하십쇼
imperative-exempt: 안녕하세요, 아니다, 감사합니다, 죄송합니다
flattery-openers: 좋은 질문입니다, 좋은 질문이네요, 좋은 질문이십니다, 좋은 지적입니다, 좋은 지적이네요, 좋은 지적이십니다, 훌륭한 질문입니다, 훌륭한 지적입니다, 정확한 지적입니다, 예리한 질문입니다, 아주 중요한 질문입니다
korean-required-min-chars: 40
writing-skill: korean-rewrite
writing-skill-min-hangul: 20
writer-agent: korean-writer
writer-agent-min-hangul: 200
writer-agent-answer-min-hangul: 0
reviewer-model: sonnet
reviewer-min-hangul: 10
reviewer-answer-min-hangul: 30
reviewer-max-hangul: 6000
reviewer-timeout: 90
banned-char: middot, em-dash, en-dash, emoji, hanja, kana, fullwidth-paren
allowed-emoji-shortcode:
sentence-min-hangul-ratio: 0.3
final-endings: 다, 요, 까, 죠, 네, 오, 냐, 군
max-comma-per-sentence: 2
max-comma-segment-words: 8
enumeration-word-max: 8
conjunctive-adverbs: 그리고, 그러나, 그런데, 그러므로, 그래서, 따라서, 하지만, 또한, 즉, 결국, 다만, 반면, 오히려, 예를 들어, 특히, 게다가, 더구나, 한편
connective-endings: 고, 며, 으며, 이며, 지만, 면서, 아서, 어서, 해서, 라서, 이라서, 이라, 거나, 든지, 는데, 은데, 인데, 는데도, 므로, 니까, 으니, 면, 으면, 으나, 아, 어, 여, 해, 되, 아도, 어도, 라도, 도록, 려면, 려고, 기에, 길래, 다가, 더니, 자마자, 느라, 하여, 되어, 아니라, 때문에
max-connective-comma-per-1k: 6
clause-min-words: 2
double-passive: 보여=보이, 쓰여=쓰이, 잊혀=잊히, 읽혀=읽히, 잡혀=잡히, 찢겨=찢기, 닫혀=닫히, 열려=열리, 놓여=놓이, 모여=모이, 짜여=짜이, 나뉘어=나뉘, 불려=불리, 걸려=걸리, 들려=들리, 되어=되, 쌓여=쌓이, 팔려=팔리, 실려=실리, 뽑혀=뽑히, 깎여=깎이, 섞여=섞이, 담겨=담기, 바뀌어=바뀌
max-sentence-chars: 110
nominalization-endings: 함, 됨, 임, 짐
max-nominalization-per-1k: 3
demonstratives: 해당, 상기, 이것, 그것, 이러한, 그러한, 이와 같은, 그와 같은
max-demonstrative-per-1k: 7
max-suffix-jeok-per-1k: 9
max-particle-ui-per-1k: 16
plural-quantifiers: 여러, 많은, 다양한, 모든, 수많은, 다수의
density-rule-floor: 4
density-margin: 2
translationese-patterns: 진행을 통해=~하여, 진행을 통하여=~하여, 수행을 통해=~하여, 수행을 통하여=~하여, 에 의하여=행위자를 붙인 피동문이면 행위자를 주어로 삼아 능동문으로 고칩니다. 근거를 뜻하는 말이면 그대로 둡니다., 에 의해=행위자를 붙인 피동문이면 행위자를 주어로 삼아 능동문으로 고칩니다. 근거를 뜻하는 말이면 그대로 둡니다.
translationese-patterns: 함에 있어=~할 때, 음에 있어=~할 때, 기간 동안=기간, 매주마다=매주, 매달마다=매달, 매년마다=매년, 매일마다=매일, 았었=았, 었었=었, 하지 않으면 안 된=해야 한, 하지 않으면 안 됩=해야 합, 것이 가능하=~할 수 있, 것이 가능합=~할 수 있습, 것이 가능했=~할 수 있었, 라고 생각된=라고 봅니, 라고 생각됩=라고 봅니, 에 위치하=에 있, 에 위치합=에 있습, 을 가지고 있=이 있, 를 가지고 있=가 있, 를 가능하게=~할 수 있게, 을 가능하게=~할 수 있게, 는 것을 허용=~할 수 있습니다, 는 것을 보장=반드시 ~합니다, 아무리 강조해도 지나치지 않=매우 중요합니다, 코드 밖에서=코드가 아닌 사용자가 직접, 어떤 모양으로=어떻게 또는 어떤 형식으로, 돌고 있=실행되고 있, 도는 중=실행 중, 돕니다=실행됩니다, 돌지 않=실행되지 않, 도는지=실행되는지, 돌았습=실행됐습, 시험용=test용, 시험 파일=test 파일, 시험 데이터=test data, 시험 data=test data, 승인을 묻=승인을 요청하, 승인을 물=승인을 요청하
translationese-exempt: 법에 의해, 법에 의하여, 법률에 의해, 법률에 의하여, 법령에 의해, 법령에 의하여, 규정에 의해, 규정에 의하여, 약관에 의해, 약관에 의하여, 계약에 의해, 계약에 의하여, 조약에 의해, 조약에 의하여, 협약에 의해, 협약에 의하여, 조례에 의해, 조례에 의하여, 판결에 의해, 판결에 의하여, 원칙에 의해, 원칙에 의하여, 정책에 의해, 정책에 의하여
translationese-headings: 왜=문제 및 원인 또는 배경
literal-verbs: @latin:세우|세워|세웁|세운|세울|세웠|세움=띄우거나 실행합니다, 서버를 세우|서버를 세웁|서버를 세워|서버를 세웠=server를 띄우거나 실행합니다, 환경을 세우|환경을 세웁|환경을 세웠=환경을 구성합니다, 시스템을 세우|시스템을 세웁|시스템을 세웠=시스템을 구축합니다, 빛을 발하=돋보입니다, 자리를 차지하=쓰입니다, 결정을 만드|결정을 만들|결정을 만듭|결정을 만들었=결정을 내립니다
literal-verbs: 센 값|센 횟수|센 개수|센 건수|센 결과=집계한 또는 계산한 또는 확인한
literal-verbs: @latin:더하고|더하면|더하는|더하려|더하지|더하여|더하자|더하겠|더해|더한|더할지|더할 수|더할 때|더할 예정|더할 계획|더할 거|더할 겁|더할까|더했|더합=추가합니다
object-verbs: 테스트|항목|줄|행|표|절|문단|문장|목록|기능|화면|버튼|메뉴|권한|조건|옵션|플래그|설정|단계|규칙|검사|안내|알림|문구|저장소|파일|함수|패키지|라이브러리|의존성|예시|경우|필드|키|표시|링크|탭|정보|이름|요청|개|가지|건|곳>더하고|더하면|더하는|더하려|더하지|더하여|더하자|더하겠|더해|더한|더할지|더할 수|더할 때|더할 예정|더할 계획|더할 거|더할 겁|더할까|더했|더합=추가합니다, 효과|성능|사용량|전송량|처리량|트래픽|비용|대역폭|규모|용량|부하|지표|영향>재지|재고 있|재려|잰|잴|잽니|쟀|재었|재야|재서|재면|재 보|재 봤|재 볼|재겠=측정합니다
object-verbs: 개수|수|횟수|건수|줄|글자|문자|낱말|어절|문장|문단|단어|항목|요청|응답|답변|오류|경고|위반|호출|실패|성공|파일|행|결과|빈도|token|사용자|방문자|접속|개|건|번>셉니다|셉니까|셌|세었|셀 수 있|셀 수도|셀 때|셀지|세어|세는|세려|세야|세겠|센다=집계합니다 또는 계산합니다 또는 확인합니다
literal-verb-exempt: plan, roadmap, strategy, hypothesis, milestone, baseline, KPI, OKR
loanword-spelling: 워크플로우=워크플로, 리포지토리=리포지터리, 레파지토리=리포지터리, 레포지토리=리포지터리, 디렉토리=디렉터리, 어플리케이션=애플리케이션, 아키텍쳐=아키텍처, 푸쉬=푸시, 라이센스=라이선스, 메세지=메시지, 맵핑=매핑, 컨텐츠=콘텐츠, 컨퍼런스=콘퍼런스, 컨셉=콘셉트, 콘트롤=컨트롤, 타겟=타깃, 썸네일=섬네일, 버젼=버전, 메뉴얼=매뉴얼, 프리젠테이션=프레젠테이션, 워크샵=워크숍, 뱃지=배지, 업그래이드=업그레이드, 플래폼=플랫폼, 네비게이션=내비게이션, 스케쥴=스케줄, 캐쉬=캐시
inclusive-terms: whitelist=Allowlist, blacklist=Blocklist, 화이트리스트=Allowlist, 블랙리스트=Blocklist, slave=Secondary 또는 Follower
banned-transliteration: 커밋=commit, 머지=merge, 리베이스=rebase, 브랜치=branch, 푸시|푸쉬=push, 풀 리퀘스트|풀리퀘스트=pull request 또는 PR, 리포지토리|리포지터리|레포지토리|레포지터리|레파지토리|리파지토리=repository, 리포|레포=repo, 코드 리뷰=code review, 빌드=build, 컴파일=compile, 테스트=test
banned-transliteration: 픽스처=fixture, 모킹=mocking, 린트=lint, 린터=linter, 디버깅=debugging, 디버그=debug, 릴리스|릴리즈=release, 롤백=rollback, 롤아웃=rollout, 아티팩트=artifact, 파이프라인=pipeline, 워크플로|워크플로우=workflow
banned-transliteration: 캐시|캐쉬=cache, 캐싱=caching, 스크립트=script, 디렉터리|디렉토리=directory, 폴더=folder, 데이터=data, 데이터베이스=database, 스키마=schema, 쿼리=query, 로그=log, 로깅=logging, 로그인=login
banned-transliteration: 로그아웃=logout, 서버=server, 브라우저=browser, 세션=session, 토큰=token, 옵션=option, 파라미터=parameter, 플래그=flag, 셸|쉘=shell, 모델=model, 프롬프트=prompt, 컨텍스트=context
banned-transliteration: 서브에이전트=subagent, 플러그인=plugin, 라이브러리=library, 모듈=module, 프레임워크=framework, 런타임=runtime, 인스턴스=instance, 리전=region, 프록시=proxy, 엔드포인트=endpoint, 핸들러=handler, 콜백=callback
banned-transliteration: 스케줄러=scheduler, 템플릿=template, 컴포넌트=component, 인터페이스=interface, 렌더링=rendering, 아키텍처|아키텍쳐=architecture, 프론트엔드|프런트엔드=frontend, 백엔드=backend, 마이그레이션=migration, 리팩터링|리팩토링=refactoring, 스토리지=storage, 스테이징=staging
banned-transliteration: 페이로드=payload, 메트릭=metric, 대시보드=dashboard, 모니터링=monitoring, 노드=node
ambiguous-transliteration: 이슈=issue, 리뷰=review, 클론=clone, 포크=fork, 패치=patch, 태그=tag, 번들=bundle, 커버리지=coverage, 클라이언트=client, 레코드=record, 테이블=table, 알람=alarm, 백업=backup, 쿠키=cookie
ambiguous-transliteration: 콘솔=console, 터미널=terminal, 훅|후크=hook, 스킬=skill, 에이전트=agent, 패키지=package, 컨테이너=container, 클러스터=cluster, 네트워크=network, 포트=port, 도메인=domain, 시크릿=secret, 프로세스=process, 스레드=thread
ambiguous-transliteration: 이벤트=event, 큐=queue, 워커=worker, 트리거=trigger, 스텝=step, 리소스=resource, 타깃|타겟=target, 스냅샷=snapshot, 타임아웃=timeout, 프로덕션=production
banned-translation: 저장소=repository, 배포=deploy, 병합=merge, 분기=branch, 끌어오기 요청=pull request 또는 PR, 매개변수=parameter, 인자=argument, 의존성=dependency, 인증서=certificate
term-exempt: 푸시 알림, 분기별, 분기마다, 이번 분기, 지난 분기, 다음 분기, 플러그인 하이브리드, 되게 하, 되게 했, 되게 해, 되게 한, 되게 할, 되게 합, 되게 만, 본 적, 본 것, 본 바, 본 대로, 본 뒤, 본 다음, 본 후, 타 보니, 타 봤, 타 보면, 타 봐, 타 볼
general-reader-globs:
hanja-words: 향후=앞으로, 익일=다음 날, 금번=이번, 제고=높이다, 상이=다르다, 제반=모든, 소정=정해진, 의거=따라, 당해 연도=해당 연도, ^본=이, _타=다른, _동=같은
colloquial-words: -구요=-고요, -길래=-아서 또는 -므로, 되게=매우, 근데=그런데
reason-endings: 때문입니다, 때문이다, 때문이에요, 때문이죠
result-adverbs: 그래서
required-spelling:
known-typos: 됬=됐, 어떻해=어떡해, 할께=할게, 갈께=갈게, 있읍니다=있습니다, 없슴=없음, 알겠슴=알겠음, 바꼈=바뀌었, 바뀜었=바뀌었
calques: 비멱등=멱등하지 않은, 미추적=추적하지 않는, 반랙=half-rack, 전랙=full-rack, 응답 모양=응답 형식, 바깥 접속=외부 접속
needs-gloss:
negation-prefixes: 비, 논, 무, 미, 반
max-bound-english-per-sentence: 0
max-repeated-english-gloss: 1
max-bold-per-unit: 3
max-contrast-per-1k: ko=0.8, en=0.5
chat-tool-fields: AskUserQuestion.question, AskUserQuestion.header, AskUserQuestion.label, AskUserQuestion.description, SendUserFile.caption, ExitPlanMode.plan
agent-tool-fields: Task.prompt, Task.description, Agent.prompt, Agent.description
doc-globs:
source-globs:
skip-globs: node_modules/**, dist/**, build/**, coverage/**, vendor/**, .venv/**, **/*.min.js, **/*.generated.*, skill/korean-style/register/*.md, **/_workspace/**
sweep-skip-dirs: .git, node_modules, dist, build, coverage, vendor, .venv, __pycache__, target
quote-marker: korean-style-quote
banned-attribution: Generated with [Claude Code], Generated with Claude Code, noreply@anthropic.com
```

## 키 설명

| 키  | 뜻 |
| ---  | --- |
| `advisory-rules` | 막지 않고 경고로만 보고할 규칙 이름입니다. |
| `review-rules` | 경고 규칙 가운데 hook이 Claude에게 알릴 규칙입니다. 이번에 바꾼 문단에서 새로 생긴 경고만 알립니다. |
| `chat-advisory-rules` | 답변과 도구에 넘기는 글(질문, 계획, 파일 설명, agent에게 주는 prompt)에서만 경고로 보고할 규칙입니다. 파일, commit 메시지, PR과 issue에 올리는 글에서는 오류로 보고합니다. 기본값은 `transliteration`입니다. 키가 없으면 값을 비운 것과 같습니다. 0.4.1까지의 검사기는 이 키를 읽지 않습니다. |
| `register`  | 프로젝트가 쓰는 말투입니다. |
| `banned-address`  | 읽는 사람을 부를 때 쓰면 안 되는 말입니다. |
| `imperative-endings`  | 사람에게 명령이 되는 어미입니다. |
| `imperative-exempt`  | 명령 어미나 다른 말투의 어미로 끝나지만 위반으로 보지 않는 표현입니다. |
| `flattery-openers`  | 답부터 하지 않고 질문이나 지적을 칭찬하는 문장입니다. |
| `korean-required-min-chars`  | 코드와 공백을 뺀 글자 수가 이 값 이상인데 한글이 없으면 영어로 쓴 것으로 봅니다. |
| `writing-skill`  | Claude가 요청을 받을 때마다 한국어를 쓰기 전에 불러야 하는 skill입니다. 값을 비우면 hook이 skill을 요구하지 않습니다. 키가 없으면 `korean-rewrite`를 씁니다. |
| `writing-skill-min-hangul`  | 답변이나 commit 메시지, 이번에 파일에 쓰는 내용에 한글이 이 수 이상 들어 있으면 hook이 skill을 요구합니다. |
| `writer-agent`  | 한글이 많은 글을 맡길 agent입니다. 값을 비우면 hook이 이 agent를 요구하지 않습니다. 키가 없으면 `korean-writer`를 씁니다. |
| `writer-agent-min-hangul`  | commit 메시지, PR과 issue에 올리는 글, 이번에 파일에 쓰는 내용에 한글이 이 수 이상 들어 있으면 hook이 `writer-agent`에 적은 agent에게 글을 맡기라고 요구합니다. 소스 파일에서는 주석의 한글만 계산에 넣습니다. 0이면 요구하지 않습니다. |
| `writer-agent-answer-min-hangul`  | 답변에 한글이 이 수 이상 들어 있으면 Stop hook이 `writer-agent`에 적은 agent에게 글을 맡겨 다시 쓰라고 요구합니다. 0이면 답변에는 요구하지 않습니다. 기본값은 0입니다. |
| `reviewer-model`  | Claude가 요청을 마친 뒤 그 요청에서 쓴 한국어를 다시 읽을 검토 model입니다. 값을 비우면 검토하지 않습니다. 키가 없으면 `sonnet`을 씁니다. |
| `reviewer-min-hangul`  | 검토 hook이 모은 글 전체의 한글이 이 수보다 적으면 검토 model에게 보내지 않습니다. 기본값은 10입니다. |
| `reviewer-answer-min-hangul`  | 답변의 한글이 이 수보다 적으면 답변은 보내지 않습니다. 0이면 답변은 늘 보내지 않습니다. 기본값은 30입니다. |
| `reviewer-max-hangul`  | 한 번에 보내는 한글의 상한입니다. hook이 조각의 한글을 앞에서부터 합쳐 이 수를 넘으면 그 조각부터는 보내지 않습니다. 첫 조각은 이 수를 넘어도 보냅니다. 기본값은 6000입니다. |
| `reviewer-timeout`  | 검토 model의 답을 기다리는 시간입니다. 단위는 초이고 기본값은 90입니다. |
| `banned-char`  | 검사할 글자 종류입니다. 쓸 수 있는 이름은 `scripts/lib/rules/chars.mjs`에 있습니다. |
| `allowed-emoji-shortcode`  | 사용자가 이름을 지정해 허용한 shortcode입니다. |
| `sentence-min-hangul-ratio`  | 문장을 한국어 산문으로 보려면 한글이 차지해야 하는 최소 비율입니다. |
| `final-endings`  | 종결어미입니다. |
| `clause-min-words`  | 절로 인정하는 최소 어절 수입니다. |
| `max-comma-per-sentence`  | 한 문장에 쓸 수 있는 쉼표 개수입니다. |
| `enumeration-word-max`  | 나열 항목 하나에 들어갈 수 있는 최대 어절 수입니다. |
| `max-comma-segment-words`  | 쉼표 앞 구간의 최대 어절 수입니다. |
| `conjunctive-adverbs`  | 뒤에 쉼표를 찍으면 안 되는 접속부사입니다. |
| `connective-endings`  | 뒤에 쉼표가 오면 횟수에 넣는 연결어미입니다. |
| `max-connective-comma-per-1k`  | 한글 1000자당 연결어미 뒤 쉼표를 허용하는 횟수입니다. |
| `double-passive`  | 이중피동입니다. |
| `max-sentence-chars`  | 끊지 않고 길게 이어 쓴 문장을 잡는 글자 수 한도입니다. |
| `nominalization-endings`  | 용언을 명사로 바꾸는 어미입니다. |
| `max-nominalization-per-1k`  | 산문 문장이 명사형으로 끝나는 빈도의 한도입니다. |
| `demonstratives`  | 지시 표현입니다. |
| `max-demonstrative-per-1k`  | 지시 표현의 빈도 한도입니다. |
| `max-suffix-jeok-per-1k`  | 접미사 `~적`의 빈도 한도입니다. |
| `max-particle-ui-per-1k`  | 관형격 조사 `~의`의 빈도 한도입니다. |
| `plural-quantifiers`  | 뒤따르는 명사에 `~들`을 붙이면 안 되는 수량 표현입니다. |
| `density-rule-floor`  | 밀도 규칙을 적용하려면 표현이 나와야 하는 최소 횟수입니다. |
| `density-margin`  | 밀도 규칙이 한도에 더하는 여유입니다. |
| `translationese-patterns`  | 번역투 구절과 대신 쓸 표현입니다. `=` 뒤에 마침표로 끝나는 문장을 적으면 검사기는 그 문장을 안내로 보여 줍니다. |
| `translationese-exempt`  | `translationese-patterns`에 적은 구절이 들어 있어도 번역투로 보지 않을 구절입니다. 근거를 뜻하는 `법에 의해` 같은 구절을 적습니다. 0.4.1까지의 검사기는 이 키를 읽지 않습니다. |
| `translationese-headings`  | 제목, 굵은 글씨로 쓴 줄, 콜론 앞 항목 이름, 표 머리글 칸에 원문 하나만 있을 때 잡는 번역투 이름과 대신 쓸 표현입니다. 0.4.0까지의 검사기는 이 키를 읽지 않습니다. |
| `literal-verbs`  | 영어 동사를 직역한 동사입니다. |
| `literal-verb-exempt`  | 직역 동사 규칙에서 예외로 두는 영어 목적어입니다. |
| `object-verbs`  | 정해 둔 낱말이 목적어일 때만 잡는 직역 동사입니다. 0.3.5까지의 검사기는 이 키를 읽지 않습니다. |
| `loanword-spelling`  | 틀린 외래어 표기와 규범 표기입니다. 개발자가 읽는 글에서 같은 낱말이 `transliteration` 오류에 걸리면 검사기는 이 항목을 건너뜁니다. |
| `inclusive-terms`  | 차별 소지가 있는 용어와 대체 용어입니다. |
| `banned-transliteration`  | 개발자가 읽는 글에서 오류로 막을 IT 용어의 한글 음차와 대신 쓸 영어 원어입니다. 0.4.1까지의 검사기는 낱말 경계를 보지 않고 글에서 이 원문을 그대로 찾습니다. |
| `ambiguous-transliteration`  | 일반 뜻으로도 흔히 쓰여 경고로만 알릴 IT 용어의 한글 음차와 대신 쓸 영어 원어입니다. 0.4.1까지의 검사기는 이 키를 읽지 않습니다. |
| `banned-translation`  | IT 용어를 옮긴 번역어와 대신 쓸 영어 원어입니다. 0.4.1까지의 검사기는 답변에서만 이 키를 봅니다. |
| `term-exempt`  | IT 용어 표, `hanja-words`, `colloquial-words`에 적은 말이 들어 있어도 잡지 않을 구절입니다. 0.4.1까지의 검사기는 이 키를 읽지 않습니다. |
| `general-reader-globs`  | 일반 독자가 읽는 글로 볼 경로 pattern입니다. 이 경로의 파일에는 IT 용어 표 규칙을 적용하지 않습니다. 기본값은 비어 있습니다. 0.4.1까지의 검사기는 이 키를 읽지 않습니다. |
| `hanja-words`  | 한자 관형사, 어려운 한자어와 대신 쓸 쉬운 말입니다. 0.4.1까지의 검사기는 이 키를 읽지 않습니다. |
| `colloquial-words`  | 격식 있는 문어체에 쓰지 않는 구어 표현과 대신 쓸 말입니다. 0.4.1까지의 검사기는 이 키를 읽지 않습니다. |
| `reason-endings`  | 이유를 밝힌 문장을 끝내는 말입니다. 0.4.1까지의 검사기는 이 키를 읽지 않습니다. |
| `result-adverbs`  | 이유 문장 바로 다음 문장 첫머리에 오면 알릴 접속 부사입니다. 0.4.1까지의 검사기는 이 키를 읽지 않습니다. |
| `required-spelling`  | 틀리지는 않았지만 팀이 쓰지 않는 표기입니다. |
| `known-typos`  | 한국어 낱말이 아닌 철자입니다. |
| `calques`  | 영어를 낱말 단위로 옮겨 만든 말과 대신 쓸 표현입니다. 코드 블록, 인라인 코드, 같은 줄에서 닫은 따옴표 안에 옮겨 적은 말은 잡지 않습니다. 앞에 한글이 붙어 있으면 다른 낱말의 일부로 보고 잡지 않습니다. |
| `needs-gloss`  | 처음 나올 때 설명해야 하는 용어입니다. |
| `negation-prefixes`  | 영어 어간에 붙이면 안 되는 한글 부정 접두사입니다. |
| `max-bound-english-per-sentence`  | 한국어 문장 하나에 조사를 붙여 쓸 수 있는 영어 낱말 수입니다. |
| `max-repeated-english-gloss`  | 같은 영어 용어를 괄호로 설명할 수 있는 횟수입니다. |
| `max-bold-per-unit`  | 문단이나 항목 하나에 쓸 수 있는 굵은 글씨 개수입니다. |
| `max-contrast-per-1k`  | 대조 구문의 언어별 밀도 한도입니다. |
| `chat-tool-fields`  | 사람이 읽는 산문이 들어가는 Claude Code 도구 입력 필드입니다. |
| `agent-tool-fields`  | agent가 읽는 산문이 들어가는 Claude Code 도구 입력 필드입니다. |
| `doc-globs`, `source-globs`  | 확장자보다 먼저 적용해 검사 종류를 정하는 경로 pattern입니다. |
| `skip-globs`  | 검사하지 않을 경로입니다. |
| `sweep-skip-dirs`  | 전체 검사에서 들어가지 않을 directory 이름입니다. |
| `banned-attribution` | Claude Code가 commit 메시지와 PR 설명 끝에 붙이는 생성 표시입니다. 같은 줄에서 이 문구 앞에 글자나 숫자가 없으면 막고 이메일 주소처럼 `@`가 든 문구는 줄 어디에 있어도 막습니다. 따라서 emoji나 목록 기호 뒤에 붙은 생성 표시도 막지만 문장 안에서 생성 표시를 언급하기만 한 줄은 막지 않습니다. 대소문자는 가리지 않습니다. 값을 비우면 검사하지 않습니다. 키가 없으면 기본 목록을 씁니다. |
| `quote-marker`  | 인용 구간을 나타내는 이름입니다. 문서에서 `<!-- 이 값 -->` 줄과 `<!-- /이 값 -->` 줄 사이에 넣은 글은 다른 글을 그대로 옮긴 인용으로 보고 검사하지 않습니다. 답변과 commit 메시지에서는 이 구간도 검사합니다. 값을 비우면 인용 표시가 있어도 그 사이를 검사합니다. 키가 없으면 `korean-style-quote`를 씁니다. |

## 보고에 나오는 규칙 이름

| 규칙 | 의미 |
| --- | --- |
| `banned-char` | 프로젝트가 금지한 부호와 문자입니다. |
| `banned-address` | 금지 목록에 있는 호칭입니다. |
| `wrong-register` | 고른 말투와 다른 종결어미입니다. |
| `imperative-to-human` | 프로젝트가 피하기로 한 직접 명령입니다. |
| `flattery` | 질문이나 지적을 칭찬하는 표현입니다. |
| `korean-required` | 긴 영어 답변입니다. 요청한 언어인지는 사람이 판단합니다. |
| `double-passive` | 목록에 있는 이중피동입니다. |
| `loanword-spelling` | 프로젝트가 정한 외래어 표기와 다른 표기입니다. |
| `known-typo` | 목록에 있는 오타입니다. |
| `calque` | 영어를 낱말 단위로 옮겨 만든 말입니다. |
| `translationese` | 번역투일 수 있는 구절입니다. `translationese-headings`에 걸린 제목과 항목 이름도 이 규칙으로 보고합니다. 문맥에 맞는 표현이면 그대로 둡니다. |
| `literal-verb` | 영어 동사를 그대로 옮겼을 수 있는 동사입니다. 실제 동작을 나타낸 문장이면 그대로 둡니다. |
| `comma-per-sentence` | 한 문장에 쓴 쉼표 수입니다. 나열에 쓴 쉼표는 이 수에 넣지 않습니다. |
| `comma-segment-length` | 쉼표로 나눈 구간의 어절 수입니다. |
| `comma-after-conjunctive-adverb` | 접속부사 뒤 쉼표입니다. |
| `comma-after-connective` | 연결어미 뒤 쉼표의 빈도입니다. |
| `sentence-too-long` | 긴 산문 문장입니다. |
| `nominalization` | 명사형 종결의 빈도입니다. |
| `demonstrative-density` | 지시 표현의 빈도입니다. |
| `suffix-jeok-density` | 접미사 `~적`의 빈도입니다. |
| `particle-ui-density` | 조사 `~의`의 빈도입니다. |
| `redundant-plural` | 수량 표현 뒤 복수 접미사입니다. |
| `bound-english` | 한 문장에서 조사가 붙은 영어 낱말 수입니다. 기본 규칙에서는 제한하지 않습니다. |
| `repeated-gloss` | 같은 영어 용어의 반복 설명입니다. |
| `bold-density` | 문단이나 항목 안의 굵은 글씨 수입니다. |
| `contrast-density` | `A가 아니라 B`, `~라기보다`, `rather than` 같은 대조 구문의 빈도입니다. `뿐만 아니라`처럼 내용을 덧붙이는 표현과 `다름이 아니라`는 빈도에 넣지 않습니다. `아니라는`, `아니라면` 같은 활용형도 빈도에 넣지 않습니다. |
| `inclusive-term` | 차별 소지가 있는 용어입니다. |
| `hybrid-negation` | 한글 부정 접두사와 영어를 붙인 표현입니다. |
| `unexplained-term` | 설명이 필요한 것으로 등록한 용어입니다. |
| `transliteration` | 개발자가 읽는 글에 쓴 IT 용어의 한글 음차입니다. 답변과 도구에 넘기는 글에서는 경고로 보고합니다. `general-reader-globs`에 적은 경로의 파일과 `<!-- korean-style: general-reader -->` 줄을 넣은 문서에는 적용하지 않습니다. |
| `ambiguous-transliteration` | IT 용어의 한글 음차일 수 있는 낱말입니다. 일반 뜻으로 썼으면 그대로 둡니다. |
| `loose-translation` | IT 용어를 옮긴 번역어일 수 있는 낱말입니다. 일반 뜻으로 썼으면 그대로 둡니다. |
| `hanja-word` | 한자 관형사나 어려운 한자어입니다. |
| `colloquial` | 격식 있는 문어체에 쓰지 않는 구어 표현입니다. |
| `adverb-after-reason` | 이유 문장 바로 뒤 문장을 시작한 `그래서` 같은 접속 부사입니다. 앞 문장의 일 때문에 뒤 문장의 일이 일어났으면 그대로 둡니다. |
| `required-spelling` | 팀 표기와 다른 용어입니다. |
| `ai-attribution` | Claude Code가 붙이는 생성 표시입니다. 코드 블록 안에서도 찾습니다. |

## 규칙을 바꿀 때

규칙 값과 설명을 함께 고치고, 잡아야 할 문장과 잡으면 안 되는 문장을 함께 확인합니다.
이 도구 repository에서는 두 종류의 문장을 test에 넣고 `npm run gate`로 확인합니다. 설치한 프로젝트에서는 `check-korean.mjs --text`로 확인합니다.
이 도구 repository에서 output style이나 skill을 바꾸면 `test/fixtures/eval/`의 요청을 실제 model에 보냅니다. 그리고 바꾸기 전에 받은 답변과 새로 받은 답변을 비교합니다.
