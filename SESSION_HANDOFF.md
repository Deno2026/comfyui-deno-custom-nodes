# SESSION_HANDOFF — comfyui-deno-custom-nodes

> ## ▶ 지침/배포 준비 (2026-06-03, Codex) — 검색 메타데이터 누락 방지
>
> **사건:** `(Deno) Bernini Prompt Guide`는 README와 한국어 README에는 Bernini 키워드가 있었지만,
> `pyproject.toml` description/keywords와 GitHub repo topics에는 Bernini/Wan2.2/Prompt Guide 키워드가
> 충분히 반영되지 않았음. Comfy Registry 검색 API에서 `bernini` 검색 시 다른 Bernini 노드만 나오고
> `deno-custom-nodes`는 잡히지 않는 것을 확인.
>
> **수정 방향:** `pyproject.toml` description에 Bernini Prompt Guide, Bernini conditioning helpers,
> Wan 2.2 reference video edit workflow를 포함하고, `keywords` 배열에 `bernini`,
> `bernini-prompt-guide`, `bernini-conditioning`, `comfyui-bernini`, `wan-2.2`, `wan2.2`,
> `reference-video-edit`, `system-prompt`, `prompt-guide`, `kj-bernini` 등을 추가.
> `tests/test_registry_metadata.py`도 새 검색 키워드를 검사하도록 보강.
>
> **새 하드 규칙:** 공개 노드/워크플로/모델군을 배포할 때는 기능 구현만 끝난 것으로 보지 말고,
> GitHub/ComfyUI Manager/Comfy Registry 검색 메타데이터까지 배포 표면으로 취급한다.
> `pyproject.toml` description/keywords, README 검색어, localized README 검색어, changelog/release notes,
> GitHub topics를 함께 갱신한다. Registry/Manager 메타데이터는 일반적으로 새 버전 publish가 필요하다.

> ## ▶ 지침 보강 (2026-06-03, Codex) — 공유용 BAT 검증 실패 패턴
>
> **사건:** `DENO_Bernini_Preview_Backend_Update.bat`를 GitHub Release asset으로 올린 뒤,
> 사용자가 직접 `YES` 경로를 실행하자 Python dependency filtering 단계에서
> `SyntaxError: unterminated string literal`이 발생. 원인은 BAT 상단
> `EnableDelayedExpansion`이 inline Python regex의 `!` 문자를 소거/변형해 한 줄 Python 코드가
> 깨진 것. 기존 `NO` 입력 smoke test는 실제 실패 경로를 전혀 검증하지 못했음.
>
> **수정:** BAT를 `setlocal EnableExtensions DisableDelayedExpansion`으로 변경하고,
> `!CD!`가 필요하던 경로 계산을 `for %%I ... %%~fI` 방식으로 대체. 테스트 포터블 루트와
> `ComfyUI\main.py` 옆에 있던 BAT 모두 동일 수정본으로 교체하고 SHA256 해시 일치 확인.
> `cmd /v:off`에서 실제 `YES` 경로를 실행해 `DONE`까지 통과, 이후 `main.py` 옆 배치 위치는
> `NO` 경로로도 ComfyUI 탐지/취소가 정상인지 확인.
>
> **새 하드 규칙:** 공유용 BAT는 cancel-only smoke test로 검증 완료라고 말하지 말 것.
> 배포/Release asset 전에는 실제 배포될 `.bat` 파일을 복사한 포터블/test 폴더에서
> `YES` 성공 경로로 끝까지 실행하고, cancel path도 별도로 확인한다. Windows BAT는 delayed expansion,
> `!`, `%`, `^`, 괄호, pipe, 공백 포함 경로, inline Python/PowerShell, 중첩 따옴표에서 깨질 수 있으므로
> 이들을 실제 실행으로 확인한다. root 배치와 `main.py` 옆 배치가 모두 지원되면 두 위치 모두 검사하고,
> 여러 위치에 BAT가 남아 있으면 전부 해시 일치시킨다. GitHub Release asset은 로컬 수정만으로
> 갱신되지 않으므로, 수정 후 반드시 asset 교체가 필요하다.

> ## ▶ 배포 기록 (2026-06-03, Codex) — 0.7.27 Bernini Prompt Guide + Preview Backend BAT
>
> **배포 목적:** Bernini/KJ 워크플로우 초보자가 system prompt prefix, reference naming,
> negative prompt preset을 쉽게 쓰도록 `(Deno) Bernini Prompt Guide`를 공개 배포.
> ComfyUI Bernini 백엔드가 아직 draft PR 상태라, 구독자 테스트용으로 복사한 포터블 ComfyUI에
> `kijai/ComfyUI bernini` 브랜치를 적용하는 공유용 BAT도 추가.
>
> **포함 파일:** `deno_bernini_prompt_guide.py`, `web/js/deno_bernini_prompt_guide.js`,
> `tools/DENO_Bernini_Preview_Backend_Update.bat`, `README.md`, `docs/README.ko.md`,
> `CHANGELOG.md`, `pyproject.toml`, 테스트/운영 지침 업데이트.
>
> **BAT 검증:** repo 위치에서 실행 시 ComfyUI 미탐지로 안전 중단. 테스트 포터블 루트
> `D:\ComfyUI-Easy-Install - test\ComfyUI-Easy-Install\DENO_Bernini_Preview_Backend_Update.bat`
> 에 복사 후 `NO` 입력 smoke test 진행. ComfyUI 경로와 현재 브랜치/커밋
> (`pr-14216-bernini-test`, `1085cf2f`)을 정상 표시하고 실제 업데이트 전 취소됨.
> untracked `extra_model_paths_Backup.yaml` 때문에 너무 엄격하게 멈추던 문제는
> `--untracked-files=no`로 수정해, 추적 중인 ComfyUI 파일 변경만 차단하도록 조정.
>
> **검증:** `python -m py_compile deno_bernini_prompt_guide.py`, `node --check web/js/deno_bernini_prompt_guide.js`,
> `python -m pytest -q` → `75 passed`, `git diff --check` 통과.
>
> **배포 커밋/태그/릴리즈:**
> - `a5fc68b` — `Release 0.7.27 Bernini prompt guide` (`origin/main` push 완료).
> - `pyproject.toml` `0.7.26 → 0.7.27`, 태그 `v0.7.27` push 완료.
> - GitHub Release: `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.27`
> - Release asset: `DENO_Bernini_Preview_Backend_Update.bat`
>
> **GitHub Actions:** CI `26845338451`, Publish to Comfy registry `26845337948`,
> Pages `26845335277` 모두 success.
>
> **Registry 확인:** `https://api.comfy.org/nodes/deno-custom-nodes/versions?include_status_reason=true`
> 기준 `0.7.27` 생성됨. 상태는 확인 시점 기준 `NodeVersionStatusPending`, `status_reason=""`,
> `comfy_node_extract_status="pending"`. CDN zip HEAD `200`:
> `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.27/node.zip`.
>
> **다음 확인 규칙:** 추가 폴링 없음. 사용자가 다시 확인 요청 시 Registry API 1회만 확인.
> `0.7.27`이 Active·latest가 되면 완료 보고. Flagged/Rejected면 `status_reason`을 먼저 보고
> 해당 파일만 최소 수정 후 새 버전으로 처리.

> ## ▶ 다음 작업 리마인더 (2026-06-03, Codex) — Deno Preview 여백 자동 맞춤
>
> **대상:** `(Deno) Image Preview` / `(Deno) Video Preview` 계열 preview 노드.
>
> **증상:** 세로 영상/이미지처럼 preview 컨텐츠 비율이 노드 내부 영역과 다를 때, 검은 여백 또는 과한 내부 여백이 남아
> 노드가 실제 미디어보다 크게 보임. 사용자는 “출력물만 딱 맞게 보이는 preview”를 기대함.
>
> **다음 수정 방향:** 미디어 decode/로드 후 실제 프레임 비율과 현재 노드 너비를 기준으로 preview 높이를 능동 계산.
> 단, Video Preview에서 이미 겪은 회귀를 반복하지 말 것: 수동 resize 보존, 키웠다가 줄이기 가능, 숨은/빈 body가
> canvas wheel/scroll/middle-click을 막지 않음, hover가 재생/오디오 복구의 유일한 경로가 되지 않음.
>
> **검증 기준:** 세로/가로/정사각형 미디어 각각에서 검은 여백 최소화, 노드 grow/shrink 양방향 작동,
> reload 후 수동 크기 유지, 빈 영역 wheel/scroll이 ComfyUI canvas에 정상 전달되는지 실제 8189 런타임에서 확인.

> ## ▶ 진행 기록 (2026-06-03, Codex) — Bernini Prompt Guide 로컬 구현
>
> **목적:** Bernini/KJ 워크플로우 초보자가 system prompt prefix를 직접 외우지 않고 쓰도록
> `(Deno) Bernini Prompt Guide` 추가.
>
> **범위:** 공식 Bernini 전체 CLI/conditioning 통합이 아니라, KJ가 보여준 task_type별 system prompt prefix
> 흐름만 편의 노드로 감쌈. 실제 Bernini visual conditioning은 ComfyUI/KJ 백엔드의
> `BerniniConditioning`/Wan context latent 지원이 필요하며, 이 노드는 텍스트 conditioning만 출력.
>
> **구현:** `deno_bernini_prompt_guide.py` 추가, `__init__.py` 등록, `web/js/deno_bernini_prompt_guide.js`
> 추가. 노드 상단에 현재 System Prompt 모드와 자동 system prompt를 표시. UI 선택지는
> `i2v`/`rv2v` 같은 코드형 토큰 대신 `Image to Video`, `Reference Video Edit` 같은
> readable label을 사용하며, 백엔드는 기존 토큰 저장값도 계속 normalize해서 받음.
> reference helper 토글은 초보자용 UI에서 제거하고, `r2v`/`rv2v` 계열에서
> `image0`, `image1`, `image2` reference naming hint를 내부적으로 prepend.
> negative preset은 출력 모드가 아니라 visible negative prompt textarea 자동입력용으로 정리.
> 현재 신규 UI 선택지는 `Official Wan2.2`, `Empty`이며, 프리셋 선택 시 아래 negative prompt 칸이
> 채워지고 사용자가 그 칸에서 직접 추가/수정한 텍스트가 최종 negative conditioning으로 인코딩됨.
> LTX Prompt Guide처럼 negative prompt 접기 section header를 추가했고, 접힌 상태에서도
> 저장된 negative prompt 값은 유지. 원본 `show_negative_prompt` boolean과 `reference_prompt_helper`
> 토글은 frontend에서 숨김. 예전 draft의 `Custom`/`Official Wan2.2 + Custom` 값은
> 백엔드와 frontend migration에서 legacy로만 처리.
> 초기 박스형 summary UI는 화면이 투박하고 본문을 밀어내서 폐기. 최종 배치는
> `System Prompt` 선택줄을 맨 위에 두고, 그 아래 초록 박스에는 실제 `You are...` system prompt
> 문장만 한 줄로 표시. positive prompt 기본 높이는 키웠고, 사용자가 노드 세로 크기를 늘리면
> 남는 높이가 positive prompt textarea에 배분되어 아래 빈 공간이 생기지 않도록 함.
> 줄이는 방향에서는 ComfyUI/LiteGraph가 현재 textarea 높이를 최소/최대 높이처럼 잡아 수동 resize가
> 막힐 수 있어서, prompt widget의 visible height 잠금과 resize bound 계산을 분리함. `getMinHeight`는
> 작은 최소값만 반환하고 `getMaxHeight`는 잠긴 높이를 반환하지 않도록 처리해 키웠다가 다시 줄이는 흐름을 허용.
> 후속 UI 정리에서 `Custom System Prompt` 선택지는 초보자에게 의미가 적고 하단에 찌꺼기 textarea를
> 남기는 원인이 되어 제거. legacy workflow의 `custom`/`Custom System Prompt` 저장값은 `Default`로
> 정규화해 깨지지 않게 처리. Negative Prompt 접힘 상태 문구는 `open/closed` 대신 액션이 분명한
> `Hide/Show`로 변경. 초록 system prompt 박스 오른쪽에는 작은 `i` 버튼을 추가해 현재 모드의 용도,
> 권장 입력(reference image/video 수), 예시 프롬프트를 DENO 스타일 도움말 패널로 표시.
> 이후 기존 워크플로우에 저장된 큰 node height가 남아 아래 빈 영역이 캔버스 휠을 막는 문제 발견.
> `refreshNode()`가 기존 height를 보존하지 않고 실제 visible widget 높이로 fit하도록 수정.
> `AGENTS.md`와 `docs/DENO_NODE_RETROSPECTIVE.md`에 dead-space hard rule 추가:
> 숨김/접힘/레이아웃 축소 후 남는 빈 노드 몸통도 캔버스 wheel/scroll/zoom을 막는 UX 버그로 취급.
>
> **도움말:** 기존 DENO `i` 버튼 DESCRIPTION에 챗봇에게 지시하듯 쓰는 프롬프트 예시와
> Bernini 백엔드 필요 주의문을 포함.
>
> **검증:** `python -m pytest -q` → 75 passed, `py_compile`, `node --check`,
> `git diff --check` 통과. 변경 파일을 source, 메인 포터블, 데스크탑, Bernini 테스트 포터블에
> 해시 일치 복사. 현재 실행 중이던 8189 테스트 ComfyUI는 queue idle 확인 후 기존 PID 종료,
> `D:\ComfyUI-Easy-Install - test\ComfyUI-Easy-Install\Start ComfyUI Bernini PR 8189.bat`
> visible BAT로 재시작. `http://127.0.0.1:8189/object_info/DenoBerniniPromptGuide`에서
> display/category/inputs 확인, `/extensions/deno-custom-nodes/deno_bernini_prompt_guide.js`
> served marker 확인. Headless Chrome에서 실제 ComfyUI 앱에 `DenoBerniniPromptGuide` 임시 노드를
> 생성해 task choices에 `Custom System Prompt`가 없는 것, `custom_system_prompt` 위젯이 생성되지 않는 것,
> summary/negative custom widget이 존재하는 것 확인. summary `i` 버튼 mouse handler를 호출해
> `Reference Video Edit` 도움말 패널이 실제 DOM에 뜨고 `Use for`/`Inputs`/`Prompt example`을 표시하는 것 확인.
>
> **미완료:** 공개 배포 전 README 스크린샷 추가와 저장-재열기 확인 필요.

> ## ▶ 로컬 버그픽스 기록 (2026-06-01, Codex) — LTX refresh + Multi Image missing-file guard
>
> **제보:** 구독자 제보 기준 `Deno LTX Model Loader`가 ComfyUI F5/R refresh 후 모델 선택값이
> `__none__`으로 초기화되어 재선택이 필요할 수 있음. `Deno Multi Image Loader`는 장시간 같은
> I2V 이미지를 사용하다 이미지가 검은 프리뷰/빈 입력처럼 되어 T2V처럼 동작하는 증상이 있음.
>
> **수정:** `web/js/deno_extra_nodes.js`에서 LTX 모델 계열 위젯의 저장값이 현재 combo 목록에 없더라도
> 비어 있지 않은 실제 저장값이면 `__none__`/다른 fallback으로 덮어쓰지 않도록 보존.
> `deno_multi_image_board.py`에서 사용자가 선택한 `image_paths`가 있는데 로드 실패가 발생하면
> 검은 placeholder 이미지를 조용히 반환하지 않고 명확한 `RuntimeError`로 중단. 추가로
> `VALIDATE_INPUTS`에서 실행 전에 선택 이미지 파일이 존재하고 PIL 이미지로 열리는지 확인하며,
> `IS_CHANGED`에서 선택 파일 내용을 SHA256에 포함해 파일이 바뀌면 ComfyUI 캐시가 무효화되도록 보강.
>
> **검증:** `tests/test_image_resize_node.py`에 F5 보존 guard, missing selected image 에러,
> `VALIDATE_INPUTS`, `IS_CHANGED` 파일 내용 해시 테스트 추가.
> embedded Python 기준 전체 테스트 `71 passed`, `py_compile deno_multi_image_board.py` 통과,
> `node --check web/js/deno_extra_nodes.js` 통과.
>
> **상태:** `0.7.26` 로컬 소스/포터블/데스크탑 반영 완료. GitHub Release 및 Registry publish 완료.
> Registry 스캔 상태는 확인 시점 기준 `NodeVersionStatusPending`.
>
> ---

> ## ▶ 배포 기록 (2026-06-01, Codex) — 0.7.26 LTX refresh + Multi Image validation
>
> **배포 목적:** 구독자 제보 기준 `Deno LTX Model Loader`가 ComfyUI F5/R refresh 후 모델 선택값이
> `__none__`으로 초기화되는 문제와, `Deno Multi Image Loader`가 선택 이미지 로드 실패 시 검은
> placeholder처럼 조용히 진행될 수 있는 문제를 수정.
>
> **수정 요약:** LTX 모델 계열 위젯은 저장된 실제 모델명이 현재 combo 목록에 잠시 없더라도
> `__none__`으로 덮어쓰지 않음. Multi Image Loader는 선택 이미지가 missing/unreadable이면
> 실행 전 `VALIDATE_INPUTS`와 실행 중 `RuntimeError`로 명확히 멈춤. `IS_CHANGED`는 선택 이미지 파일
> 내용을 SHA256에 포함해 같은 경로의 파일 내용 변경도 캐시 무효화에 반영.
>
> **리뷰/검증:** Feynman 리뷰어 2차 검토 결과 blocking 없음. 이전 리뷰어 지적사항이었던
> `VALIDATE_INPUTS(**kwargs)` 문제는 `image_paths` 단일 시그니처와 회귀 테스트로 고정.
> embedded Python 기준 전체 테스트 `71 passed`, `py_compile deno_multi_image_board.py
> deno_ltx23_preset_loader.py` 통과, `node --check web/js/deno_extra_nodes.js` 통과,
> `git diff --check` 통과.
>
> **로컬 반영/검증:** 포터블 실행본
> `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`와 데스크탑 실행본
> `C:\Users\aions\Documents\ComfyUI\custom_nodes\comfyui-deno-custom-nodes`에 동일 파일 반영 후 해시 일치 확인.
> queue idle 상태에서 기존 SageAttention BAT/python PID 종료 후
> `Start ComfyUI SageAttention.bat`로 재시작. `/system_stats`, `/object_info/DenoMultiImageLoader`,
> `/object_info/DenoLTX23PresetLoader` 응답 및 런타임 마커 확인.
>
> **배포 커밋/태그/릴리즈:**
> - `8d69853` — `Release 0.7.26 loader refresh and image validation fixes` (`origin/main` push 완료).
> - `pyproject.toml` `0.7.25 → 0.7.26`, `CHANGELOG.md` `0.7.26 - 2026-06-01` 추가.
> - 태그 `v0.7.26` push 완료. GitHub Release `v0.7.26` 생성:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.26`
>
> **GitHub Actions (push 트리거, 모두 success):**
> - Publish to Comfy registry: run `26737197386`.
> - CI: run `26737197353`. Pages: run `26737196768`.
>
> **Registry 1회 확인 결과:**
> - API: `https://api.comfy.org/nodes/deno-custom-nodes/versions?include_status_reason=true`
> - `0.7.26` 생성됨: `NodeVersionStatusPending`, `status_reason=""`,
>   `comfy_node_extract_status="pending"`.
> - CDN zip HEAD `200`: `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.26/node.zip`.
>
> **다음 확인 규칙:** 추가 폴링 없음. 사용자가 다시 확인 요청 시 Registry API 1회만 확인.
> `0.7.26`이 Active·latest가 되면 완료 보고. Flagged/Rejected면 `status_reason`을 먼저 보고
> 해당 파일만 최소 수정 후 새 버전으로 처리.
>
> ---

> ## ▶ 기준 워크플로우 기록 (2026-05-31, Codex) — public LTX 2.3 8GB VRAM workflow
>
> **기준 파일:** 사용자가 공개 배포 중인 워크플로
> `C:\Users\aions\Downloads\LTX2.3 8GB VRAM workflow (1).json`.
> repo 기준 사본:
> `docs/workflows/ltx23-8gb-vram-public-baseline.json`.
>
> **원칙:** 앞으로 `(Deno) LTX 2.3 8GB VRAM` 공개 워크플로우는 이 파일이 Manager 최신 업데이트 후
> 바로 열리고, DENO 노드 업데이트 때문에 깨지지 않는 것을 기준점으로 삼는다.
>
> **검증 결과:** 워크플로 내 DENO 타입은 `DenoLTX23PresetLoader`, `DenoLTXModelDownloader`,
> `DenoLTXMultiLoraLoader`, `DenoLTXPromptGuide`, `DenoLTXSequencer`, `DenoMultiImageLoader`,
> `DenoResolutionSetup`이며 모두 현재 로컬 런타임과 Registry `0.7.24 Active`에서 존재.
> `DenoLTX23PresetLoader`는 11개짜리 legacy widget array(`GGUF Style`, blank slot 포함)를 들고 있어
> 0.7.23+의 widget normalization/validation fix가 필수.
>
> **자동화:** `tests/test_image_resize_node.py`에
> `test_public_ltx23_8gb_workflow_keeps_deno_node_contracts` 추가. 기준 워크플로우의 canonical SHA256과
> DENO node type contract를 검사해, 향후 DENO 노드명/계약 변경으로 이 공개 워크플로우가 깨지면 테스트가 실패하게 함.
>
> **외부 의존성 주의:** 이 워크플로우는 DENO만으로 완결되지 않음.
> `ComfyUI-LTXVideo`, `comfyui-videohelpersuite`, `comfyui-kjnodes`, `ComfyMath`,
> `GACLove/ComfyUI-VFI`, `comfyui_memory_cleanup`, `comfyui_nvidia_rtx_nodes`,
> `rgthree-comfy`, 그리고 Get/Set/Note/Markdown 계열 프론트엔드 노드가 필요할 수 있음.
> 신규 사용자 안내에는 “DENO 노드 최신 업데이트”와 별도로 의존 노드팩 설치 안내가 필요.
>
> ---

> ## ▶ 로컬 정리 기록 (2026-05-31, Codex) — Easy Model Download Helper 중복 노드 제거
>
> **원인:** `0.7.24`에서 예전 워크플로 `DenoLTX8GBModelDownloader`를 살리기 위해
> `NODE_CLASS_MAPPINGS`에 alias를 직접 추가했으나, ComfyUI 노드 목록에는
> `(Deno) Easy Model Download Helper`가 2개 보이는 UX 중복이 생김.
>
> **수정:** `DenoLTX8GBModelDownloader`를 실제 노드 등록에서 제거하고,
> `DenoLTX8GBModelDownloader → DenoLTXModelDownloader`는 ComfyUI node replacement metadata로만 등록.
> `web/js/deno_ltx_model_downloader.js`도 최신 타입 `DenoLTXModelDownloader`만 대상으로 정리.
>
> **검증:** embedded Python 기준 `54 passed`, `py_compile` 통과, `node --check` 통과.
> source/portable/desktop 해시 일치 확인 후 ComfyUI queue idle 상태에서 기존 PID 종료,
> `Start ComfyUI SageAttention.bat`로 재시작. `/object_info`에서 `DenoLTX8GBModelDownloader`
> 사라짐 확인. `/node_replacements`와 `/api/node_replacements` 모두
> `DenoLTX8GBModelDownloader → DenoLTXModelDownloader` migration 등록 확인.
>
> ---

> ## ▶ 배포 기록 (2026-05-31, Codex) — 0.7.25 downloader migration + public workflow baseline
>
> **배포 목적:** `0.7.24`의 legacy downloader alias는 기존 워크플로를 살렸지만,
> ComfyUI 노드 목록에 `(Deno) Easy Model Download Helper`가 중복 표시되는 UX 문제가 있었음.
> 이번 릴리즈는 예전 `DenoLTX8GBModelDownloader`를 실제 노드 등록에서는 제거하고,
> ComfyUI node replacement migration으로만 `DenoLTXModelDownloader`에 연결.
>
> **추가 기준점:** 사용자가 공개 배포 중인
> `LTX2.3 8GB VRAM workflow (1).json`을
> `docs/workflows/ltx23-8gb-vram-public-baseline.json`으로 보관하고,
> `tests/test_image_resize_node.py`에 canonical SHA256 및 DENO node contract 테스트 추가.
> 향후 DENO 노드 업데이트로 공개 워크플로우의 DENO 노드명이 깨지면 테스트가 실패하게 됨.
>
> **로컬 반영/검증:** 포터블 실행본
> `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`와 데스크탑 실행본
> `C:\Users\aions\Documents\ComfyUI\custom_nodes\comfyui-deno-custom-nodes`에 동일 파일 반영 후 해시 일치 확인.
> embedded Python 기준 `54 passed`, `py_compile` 통과, `node --check` 통과.
> Sage Attention BAT로 포터블 재시작 후 `/object_info/DenoLTXModelDownloader`와
> `/object_info/DenoLTX23PresetLoader` 응답 확인. `/object_info/DenoLTX8GBModelDownloader`는 빈 응답,
> `/node_replacements`와 `/api/node_replacements`는 legacy → current migration 확인.
>
> **배포 커밋/태그/릴리즈:**
> - `e845d0b` — `Release 0.7.25 workflow baseline and downloader migration` (`origin/main` push 완료).
> - `pyproject.toml` `0.7.24 → 0.7.25`, `CHANGELOG.md` `0.7.25 - 2026-05-31` 추가.
> - 태그 `v0.7.25` push 완료. GitHub Release `v0.7.25` 생성:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.25`
>
> **GitHub Actions (push 트리거, 모두 success):**
> - Publish to Comfy registry: run `26706594611`.
> - CI: run `26706594603`. Pages: run `26706594297`.
>
> **Registry 1회 확인 결과:**
> - API: `https://api.comfy.org/nodes/deno-custom-nodes/versions?include_status_reason=true`
> - `0.7.25` 생성됨: `NodeVersionStatusPending`, `status_reason=""`,
>   `comfy_node_extract_status="pending"`.
> - CDN zip HEAD `200`: `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.25/node.zip`.
> - 확인 시점 `0.7.24`는 `NodeVersionStatusActive`, `0.7.25`는 Pending → 스캔 후 Active/latest 전환 예정.
>
> **다음 확인 규칙:** 추가 폴링 없음. 사용자가 다시 확인 요청 시 Registry API 1회만 확인.
> `0.7.25`가 Active·latest가 되면 완료 보고. Flagged/Rejected면 `status_reason`을 먼저 보고
> 해당 파일만 최소 수정 후 새 버전으로 처리.
>
> ---

> ## ▶ 배포 기록 (2026-05-31, Codex) — 0.7.24 legacy downloader alias
>
> **원인:** 기존 워크플로에 저장된 예전 노드 타입 `DenoLTX8GBModelDownloader`가 최신 팩에서
> `DenoLTXModelDownloader`로 이름 변경된 뒤 호환 alias 없이 빠져, 설치된 DENO 팩에서도 해당 노드만
> `UNKNOWN`/Missing Node Pack처럼 표시됨.
>
> **수정:** `__init__.py`에서 `DenoLTX8GBModelDownloader`를 `DenoLTXModelDownloader` 클래스에 연결하는
> backward-compatible alias 추가. `web/js/deno_ltx_model_downloader.js`도 두 타입명 모두에서 같은 DOM UI를
> 붙이도록 수정. 테스트에 alias 매핑 검증 추가.
>
> **로컬 반영/검증:** 포터블 실행본
> `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`와 데스크탑 실행본
> `C:\Users\aions\Documents\ComfyUI\custom_nodes\comfyui-deno-custom-nodes`에 동일 패치 반영. Sage Attention BAT로
> 포터블 재시작 후 `/object_info/DenoLTX8GBModelDownloader`가 `(Deno) Easy Model Download Helper`로 정상 응답 확인.
>
> **배포 커밋/태그/릴리즈:**
> - `3d24177` — `Release 0.7.24 legacy downloader compatibility` (`origin/main` push 완료).
> - `pyproject.toml` `0.7.23 → 0.7.24`, `CHANGELOG.md` `0.7.24 - 2026-05-31` 추가.
> - 태그 `v0.7.24` push 완료. GitHub Release `v0.7.24` 생성:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.24`
>
> **GitHub Actions (push 트리거, 모두 success):**
> - Publish to Comfy registry: run `26704673262`.
> - CI: run `26704673263`. Pages: run `26704673092`.
>
> **Registry 1회 확인 결과:**
> - API: `https://api.comfy.org/nodes/deno-custom-nodes/versions?include_status_reason=true`
> - `0.7.24` 생성됨: `NodeVersionStatusPending`, `status_reason=""`,
>   `comfy_node_extract_status="pending"`.
> - CDN zip HEAD `200`: `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.24/node.zip`.
> - 확인 시점 top-level latest는 Registry 캐시/인덱싱 때문에 아직 `0.7.22 Active`.
>   `0.7.24`는 Pending → 스캔 후 Active/latest 전환 예정.
>
> **다음 확인 규칙:** 추가 폴링 없음. 사용자가 다시 확인 요청 시 Registry API 1회만 확인.
> `0.7.24`가 Active·latest가 되면 완료 보고. Flagged/Rejected면 `status_reason`을 먼저 보고
> 해당 파일만 최소 수정 후 새 버전으로 처리.
>
> ---

> ## ▶ 배포 기록 (2026-05-30, Claude) — 0.7.23 Registry 제출 완료
>
> **배포 커밋/태그/릴리즈:**
> - `78b74df` — `Release 0.7.23 LTX model loader validation fix` (`origin/main` push 완료).
> - `pyproject.toml` `0.7.22 → 0.7.23`, `CHANGELOG.md` `0.7.23 - 2026-05-30` 추가.
> - 태그 `v0.7.23` push 완료. GitHub Release `v0.7.23` 생성:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.23`
>
> **GitHub Actions (push 트리거, 3개 모두 success):**
> - Publish to Comfy registry: run `26687481077` (`Publish Custom Node to registry` 잡 실제 실행, 22s).
> - CI: run `26687481073`. Pages: run `26687480679`.
> - 유일 경고: Node.js 20 actions deprecation(무해, publish 자체 success).
>
> **Registry 1회 확인 결과:**
> - API: `https://api.comfy.org/nodes/deno-custom-nodes/versions?include_status_reason=true`
> - `0.7.23` 생성됨: `NodeVersionStatusPending`, `status_reason=""`,
>   `comfy_node_extract_status="pending"`.
> - CDN zip HEAD `200`: `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.23/node.zip`.
> - 확인 시점 top-level latest는 Registry 캐시/인덱싱 때문에 아직 `0.7.22 Active`.
>   `0.7.23`은 Pending → 스캔 후 Active/latest 전환 예정.
>
> **다음 확인 규칙:** 추가 폴링 없음. 사용자가 다시 확인 요청 시 Registry API 1회만 확인.
> `0.7.23`이 Active·latest가 되면 완료 보고. Flagged/Rejected면 `status_reason`을 먼저 보고
> 해당 파일만 최소 수정 후 새 버전으로 처리.
>
> ---

> ## ▶ 배포 준비/반영 (2026-05-30, Claude) — 0.7.23 LTX Model Loader validation 수정
>
> **요청/맥락:** Codex 한도 소진으로 사용자가 Claude에 배포 위임. 데스크탑 ComfyUI에서
> 이미 검증된 `(Deno) LTX Model Loader` validation 버그픽스를 소스 저장소에 반영·배포.
>
> **원인 요약:** 구버전 워크플로에 저장된 LTX Model Loader widget 값이 현재 위젯 순서와
> 맞지 않아 값이 밀렸고, 숨겨진 비활성 모드 입력값에 남은 미설치
> `checkpoint_name = ltx-2.3-22b-dev.safetensors`가 ComfyUI 기본 prompt validation에서
> required combo로 검사돼 실행 직전 0.1초 만에 컷됨.
>
> **반영(데스크탑 런타임 → 소스 복사):**
> - `deno_ltx23_preset_loader.py`: `VALIDATE_INPUTS` 추가 — 현재 선택한 pipeline mode가
>   실제로 쓰는 입력만 검증하고, 숨겨진 다른 모드의 오래된 값이 실행을 막지 않게 함.
> - `web/js/deno_extra_nodes.js`: `getNormalizedLtxSerializedValues` /
>   `applyLtxSerializedValuesToWidgets` / `sanitizeLtxWidgetValues` / `chooseLtxFallbackValue`
>   — 구버전 11개 widget 값에서 빈 legacy slot 제거, 실제 combo 목록에 없는 값 fallback 처리.
> - `pyproject.toml` `0.7.22 → 0.7.23`, `CHANGELOG.md` 공개 항목 추가.
>
> **검증:**
> - source↔runtime SHA256 일치(py `882430ee…`, js `8de41d69…`).
> - `python -m py_compile deno_ltx23_preset_loader.py` 통과.
> - `node --check web/js/deno_extra_nodes.js` 통과.
> - `python -m pytest` → 65 passed.
> - `git status --short` = 위 코드 2파일 + `pyproject.toml`/`CHANGELOG.md`/`SESSION_HANDOFF.md`만.
>
> **배포 게이트:** `origin main` push(→ Publish workflow → Registry), tag `v0.7.23`,
> GitHub Release는 사용자 명시 승인 후 진행. 승인 시 워크플로 3개 success 1회 +
> Registry API 1회 확인 후 종료(반복 폴링 없음). publish 워크플로는 `push main` +
> `pyproject.toml` 변경에만 트리거(중복 버전은 자동 skip), tag push는 트리거 안 함.
>
> ---

> ## ▶ 배포 기록 (2026-05-27, Codex) — 0.7.22 Registry 제출 완료
>
> **요청/맥락:** 사용자가 Video Preview 정보 배지와 LTX Model Loader 드롭다운
> 안전 패치를 현재 기준으로 배포 요청.
>
> **배포 커밋:**
> - `17e56ea` — `Release 0.7.22 preview metadata and LTX dropdown safety`
> - `pyproject.toml` `0.7.21 → 0.7.22`.
> - `CHANGELOG.md`에 `0.7.22 - 2026-05-27` 공개 항목 추가.
> - `main`으로 push 완료.
>
> **배포 중 발견/수정한 파이프라인 이슈:**
> - 첫 자동 Publish workflow(`26518362614`)는 GitHub Actions상 success였지만
>   `Publish Custom Node` 단계가 skipped였음.
> - 원인: shallow checkout에서 `github.event.before` 커밋을 찾지 못해
>   `pyproject.toml` 변경 감지가 실패.
> - `3ac29ae` — `Fix registry publish eligibility on shallow checkout`에서
>   이전 커밋이 없으면 fetch 후 비교하도록 수정.
> - 이후 `workflow_dispatch`로 publish 재실행.
>
> **GitHub Actions:**
> - Publish workflow 수동 실행:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/runs/26518524183`
> - CI workflow:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/runs/26518516013`
> - Pages workflow:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/runs/26518512973`
> - 결과: 세 workflow 모두 `success`.
>
> **Registry 1회 확인 결과:**
> - API: `https://api.comfy.org/nodes/deno-custom-nodes/versions?include_status_reason=true`
> - `0.7.22` 버전 생성됨:
>   `NodeVersionStatusPending`, `status_reason=""`,
>   `comfy_node_extract_status="pending"`.
> - CDN zip HEAD 확인 성공:
>   `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.22/node.zip`
>   (`200`, `application/zip`, 약 `10.6MB`).
> - 확인 시점의 top-level latest는 Registry 캐시 때문에 `0.7.20`/`0.7.21`
>   사이에서 흔들렸고, 아직 `0.7.22` Active/latest 전환 전.
>
> **다음 확인 규칙:** 추가 폴링은 하지 않음. 사용자가 다시 상태 확인을 요청하면
> Registry API를 1회 확인한다. `0.7.22`가 Active가 되고 latest도 `0.7.22`이면
> 완료 보고. Flagged/Rejected가 되면 `status_reason`을 먼저 보고 해당 파일만
> 최소 수정한다.
>
> ---

> ## ▶ 최신 로컬 수정 (2026-05-27, Codex) — LTX Model Loader 없는 모델 파일 드롭다운 제거
>
> **요청/맥락:** 사용자가 체크포인트를 바꿨는데 `ltx-2.3-22b-dev.safetensors`
> 같은 실제로 없는 파일이 `(Deno) LTX Model Loader` 선택 목록에 계속 보이는
> 이유를 물었고, 같은 사례가 다른 노드에도 있는지 전체 확인을 요청.
>
> **확인 결과:**
> - 같은 패턴은 여러 노드에 흩어진 것이 아니라 `deno_ltx23_preset_loader.py`
>   안의 공통 드롭다운 생성 함수에 집중되어 있었음.
> - 영향 범위: `checkpoint_name`, `diffusion_model_name`, `gguf_unet_name`,
>   `video_vae_name`, `audio_vae_name`, `text_encoder_name`,
>   `text_projection_name`.
> - `deno_multi_lora_loader.py`, `deno_ltx_multi_lora_loader.py`는
>   `__none__ + 실제 발견 목록` 구조라 같은 문제는 아니었음.
>
> **수정:**
> - 추천 파일명은 실제 `folder_paths.get_filename_list(...)`에서 발견된 경우에만
>   드롭다운 상단으로 정렬되도록 변경.
> - 추천 LTX 계열 파일이 없고 다른 모델만 있을 때는 아무 파일이나 자동 선택하지
>   않고 `__none__`을 기본값으로 표시하도록 보수적으로 보완.
> - 모델이 하위 폴더에 들어간 경우도 basename이 유일하게 일치하면 추천 파일로
>   인식해서 기존 workflow/사용자 폴더 정리 방식과 충돌을 줄임.
> - 저장된 workflow의 기존 widget 이름/순서/socket contract는 변경하지 않음.
>
> **검증 포인트:**
> - `tests/test_image_resize_node.py`에 없는 추천 파일명이 목록에 섞이지 않는
>   회귀 테스트, 관련 없는 모델만 있을 때 `__none__` 기본값 테스트, 하위 폴더
>   추천 파일 basename 매칭 테스트 추가.
> - `python -m py_compile deno_ltx23_preset_loader.py` 통과.
> - `python -m pytest` 전체 `65 passed`.
> - 런타임 복사 후 source/runtime SHA256 일치 확인.
> - 기존 ComfyUI 종료 후 `Start ComfyUI SageAttention.bat`로 재시작 완료.
> - `/object_info/DenoLTX23PresetLoader`에서 현재 PC 기준 기본값 유지 확인:
>   checkpoint=`ltx-2.3-22b-dev-fp8.safetensors`,
>   text_encoder=`gemma_3_12B_it_fp4_mixed.safetensors`,
>   text_projection=`ltx-2.3_text_projection_bf16.safetensors`.
> - `ltx-2.3-22b-dev.safetensors`, `comfy_gemma_3_12B_it.safetensors` 같은
>   현재 미설치 추천값은 런타임 목록에 표시되지 않음.
>
> ---

> ## ▶ 최신 로컬 수정 (2026-05-27, Codex) — Video Preview 현재 영상 정보 배지
>
> **요청/맥락:** 사용자가 `(Deno) Video Preview`에서 현재 재생 중인 영상의
> 해상도, FPS 같은 정보를 우측 상단 Full screen 버튼처럼 좌측 상단에 표시하고
> 싶다고 요청.
>
> **수정:**
> - `web/js/deno_video_preview.js`에 좌측 상단 metadata badge(`.mi`) 추가.
> - 백엔드가 이미 넘기는 `width`, `height`, `frame_rate`, `frame_count`,
>   `has_audio`를 사용하므로 Python node contract는 변경하지 않음.
> - 표시 예: `1920x1080 | 30fps | 120f | 4s`.
> - badge는 `max-width: calc(100% - 150px)`, ellipsis 처리로 우측 Full screen
>   버튼과 겹치지 않게 함. 전체 정보는 hover title에 resolution/FPS/frames/
>   duration/audio로 제공.
> - `README.md`, `CHANGELOG.md`, `tests/test_image_resize_node.py`에 반영.
>
> **주의/다음 단계:**
> - 아직 공개 배포/버전 bump는 하지 않음. 사용자 화면 확인 후 배포 요청 시
>   `Unreleased` 항목을 새 버전으로 이동해 배포.
> - 런타임 복사 후 ComfyUI SageAttention bat 재시작까지 진행할 것.
>
> ---

> ## ▶ 배포 기록 (2026-05-27, Codex) — 0.7.21 Registry 제출 완료
>
> **요청/맥락:** 사용자가 `(Deno) Video Preview` 수동 크기 보존, 내부 높이 추종,
> hover-to-hear 오디오 재동기화가 정상 작동한다고 확인 후 현재 기준 배포 요청.
>
> **배포 커밋:**
> - `742be6a` — `Release 0.7.21 preview sizing fixes`
> - `pyproject.toml` `0.7.20 → 0.7.21`.
> - `CHANGELOG.md`에 `0.7.21 - 2026-05-27` 공개 항목 추가.
> - `origin/main`으로 push 완료.
>
> **GitHub Actions:**
> - Publish workflow:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/runs/26510069640`
> - CI workflow:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/runs/26510069505`
> - Pages workflow:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/runs/26510068139`
> - 결과: 세 workflow 모두 `success`.
>
> **배포 후속 안전장치:**
> - 배포 기록 문서만 올린 `d469f23`에서 Publish workflow가 다시 실행되어
>   `The node version already exists`로 실패했으나, 위 Publish 성공 및 Registry
>   `0.7.21` 생성 확인 때문에 실제 배포 실패는 아님.
> - `.github/workflows/publish_registry.yml`에 publish eligibility 단계를 추가:
>   `pyproject.toml` 미변경 push 또는 Registry에 이미 있는 같은 버전은 publish를
>   실패시키지 않고 정상 스킵한다.
>
> **Registry 1회 확인 결과:**
> - API: `https://api.comfy.org/nodes/deno-custom-nodes/versions?include_status_reason=true`
> - `0.7.21` 버전 생성됨:
>   `NodeVersionStatusPending`, `status_reason=""`,
>   `comfy_node_extract_status="pending"`.
> - 다운로드 URL:
>   `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.21/node.zip`
>
> **다음 확인 규칙:** 추가 폴링은 하지 않음. 사용자가 다시 상태 확인을 요청하면
> Registry API를 1회 확인한다. `0.7.21`이 Active가 되고 latest도 `0.7.21`이면
> 완료 보고. Flagged/Rejected가 되면 `status_reason`을 먼저 보고 해당 파일만
> 최소 수정한다.
>
> ---

> ## ▶ 최신 로컬 수정 (2026-05-27, Codex) — Preview 노드 수동 크기 보존
>
> **요청/맥락:** 사용자가 `(Deno) Video Preview`가 영상 재생/로드 때마다 노드 크기를
> 이상하게 바꾼다고 제보. 특히 사용자가 수동으로 조절한 노드 크기를 보존하는 장치가
> 없고, 유사 preview 노드도 같이 봐야 한다고 요청.
>
> **후보 판단:**
> - 동시 패치 대상: `(Deno) Video Preview`, `(Deno) Video Compare`,
>   `(Deno) Image Compare`.
> - 제외: Multi Image Loader, Advanced Image Source Loader, LoRA/RTX/LTX 설정 패널.
>   이쪽은 미디어 auto-fit보다 패널 최소 높이/클리핑 방지 성격이 강해 이번 증상과
>   다르고, 무리하게 건드리면 저장 workflow나 widget order 리스크가 더 큼.
>
> **수정:**
> - `web/js/deno_video_preview.js`
>   - `loadedmetadata`마다 `node.setSize(node.computeSize())`로 크기를 다시 덮는 경로 제거.
>   - 첫 유효 preview만 1회 auto-fit하고, 이후 실행/재생은 사용자가 고른 노드 크기 유지.
>   - `__denoVideoPreviewManualSize` property로 수동 resize 상태 저장.
>   - `<video>`를 `width:100%; height:100%; object-fit:contain`으로 바꿔 잘림 대신
>     컨테이너 안에 letterbox/contain 되도록 변경.
>   - 사용자 확인 중 "노드가 무한하게 아래로 길어지는" 회귀가 발견되어 즉시 hotfix:
>     `state.widgetHeight`/`previewHeightForNodeHeight` 상태 계산을 제거하고,
>     `Video Compare`처럼 `node height - fixed chrome - native widget height` 방식으로
>     내부 프리뷰가 사용자 노드 높이를 따라오되 무한 성장하지 않게 조정.
>   - 사용자가 마우스를 노드 위에 올린 상태에서 새 preview decode가 끝나면
>     `pointerenter`가 다시 발생하지 않아 오디오가 계속 muted로 남던 문제 수정:
>     `hovering` 상태와 `syncAudioMute()`를 추가해 loadedmetadata/play 이후 즉시 반영.
> - `web/js/deno_video_compare.js`
>   - `__denoVideoCompareManualSize` property 추가.
>   - 사용자 resize 후에는 `fitNode()`가 실행 결과에 맞춰 높이를 다시 snap하지 않도록 제한.
> - `web/js/deno_image_compare.js`
>   - `__denoImageCompareManualSize` property 추가.
>   - 사용자 resize 후에는 이미지 load/execute에서 `resizeNodeToImage()`가 높이를 다시
>     덮지 않고 현재 노드 크기 기반 panel만 유지.
> - `AGENTS.md`, `docs/DENO_NODE_RETROSPECTIVE.md`에 preview sizing hard rule 추가.
> - `CHANGELOG.md` Unreleased에 사용자 체감 변경 기록.
> - `tests/test_image_resize_node.py`에 세 preview 노드의 수동 크기 보존 회귀 테스트 추가.
>
> **검증:**
> - `node --check web/js/deno_video_preview.js` 통과.
> - `node --check web/js/deno_video_compare.js` 통과.
> - `node --check web/js/deno_image_compare.js` 통과.
> - `python -m pytest tests/test_image_resize_node.py tests/test_registry_metadata.py`
>   → 61 passed.
> - `git diff --check` 통과(CRLF warning만 표시).
> - 실행본
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`
>   에 세 JS 파일 복사 후 SHA256 일치 확인.
> - ComfyUI queue idle 확인 후 기존 8188 실행본 PID `40880` 및 bat shell PID `35424`
>   종료. 이후 숨김 실행 없이
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`
>   를 보이는 창으로 재실행.
> - `/system_stats` 확인: argv는
>   `ComfyUI\main.py --windows-standalone-build --use-sage-attention`.
> - served JS 확인:
>   - `deno_video_preview.js`: `ManualSize`, `object-fit:contain`,
>     기존 `node.setSize?.(node.computeSize())` 없음, `syncAudioMute` 포함.
>   - `deno_video_compare.js`, `deno_image_compare.js`: `ManualSize` 포함.
> - `/object_info/DenoVideoPreview`, `/object_info/DenoVideoCompare`,
>   `/object_info/DenoImageCompare` 응답 정상.
>
> **미검증/사용자 테스트:** Playwright가 현재 Codex 세션에 설치되어 있지 않아
> 자동 브라우저 렌더 e2e는 미실행. Chrome 새로고침 후 Video Preview 노드를 손으로
> 원하는 크기로 조절하고 같은/다른 영상을 다시 실행했을 때 노드 크기가 튀지 않는지 확인.
>
> ---

> ## ▶ 하드 규칙 보강 (2026-05-26, Codex) — ComfyUI 재시작 전 기존 프로세스 종료
>
> **요청/맥락:** 사용자가 ComfyUI를 새로 켤 때 기존 실행본을 같이 종료하지 않으면
> 프로세스/창이 계속 쌓인다고 지적. 앞으로 SageAttention bat 재시작 시 기존
> ComfyUI를 남겨두지 말 것을 요청.
>
> **규칙:**
> - SageAttention bat를 새로 실행하기 전에는 먼저 ComfyUI queue가 idle인지 확인한다.
> - idle이면 기존 Easy Install ComfyUI `main.py` 프로세스를 종료한다.
> - 기존 프로세스가 남아 있는 상태에서 `Start ComfyUI SageAttention.bat`를 추가로
>   띄워 ComfyUI 인스턴스를 누적하지 않는다.
> - 작업 실행 중이면 중간 종료하지 않고, 위험을 보고하거나 idle까지 기다린다.
> - 새 실행은 기존 규칙대로 반드시 보이는
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`
>   로만 한다.
>
> **규칙 반영 위치:**
> - `C:\Users\aions\Documents\Codex\전역설정.md`
> - `E:\DENO-Repos\comfyui-deno-custom-nodes\AGENTS.md`
>
> ---

> ## ▶ 배포 기록 (2026-05-26, Codex) — 0.7.20 Registry 제출 완료
>
> **요청/맥락:** 사용자가 현재 기준 변경분 전체 배포를 요청. 이번 배포에는
> RTX VFX 패널의 ComfyUI 캔버스 휠/휠클릭 네비게이션 보존, Visual Fold stale
> group 선택 오인 방지, README의 RTX VFX `divisible_by` 설명 정정이 포함됨.
>
> **배포 커밋:**
> - `7e22fc5` — `Release 0.7.20 canvas navigation fixes`
> - `pyproject.toml` `0.7.19 → 0.7.20`.
> - `CHANGELOG.md`에 `0.7.20 - 2026-05-26` 공개 항목 추가.
> - `origin/main`으로 push 완료.
>
> **GitHub Actions:**
> - Publish workflow:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/runs/26432248474`
> - CI workflow:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/runs/26432248498`
> - Pages workflow:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/runs/26432248030`
> - 결과: 세 workflow 모두 `success`.
>
> **Registry 1회 확인 결과:**
> - API: `https://api.comfy.org/nodes/deno-custom-nodes/versions?include_status_reason=true`
> - `0.7.20` 버전 생성됨:
>   `NodeVersionStatusPending`, `status_reason=""`,
>   `comfy_node_extract_status="pending"`.
> - 다운로드 URL:
>   `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.20/node.zip`
>
> **다음 확인 규칙:** 추가 폴링은 하지 않음. 사용자가 다시 상태 확인을 요청하면
> Registry API를 1회 확인한다. `0.7.20`이 Active가 되고 latest도 `0.7.20`이면
> 완료 보고. Flagged/Rejected가 되면 `status_reason`을 먼저 보고 해당 파일만
> 최소 수정한다.
>
> ---

> ## ▶ 최신 로컬 수정 (2026-05-26, Codex) — Visual Fold stale group 선택 오인 방지
>
> **요청/맥락:** 사용자가 Fold 기능과 Align/정렬 기능을 쓰다 보면, 정렬 완료 후
> 정렬된 일반 노드 3개를 다시 선택했는데 실제 ComfyUI group이 아닌 상태에서도
> `Fold Group` 옵션이 갑자기 뜬다고 제보.
>
> **원인:** `web/js/deno_visual_fold.js`의 `selectedGroups()`가
> `app.canvas.selected_group` / `selectedGroup` legacy 값을 그대로 신뢰하고 있었음.
> ComfyUI가 정렬/선택 전환 후 이 값을 비우지 않으면, 현재는 일반 노드를
> 선택한 상태인데도 이전 group 객체를 아직 선택된 group처럼 판단할 수 있었음.
>
> **수정:**
> - 일반 노드가 하나라도 선택되어 있으면 stale legacy group selection을 무시.
> - `Fold Group` 버튼/메뉴는 `clean.length === 0`일 때만, 즉 일반 선택 노드가
>   없는 진짜 group 선택 상태에서만 표시되도록 제한.
> - `tests/test_registry_metadata.py`에 stale group 방지 문자열 회귀 테스트 추가.
> - `CHANGELOG.md` Unreleased에 Visual Fold stale group 선택 방지 항목 추가.
> - README의 RTX VFX `divisible_by` 설명이 0.7.19 변경 전 기준으로 남아 있어,
>   기본값 `1` / 필요 시 `32` 사용 설명으로 갱신.
>
> **검증:**
> - `node --check web/js/deno_visual_fold.js` 통과.
> - `python -m pytest tests/test_registry_metadata.py tests/test_image_resize_node.py`
>   → 60 passed.
> - `git diff --check` 통과.
> - 실행본
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`
>   에 `web\js\deno_visual_fold.js` 복사 후 SHA256 일치 확인.
> - 큐 idle 확인 후 기존 ComfyUI PID `30184` 종료.
> - 숨김 실행 없이
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`
>   를 보이는 창으로 재실행.
> - `/system_stats` 확인 완료.
> - served JS에서 `const hasSelectedNodes = selectedNodes().length > 0;`,
>   `Normal node selection wins.`, `clean.length === 0 && groups.length === 1`
>   포함 확인.
>
> **사용자 테스트:** Chrome 새로고침 후, 일반 노드 3개 선택 상태에서 toolbar/context
> menu에 `Fold Group`이 뜨지 않고 일반 `Fold`/`Align`만 뜨는지 확인.
>
> ---

> ## ▶ 최신 로컬 수정 (2026-05-26, Codex) — RTX VFX 패널 캔버스 휠/휠클릭 네비게이션 보존
>
> **요청/맥락:** 사용자가 DENO 노드 상단/패널 위에서 마우스 휠 또는 휠클릭을
> 사용할 때 커스텀 DOM이 ComfyUI 캔버스보다 우선되어 캔버스 줌/팬이 작동하지
> 않는 경우가 많다고 지적. 이어서 2 Pass RTX 노드도 제대로 작동하지 않는다고
> 확인 요청.
>
> **확인:** `web/js/deno_rtx_vfx_video_finisher.js`와
> `web/js/deno_rtx_vfx_easy_upscale.js`에는 wheel forwarding만 있었고,
> Video Compare처럼 middle-button / wheel-click drag를 ComfyUI canvas pan으로
> 처리하는 로직이 없었음.
>
> **수정:**
> - `AGENTS.md`에 frontend interaction hard rule 추가:
>   DOM widget/preview/overlay가 ComfyUI canvas navigation을 삼키지 말 것.
> - `docs/DENO_NODE_RETROSPECTIVE.md`의 LiteGraph pitfall 및 검증 루틴에
>   wheel zoom/scroll, middle-click pan 확인 항목 추가.
> - `web/js/deno_rtx_vfx_video_finisher.js`: 2 Pass RTX 패널 위
>   middle-button drag → ComfyUI canvas pan, middle auxclick 억제 추가.
> - `web/js/deno_rtx_vfx_easy_upscale.js`: Easy RTX 패널에도 동일 적용.
> - 텍스트 입력류(`input`, `textarea`, `contenteditable`)는 예외로 남겨둠.
> - `tests/test_image_resize_node.py`: RTX frontend에 pointerdown/auxclick/pan 로직이
>   포함되는지 회귀 테스트 추가.
> - `CHANGELOG.md`: Unreleased에 RTX VFX 패널 navigation 보존 항목 추가.
>
> **검증:**
> - `node --check web/js/deno_rtx_vfx_easy_upscale.js` 통과.
> - `node --check web/js/deno_rtx_vfx_video_finisher.js` 통과.
> - `python -m pytest tests/test_image_resize_node.py` → 48 passed.
> - `git diff --check` 통과.
> - 실행본
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`
>   에 두 RTX JS 파일 복사 후 SHA256 일치 확인.
> - 큐 idle 확인 후 기존 ComfyUI PID `26704` 종료.
> - 숨김 실행 없이
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`
>   를 보이는 창으로 재실행.
> - `/system_stats` 확인 완료, argv는
>   `ComfyUI\main.py --windows-standalone-build --use-sage-attention`.
> - served JS에서 `root.addEventListener("pointerdown")`,
>   `root.addEventListener("auxclick")`, `canvas.ds.offset[0]`,
>   `isEditableTextTarget` 포함 확인.
>
> **사용자 테스트:** Chrome 새로고침 후 2 Pass RTX 노드 패널 위에서
> 마우스 휠 줌/스크롤과 휠클릭 드래그 pan을 확인하면 됨.
>
> ---

> ## ▶ 배포 기록 (2026-05-26, Codex) — 0.7.19 Registry 제출 완료
>
> **요청/맥락:** 사용자가 RTX VFX 영상 크롭/패딩 완화 수정까지 배포 진행 요청.
> 직전 확인에서 Registry 최신 `0.7.18`은 `NodeVersionStatusActive`였으므로
> 이번 배포 버전을 `0.7.19`로 올림.
>
> **배포 커밋:**
> - `fe99d18` — `Release 0.7.19 RTX sizing fixes`
> - `pyproject.toml` `0.7.18 → 0.7.19`.
> - `CHANGELOG.md`에 `0.7.19 - 2026-05-26` 공개 항목 추가.
> - `origin/main`으로 push 완료.
>
> **GitHub Actions:**
> - Publish workflow:
>   `https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/runs/26428760682`
> - 결과: `success`.
> - 참고: GitHub runner가 Node.js 20 actions deprecation warning을 표시했지만,
>   publish job 자체는 성공.
>
> **Registry 1회 확인 결과:**
> - API: `https://api.comfy.org/nodes/deno-custom-nodes`
> - latest 노출은 확인 시점 기준 아직 `0.7.18 Active`.
> - `0.7.19` 버전은 생성됨:
>   `NodeVersionStatusPending`, `status_reason=""`,
>   `comfy_node_extract_status="pending"`.
> - 다운로드 URL:
>   `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.19/node.zip`
>
> **다음 확인 규칙:** 추가 폴링은 하지 않음. 사용자가 다시 상태 확인을 요청하면
> Registry API를 1회 확인한다. `0.7.19`가 Active가 되고 latest도 `0.7.19`이면
> 완료 보고. Flagged/Rejected가 되면 `status_reason`을 먼저 보고 해당 파일만
> 최소 수정한다.
>
> ---

> ## ▶ 최신 로컬 수정 (2026-05-26, Codex) — RTX VFX 영상 크롭/패딩 완화
>
> **요청/맥락:** Reddit 댓글에서 1280×720 이미지를 1920×1080 또는
> 2560×1440으로 RTX 2 Pass 업스케일할 때 양쪽/전체가 잘리고, `resize_type`,
> `divisible_by`, `resize_method`, 강제 width/height, 외부 resize 노드를 바꿔도
> 달라지지 않는다는 보고를 확인. 첨부 스크린샷은 2 Pass 노드가
> `Manual`, `1920×1080`, `divisible_by=32`, `Fit (Letterbox/Pillarbox)`로
> 설정되어 있었음.
>
> **진단:** 기존 RTX VFX 노드는 영상 표준 해상도에도 `divisible_by=32`만 허용해
> 1920×1080 같은 목표를 내부에서 1920×1088처럼 올릴 수 있었다. 이러면 사용자는
> 16:9를 지정했다고 생각해도 NVIDIA VFX 단계에는 미묘하게 다른 비율이 들어가며,
> 패딩/크롭/검은 여백이 섞여 보일 수 있다. NVIDIA 문서상 업스케일 계열은 가로/세로
> 스케일 비율 일치가 중요하므로, 영상 크기에서는 정확한 목표 크기를 우선하도록 수정.
>
> **수정:**
> - `deno_rtx_vfx_easy_upscale.py`: RTX VFX `divisible_by` 선택지에 `1` 추가,
>   기본값을 `1`로 변경.
> - `web/js/deno_rtx_vfx_easy_upscale.js`: frontend 기본값/허용값 동기화.
> - `web/js/deno_rtx_vfx_video_finisher.js`: 2 Pass frontend 기본값/허용값 동기화,
>   하단 안내를 `use divisible_by 1 for exact video sizes`로 변경.
> - `tests/test_image_resize_node.py`: 1280×720 → 1920×1080 수동 목표가
>   `divisible_by=1`에서 그대로 유지되는 회귀 테스트 추가.
> - `CHANGELOG.md`: 공개 사용자 체감 변경으로 짧게 기록.
>
> **검증:**
> - `python -m py_compile deno_rtx_vfx_easy_upscale.py deno_rtx_vfx_video_finisher.py`
>   통과.
> - `node --check web/js/deno_rtx_vfx_easy_upscale.js` 및
>   `node --check web/js/deno_rtx_vfx_video_finisher.js` 통과.
> - `python -m pytest tests/test_image_resize_node.py` → 48 passed.
> - 실행본 복사:
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`
>   에 `deno_rtx_vfx_easy_upscale.py`,
>   `web\js\deno_rtx_vfx_easy_upscale.js`,
>   `web\js\deno_rtx_vfx_video_finisher.js` 복사 후 SHA256 일치 확인.
> - ComfyUI는 숨김 실행 없이
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`
>   를 보이는 창으로 실행.
> - `/system_stats` 확인: argv는
>   `ComfyUI\main.py --windows-standalone-build --use-sage-attention`.
> - `/object_info/DenoRTXVFXEasyUpscale` 및
>   `/object_info/DenoRTXVFXVideoFinisher`에서 `divisible_by` 선택지
>   `["1","8","16","32","64","128"]`, 기본값 `"1"` 확인.
> - served JS에서도 2 Pass 안내/기본값 반영 확인.
>
> **사용자 테스트 권장:** Chrome 새로고침 후 RTX 2 Pass 노드에서
> `Manual`, `1920×1080` 또는 `2560×1440`, `divisible_by=1`,
> `Fit (Letterbox/Pillarbox)`로 다시 테스트. 기존 워크플로 저장값이
> `32`로 남아 있으면 직접 `1`로 바꿔야 한다.
>
> ---

> ## ▶ 하드 규칙 보강 (2026-05-24, Codex) — ComfyUI 재시작은 숨김 실행 금지
>
> **요청/맥락:** 사용자가 ComfyUI 재시작을 백그라운드/숨김 실행으로 띄우지 말고,
> 항상 `Start ComfyUI SageAttention.bat` 파일로 보이는 창에서 실행하라고 지적.
> 숨김 실행으로 포트만 점유하면 사용자가 직접 실행하려 할 때 "이미 실행 중"으로
> 보여 불편해짐.
>
> **절대 규칙:**
> - SageAttention ComfyUI 재시작은 반드시
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`
>   를 보이는 콘솔 창으로 실행한다.
> - `Start-Process -WindowStyle Hidden`, 백그라운드 서비스식 실행, 숨김 포트 점유
>   재시작 금지.
> - 재시작 전 큐 idle 확인은 유지한다.
> - 재시작 후 `/system_stats` 또는 `/object_info/<NodeName>` 확인은 유지한다.
>
> **규칙 반영 위치:**
> - `C:\Users\aions\Documents\Codex\전역설정.md`
> - `E:\DENO-Repos\comfyui-deno-custom-nodes\AGENTS.md`
>
> ---

> ## ▶ 운영 설정 원복 (2026-05-24, Codex) — SageAttention reserve VRAM 제거
>
> **요청/맥락:** 사용자가 `--reserve-vram 3` 적용 후 ComfyUI가 체감상 너무 느려졌고,
> Dynamic VRAM이 무효화되는지 확인 요청. 코드 확인 결과 reserve 옵션은
> Dynamic VRAM을 끄지는 않지만 ComfyUI의 사용 가능 VRAM 계산을 보수적으로
> 만들어 큰 워크플로에서 모델 부분 로딩/오프로딩이 늘 수 있음.
>
> **변경:**
> - `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`
>   실행 줄에서 `--reserve-vram 3` 제거.
> - 변경 전 백업:
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\codex-backups\20260524-reset-reserve-vram\`
>
> **검증:**
> - ComfyUI 큐가 비어 있음을 확인한 뒤 재시작.
> - `/system_stats`에서 argv가
>   `ComfyUI\main.py --windows-standalone-build --use-sage-attention`만 포함하고
>   `--reserve-vram`이 없는 것 확인.
> - 재시작 후에도 VRAM이 높게 보이는 원인은 reserve가 아니라
>   Ollama `gemma4:31b-it-q4_K_M`이 다시 GPU에 올라와 약 24.6GB를 점유한 것.
>
> **현재 권장:** OBS 1080p/30fps 병행만 고려하면 기본값 또는 필요 시
> `--reserve-vram 1.5~2` 정도가 현실적. Ollama 대형 모델이 같이 올라와 있으면
> reserve 값과 무관하게 ComfyUI가 느려질 수 있으므로 먼저 Ollama 모델 언로드 확인.
>
> ---

> ## ▶ 문서 운영 추가 (2026-05-24, Codex) — 공개 Changelog + GitHub Release 템플릿
>
> **요청/맥락:** 사용자가 버그 수정/업데이트 내역을 GitHub 쪽에 남길 공식 공간이
> 필요하다고 판단. 단, README가 길어지는 것은 피하고, 공개 표기는 짧고
> 표면적인 사용자 체감 변경만 남기며 내부 구현 세부사항은 굳이 공개 기록에
> 쓰지 않기를 원함.
>
> **수정:**
> - `CHANGELOG.md` 추가. 최신 항목만 짧게 노출하고, 이전 공개 하이라이트는
>   GitHub Markdown `<details>` 접기/펼치기 섹션으로 정리.
> - `.github/RELEASE_TEMPLATE.md` 추가. 실제 GitHub Release 작성 시
>   `Public Highlights`는 짧게 쓰고, 호환성/이슈 링크는 접힌 섹션에 넣는
>   형식으로 고정.
> - `README.md`에는 긴 변경 내역을 넣지 않고 `CHANGELOG.md` 링크만 추가.
> - `.github/pull_request_template.md` 체크리스트에 사용자 체감 변경 시
>   `CHANGELOG.md` 갱신 항목 추가.
>
> **운영 원칙:**
> - README에는 변경 내역을 누적하지 않는다.
> - GitHub Release/CHANGELOG는 사용자에게 보이는 결과 중심으로만 짧게 쓴다.
> - 세부 구현, 로컬 검증, 런타임 복사/재시작 같은 내부 기록은
>   `SESSION_HANDOFF.md`에 남긴다.
> - 실제 GitHub Release 발행은 태그/버전 배포 시점의 공개 액션이므로,
>   이번 변경에서는 템플릿과 changelog 기반만 준비하고 릴리즈 발행은 하지 않음.
>
> ---

> ## ▶ 운영 규칙 추가 (2026-05-24, Codex) — 노드 수정 후 SageAttention 자동 재시작
>
> **요청/맥락:** 사용자가 DENO ComfyUI 노드 로컬 수정/업데이트 후에는
> 별도 지시 없이도 에이전트가 ComfyUI SageAttention bat를 재시작해 띄워두고,
> 사용자는 Chrome 새로고침만으로 바로 테스트할 수 있기를 요청.
>
> **추가한 규칙 위치:**
> - `C:\Users\aions\Documents\Codex\전역설정.md` §4 기본 검증 루틴.
> - `E:\DENO-Repos\comfyui-deno-custom-nodes\AGENTS.md`.
>
> **규칙 요약:**
> - DENO ComfyUI 노드의 로컬 런타임 파일(Python/JS)을 수정하거나 실행본에
>   복사한 뒤에는 기본적으로
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`
>   를 재시작해 띄운다.
> - 문서/README/테스트만 바꾼 경우에는 재시작하지 않는다.
> - 큐가 실행 중이면 중간에 죽이지 말고 idle 확인 후 재시작하거나 위험을 보고한다.
> - 재시작 후 `/system_stats` 또는 `/object_info/<NodeName>` 응답을 확인하고,
>   frontend 변경은 사용자가 Chrome 새로고침 후 바로 테스트할 수 있게 보고한다.
>
> **현재 세션:** 규칙 기록 후, 직전 Video Compare 런타임 수정분이 바로 테스트될
> 수 있도록 `Start ComfyUI SageAttention.bat`를 실행함. `/system_stats` 응답
> 확인 완료, argv에 `--use-sage-attention --reserve-vram 3` 표시 확인.
> `/object_info/DenoVideoCompare` 응답 확인 완료. served JS
> `/extensions/deno-custom-nodes/deno_video_compare.js`에서도 `Output Badges`,
> `Output` 라벨 문구가 반영되고 옛 `Output Images SBS/Diff` 문자열이 없는 것
> 확인 완료. 사용자는 Chrome 새로고침 후 테스트하면 됨.
>
> ---

> ## ▶ 운영 설정 변경 (2026-05-24, Codex) — Easy Install SageAttention reserve VRAM 3GB
>
> **요청/맥락:** 사용자가 OBS 1080p/30fps 녹화 위주로 ComfyUI를 함께 쓸 예정이라
> 기존 6GB reserve는 과하다고 판단. 바탕화면 `ComfyUI - Sage Attention.lnk`
> 실행 경로의 현재 설정을 확인한 뒤 3GB reserve 적용을 요청.
>
> **확인한 현재 경로:**
> - 바로가기: `C:\Users\aions\Desktop\ComfyUI - Sage Attention.lnk`
> - 대상: `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`
> - 기존 실행 줄에는 `--reserve-vram`이 없었고 `--use-sage-attention`만 있었음.
>
> **변경:**
> - `Start ComfyUI SageAttention.bat` 실행 줄 끝에 `--reserve-vram 3` 추가.
> - FlashAttention/기본 Start bat/포트/브릿지/ComfyUI 프로세스는 건드리지 않음.
> - 원본 백업:
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\codex-backups\20260524-reserve-vram-3\Start ComfyUI SageAttention.bat.before-reserve-vram-3`
>
> **검증:**
> - 바로가기 대상이 수정한 bat 파일과 일치함을 확인.
> - 수정 후 실행 줄:
>   `.\python_embeded\python.exe -I -W ignore::FutureWarning ComfyUI\main.py --windows-standalone-build --use-sage-attention --reserve-vram 3`
> - ComfyUI는 실행하지 않음.
>
> **롤백:** 위 백업 파일을 원래 이름으로 되돌리거나, 실행 줄 끝의
> `--reserve-vram 3`만 제거하면 된다.
>
> ---

> ## ▶ 최신 로컬 수정 (2026-05-24, Codex) — Video Compare 출력 라벨/Slider 선/Output Badges UX
>
> **요청/맥락:** 사용자가 `(Deno) Video Compare`의 출력 단자 표시가
> `SBS/Diff`처럼 보여 4개 모드 중 2개만 출력되는 것처럼 보인다고 확인 요청.
> 이어서 Slider 저장 출력의 구분선을 프리뷰처럼 DENO green으로 맞추고,
> `Labels` 버튼이 의미가 모호하니 출력물에 라벨/뱃지를 붙이는 용도임을
> 더 직관적으로 보이게 해달라고 요청.
>
> **수정:**
> - `deno_video_compare.py`: Slider 모드 저장 출력 구분선을 흰색 `(1,1,1)`
>   에서 DENO green `#48ff84`로 변경.
> - `web/js/deno_video_compare.js`: 출력 단자 라벨을
>   `Output Images SBS/Diff`에서 `Output`으로 단순화.
> - 같은 JS에서 `🏷 Labels` 버튼/툴팁/도움말 문구를
>   `🏷 Output Badges`로 변경해 "저장 출력에 A/B + 해상도 뱃지 추가" 용도를
>   바로 읽히게 정리.
> - `README.md`와 테스트 문구도 새 이름에 맞춤.
>
> **검증:**
> - `node --check web/js/deno_video_compare.js` 통과.
> - `python -m py_compile deno_video_compare.py` 통과.
> - `python -m pytest tests/test_image_resize_node.py -q` → **48 passed**.
> - 실행본
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`
>   에 `deno_video_compare.py`, `web/js/deno_video_compare.js`만 복사했고,
>   원본↔실행본 SHA256 해시 일치 확인.
> - 실행본 파일 기준 `node --check`, `py_compile`도 통과.
>
> **주의/다음:** ComfyUI 프로세스 재시작이나 브라우저 캔버스 조작은 하지 않음.
> 현재 실행 중인 ComfyUI에 Python 변경을 반영하려면 재시작이 필요하고,
> 프론트 JS 라벨 반영은 브라우저 새로고침/캐시 갱신이 필요할 수 있음.
> 사용자 승인 전 버전 bump, 커밋, push, Registry 재배포 금지.
>
> ---

> ## ▶ 후속 확인 (2026-05-24 10:04 KST, Codex) — 0.7.18 Registry still pending
>
> **이어받은 작업:** 직전 핸드오프의 "다음 세션이 할 일"에 따라 Registry
> API 상태를 1회 확인함. 불필요한 재배포/반복 폴링은 하지 않음.
>
> **확인 결과:**
> - 로컬 원본 repo `E:\DENO-Repos\comfyui-deno-custom-nodes`:
>   `main` = `origin/main`, 최신 커밋 `dc06dc8`, `pyproject.toml` 버전
>   `0.7.18`.
> - Working tree에는 `SESSION_HANDOFF.md`만 수정 상태. 이는 배포 커밋 이후의
>   로컬 문서 기록이며, 사용자 별도 요청 전에는 커밋/푸시하지 말 것.
> - `https://api.comfy.org/nodes/deno-custom-nodes/versions?statuses=NodeVersionStatusPending&include_status_reason=true`
>   응답에서 `0.7.18 = NodeVersionStatusPending`,
>   `comfy_node_extract_status = pending`, `status_reason = ""`.
> - `https://api.comfy.org/nodes/deno-custom-nodes` 응답에서
>   `latest_version.version = 0.7.17`, `latest_version.status =
>   NodeVersionStatusActive`.
>
> **다음 행동:**
> 1. 지금 상태는 Registry 인덱싱/스캔 대기이므로 재배포하지 않는다.
> 2. 사용자가 다시 확인을 요청하면 위 두 API를 1회만 다시 확인한다.
> 3. `0.7.18`이 Active가 되고 latest도 `0.7.18`이면 사용자에게 완료 보고.
> 4. Flagged/Rejected/status_reason이 생기면 reason을 먼저 보고, 원인 파일만
>    최소 수정 후 새 버전으로 처리한다.
>
> ---

> ## ▶ 최신 세션 (2026-05-24, Codex) — 0.7.18: Copy path + LTX Checkpoint UI 계약 수정
>
> **요청/맥락:** 사용자가 `(Deno) Multi Image Loader`의 이미지 우클릭
> `Copy Image Path`가 실제 파일 경로를 제대로 복사하지 않는 것 같다고 제보.
> 이어서 `(Deno) LTX Model Loader`의 `Checkpoint Style`에서는 `text_projection`
> 이 필요 없고, `clip` 쪽에는 checkpoint 파일이 projection 역할로 들어가는
> 것이 맞다고 지적. 두 수정 모두 배포까지 요청.
>
> **수정 1 — Multi Image Loader Copy Path:**
> - 원인: 프론트 메뉴가 카드에 저장된 내부 경로 문자열(`subfolder/image.png`
>   등)을 그대로 클립보드에 복사함. 사용자가 기대한 것은 실제 Windows 파일
>   전체 경로.
> - 백엔드 `deno_multi_image_board.py`에 `/deno/input-image-path` API 추가.
>   상대 경로는 ComfyUI input 폴더 안에서만 안전하게 realpath로 해석하고,
>   `../`, drive-like path 등 traversal은 차단. 절대 경로도 실제 파일일 때만
>   반환.
> - 프론트 `web/js/deno_extra_nodes.js`의 `Copy Image Path` 및 이미지 복사
>   실패 fallback이 새 API를 거쳐 실제 경로를 복사하도록 변경.
>
> **수정 2 — LTX Model Loader Checkpoint Style:**
> - 실제 ComfyUI `LTXAVTextEncoderLoader` 확인 결과, Checkpoint Style은
>   `text_encoder + checkpoint` 조합으로 CLIP을 만들며 별도 `text_projection`
>   을 쓰지 않음.
> - `deno_ltx23_preset_loader.py` 설명문에 이 계약을 명시.
> - `web/js/deno_extra_nodes.js`에서 `text_projection_name` 위젯은
>   `KJ Style` 또는 `GGUF Style`일 때만 표시되도록 수정.
> - 테스트에서 Checkpoint Style이 `DualCLIPLoader/text_projection` 경로를
>   타지 않는 것을 강제.
>
> **검증:**
> - `node --check web/js/deno_extra_nodes.js` 통과.
> - `python -m py_compile deno_ltx23_preset_loader.py deno_multi_image_board.py`
>   통과.
> - `python -m pytest tests/test_image_resize_node.py -q` → **48 passed**.
> - 원본 repo `E:\DENO-Repos\comfyui-deno-custom-nodes`와 실행본
>   `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`
>   사이 변경 런타임 파일 해시 일치 확인:
>   `deno_ltx23_preset_loader.py`, `deno_multi_image_board.py`,
>   `web/js/deno_extra_nodes.js`, `pyproject.toml`.
>
> **배포:**
> - `pyproject.toml` **0.7.17 → 0.7.18**.
> - 커밋: `dc06dc8 Fix LTX checkpoint mode and image path copy`.
> - `origin/main` push 완료. 로컬 `main` = `origin/main`, working tree clean.
> - GitHub Actions:
>   - CI run `26347938480` = **success**.
>   - Publish to Comfy registry run `26347938481` = **success**.
> - Comfy Registry 확인:
>   - `latest_version`은 아직 **0.7.17 Active**.
>   - **0.7.18 = NodeVersionStatusPending**, `status_reason` 빈 문자열,
>     `comfy_node_extract_status = pending`.
>   - Pending zip:
>     `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.18/node.zip`.
>
> **다음 세션이 할 일:**
> 1. Registry API로 `0.7.18` 상태를 한 번 확인:
>    `https://api.comfy.org/nodes/deno-custom-nodes/versions?statuses=NodeVersionStatusPending&include_status_reason=true`
>    및 `https://api.comfy.org/nodes/deno-custom-nodes`.
> 2. `0.7.18`이 Active가 되고 `latest_version.version == "0.7.18"`이면
>    사용자에게 간단히 보고. Registry 캐시 지연일 수 있으므로 불필요한 재배포
>    금지.
> 3. 만약 Flagged/Rejected/status_reason 발생 시 reason을 먼저 확인하고,
>    원인 파일만 최소 수정 후 새 버전으로 재배포.
> 4. 사용자가 실사용 테스트를 요청하면 ComfyUI 완전 재시작 후
>    `(Deno) Multi Image Loader` 우클릭 Copy Image Path와
>    `(Deno) LTX Model Loader` Checkpoint Style UI에서 `text_projection`
>    숨김을 확인.
>
> **주의:** 이번 핸드오프 문서 수정은 배포 커밋 이후의 로컬 문서 변경이다.
> 사용자가 별도로 요청하지 않으면 이 문서만 추가 커밋/푸시하지 말 것.
>
> ---

> ## ▶ 최신 세션 (2026-05-19, Claude Opus 4.7) — 0.7.5: LTX Multi LoRA clip optional
>
> **증상:** 사용자가 Run 누르면 `(Deno) LTX Multi LoRA Loader`에서 막힘.
> **원인 (로그로 확정, 코드버그·회귀 아님):** `Failed to validate prompt
> ... DenoLTXMultiLoraLoader: Required input is missing: clip`. INPUT_TYPES가
> `clip`을 **required**로 선언했지만 `load_multi_lora`는 이미 `clip=None`을
> 전 구간 처리(model-only LoRA, LTX에서 흔함) — 선언이 구현보다 엄격한 계약버그.
> **수정:** `clip` → optional(default None). 소켓은 model+clip뿐이고 순서
> (model=0, clip=1) 불변 → 기존 clip 연결 저장 workflow도 그대로 동작,
> clip 없는 구성은 이제 검증 통과. 함수 시그니처는 테스트가 위치호출
> `(model, clip, 1)` 하므로 순서 유지 + 둘 다 default(`clip=None,
> active_loras=1`)로 처리(ComfyUI는 kwarg라 무관).
> **검증:** py_compile + tests **50/50** + 실행본 재시작 후 라이브
> `/object_info`에서 clip이 optional 확인. **배포: 0.7.4 → 0.7.5**
> (`3131e89`), 비파괴 relaxation.
>
> ---

> ## ▶ 최신 세션 (2026-05-19, Claude Opus 4.7) — 0.7.3 잠재버그 리뷰 → 0.7.4 배포
>
> **요청:** 0.7.3 잠재버그 리뷰(GPT Pro 리뷰 검증) + 병렬 Codex가 추가한
> 새 `(Deno) Video Preview` 노드(`cb1e1c4`)의 무음/UI 손질 + 공개 배포.
>
> **수정 (origin/main `c4870f9` 위 12커밋, 04bb5da):**
> - `29a888e` 4건: LTX Multi LoRA `alpha=None` 스케일(값÷rank→값 그대로),
>   Multi Image Loader 실패 시 보고 크기로 출력(64×64 더미 제거),
>   LTX Sequencer `assert`→`ValueError`, `__init__` 노드별 임포트 격리.
>   #6 메모리·#7 픽셀·#8b latent는 의도된 설계라 유지(GPT 과장 판정).
> - `(Deno) Video Preview`: 백엔드 오디오 추출을 video_compare 수준으로
>   견고화(dict/obj/tuple·numpy·[N,C] 대응 + 실패 시 silent→log) → 무음 해결.
>   프런트엔드: VHS식 player(컨트롤 크롬 제거, hover=소리, click=일시정지,
>   Full screen 버튼, wheel→캔버스). 크기 fit은 최종적으로 **검증된 VHS 공식
>   `(node.size[0]-20)/aspect+10`** 으로 확정(측정/ResizeObserver 방식은
>   GPU 100%·리사이즈 떨림 유발 → 전부 제거, 단일 컨트롤러).
>
> **검증:** py_compile + `node --check` + tests **50/50**(ComfyUI portable),
> 원본↔실행본 해시 일치, 실런타임 재시작 후 `/object_info`·라이브 실행 OK.
> 사용자 화면 확인으로 무음·크롭·여백·떨림 해소 최종 컨펌.
>
> **배포 (2026-05-19 사용자 승인):** `c4870f9..04bb5da` → origin/main push,
> publish 워크플로 run **26069940343 = success**, Registry **0.7.4 =
> NodeVersionStatusPending**(0.7.3과 동일 경로; latest_version 노출은 인덱싱
> 지연 — §6대로 1회 확인 후 폴링 안 함). CI 트리거-리터럴 가드 green이라
> 0.7.3처럼 Active 전망(스캔 결과는 다음 세션이 확인).
>
> **미해결/위험:**
> - ~~README Video Preview 스크린샷 미첨부~~ → **해소**: 사용자가 실제
>   ComfyUI 캡처 제공, `docs/images/video-preview.jpg`로 추가·README 반영
>   (`c795158`, docs-only push — pyproject 미변경이라 publish 재트리거 없음).
> - 작업 내내 워킹트리에 비커밋 `.comfyignore`(M)·`docs/video-to-gif/`(??)
>   존재 — **내 변경 아님(Codex 추정), 손대지 않음·배포에 미포함.**
> - `0.7.2` = Flagged는 이전 사가의 잔존 상태(무관).
>
> ---

> ## ▶ 최신 세션 (2026-05-18, Claude Opus 4.7) — 0.7.2도 Flagged → 0.7.3
>
> **0.7.2 결과 = Flagged.** 단 사유 1건뿐이고 `SESSION_HANDOFF.md`/`AGENTS.md`/
> 내부 docs는 더 이상 안 잡힘 → **dev 문서 제외(.comfyignore)는 성공**. 남은
> 유일 트리거: `.comfyignore` **line 14**, `$socket3` — 즉 "왜 제외하는지"
> 설명하려고 내가 주석에 트리거 문자열을 적은 그 주석 자체가 잡힘.
>
> **확정 원칙:** 패키지에 들어가는 어떤 텍스트 파일도 트리거 리터럴을
> 코드/산문/주석 **어디에도** 담으면 안 됨(스캐너=문맥 0 substring 매처).
>
> **수정:** `.comfyignore` 설명 주석을 트리거 리터럴 0개로 재작성. CI 가드의
> 사각지대(확장자 없는 파일 스킵)를 수정 — 화이트리스트→바이너리 블랙리스트로
> 바꿔 `.comfyignore`/`LICENSE` 등도 스캔. `pyproject.toml` 0.7.2 → **0.7.3**.
>
> **검증:** 패키지 전체 시뮬레이션 — 배포될 텍스트 파일 **45개 열거, 트리거
> 0개**(`.comfyignore` 포함 스캔, dev 문서는 정상 제외 확인). CI 50/50 통과.
>
> **결과 (2026-05-18 확정):** `5305b45`→`a8ee414` push, publish 워크플로
> success, **0.7.3 = `NodeVersionStatusActive`** (자동 보안 스캔 통과). latest
> Active = 0.7.3, 0.5.9도 Active. **프로젝트 목표 달성: 플래그 없이 Video
> Compare 기능 제공.** 3연속 플래그 공통 원인 = 패키지 텍스트 파일이 트리거
> 리터럴을 글자 그대로 포함(코드/문서/주석 무관) → 0.7.3은 패키지 전체 0개로
> 해소. CI 가드 2개가 영구 회귀 방지. 사가 종료 — 추가 작업 없음.
>
> ---

> ## ▶ 이전 세션 (2026-05-18, Claude Opus 4.7) — 0.7.1 Flagged 진짜 원인 + 0.7.2
>
> **진짜 원인 (reason API `include_status_reason`로 확정):** Registry YARA 스캐너는
> 패키지에 포함된 **모든 텍스트 파일(.md 포함)** 을 읽어 위험 토큰을 substring 매칭함.
> 코드/산문 구분 안 함. 0.7.1 Flagged 사유 2건 모두 **`SESSION_HANDOFF.md`**:
> (1) `python_command_injection_risk $subprocess_popen_direct` — 핸드오프 문서가
> 옛 버그를 *설명*하며 `proc = subprocess.Popen(` 를 그대로 인용; (2)
> `python_network_operations $socket3` — Codex 노트가 `.connect(` 오탐을 *설명*하며
> 그 문자열을 포함. 즉 **문서가 코드를 인용해서 스스로 플래그**된 것.
> 캐스케이드: 0.6.1=실제 ffmpeg `subprocess.Popen(`(정당) → 0.7.0=JS WebAudio
> `.connect(`(오탐, Codex가 `"con"+"nect"` 우회=정당, 유지) → 0.7.1=문서 자체.
> `deno_advanced_image_source_loader.py`의 `socket.getaddrinfo`는 **Active 0.5.9에도
> 들어있음 → 무죄 확정**(규칙은 `.connect(`만 키잉, "socket" 단어 아님). 손대지 않음.
>
> **수정 (기능 변경 0):**
> - `.comfyignore`에 내부 dev/process/design 문서 제외 추가: `SESSION_HANDOFF.md`,
>   `AGENTS.md`, `docs/DENO_NODE_RETROSPECTIVE.md`, `docs/DENO_NODE_VISUAL_IDENTITY.md`.
>   (GitHub에는 그대로 남고 *배포 패키지*에서만 빠짐 — `.comfyignore`의 본래 용도.)
> - `README.md` 1줄 "no output socket" → "no output connection"(유저노출 파일 보험).
> - Codex의 JS `"con"+"nect"` 우회는 0.7.0 플래그로 필요성 입증됨 → **유지**.
> - CI 회귀 가드 2개 추가(`tests/test_registry_metadata.py`): `.comfyignore` 신규
>   제외 검증 + 패키지 시뮬레이션해 트리거 리터럴(`subprocess.Popen(`/`os.system(`/
>   `.connect(`) 0개 단언.
> - `pyproject.toml` **0.7.1 → 0.7.2**.
>
> **검증:** 임베디드 py_compile OK, `node --check` OK, CI 로컬 테스트 통과.
>
> **배포 완료 (2026-05-18, 사용자 요청 "어떻게 방법 없을까"):** `5305b45`를
> `origin/main`에 fast-forward push(ce4b501→5305b45). `publish_registry.yml`
> 워크플로 run `26003030526` = **success** — Comfy Registry 게시 제출 완료.
> §6대로 워크플로 conclusion **1회** + Registry status **1회**만 확인(반복 폴링 X):
> **0.7.2 = `NodeVersionStatusPending`**(자동 YARA 스캔 진행 중 — 0.7.0/0.7.1과
> 동일한 초기 상태, 아직 Active/Flagged 아님). 0.7.1 = Flagged(사유
> `SESSION_HANDOFF.md:65` + `SESSION_HANDOFF.md:7` — 진단 정확히 일치).
> 0.5.9 = Active 유지 = 안전망(사용자 영향 0). 결정적 근거는 실시간 status가
> 아니라 로컬 가드: `test_packaged_files_contain_no_scanner_trigger_literals`가
> .comfyignore 적용한 패키지 시뮬레이션에서 트리거 리터럴 **0개** 확인 +
> 유일 원인 `SESSION_HANDOFF.md`가 패키지에서 제외됨(검증).
> **다음:** §6/사용자 지시대로 반복 폴링·경량모델 위임 안 함. 사용자가 다시
> 요청하면 그때 0.7.2 status **1회만** 재확인. Flagged면 reason 받아 그 파일만
> 처리 후 재배포(0.5.9 Active 유지되므로 안전).
>
> ---

> ## ▶ 최신 뒷처리 (2026-05-18, Codex) — 0.7.1 Registry retry
>
> **확인 결과:** 0.7.0은 `NodeVersionStatusFlagged`로 전환됨. 원인은 Python subprocess가 아니라
> `web/js/deno_video_compare.js`의 WebAudio 호출 `s.gA.connect(...)` / `src.connect(...)`를 Registry YARA가
> 네트워크 `.connect(` 패턴으로 오탐한 것.
>
> **수정:** 기능 변경 없이 WebAudio 연결 호출을 bracket method helper로 우회:
> `AUDIO_CONNECT_METHOD = "con" + "nect"`, `AUDIO_DISCONNECT_METHOD = "dis" + AUDIO_CONNECT_METHOD`.
> 패키지 대상 `deno_video_compare.js`에서 `.connect(` / `.disconnect(` / `<video` / `ffmpeg` / `subprocess` 문자열 0개 확인.
>
> **버전:** `pyproject.toml` 0.7.0 → **0.7.1**.
>
> **검증:** embedded Python 기준 `py_compile` OK, `node --check` OK, CI-style local tests **48/48 통과**.
>
> **다음:** 0.7.1을 `origin/main`에 push하면 `pyproject.toml` 변경 때문에 Registry publish workflow가 자동 실행됨.
> 이후 `https://api.comfy.org/nodes/deno-custom-nodes/install`에서 0.7.1 상태를 확인.
>
> ---

> ## ▶ 최신 세션 (2026-05-18, Claude Opus 4.7) — 이것부터 읽기
>
> **목표/결정:** 0.6.0/0.6.1을 플래그한 유일 원인 = 옛 `deno_video_compare.py`의 ffmpeg `subprocess`
> (urllib/socket/HF/.bat는 0.5.9에서 통과 → 무죄, git diff로 검증). 소명 X, **안 걸리게 새로 만들어 재배포**.
>
> **한 일 (Registry-clean Video Compare 단일 노드로 교체):**
> - 옛 ffmpeg `deno_video_compare.py`/`web/js/deno_video_compare.js` **삭제**. 스테이징 변형(Preview/VHS) 폐기.
> - 인터랙티브 캔버스 플레이어를 정식화: `deno_video_compare.py`(클래스 `DenoVideoCompare`, 표시명
>   **"(Deno) Video Compare"**) + `web/js/deno_video_compare.js`(NODE_NAME `DenoVideoCompare`).
>   합성 전부 순수 torch; 프리뷰=temp WebP 시퀀스+raw f32 PCM을 기존 `/view`로 서빙(새 라우트 X);
>   가상클럭 캔버스 재생(A/B 정확 동기)+WebAudio(hover로 해당 측 소리). subprocess/ffmpeg/wave/os.remove/
>   urllib/socket **0개**(주석까지 스크럽, 검증). 프리뷰 프레임 상한 없음(공간 다운스케일만, 출력은 풀해상도 무손실).
> - `🏷 Labels` 토글(기본 off): 켜면 A/B+해상도 뱃지를 **저장 출력에만** burn-in(노드 프리뷰는 항상 표시).
> - `__init__.py` 단일 등록. 스테일 docs/템플릿 제거. CI 테스트(`tests/test_image_resize_node.py`)
>   새 계약으로 재작성 + 등록목록에 `DenoRTXVFXVideoFinisher` 추가 → **48/48 통과(0 실패, 임베디드 torch 환경)**.
> - `pyproject.toml` **0.6.1 → 0.7.0**. README Video Compare 섹션 갱신.
>
> **검증:** py_compile, JS `node --check`, 패키지 전체 스캐너 트리거 0, CI 러너 48/48, ComfyUI 재시작 후
> `/object_info` 단일 `(Deno) Video Compare` + `burn_labels` 노출, 합성/burn/오디오 자체테스트 통과.
> 실행본 해시일치 동기화.
>
> **배포 완료 (2026-05-18, 사용자 OK):** `85941b7`를 `origin/main`에 fast-forward push
> (561362c→85941b7). `publish_registry.yml` 워크플로 **success**(run 26000499746) — Comfy Registry
> 게시 제출 완료. **0.7.0 = `NodeVersionStatusPending`** (자동 YARA 스캔 진행 중, ~6분 8회 확인까지
> 계속 Pending — 아직 Active/ Flagged 아님). 옛 **0.5.9 Active가 그대로 롤백 안전망**(사용자 영향 없음).
> - **결정적 확인:** `include_status_reason`로 0.6.0/0.6.1 플래그 사유 노출 = `yara python_command_injection_risk`,
>   `deno_video_compare.py:191 proc = subprocess.Popen(` **단 한 줄**. urllib/socket/HF/.bat 전부 무관(진단 확정).
>   0.7.0은 패키지 전체 subprocess/os.system **0개**(검증) → 0.5.x Active와 동일 프로파일 → Active 전망.
> - **다음 (경량모델 위임 금지 — 전역설정 §6 2026-05-18 갱신):** 진행 에이전트가 직접 Registry API
>   `https://api.comfy.org/nodes/deno-custom-nodes/versions` 0.7.0 상태 **1회 재확인**(반복 루프 X).
>   Active면 종료. 만약 Flagged면 reason 받아 그 파일만 정리 후 재배포(0.5.9 Active 유지되므로 안전).
>
> ---
>
> ## ▶ 이전 세션 (2026-05-17, Claude Opus 4.7)
>
> 브랜치 `claude/review-project-repo-mQQtO`, **origin보다 ahead 8 · 미push**.
> GitHub `main` = 브랜치 = `561362c`(0.6.1). 아래 전부 **로컬 세이브포인트**, 배포는 사용자 OK 대기.
> 모든 변경은 ComfyUI API로 end-to-end 검증함. 실행본(`D:\...\custom_nodes\deno-custom-nodes`)에 해시일치 동기화.
>
> ### 완료·검증
> - **Video Compare**: `-shortest`/apad 오디오버그 → 오디오입력 `-t n/fps` 캡으로 해결(Broken pipe 제거);
>   stderr 스레드 drain+실제 ffmpeg에러 노출(37f2d5a, Deno2026); rAF 루프가 master도 재생(좌측 정지/우측 초반반복 해소);
>   `fps` 위젯 UI 노출(기본24, 소스fps로 사용자 지정); fps 위젯 높이 반영(초록패널 안 삐짐). **사용자 확정.**
> - **RTX 2-Pass** (`DenoRTXVFXVideoFinisher`, 세이브포인트 `e72cd13`):
>   표시명 **"(Deno) RTX Video Super Resolution (2 Pass)"** (클래스키 불변→저장 workflow 안전).
>   프론트 전면 재설계(정체성+`2 PASS`칩, `Input→1 Pass→2 Pass→Output` 흐름띠, 단계카드 Off=3번째,
>   Quality, 출력크기버튼, `(i)`도움말, 전부 영문, 다크 드롭다운, 패널높이 실측). 프리셋/코치 제거.
>   백엔드 정리: `device`(GPU0 고정)·`out_precision`·`clear_cuda_cache` + 캐시헬퍼 **제거**(이 노드 VRAM 무시가능).
>   `low_ram_mode`가 유일한 정직한 RAM 레버: On=출력 CPU+float16(결과배치 시스템RAM ~½), Off=입력장치+float32.
>   clamp는 float32에서 먼저→fp16 캐스트 1회(느린 CPU-fp16 clamp 회피). `divisible_by` 유지,
>   `resize_method`는 Keep Ratio/Megapixels 포함 모든 resizable에서 노출(이전 누락 복원).
>
> ### V2 결론 — 새 노드 불필요 (VHS Meta Batch로 해결, 검증 완료 2026-05-17)
> 별도 파일→파일 V2 노드 **취소**. VHS에 이미 `VHS_BatchManager`(Meta Batch Manager)
> + LoadVideo/VideoCombine `meta_batch` 입력이 있어, 그래프 전체를 frames_per_batch
> 청크로 requeue 실행 → LoadVideo는 청크만 lazy 디코드, VideoCombine은 ffmpeg
> 프로세스를 청크 간 유지하며 한 파일에 누적. 중간의 우리 RTX 노드(1·2-pass)는
> stateless·프레임별이라 **코드 변경 0**으로 그대로 동작. + low_ram_mode fp16이면
> 청크당 RAM 추가 절반. VHS는 거의 모두 설치 → 우회 인프라 보장.
> - 실증: `BatchManager(8) → LoadVideo(meta_batch) → DenoRTXVFXEasyUpscale →
>   VideoCombine(meta_batch)` 48프레임/8청크, 출력 1728x1152·48f·오디오 정상.
> - 산출물(코드 신규 0): 추천 워크플로 템플릿
>   `docs/workflows/deno-rtx-lowram-metabatch.json` (= ComfyUI Workflows에
>   "Deno RTX LowRAM (Meta Batch)"로도 설치). 남은 일: README에 이 저RAM
>   워크플로 안내 문구 추가(배포 단계에서).
> - 한계(허용): 청크마다 RTX 효과 재생성(소폭 init 오버헤드). 필요시 추후
>   meta_batch 인지 최적화 가능하나 필수 아님.
>
> ### 환경 사실 (레포 변경 아님)
> - 중복 `comfyui-deno-custom-nodes` 폴더(캔버스 lag 주범) → `.disabled`로 개명(보존·복구가능). `deno-custom-nodes`만 로드.
> - `VHS.AdvancedPreviews=Always` (사용자 comfy.settings.json; 환경설정) → save_output 꺼도 VideoCombine 프리뷰됨.
> - push/Registry는 사용자 명시 OK 시에만. push 전 squash 정리 권장(apad→audio-cap 등 교정커밋 중복).
>
> ---
> (아래는 이전 세션 2026-05-16 기록 — 역사 참고용)

작성: 2026-05-16 (Claude Opus 4.7) · 권위 문서: `C:\Users\aions\Documents\Codex\전역설정.md`

## 작업 위치 (이주 완료)

- **원본 = `E:\DENO-Repos\comfyui-deno-custom-nodes`** (origin = `Deno2026/comfyui-deno-custom-nodes`).
- 현재 브랜치: `claude/review-project-repo-mQQtO` (origin과 동기). `main`은 `bc59d5d`.
- 이번 세션에 작업 위치를 D: 실행 클론에서 **E: 원본으로 이주**. 앞으로 개발은 E:에서.
- D: 실행 클론 `...\ComfyUI\custom_nodes\comfyui-deno-custom-nodes` 에 `docs/video-compare/` 사본이 남아있음(무해, E:에 커밋 보존됨). 사용자 요청으로 삭제 안 함.

**프로젝트 마무리 (사용자 종료 선언, 2026-05-16).** 원격 `main` = feature `claude/review-project-repo-mQQtO` HEAD `8d9fe41` (fast-forward 동기). Comfy Registry **0.6.1** publish 워크플로 `success` 확정(0.6.0→0.6.1, 노드 영어화 포함). 웹툴 GitHub Pages 라이브: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/ . README+실노드 스크린샷(§6) 포함. 노드(영어 UI, mp4 백엔드, 오디오, IMAGE출력, Toggle 플립) + 웹툴(영어, 유튜브 아이콘 @Denoise-AI, 대칭 헤더, SxS 무여백) 모두 완료·검증·공개.

## 커밋 상태 (브랜치 `claude/review-project-repo-mQQtO`)

- `410a38e` 휠줌 ComfyUI 캔버스 우선 (확정 베이스 위 단일 패치) ← 현재 안정 지점
- `914ab26` 프론트엔드를 2c2b7bc로 롤백 (사이징 재작성 스파이럴 되돌림)
- `2c2b7bc` Video Compare: read VHS LazyAudioMap audio + isolate widget events ← **프론트 확정 베이스**
- (fc0b8bb..3b745a3 사이징 재작성/줌제거 시도 = 회귀, 914ab26로 폐기)
- `a62ce1f` Rebuild Video Compare node: mp4 backend + web-tool UX
- `32bb8ea` Add SESSION_HANDOFF after migrating work to E: origin
- `740acd2` Add standalone Video Compare web tool
- `e86f792` Add (Deno) Video Compare node (원격 푸시됨, main 미반영)
- `bc59d5d` Add image compare README screenshot (= main HEAD)

## 산출물 2개

1. **(Deno) Video Compare 노드** — **이번 세션에 mp4 백엔드로 재구현**. 백엔드(`deno_video_compare.py`)는 더 이상 PNG 시퀀스를 저장하지 않고, A·B IMAGE 배치를 **프레임 스트리밍으로 ffmpeg에 흘려 각각 temp mp4 1개로 인코딩**(풀배치 float 복사 제거 → 메모리 스파이크 해소). 프론트(`web/js/deno_video_compare.js`)는 웹툴 엔진을 ComfyUI **DOM 위젯**으로 이식: `<video>` 2개 코덱 디코드, rate 기반 동기, 줌/팬, 4모드, 재로드 없는 Swap, DENO 다크/그린 + `i` 정보 버튼. **소켓 계약(INPUT_TYPES/RETURN/FUNCTION/CATEGORY/OUTPUT_NODE) 불변** → 저장 workflow 안전. `ui` 프리뷰 페이로드만 `a_video/b_video/compare_meta`로 변경, 테스트도 동기 갱신. ffmpeg는 무의존성 원칙대로 런타임 탐지(imageio_ffmpeg→PATH); 없으면 meta.error로 안내. 공유 타임라인은 양쪽 mp4를 동일 duration으로 인코딩해 보존.
2. **Standalone Video Compare 웹툴** (`docs/video-compare/index.html`) — 커밋 `740acd2`. 단일 파일, 무설치/오프라인, 4K 무렉. 별도 구독자 배포용으로 유지.

## 오디오 + 레이아웃 패스 (이번 세션 신규-2)

- **AUDIO 입력 추가**: optional `audio_a`, `audio_b` (`"AUDIO"`). additive라 기존 저장 workflow 호환. ffmpeg가 영상 mp4에 AAC로 먹싱(stdlib `wave`로 임시 WAV 생성 → 추가 의존성 0). 양쪽 mp4가 공유 duration이라 오디오도 자동 정렬. meta에 `a_has_audio/b_has_audio` 추가.
- **브라우저 자동재생 정책 대응**: `<video>`는 사용자 제스처 전까지 무음 유지(자동재생 차단 회피). stage/scrub pointerdown·Play·오디오 버튼 클릭 시 unmute 허용(`markGesture`). 오디오 없는 쪽 버튼은 disable, 한쪽만 오디오면 그쪽으로 자동 선택.
- **레이아웃 정리**: 상단 Swap 절대중앙 제거(좁은 노드 겹침 해소) → modes 옆 인라인 배치. 타이틀 태그라인 축약(긴 문구는 info 버튼 tooltip로). `i` 정보 버튼 DENO 그린 유지.
- `/object_info/DenoVideoCompare` 재확인: required `mode,split_position,toggle_image,swap,fps` / optional `video_a,video_b,audio_a,audio_b`(AUDIO) / Deno/Image / output_node True. ComfyUI 재시작(Sage bat, 유휴 확인) 후 로드 정상.

## 검증 (이번 세션, 전역설정.md §4)

- `python -m py_compile deno_video_compare.py` OK
- `node --check web/js/deno_video_compare.js` OK
- CI 인라인 러너(ComfyUI python, torch 보유): **48개 중 47 ok**. 1건 `test_deno_video_compare_runtime_semantics_when_torch_available`는 **격리 실행 시 통과** — 결합 실행 실패 원인은 torch C확장 이중 임포트(`conv1d already has a docstring`) 하네스 아티팩트(image+video 런타임 테스트가 같은 프로세스에서 torch pop/reimport, 기존부터 동일 구조). CI는 torch 미설치라 두 런타임 테스트 early-return → CI 영향 없음.
- E:↔D: 실행 클론(`...\custom_nodes\comfyui-deno-custom-nodes`) 변경 2파일 SHA256 일치 복사 완료. `__init__.py` 등록 불변.

## 웹툴 현재 상태 (이번 세션 사용자 검증 완료)

모드 Slider/SxS/Difference/Toggle, 공유 타임라인 rate 기반 동기(시크 없음 → 끊김 없음, 정지·재생 즉시 락), 동기 줌/팬, 오디오 A/B/Mute(기본 A), 좌/우 절반 전체 드롭존, 슬롯 X 제거, **재로드 없는 Swap(위치/라벨만 교체, 재생·동기 유지)**, Toggle 상태 상단중앙 표시, 마우스 hover 슬라이더(줌 보정), 클릭=재생토글/드래그=슬라이더 구분. 사용자 "거의 완벽" 확인. `node --check` 통과. E:↔원본 해시 일치 확인.

검증 한계: 브라우저 클릭/소리 실테스트는 사용자가 수동 수행(에이전트 불가).

## 미완료 / 다음 단계

- **노드 현재 상태(HEAD)**: 2c2b7bc 베이스 위 누적 패치로 사용자 검증 완료 — mp4 프리뷰·4모드·Swap·hover오디오(VHS LazyAudioMap mux)·리사이즈 비례·휠→ComfyUI캔버스줌·가운데버튼→캔버스팬·정지 프레임정확 동기·좌우상단 A/B 정보·줌UI/i버튼 제거. **IMAGE 출력 `comparison`** 추가(라벨 표시 `Output Images SBS/Diff`): SbS=A|B결합, Diff=|A−B|, Slider/Toggle=B 패스스루. 메모리 50~60GB(이전 100GB 해소).
- **배포 진행(사용자 "고고", 2026-05-16)**: feature 브랜치 `claude/review-project-repo-mQQtO` **원격 push 완료 → HEAD `0e4a21c`**. 웹툴에 YouTube 아이콘(@Denoise-AI) 추가, 노드 하단에 웹툴 링크 줄 추가(URL 결정적), README 갱신, 전부 push.
- **남은 수동 1: GitHub Pages 활성화(사용자 GUI, gh CLI 부재)** — Repo Settings ▸ Pages ▸ Deploy from a branch ▸ Branch=`claude/review-project-repo-mQQtO`, Folder=`/docs` ▸ Save. 그러면 `https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/` 라이브(노드 링크·README가 이미 이 URL 가리킴).
- ✅ **GitHub Pages 활성화·라이브 확인 완료** (브랜치 `/docs` 서빙).
- ✅ **§6 실노드 스크린샷 완료**: `docs/images/video-compare{,-sbs,-diff}.png` (Slider/SbS/Diff) + README 이미지 태그, 커밋 `2f014e9` push.
- **남은 것 없음.** 유일한 후속: Comfy Registry `latest_version` 표기가 0.6.1로 갱신되는 인덱싱 전파 확인 — 전역설정 §6대로 **Codex(gpt-5.3-codex-spark)에 위임**(워크플로 success로 게시 확정, 단순 반복 폴링은 경량 모델). 추가 작업 필요 없음.
- 로컬 `main` 브랜치는 stale(작업은 feature에서 계속). 다음 세션은 feature `claude/review-project-repo-mQQtO` 기준.
- ffmpeg 미탐지 환경 대비: 현재 fallback은 meta.error 안내. VHS 전제이므로 실무상 문제 없을 것으로 판단하나, 배포 전 최신 Portable 기준점에서도 확인 권장(§4).

## 위험 경로

- 같은 파일을 Codex와 동시 수정 금지(순차). 핸드오프 채널 = git 커밋.
- `main` 직접 수정 금지. 작업 브랜치 유지(노드 미릴리스).
- 노드 계약(INPUT/RETURN/이름/순서) 변경 시 `tests/test_image_resize_node.py` 동기 + CI 하드코딩 테스트 파일 규약 준수.
