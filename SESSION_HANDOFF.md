# SESSION_HANDOFF — comfyui-deno-custom-nodes

작성: 2026-05-16 (Claude Opus 4.7) · 권위 문서: `C:\Users\aions\Documents\Codex\전역설정.md`

## 작업 위치 (이주 완료)

- **원본 = `E:\DENO-Repos\comfyui-deno-custom-nodes`** (origin = `Deno2026/comfyui-deno-custom-nodes`).
- 현재 브랜치: `claude/review-project-repo-mQQtO` (origin과 동기). `main`은 `bc59d5d`.
- 이번 세션에 작업 위치를 D: 실행 클론에서 **E: 원본으로 이주**. 앞으로 개발은 E:에서.
- D: 실행 클론 `...\ComfyUI\custom_nodes\comfyui-deno-custom-nodes` 에 `docs/video-compare/` 사본이 남아있음(무해, E:에 커밋 보존됨). 사용자 요청으로 삭제 안 함.

## 커밋 상태 (브랜치 `claude/review-project-repo-mQQtO`)

- `740acd2` Add standalone Video Compare web tool ← 이번 세션
- `e86f792` Add (Deno) Video Compare node (원격 푸시됨, main 미반영)
- `bc59d5d` Add image compare README screenshot (= main HEAD)

## 산출물 2개

1. **(Deno) Video Compare 노드** (`deno_video_compare.py`, `web/js/deno_video_compare.js`, `__init__.py`, tests, README) — 커밋 `e86f792`. 백엔드는 PreviewImage 패턴으로 전 프레임 PNG 저장 → 고해상도·장클립에서 메모리 과다(설계 한계). 정식 릴리스(main 병합)·실제 ComfyUI 육안 테스트 미완.
2. **Standalone Video Compare 웹툴** (`docs/video-compare/index.html`) — 커밋 `740acd2`. 단일 파일, 무설치/오프라인, `<video>` 2개 코덱 디코드라 4K 무렉. 노드의 메모리 문제를 우회하는 "완성 영상 비교용" 도구. 구독자 배포 목적.

## 웹툴 현재 상태 (이번 세션 사용자 검증 완료)

모드 Slider/SxS/Difference/Toggle, 공유 타임라인 rate 기반 동기(시크 없음 → 끊김 없음, 정지·재생 즉시 락), 동기 줌/팬, 오디오 A/B/Mute(기본 A), 좌/우 절반 전체 드롭존, 슬롯 X 제거, **재로드 없는 Swap(위치/라벨만 교체, 재생·동기 유지)**, Toggle 상태 상단중앙 표시, 마우스 hover 슬라이더(줌 보정), 클릭=재생토글/드래그=슬라이더 구분. 사용자 "거의 완벽" 확인. `node --check` 통과. E:↔원본 해시 일치 확인.

검증 한계: 브라우저 클릭/소리 실테스트는 사용자가 수동 수행(에이전트 불가).

## 미완료 / 다음 단계

- **노드**: 실제 ComfyUI 육안 테스트(재생/슬라이더/4모드/업스케일·RIFE 동기), README 스크린샷(`docs/images/`), 메모리 완화(다운스케일+풀배치 float 제거) 또는 노드 폐기 여부 결정 → 그 후 main 병합 + Registry.
- **웹툴**: 사용자 추가 피드백 반영 중. 배포 수단(GitHub Pages `docs/` / 직접 파일) 미정.
- **push/publish는 전역설정.md §5 게이트** — 사용자 명시 OK 전까지 GitHub push 안 함. 현재 `740acd2`는 로컬 커밋만.

## 위험 경로

- 같은 파일을 Codex와 동시 수정 금지(순차). 핸드오프 채널 = git 커밋.
- `main` 직접 수정 금지. 작업 브랜치 유지(노드 미릴리스).
- 노드 계약(INPUT/RETURN/이름/순서) 변경 시 `tests/test_image_resize_node.py` 동기 + CI 하드코딩 테스트 파일 규약 준수.
