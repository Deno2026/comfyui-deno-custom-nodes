# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

![Deno Custom Nodes banner](images/deno-custom-nodes-banner.jpg)

실제 ComfyUI 작업에서 반복되는 이미지, 비디오, LTX, RTX, 모델 설치 흐름을 더 빠르고 편하게 만들기 위한 Deno 커스텀 노드 모음입니다. 대부분의 Deno 노드는 ComfyUI 캔버스를 벗어나지 않고 도움말을 볼 수 있는 작은 초록색 `i` 버튼을 포함합니다.

## Release Notes

공개 업데이트 내역은 [CHANGELOG.md](../CHANGELOG.md)에 짧게 정리합니다.

## Web Tools

브라우저에서 바로 실행할 수 있는 도구입니다.

- [DENO Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - 두 렌더 영상을 슬라이더, 나란히 보기, 차이 보기, 토글 방식으로 비교합니다.
- [DENO Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - 짧은 영상을 자르고, 크롭하고, 리사이즈해서 GIF 또는 작은 WebP로 내보냅니다.

## DENO Visual Fold

![DENO Visual Fold](images/deno-visual-fold.webp)

DENO Visual Fold는 큰 ComfyUI 그래프를 시각적으로 정리하는 기능입니다. 여러 노드 또는 그룹을 접어도 워크플로우 로직은 바뀌지 않습니다.

두 개 이상의 노드를 선택하면 캔버스 오른쪽 위 근처에 초록색 `Fold` 버튼이 나타납니다. 누르면 선택한 노드가 하나의 시각적 그룹처럼 접히고, `Unfold`로 다시 펼칠 수 있습니다. 일반 ComfyUI 그룹 하나를 선택하면 `Fold Group`으로 그룹 안의 노드를 접을 수 있고, 여러 그룹을 선택하면 정렬 버튼도 함께 나타납니다.

ComfyUI Subgraph는 노드를 하위 그래프로 이동시키는 기능입니다. Visual Fold는 그와 달리 정리 목적의 시각 기능입니다. `Get` / `Set` 노드나 부모-자식 그래프 구조를 그대로 보이게 두고 싶을 때 유용합니다.

## Included Nodes

### `(Deno) Ideogram Director`

[![Ideogram Director workflow demo](images/ideogram-director-video-thumbnail.jpg)](https://youtu.be/Z8s27skkIDM)

Ideogram 4용 구조화 JSON 프롬프트와 bbox 배치를 ComfyUI 캔버스 안에서 편집하는 시각형 프롬프트 빌더입니다.

주요 기능:

- 캔버스 위에서 bbox 영역을 직접 그리고 편집
- Local LLM Loader 또는 다른 STRING 출력에서 JSON 프롬프트 가져오기
- 기존 보드가 있을 때 새 JSON으로 교체할지 먼저 확인
- 잘못된 JSON은 명확하게 거절하고 깨진 프롬프트를 샘플러로 보내지 않음
- 스타일/레이아웃 프리셋 갤러리와 가벼운 미리보기 썸네일
- Language 보기로 장면 설명을 원하는 언어로 읽고 수정할 수 있으며, 최종 출력은 생성용 영어로 유지. 실제 TEXT 박스 단어는 간판, 로고, 제목처럼 그대로 보존
- 출력: `prompt`, `width`, `height`, `seed`, `bboxes`

### `(Deno) Resize Box`

ComfyUI용 해상도 도우미와 이미지 리사이즈 노드입니다.

![Deno Resize Box](images/resize-box.jpg)

주요 기능: 비율 프리셋, 직접 입력, 메가픽셀 기반 계산, `divisible_by` 정렬, Center Crop과 Fit 리사이즈, 노드 안 비율 미리보기, `image`, `width`, `height` 출력.

### `(Deno) Multi Image Loader`

배치 가이드 워크플로우에 맞춘 다중 이미지 로더입니다.

![Deno Multi Image Loader](images/multi-image-loader.jpg)

주요 기능: 고정 높이 갤러리, 드래그 정렬, 업로드, 드래그 앤 드롭, 이미지 붙여넣기, ComfyUI `input` 폴더 탐색, 중첩 폴더 이미지 추가, 최신순 정렬, 비율 유지/프리셋/직접 입력 리사이즈, `multi_output`, `width`, `height` 출력.

### `(Deno) Advanced Image Source Loader`

외부 폴더, 로컬 경로, 웹 이미지 URL, 혼합 크기 이미지 리스트가 필요한 워크플로우용 고급 이미지 소스 로더입니다.

![Deno Advanced Image Source Loader](images/advanced-image-source-loader.png)

주요 기능: ComfyUI `input` 폴더와 외부 로컬 폴더 지원, URL/Path 입력, 업로드와 붙여넣기, 썸네일 enable/disable, 드래그 정렬, masonry 스타일 갤러리, 재귀 폴더 로드, 배치 텐서와 `image_list` 출력.

### `(Deno) Image Compare`

ComfyUI 캔버스 안에서 두 이미지를 빠르게 비교하는 A/B 비교 노드입니다.

![Deno Image Compare](images/image-compare.jpg)

주요 기능: `image_a`와 `image_b` 비교, Slider/Side by Side/Difference/Toggle 모드, hover 슬라이더, A/B 라벨, Swap 버튼, 리사이즈 가능한 내부 미리보기.

### `(Deno) Video Compare`

업스케일과 FPS 보간 결과를 ComfyUI 캔버스 안에서 확인하기 위한 비디오 A/B 비교 노드입니다.

주요 기능: `video_a`, `video_b`, 선택적 `audio_a`, `audio_b`, Slider/Side by Side/Difference/Toggle 모드, 재생/일시정지, 스크럽바, 프레임 스텝, 속도, 루프, 출력 배지 토글, `comparison` 이미지 출력.

설치가 부담스러우면 브라우저 도구를 사용할 수 있습니다: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/

![Deno Video Compare - Slider](images/video-compare.png)

![Deno Video Compare - Side by Side](images/video-compare-sbs.png)

![Deno Video Compare - Difference](images/video-compare-diff.png)

### `(Deno) Video Preview`

그래프 중간에서 실제 인코딩된 비디오 결과를 확인하는 풀 해상도 미리보기 노드입니다.

![Deno Video Preview](images/video-preview.jpg)

주요 기능: IMAGE batch 입력과 straight-through 출력, 선택적 오디오 mux, hover 오디오, 클릭 재생/일시정지, Full screen 버튼, 해상도/FPS/프레임/길이 배지, PyAV 누락 시 친절한 설치 힌트.

### `(Deno) RTX Video Super Resolution`

NVIDIA RTX Video Super Resolution을 ComfyUI 안에서 간단히 시도할 수 있는 선택형 Windows/NVIDIA RTX 도우미 노드입니다.

![Deno RTX Video Super Resolution](images/rtx-vfx-easy-upscale-node.png)

초보자 흐름: `deno-custom-nodes` 설치 또는 업데이트, ComfyUI 시작, 노드 추가 후 한 번 실행, NVIDIA VFX가 없다는 안내가 나오면 ComfyUI를 완전히 종료, `How to install` 버튼의 설치 가이드 순서대로 진행, BAT에서 경로를 확인하고 `Y`, 완료 후 ComfyUI 재시작.

NVIDIA 공식 참고 링크: [NVIDIA Maxine Windows Getting Started](https://docs.nvidia.com/deeplearning/maxine/vfx-sdk-programming-guide/index.html), [RTX Video FAQ](https://nvidia.custhelp.com/app/answers/detail/a_id/5448/~/rtx-video-faq).

### `(Deno) RTX Video Super Resolution (2 Pass)`

비디오 전체 마감용 2-pass RTX 처리 노드입니다. 먼저 같은 크기의 `Denoise` 또는 `Deblur`를 선택적으로 실행하고, 그 다음 `VSR` 또는 `High Bitrate` 업스케일을 선택적으로 실행할 수 있습니다.

예제 워크플로우: [RTX 2-pass upscale workflow](workflows/deno-rtx-lowram-metabatch.json)

주요 기능: Low System Memory와 High System Memory 흐름, VHS Meta Batch 기반 저메모리 처리, 원본 FPS 전달, 오디오 보존, 실제 인코딩 비디오 마감에 적합.

### `(Deno) LTX Sequencer`

멀티 이미지 LTX 워크플로우에 맞춘 가이드 시퀀서입니다.

![Deno LTX Sequencer](images/ltx-sequencer.jpg)

주요 기능: `(Deno) Multi Image Loader` 배치 출력과 함께 사용, 가능한 경우 `num_images` 자동 채움, 기존 sync 스타일 유지, 필요한 strength만 수동 제어, bypass로 빠른 A/B 테스트.

### `(Deno) LTX Model Loader`

LTX 2.3 모델 로딩 패턴을 한 노드로 정리한 로더입니다.

![Deno LTX Model Loader](images/ltx-model-loader.jpg)

주요 기능: Checkpoint Style, KJ Style, GGUF Style, `model`, `clip`, `video_vae`, `audio_vae` 출력, ComfyUI 기본 로더와 KJNodes/ComfyUI-GGUF 흐름을 함께 지원.

### `(Deno) Easy Model Download Helper`

권장 모델 파일 세트를 안내하는 프리셋 기반 설치 도우미입니다.

![Deno Easy Model Download Helper](images/easy-model-download-helper.png)

주요 기능: Python에서 직접 다운로드하지 않고 공식 모델 링크를 브라우저로 열기, ComfyUI 모델 루트 표시, workflow 안 creator preset 저장, Hugging Face와 Civitai 링크 지원, 파일이 올바른 모델 폴더에 있는지 확인.

![Hugging Face link guide](images/easy-model-download-helper-huggingface-link.png)

![Civitai page URL guide](images/easy-model-download-helper-civitai-link.png)

![Civitai preset editor guide](images/easy-model-download-helper-civitai-node.png)

### `(Deno) LTX Multi LoRA Loader`

LTX 워크플로우용 Power-LoRA 스타일 다중 LoRA 로더입니다.

![Deno LTX Multi LoRA Loader](images/ltx-multi-lora-loader.png)

주요 기능: 여러 LoRA 추가, 슬롯별 enable, strength/video/audio strength, trigger word와 note 관리, trigger word 복사, 패치된 `model`과 `clip` 출력.

### `(Deno) LTX Prompt Guide`

LTX 프롬프트 인코딩, 선택적 negative prompt, LTX conditioning, 대사 길이 계획을 함께 다루는 프롬프트 도우미입니다.

![Deno LTX Prompt Guide](images/ltx-prompt-guide.png)

주요 기능: positive prompt 인코딩, 접을 수 있는 negative prompt, `frame_rate`가 포함된 LTX conditioning, 따옴표 안 대사 길이 추정, Auto/Korean/English/Japanese/Chinese 대사 추정.

### `(Deno) Bernini Prompt Guide`

KJ Bernini 방식의 프롬프트 prefix를 쉽게 쓰도록 만든 프롬프트 도우미입니다. positive/negative prompt를 한 노드에서 인코딩하고, 선택한 `System Prompt` 모드에 맞는 system prompt를 노드 맨 위에 보여줍니다.

![Deno Bernini Prompt Guide](images/bernini-prompt-guide.jpg)

주요 기능: `Text to Video`, `Image to Video`, `Reference Video Edit` 같은 읽기 쉬운 System Prompt 선택, reference 모드의 `image0`/`image1` naming hint 자동 적용, 접을 수 있는 negative prompt, 공식 Wan2.2 negative preset 자동입력, `positive`/`negative` 출력.

Negative preset은 출력 모드가 아니라 아래 negative prompt 칸을 자동으로 채우는 용도입니다. 프리셋으로 채운 뒤 사용자가 그 칸에서 직접 추가하거나 수정한 문구가 최종 negative conditioning으로 인코딩됩니다.

프롬프트는 평소 태그를 나열하는 방식보다 챗봇에게 시키듯이 씁니다. 예: `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`

주의: 이 노드는 텍스트 conditioning만 준비합니다. Bernini visual conditioning은 Bernini context latent를 지원하는 ComfyUI/KJ 백엔드가 필요합니다.
해당 백엔드가 아직 ComfyUI draft PR 상태인 동안에는 `tools/DENO_Bernini_Preview_Backend_Update.bat`를 복사한 테스트용 포터블 ComfyUI 폴더에서만 사용하세요.

### `(Deno) Local LLM Loader` / `(Deno) Local LLM Reviewer`

내 PC에서 실행 중인 로컬 LLM을 ComfyUI 안에서 호출하고, LLM이 만든 review text로 저장 전 결과를 통과하거나 막는 노드입니다.

주요 기능: Ollama 또는 LM Studio 로컬 모델 호출, `127.0.0.1`/`localhost` 전용 안전 제한, provider별 모델 새로고침, 실행 중인 로컬 LLM 요청 중단, prompt batch를 한 번의 노드 실행으로 순차 처리, vision 모델용 IMAGE 첨부, Thinking/Result 프리뷰, Save 노드 앞 IMAGE/AUDIO gate, 현재 리뷰 결과 1회 승인, reviewer 앞 경로만 다시 실행.

오디오 참고: Local LLM Loader가 AUDIO를 직접 로컬 모델로 보내는 구조는 아닙니다. ComfyUI 기본 또는 다른 audio-capable text generation 노드가 review text를 만들면, Local LLM Reviewer가 그 review text 기준으로 AUDIO도 함께 통과하거나 차단할 수 있습니다.

## Why This Exists

이 노드들은 실제 ComfyUI 제작 과정에서 반복되는 세팅 피로를 줄이기 위해 만들어졌습니다. 목표는 거대한 기능 목록이 아니라, 매일 반복하는 워크플로우를 더 빠르고 깨끗하고 가르치기 쉽게 만드는 것입니다.

## Search Tips

GitHub, ComfyUI Manager, Registry에서 `deno custom nodes`, `ideogram`, `ideogram 4`, `ideogram director`, `json prompt`, `bbox`, `bounding boxes`, `layout prompt`, `rtx video super resolution`, `nvidia vfx`, `image compare`, `video compare`, `video preview`, `video to gif`, `gif webp`, `ltx 2.3`, `ltx model loader`, `ltx multi lora`, `prompt guide`, `system prompt`, `local llm loader`, `local llm prompt`, `local llm reviewer`, `prompt only`, `final prompt`, `ai reviewer`, `media reviewer`, `audio review gate`, `ollama`, `lm studio`, `bernini`, `bernini prompt guide`, `bernini conditioning`, `comfyui bernini`, `kj bernini`, `reference video edit`, `wan-2.2`, `wan2.2`, `visual fold` 같은 키워드로 찾을 수 있습니다.

## Install

ComfyUI의 `custom_nodes` 폴더 안에서 설치합니다.

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

그 다음 ComfyUI를 다시 시작하세요.

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
