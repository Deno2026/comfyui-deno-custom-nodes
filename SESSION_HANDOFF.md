# SESSION_HANDOFF — comfyui-deno-custom-nodes

작성: 2026-05-16 (Claude Opus 4.7) · 권위 문서: `C:\Users\aions\Documents\Codex\전역설정.md`

## 작업 위치 (이주 완료)

- **원본 = `E:\DENO-Repos\comfyui-deno-custom-nodes`** (origin = `Deno2026/comfyui-deno-custom-nodes`).
- 현재 브랜치: `claude/review-project-repo-mQQtO` (origin과 동기). `main`은 `bc59d5d`.
- 이번 세션에 작업 위치를 D: 실행 클론에서 **E: 원본으로 이주**. 앞으로 개발은 E:에서.
- D: 실행 클론 `...\ComfyUI\custom_nodes\comfyui-deno-custom-nodes` 에 `docs/video-compare/` 사본이 남아있음(무해, E:에 커밋 보존됨). 사용자 요청으로 삭제 안 함.

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

- **노드 현재 상태(`410a38e`)**: 사용자 검증 — mp4 인코딩·재생·4모드·Swap·오디오(VHS LazyAudioMap mux, 클릭해서 듣기)·노드 리사이즈 시 영상 비례 확대/축소 모두 정상, 메모리 50~60GB(이전 100GB 해소). 휠은 ComfyUI 캔버스 줌 우선. **알려진 잠복 한계**: 노드 '축소' 극단 시 세로 폭주 가능(2c2b7bc 베이스의 self-ref computeSize). 일반 사용 범위에선 정상. 향후 줌버튼 정리/hover-소리/축소버그는 **이 베이스에서 작은 단위로만** 신중히.
- **다음**: README + 실노드 스크린샷(`docs/images/`) → main 병합 + Registry (전역설정 §5 게이트).
- **웹툴**: 추가 피드백 반영 가능. 배포 수단(GitHub Pages `docs/` / 직접 파일) 미정.
- **push/publish는 전역설정.md §5 게이트** — 사용자 명시 OK 전까지 GitHub push 안 함. 로컬 커밋만 누적 중.
- ffmpeg 미탐지 환경 대비: 현재 fallback은 meta.error 안내. VHS 전제이므로 실무상 문제 없을 것으로 판단하나, 배포 전 최신 Portable 기준점에서도 확인 권장(§4).

## 위험 경로

- 같은 파일을 Codex와 동시 수정 금지(순차). 핸드오프 채널 = git 커밋.
- `main` 직접 수정 금지. 작업 브랜치 유지(노드 미릴리스).
- 노드 계약(INPUT/RETURN/이름/순서) 변경 시 `tests/test_image_resize_node.py` 동기 + CI 하드코딩 테스트 파일 규약 준수.
