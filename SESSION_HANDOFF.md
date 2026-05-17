# SESSION_HANDOFF — comfyui-deno-custom-nodes

> ## ▶ 최신 세션 (2026-05-17, Claude Opus 4.7) — 이것부터 읽기
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
