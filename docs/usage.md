# 설치와 사용

## 설치

이 도구를 사용할 프로젝트에서 Claude Code를 열고 다음과 같이 요청하면 Claude가 repository를 읽고 설치합니다.

> https://github.com/nerdkim/korean-rewrite repository를 읽고 이 프로젝트에 설치해 주십시오.

직접 설치하려면 프로젝트 root directory에서 다음 명령을 실행합니다.

```sh
npx -y github:nerdkim/korean-rewrite --target . --activate
node .korean-style/scripts/doctor.mjs
```

npx를 사용할 수 없으면 repository를 내려받아 설치 script를 직접 실행합니다.

```sh
git clone --depth 1 https://github.com/nerdkim/korean-rewrite.git /tmp/korean-rewrite
node /tmp/korean-rewrite/scripts/install.mjs --target "$PWD" --activate
```

설치한 뒤에는 Claude Code를 재시작해야 합니다. Skill과 hook은 새 session부터 적용됩니다.
Node.js 20 이상과 npm, Git, Claude Code가 필요합니다. 명령은 macOS, Linux, WSL의 shell에서 실행해야 합니다. 설치할 npm package는 없습니다.
새 프로젝트라면 먼저 directory를 만듭니다. Git을 사용한다면 그 directory에서 `git init`부터 실행합니다. 프로젝트 root directory에 `.git`이 없으면 설치 script는 `.gitignore` 항목과 `commit-msg` hook을 추가하지 않습니다.

### 설치 option

| Option | 설명 |
| --- | --- |
| `--target <경로>` | 이 도구를 설치할 프로젝트의 root directory입니다. 반드시 지정해야 합니다. |
| `--activate` | 프로젝트 설정의 output style을 `korean-style`로 변경합니다. 이 option을 주지 않으면 이미 선택한 output style은 그대로 두고 선택한 것이 없을 때만 `korean-style`을 선택합니다. |
| `--register <말투>` | Claude가 사용할 말투입니다. `합니다체`(기본값), `해요체`, `혼용` 가운데 하나를 선택합니다. `혼용`을 선택하면 검사기는 두 말투를 모두 허용합니다. 다만 skill과 output style에는 답변 하나 안에서는 처음 쓴 말투를 끝까지 유지하라는 지시가 들어 있습니다. 0.3.0까지 쓰던 이름인 `다나까체`를 주면 `합니다체`를 선택한 것과 동일합니다. 이 option 없이 다시 설치하면 규칙 문서에 적힌 말투 이름이 그대로 유지됩니다. |
| `--dry-run` | 파일을 쓰지 않습니다. 규칙을 새 기본값으로 교체할지, 어떤 말투를 사용할지, `commit-msg` hook을 어디에 둘지 미리 보여 줍니다. |
| `--force` | 직접 수정한 규칙 문서를 새 기본 규칙으로 교체합니다. 교체하기 전에 원래 규칙을 backup합니다. |

### 설치되는 파일

| 경로 | 내용 | Git |
| --- | --- | --- |
| `.korean-style/rules.md` | 규칙 문서 | Commit |
| `.korean-style/defaults.sha256` | 규칙을 직접 수정했는지 확인하는 데 쓰는 값 | Commit |
| `.korean-style/scripts/` | 검사기, hook, doctor | 제외 |
| `.korean-style/docs/` | 기본 규칙 사본과 제약 문서 | 제외 |
| `.claude/skills/korean-rewrite/SKILL.md` | 한국어 작성 skill | 제외 |
| `.claude/skills/korean-style/SKILL.md` | 검사 규칙 skill | 제외 |
| `.claude/output-styles/korean-style.md` | Output style | 제외 |
| `.claude/agents/korean-writer.md` | 한글이 많은 글을 쓰는 작성 agent | 제외 |
| `.claude/settings.json` | Hook 다섯 개, `outputStyle`, `attribution`, `env` 설정 | Commit |
| `.gitignore` | 위에서 제외로 표시한 항목 | Commit |
| `.worktreeinclude` | `claude --worktree`로 만든 worktree에 복사할 제외 항목 | Commit |
| `.git/hooks/commit-msg` | Commit 메시지 검사 | 해당 없음 |

제외로 표시한 파일은 설치할 때마다 새로 만듭니다. 따라서 repository를 clone한 팀원도 설치 명령을 한 번 실행해야 합니다.
설치 명령을 실행하기 전에는 hook이 검사하지 않습니다. 그 대신 hook은 사용자가 prompt를 보낼 때마다 Claude에게 안내를 남겨 사용자에게 설치 명령을 다시 실행해 달라고 알리게 합니다.
`claude --worktree`로 worktree를 만들면 Claude Code가 `.worktreeinclude`에 적힌 제외 파일을 복사합니다. 따라서 그 worktree에서는 다시 설치하지 않아도 됩니다. `git worktree add`로 만든 worktree에서는 설치 명령을 다시 실행해야 합니다.

설치 script는 `.claude/settings.json`에 hook 다섯 개를 추가하고 `.claude/agents/korean-writer.md`에 작성 agent를 만듭니다. 같은 이름의 agent 파일이 이미 있고 그 파일에 이 도구가 설치했다는 문구가 없으면 덮어쓰지 않고 중단합니다. `attribution`에 `commit`이나 `pr` 값이 없으면 빈 값을 넣어 Claude Code가 `Co-Authored-By: Claude` 줄과 `Generated with [Claude Code]` 줄을 붙이지 않게 합니다. `env`에 `CLAUDE_CODE_THINKING_DISPLAY_UPDATES` 값이 없으면 `0`을 넣어 server가 요약한 진행 보고가 화면에 나오지 않게 합니다. 설치 script는 `attribution`과 `env`에서 프로젝트가 이미 정해 둔 값을 변경하지 않습니다. `outputStyle`은 위 `--activate` 설명에 따라 변경합니다.
기존 `CLAUDE.md`, 다른 hook, 권한, MCP 설정, 다른 output style 파일, 사용자 전역 설정, `.claude/settings.local.json`은 변경하지 않습니다.
설정 파일이 손상되었거나 설치 경로에 symlink가 있으면 아무것도 덮어쓰지 않고 중단합니다. 처음 설치할 때 skill이나 output style 파일을 둘 경로에 같은 이름의 파일이 있어도 중단합니다.

## 쓰는 법

Claude Code를 재시작한 뒤에는 따로 할 일이 없습니다. Claude는 session에서 처음 한국어를 쓰기 전에 skill을 한 번 부릅니다. Hook은 Claude가 쓴 글을 검사합니다.
Skill을 직접 부르려면 메시지 맨 앞에 `/`와 skill 이름을 입력합니다.

| Skill | 사용하는 경우 | 예 |
| --- | --- | --- |
| `korean-rewrite` | 한국어 글을 쓰거나 다듬을 때, 영어 문서를 한국어로 옮길 때 | `/korean-rewrite docs/guide.md를 자연스러운 한국어로 다듬어 주십시오` |
| `korean-style` | 검사 규칙을 확인하거나 표현이 어색한 이유를 찾을 때 | `/korean-style README.md에서 어색한 표현을 찾아 주십시오` |

### Hook이 하는 일

| 시점 | 보는 글 | 하는 일 |
| --- | --- | --- |
| 사용자가 prompt를 보낼 때 | 없음 | 한국어를 쓰기 전에 skill을 부르고 처음부터 한국어로 생각하라고 Claude에게 알립니다. 이 session에서 skill을 이미 불렀으면 다시 부르지 말라고 알립니다. |
| Claude Code가 도구를 실행하기 직전 | 파일에 쓸 내용, 사용자에게 하는 질문, 승인받을 계획, 사용자에게 보내는 파일 설명, subagent prompt, `git commit` 메시지, `gh pr`과 `gh issue`로 올리는 제목과 설명 | 오류가 있거나 skill을 부르기 전에 한국어를 쓰면 실행을 막고 이유를 알려 줍니다. 파일 내용, commit 메시지, PR과 issue에 올리는 글은 한 번에 쓰는 한글이 200자 이상인데 작성 agent에게 맡기지 않았을 때도 막습니다. 소스 파일에서는 주석의 한글만 계산에 넣습니다. |
| Claude Code가 답변을 마칠 때 | 최종 답변 | Skill을 부르지 않았거나 오류가 있으면 한 번 다시 쓰게 합니다. 답변도 작성 agent에게 맡기도록 규칙을 변경했으면 맡기지 않은 긴 답변도 다시 쓰게 합니다. |
| Claude Code가 답변을 마치거나 subagent가 끝날 때 | 이번 요청에서 쓴 한국어 가운데 파일에 새로 쓴 줄, commit 메시지, PR과 issue에 올린 글, 답변입니다. Subagent가 끝날 때는 subagent가 쓴 진행 보고와 마지막 보고를 모두 뺍니다. | 검토 hook이 background에서 이 글을 검토 model에게 따로 보내 번역투, 격식 있는 문어체에 맞지 않는 말, IT 용어의 한글 음차와 번역어를 찾게 합니다. 파일과 commit 메시지에 대한 지적이 있으면 Claude Code가 그 지적을 Claude에게 전달합니다. Claude는 지적이 맞고 고쳐도 뜻이 바뀌지 않을 때만 파일을 수정하고 commit 메시지는 push하기 전에만 수정합니다. PR과 issue에 올린 글은 Claude가 수정하지 않고 지적만 사용자에게 알립니다. 답변에 대한 지적은 다음 요청에서 hook이 Claude에게만 알립니다. 답변이 늦어지지는 않지만 검토 model 호출도 Claude Code 계정의 사용량에 포함됩니다. |
| Git이 commit할 때(`commit-msg` hook) | Commit 메시지 | 오류가 있으면 commit을 중단합니다. |

Subagent prompt는 영어로 써도 되므로 hook은 skill을 요구하지 않고 오류만 검사합니다. 한글이 20자보다 적은 글에도 skill을 요구하지 않습니다. 이 기준을 변경하려면 규칙 문서의 `writing-skill-min-hangul` 값을 수정합니다.
이미 있는 파일을 편집할 때 hook은 이번 편집으로 새로 생긴 오류만 막습니다. 파일에 쓸 내용에 오류가 없고 경고만 있으면 쓰기를 막지 않습니다. 다만 이번 편집으로 바뀐 문단에서 `review-rules`에 든 규칙의 경고가 새로 나오면 hook이 Claude에게 알려 다시 살펴보게 합니다.
Claude가 shell 명령으로 검사 대상 파일에 쓰려 하면 hook은 쓸 내용을 미리 볼 수 없으므로 그 명령을 막고 Write나 Edit 도구로 다시 쓰라고 안내합니다.
Stop hook은 답변이 화면에 나온 뒤에 실행되므로 이미 나온 답변을 되돌리지 못합니다. Hook을 실행하는 도중 예외가 발생하면 작업은 그대로 계속됩니다.
Skill을 요구하는 조건과 내부 동작은 [동작 원리](how-it-works.md)에 있습니다.

### 검사기 CLI

```sh
node .korean-style/scripts/check-korean.mjs --text '확인했습니다.'
node .korean-style/scripts/check-korean.mjs --file docs/guide.md
node .korean-style/scripts/check-korean.mjs --all
node .korean-style/scripts/check-korean.mjs --explain translationese
```

`--stdin`을 주면 검사기가 표준 입력을 검사합니다. 글의 종류는 `--target chat|doc|comment|commit`으로 지정합니다. 설치 script의 `--target <경로>`와는 다른 option입니다.
오류가 있으면 종료 코드 1로, 사용법이 틀리면 2로 끝납니다. 경고만 있으면 0으로 끝나고 `--strict`를 주면 경고만 있어도 1로 끝납니다.
검사기는 파일을 수정하지 않습니다. 기존 문서에서 오류가 나와도 설치에 실패한 것은 아닙니다.

## 규칙 바꾸기

`.korean-style/rules.md`의 `korean-style-rules` 블록을 수정합니다. 막지 않고 경고만 할 규칙은 `advisory-rules`에 추가합니다. Skill을 요구하지 않으려면 `writing-skill:`의 값을 비웁니다. 생성 표시를 막지 않으려면 `banned-attribution:`의 값을 비웁니다.
Hook이 작성 agent를 요구하지 않게 하려면 `writer-agent:`의 값을 비웁니다. 그러면 UserPromptSubmit hook도 작성 agent를 안내하지 않습니다. Agent에게 맡길 글의 기준 길이는 `writer-agent-min-hangul`로 정합니다. 화면에 나오는 답변까지 맡기려면 `writer-agent-answer-min-hangul`을 0보다 크게 정합니다. 그러면 Claude가 한글이 그 수 이상인 답변마다 메모를 넘기고 돌려받은 글을 다시 출력하므로 답변이 늦어집니다.

검토 hook을 끄려면 `reviewer-model:`의 값을 비웁니다. 규칙 문서에 이 키가 없으면 검토 hook이 기본값으로 검토하므로 키를 추가하고 값을 비워야 합니다. 검토 model을 변경하려면 `reviewer-model:`에 model 이름을 적습니다. 기본값은 `sonnet`이고 `opus`나 `haiku`로 변경할 수 있습니다. 2026년 11월 6일에 Claude Code 2.1.310에서 세 model의 지적 횟수와 비용을 측정했습니다. 예문 18개를 묶음 3개로 나눴고 model마다 각 묶음을 여섯 번 보냈습니다. 묶음 하나에 든 평균 비용은 Sonnet $0.0114, Opus $0.0147, Haiku $0.0013였습니다. 자연스러운 문장은 model마다 합쳐서 60번 보냈습니다. Sonnet과 Opus는 이 60번 가운데 한 번도 잘못 지적하지 않았고 Haiku는 6번 잘못 지적했습니다. 검토 model이 잘못 지적하면 Claude가 자연스러운 문장까지 수정할 수 있습니다. 답변을 검토 model에게 보내지 않으려면 `reviewer-answer-min-hangul:`을 `0`으로 정합니다. 그러면 파일, commit 메시지, PR과 issue에 올린 글만 보냅니다.

개발자가 읽는 글에서 IT 용어를 영어 원어로 쓰는 표기는 업계 다수 관행이 아니라 이 도구가 정한 기본값입니다. 이 기본값의 근거는 [한국어 작성 원칙](writing.md)에 있습니다. 기본 규칙에서 검사기는 `banned-transliteration`에 적은 한글 음차를 오류로 잡습니다. `ambiguous-transliteration`에 적은 한글 음차와 `banned-translation`에 적은 번역어는 경고로 알립니다.
팀이 IT 용어를 영어 원어로 쓰지 않으려면 이 세 키의 값을 비웁니다. 기본 규칙은 한 키의 값을 여러 줄에 나눠 적었으므로 키마다 그 키로 시작하는 줄을 모두 삭제한 뒤 `banned-transliteration:`처럼 값이 빈 줄을 하나 적습니다. 한 줄만 비우면 다른 줄에 적은 낱말은 계속 잡습니다. 세 키를 비우면 검사기는 IT 용어의 한글 표기가 `loanword-spelling`에 적은 표기와 맞는지만 확인합니다. 예를 들어 `디렉토리`는 오류로 잡고 `디렉터리`로 고치라고 알립니다. 세 키를 비워도 skill, output style, 작성 agent에 든 영어 원어 지시는 바뀌지 않습니다. Claude가 한글 표기를 쓰게 하려면 프로젝트의 `CLAUDE.md`에 그렇게 적어야 합니다.
`푸시 알림`처럼 세 키에 적은 말이 들어 있어도 잡지 않을 구절은 `term-exempt`에 적습니다. 답변과 도구에 넘기는 글(사용자에게 하는 질문, 계획, 사용자에게 보내는 파일 설명, agent에게 주는 prompt)에서는 `banned-transliteration`에 적은 낱말도 경고로만 알립니다. 이런 글에서도 오류로 보고하게 하려면 `chat-advisory-rules`의 값을 비웁니다.

이용자 공지, 웹 페이지, 앱 문구처럼 일반 독자가 읽는 글에서는 `페이지`, `브라우저`처럼 사전에 오른 외래어를 한글로 적습니다. 일반 독자가 읽는 파일에는 위 세 키로 정한 IT 용어 규칙을 적용하지 않습니다. 다른 규칙은 그대로 적용합니다. 이런 파일은 다음 두 방법 가운데 하나로 지정합니다.

- 규칙 문서의 `general-reader-globs`에 `notices/**`처럼 경로 pattern을 적습니다. 형식은 `doc-globs`와 같습니다.
- 문서 파일 첫머리에 `<!-- korean-style: general-reader -->` 줄을 넣습니다. 이 줄은 문서 파일에만 쓸 수 있습니다.

검사기는 격식 있는 문어체에 맞지 않는 한자 관형사와 어려운 한자어(`hanja-words`), 구어 표현(`colloquial-words`)을 경고로만 알립니다. `reason-endings`에 적은 말로 끝난 이유 문장 바로 다음 문장이 `result-adverbs`에 적은 `그래서`로 시작할 때도 경고로만 알립니다. 한자어 경고는 `hanja-words`, 구어 표현 경고는 `colloquial-words`의 값을 비우면 꺼집니다. `그래서` 경고는 `reason-endings`나 `result-adverbs`의 값을 비우면 꺼집니다.

각 키의 뜻은 [검사 규칙](rules.md)에 있습니다. 규칙을 수정한 뒤에는 잡아야 할 문장과 통과해야 할 문장을 `--text`로 함께 확인합니다.

문서에 다른 사람이나 model이 쓴 글을 그대로 옮길 때는 그 글을 `<!-- korean-style-quote -->` 줄과 `<!-- /korean-style-quote -->` 줄 사이에 넣습니다. 검사기는 문서에서 이 구간을 검사하지 않습니다. 답변과 commit 메시지에서는 이 구간도 검사합니다.

## 다시 설치하기와 팀에서 쓰기

같은 설치 명령을 다시 실행하면 검사기, skill, output style이 최신 버전으로 바뀝니다. `git clone`으로 설치했다면 `/tmp/korean-rewrite` directory를 삭제한 뒤 `git clone`부터 다시 실행합니다. Hook은 중복으로 등록되지 않습니다. `--register`를 주지 않으면 현재 사용하는 말투가 그대로 유지됩니다.
규칙 문서를 수정하지 않았다면 다시 설치할 때 새 기본 규칙이 적용됩니다. 직접 수정한 규칙과 수정했는지 확인할 수 없는 예전 규칙은 그대로 둡니다. 이런 규칙 문서에는 새 기본 규칙에서 추가한 키와 값이 들어가지 않습니다. 새 기본 규칙으로 교체하려면 `--force`를 붙입니다. 원래 규칙은 `.korean-style/rules.backup-*.md`에 backup되므로 필요한 내용을 옮겨 올 수 있습니다.

새 기본 규칙에서는 검사기가 `banned-transliteration`에 적은 한글 음차를 문서에서 오류로 잡습니다. 0.4.1까지의 기본 규칙은 이 표기를 검사하지 않았으므로 기존 문서에는 `커밋`, `서버` 같은 표기가 남아 있을 수 있습니다. 다시 설치해도 기존 문서는 바뀌지 않습니다. Hook은 파일을 편집할 때 이번 편집으로 새로 생긴 오류만 막으므로 예전 표기가 남은 기존 문서도 편집할 수 있습니다. 새로 쓰는 문장만 새 규칙에 맞추면 됩니다. 기존 문서를 한 번에 새 규칙에 맞추려면 `node .korean-style/scripts/check-korean.mjs --all`로 수정할 위치를 확인합니다.

규칙 문서(`.korean-style/rules.md`)는 repository에 commit하는 파일입니다. Repository를 clone한 팀원이 설치 명령을 한 번 실행하면 같은 규칙이 적용됩니다. 0.4.1까지의 검사기는 `banned-transliteration`의 낱말을 낱말 경계를 보지 않고 찾으므로 새 기본 규칙을 읽으면 `블로그`의 `로그`와 `머지않아`의 `머지`도 오류로 잡습니다. 따라서 새 기본 규칙이 들어간 규칙 문서를 commit했으면 다른 팀원도 모두 다시 설치해야 합니다.
아직 0.3.0을 사용하는 팀원이 있으면 `--register` 없이 다시 설치합니다. 그러면 규칙 문서의 `다나까체`가 그대로 유지됩니다. 새 검사기와 0.3.0 검사기는 모두 이 이름을 읽습니다.

Git worktree와 `core.hooksPath`도 지원합니다. 여러 worktree가 `commit-msg` hook 하나를 함께 사용하더라도 hook은 현재 commit하는 worktree의 규칙을 따릅니다.
다른 `commit-msg` hook이 이미 있으면 설치 script는 그 hook을 덮어쓰지 않습니다. 이때 사람이 직접 하거나 다른 프로그램으로 하는 commit도 검사하려면 기존 hook에 다음 줄을 추가합니다.

```sh
node .korean-style/scripts/hooks/commit-msg.mjs "$1" || exit $?
```

Git repository가 아닌 프로젝트에 설치해도 Claude Code hook은 동작합니다. 나중에 `git init`을 실행하고 다시 설치하면 `.gitignore` 항목과 `commit-msg` hook이 추가됩니다.

## 제거

1. `.korean-style/`, `.claude/skills/korean-style/`, `.claude/skills/korean-rewrite/`, `.claude/output-styles/korean-style.md`, `.claude/agents/korean-writer.md`를 삭제합니다.
2. `.claude/settings.json`에서 명령에 `.korean-style/scripts/hooks/`가 들어 있는 hook 항목을 삭제합니다. UserPromptSubmit, PreToolUse, Stop의 hook 항목과 함께 Stop과 SubagentStop에 등록된 검토 hook(`review.mjs`) 항목도 삭제합니다. `"outputStyle": "korean-style"`도 삭제합니다. `attribution` 항목과 `env`의 `CLAUDE_CODE_THINKING_DISPLAY_UPDATES` 항목은 이 도구가 넣었으면 삭제합니다.
3. `.gitignore`에서 `# korean-style`로 시작하는 줄과 그 아래 일곱 줄(`.korean-style/*`, `!.korean-style/rules.md`, `!.korean-style/defaults.sha256`, `.claude/skills/korean-style/`, `.claude/skills/korean-rewrite/`, `.claude/output-styles/korean-style.md`, `.claude/agents/korean-writer.md`)을 삭제합니다. `.worktreeinclude`에서도 같은 줄을 삭제합니다.
4. `git rev-parse --git-path hooks/commit-msg`가 가리키는 파일에 `korean-style commit hook`이 들어 있는 줄이 있으면 그 파일을 삭제합니다. 기존 hook에 검사기 호출을 직접 추가했다면 그 줄도 삭제합니다.

## 문제 해결

먼저 `node .korean-style/scripts/doctor.mjs`로 설치 상태를 확인합니다. 실패한 항목이 있으면 종료 코드 1로 끝납니다.

- **Skill, output style, hook이 적용되지 않을 때:** Claude Code를 재시작했는지 확인합니다. 그다음 `.claude/settings.local.json`의 `outputStyle`과 `disableAllHooks`를 확인합니다. Worktree에서는 main worktree의 local 설정도 확인합니다. 어느 설정이 우선하는지는 Claude Code 문서의 [설정 우선순위](https://code.claude.com/docs/en/settings#settings-precedence)에 나와 있습니다.
- **조직 정책, session option, 사용자 전역 설정이 의심될 때:** `doctor`는 프로젝트 설정 파일과 local 설정 파일만 읽습니다. 실제로 적용된 설정은 Claude Code의 `/status`로 확인합니다.
- **주의 항목이 나올 때:** 다른 `commit-msg` hook을 사용하거나, commit해야 할 파일이 Git에서 빠져 있거나, 생성 표시나 진행 보고 요약이 켜져 있으면 `doctor`가 주의 항목으로 표시합니다.
- **설치가 중단될 때:** 손상된 설정 파일을 수정하고 같은 이름의 기존 파일이나 설치 경로의 symlink를 옮기거나 삭제한 뒤 다시 설치합니다.

## 다른 코딩 agent

Codex나 Gemini CLI에서는 skill, output style, 작성 agent, Claude Code hook이 동작하지 않습니다.
Commit 메시지 검사는 Git의 `commit-msg` hook에서 실행되므로 어느 프로그램으로 commit하든 적용됩니다.
다른 agent도 같은 기준을 따르게 하려면 `AGENTS.md`나 `GEMINI.md`에 지시를 적어 둡니다. 한국어를 쓰기 전에 `.claude/skills/korean-rewrite/SKILL.md`를 읽고 그 순서를 따르라고 적습니다.
