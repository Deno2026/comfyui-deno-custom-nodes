# ComfyUI Video Compare 노드 — Registry 플래그 회피 + 인터랙티브 슬라이더 유지 (외부 리뷰 요청)

## 목표
- ComfyUI 커스텀 노드 팩 `deno-custom-nodes` (publisher `deno2026`) 의 `(Deno) Video Compare` 노드.
- 기능(원본 사용감): 영상 A/B 비교 — **마우스 드래그 실시간 슬라이더** / Side-by-Side / Difference / Toggle, A·B 프레임 싱크 재생, 마우스 hover 시 해당 측 오디오 재생, swap, 노드 안에서 바로 재생/정지/루프/속도.
- 문제: Comfy Registry 자동 보안 스캔이 0.6.0 / 0.6.1 을 `NodeVersionStatusFlagged` 처리. 0.5.9 는 통과(Active). 소명/복구가 아니라 **"안 걸리게 만들어서 새 버전으로 올리되 사용감/품질은 유지"** 가 목표.

## 확정된 사실 (git diff / grep 교차검증, 추측 아님)
- 0.5.9 → 0.6.0 사이에 추가된 **유일한 파이썬 파일 = `deno_video_compare.py`** (그 외엔 README/web js/docs).
- 0.5.9 에 **이미 있었고 플래그 안 된 것**: `urllib.request`+`socket.getaddrinfo`(원격 이미지 로더), `urllib`(HF 모델 다운로드 헬퍼), `tools/install_rtx_vfx.bat`, `prestartup_script.py`.
- 0.6.0 에서 **처음 등장한 스캐너 트리거**: `deno_video_compare.py` 의 `subprocess.Popen`(ffmpeg 호출) + 부수적으로 stdlib `wave`, `os.remove`.
- 결론: 실질 트리거는 **ffmpeg `subprocess` 하나**. (urllib/socket 등은 무관 → 스캐너가 단순 텍스트 grep 이 아니라 행위/AST 기반 또는 스코어/허용목록일 가능성의 근거)
- 같은 ffmpeg subprocess 를 쓰는 VideoHelperSuite(VHS)는 Registry 허용 상태 → 평판/허용목록/스코어링 가능성.

## 원본 노드 내부 구조
- `RETURN_TYPES=("IMAGE",)` ("comparison"), `OUTPUT_NODE=True`.
- 파이썬: A 와 B **각각**을 ffmpeg(subprocess)로 임시 mp4 2개로 인코딩. 오디오는 stdlib `wave` 로 임시 wav 작성 → ffmpeg 로 aac mux → `os.remove`.
- 프론트(web/js): 두 개의 `<video>` 엘리먼트를 `/view?filename=temp...` 로 로드. JS 가 실시간으로 두 영상을 겹쳐 **슬라이더 분할 / SbS / Diff / Toggle** 합성 + "공유 타임라인"으로 A·B 프레임 싱크 + hover 오디오 토글.
- 즉 **비교 합성·재생·슬라이더·오디오 토글은 전부 브라우저 JS**, ffmpeg 는 오직 "재생 가능한 미리보기 영상 파일 2개 생성" 역할만 함. (이 한 가지가 플래그 원인)

## 지금까지 구현 (로컬 커밋만, 미배포)
`subprocess / ffmpeg / wave / os.remove / network 0개` 인 자립 파일 `deno_video_compare_clean.py` 신설. 비교 합성(Slider/SbS/Diff/Toggle)은 전부 순수 torch. 테스트 노드 2개:

- **① `DenoVideoComparePreview`** — 모든 모드 torch 합성 → **Pillow 로 애니메이션 WebP** 생성해 노드 안 미리보기. 소리 없음. split_position 은 위젯 고정값이라 **드래그 불가**.
- **② `DenoVideoCompareVHS`** — 합성 프레임(IMAGE) + AUDIO 패스스루 출력 → 사용자가 표준 **VHS Video Combine** 에 연결해 소리 포함 mp4 생성/재생. 노드 안 재생 없음.

ComfyUI 에서 등록/동작/4모드×swap/오디오 패스스루/스캐너 트리거 0개 자체검증 완료.
**한계(사용자 지적): ①② 모두 원본의 "마우스 드래그 실시간 슬라이더 + hover 오디오 + 노드 안 싱크 재생" 사용감을 100% 복원 못함.**

## 검토 중인 ③안
ffmpeg 없이 원본 사용감 복원:
- 파이썬: Pillow/torch 로 **프리뷰 프레임만** 생성(스프라이트 시트 또는 개별 프레임/경량 JPEG/WebP). `comparison` 출력은 풀해상도 **무손실** torch 합성.
- 프론트: 노드 안 **커스텀 캔버스 플레이어(JS)** — 프레임을 직접 그리며 드래그 슬라이더 / SbS / Diff / Toggle + 재생·정지·루프·속도. 프레임 인덱스를 JS 가 제어 → A·B **완벽 싱크**(원본의 dual-`<video>` 보다 정확).
- 오디오: AUDIO 텐서의 raw PCM(float32)을 브라우저로 보내 **Web Audio API(AudioBuffer)** 로 프레임 동기 재생 → `wave`/subprocess 불필요.
- 선례: rgthree / comfyui image-compare 류 노드가 이미 IMAGE 텐서 기반 캔버스 슬라이더 비교를 subprocess 없이 구현해 Registry 통과 중. 이를 다중 프레임+플레이헤드+오디오로 확장하는 셈.

### 3가지 기준 자체 평가
1. **사용감 100%?** 비주얼/조작/싱크/모드/swap = 100%(이상). **오디오(hover 재생)만 유일 난이도** — Web Audio + raw PCM 으로 복원 가능하나 가장 새롭고 손 많이 가는/불확실한 구간.
2. **Registry 통과?** torch+Pillow+numpy(코어 의존성)만, 트리거 0개 = 0.5.9(통과) 프로파일. 신뢰도 매우 높음. 단 스캐너 룰셋 비공개라 **확정은 실제 publish 후 Active 확인**으로만. 대비: 트리거 0 + 옛 ffmpeg 파일 제거 + 배포 후 모니터 + 롤백.
3. **무손실 비교?** `comparison` 출력 = torch 합성 완전 무손실·원본 해상도(원본은 Slider/Toggle 시 B 단순 통과였음 → ③이 더 제대로). 미리보기 화질은 튜닝 가능(원본 H.264 CRF20 이상), 필요시 무손실 프레임도 가능(전송량↑).

## 외부 리뷰로 묻고 싶은 것
1. ③(캔버스 프레임 플레이어 + WebAudio raw PCM)보다 **더 단순/안정적으로**, ffmpeg/subprocess 없이 ComfyUI 노드 안에서 (a)실시간 드래그 슬라이더 (b)A·B 프레임 싱크 재생 (c)오디오까지 달성하는 방법이 있는가?
2. 프리뷰 프레임 전송 방식 — 스프라이트 시트 vs 개별 이미지(`/view`) vs base64 data vs 바이너리 blob — 데이터량/메모리/구현난이도 최적은? 긴/4K 클립 대응 정책(프레임/해상도 캡)?
3. ComfyUI Registry 보안 스캔이 정확히 무엇을 트리거하는지(룰셋/허용목록/스코어) 알려진 정보? 순수 torch+Pillow+numpy 만으로 통과 보장 가능한지, 추가로 피해야 할 패턴(예: stdlib `wave`, `tempfile`, `os.remove`, `urllib`)이 실제 위험한가?
4. 노드 안 오디오를 무손실로 들려주되 스캐너 안전한 더 나은 방법 — 예: VHS 가 프론트에 오디오를 노출/재생하는 방식 차용?
5. 무손실 비교 품질 ↔ 브라우저 전송량 사이 권장 절충안?

## 제약
- 코어 의존성(torch, numpy, Pillow)만. `subprocess / os.system / eval / exec / 네트워크 / install 스크립트 / pip 설치` 금지.
- 최종 배포 시 옛 ffmpeg `deno_video_compare.py` 는 제거하고 클린 노드만 등록 예정. RTX 2-Pass 등 나머지 노드는 이미 무 subprocess(클린).
