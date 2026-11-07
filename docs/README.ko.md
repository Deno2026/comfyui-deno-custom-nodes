<p align="center">
  <img src="images/deno-custom-nodes-banner.jpg" alt="Deno Custom Nodes" width="100%">
</p>

<p align="center">
  <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Deno2026/comfyui-deno-custom-nodes?style=flat-square&label=release&labelColor=0F0E12&color=F2FF59"></a>
  <a href="https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes"><img alt="Comfy Registry" src="https://img.shields.io/badge/Comfy_Registry-deno--custom--nodes-2E1E38?style=flat-square&labelColor=0F0E12"></a>
  <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Deno2026/comfyui-deno-custom-nodes/ci.yml?branch=main&style=flat-square&label=CI&labelColor=0F0E12"></a>
  <a href="../LICENSE"><img alt="License: GPL-3.0-only" src="https://img.shields.io/badge/license-GPL--3.0--only-2E1E38?style=flat-square&labelColor=0F0E12"></a>
  <a href="https://www.youtube.com/@Denoise-AI"><img alt="YouTube" src="https://img.shields.io/badge/YouTube-Denoise--AI-2E1E38?style=flat-square&labelColor=0F0E12"></a>
</p>

<p align="center">
  <b>제작의 전 과정을 위한 실용 ComfyUI 노드 모음입니다.</b><br>
  입력을 준비하고, 모델을 연출하고, 결과를 비교하고, 최종 룩을 다듬고, 큰 그래프를 읽기 쉽게 유지합니다.
</p>

<p align="center">
  <a href="../README.md">English</a> · 한국어 · <a href="README.ja.md">日本語</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.es.md">Español</a> · <a href="README.pt-PT.md">Português (PT)</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.id.md">Bahasa Indonesia</a>
</p>

<p align="center">
  <a href="#빠른-시작">빠른 시작</a> · <a href="#워크플로-맵">워크플로 맵</a> · <a href="#웹-도구">웹 도구</a> · <a href="#포함된-노드">노드 레퍼런스</a> · <a href="#안전과-개인정보">안전</a> · <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest">최신 릴리스</a>
</p>

> [!NOTE]
> **v0.7.126 신규:** [`(Deno) MiniMax H3 Tiled Sampler`](#deno-minimax-h3-tiled-sampler)는 확대한 MiniMax H3 영상+오디오 latent를 겹치는 조각으로 나눠 마무리하므로, 16GB GPU에서도 고해상도 마지막 패스를 돌릴 수 있습니다.
>
> **v0.7.125**에서는 Local LLM 서버 주소, Easy Model Download Helper 링크, Ideogram Director 이미지 저장을 더 엄격하게 다듬었습니다. 노드 ID, 입력, 저장된 워크플로는 그대로입니다. [CHANGELOG](../CHANGELOG.md)를 참고하세요.

## 빠른 시작

ComfyUI가 설치되어 정상 실행되는 환경에서 시작하세요.

1. **ComfyUI Manager**에서 `Deno Custom Nodes`를 검색해 설치합니다.
2. ComfyUI를 다시 시작하고 브라우저 페이지를 새로고침합니다.
3. 캔버스의 빈 곳을 더블클릭하고 `(Deno) Resize Box`를 검색해 추가합니다.
4. 기본 `Load Image` 노드를 추가하고 이미지를 선택합니다. 이 노드를 Resize Box에 연결하고, Resize Box의 `image` 출력을 `Preview Image`에 연결합니다. 크기를 선택한 뒤 실행하면 조절된 이미지를 확인할 수 있습니다.

이 첫 예제에는 생성 모델이 필요하지 않습니다. 모델별 노드와 RTX 노드의 요구사항은 아래 각 노드에 적혀 있습니다. Manager를 사용하지 않는 경우에는 [수동 설치](#설치)를 참고하세요.

대부분의 Deno 노드는 ComfyUI 캔버스를 벗어나지 않고 도움말을 볼 수 있는 작은 초록색 `i` 버튼을 오른쪽 위에 포함합니다. 새 Deno Custom Nodes 버전이 있으면 버튼이 노란색으로 바뀌고 작은 `!` 배지가 표시됩니다.

## 워크플로 맵

<p align="center">
  <img src="images/readme/workflow-map.webp" alt="워크플로 맵: 준비, 생성, 비교, 마무리, 정리" width="920">
</p>

모든 Deno 노드는 ComfyUI 제작 흐름의 한 단계에 속합니다. 지금 작업 중인 단계에서 시작하세요.

### 01 · 준비

모델을 실행하기 전에 이미지, 참조, 크기를 모두 맞춥니다.

<p align="center">
  <img src="images/readme/multi-image-loader.webp" alt="이미지 6장 중 1장을 끈 Multi Image Loader" width="370">&nbsp;&nbsp;
  <img src="images/readme/h3-reference-loader.webp" alt="이미지 3장과 오디오 참조 2개가 있는 MiniMax H3 Multi Reference Image Loader" width="370">
</p>

| 노드 | 기능 | 필요 조건 |
| --- | --- | --- |
| [Resize Box](#deno-resize-box) | 비율, 메가픽셀, 크롭 리사이즈와 직접 끌 수 있는 실시간 크롭 미리보기 | — |
| [Multi Image Loader](#deno-multi-image-loader) | 순서가 있는 갤러리 하나와 케이블 하나. 카드를 클릭하면 삭제하지 않고 건너뜁니다 | — |
| [Advanced Image Source Loader](#deno-advanced-image-source-loader) | 폴더 업로드, 이어 붙인 배치, 크기가 섞인 `image_list` 출력 | — |
| [MiniMax H3 Multi Reference Image Loader](#deno-minimax-h3-multi-reference-image-loader) | 이미지 최대 9장과 오디오 3개를 각자의 크기 그대로 유지 | ComfyUI 0.30.0 이상 |

### 02 · 생성

레이아웃, 참조, 프롬프트, LoRA를 캔버스에서 읽기 쉽게 정리해 모델을 연출합니다.

<p align="center">
  <img src="images/readme/ideogram-director.webp" alt="생성된 포스터 위에 제목, 주제, 자동차, 태그라인 박스가 놓인 Ideogram Director 보드" width="640">
</p>

| 노드 | 기능 | 필요 조건 |
| --- | --- | --- |
| [Ideogram Director](#deno-ideogram-director) | bbox 레이아웃을 그리고 모델에 바로 쓸 Ideogram 4 JSON 캡션을 만듭니다 | Ideogram 4 워크플로 |
| [MiniMax H3 Acc LoRA Loader](#deno-minimax-h3-acc-lora-loader) | Alibaba 공식 8-step H3 Acc-LoRA를 변환 없이 불러옵니다 | 공식 Acc-LoRA 가중치 |
| [MiniMax H3 Tiled Sampler](#deno-minimax-h3-tiled-sampler) | 확대한 H3 영상을 16GB GPU에서 겹치는 조각으로 마무리합니다 | 순정 H3가 있는 ComfyUI 0.30.0 이상 |
| [MiniMax H3 R2V Audio Reference workflow](#minimax-h3-r2v-audio-reference-workflow) | `(Deno) Audio Transcript`와 `(Deno) Audio Analysis Finalizer`가 원본 오디오를 프롬프트 연출로 바꿉니다 | VideoHelperSuite, LM Studio |
| [LTX Model Loader](#deno-ltx-model-loader) | Checkpoint, KJ, GGUF 로딩 방식을 한 노드에 모았습니다 | 해당 모드는 KJNodes 또는 ComfyUI-GGUF |
| [LTX Sequencer](#deno-ltx-sequencer) | 이미지별 프레임과 strength를 지정하는 다중 이미지 가이드 시퀀싱 | — |
| [LTX Multi LoRA Loader](#deno-ltx-multi-lora-loader) | 영상·오디오 strength를 따로 지정하는 Power-LoRA 스타일 행 | — |
| [LTX Prompt Guide](#deno-ltx-prompt-guide) | 따옴표 안 대사에서 최소 길이를 계산하는 LTX 프롬프트 인코딩 | — |
| [LTX Tiled Spatial Upscaler](#deno-ltx-tiled-spatial-upscaler) | 영상 latent를 겹치는 공간 조각으로 업스케일 | LTX latent upscaler |
| [LTX High resolution Tiled Sampler](#deno-ltx-high-resolution-tiled-sampler) | 합쳐진 공간 조각으로 고해상도 LTX AV를 다듬습니다 | — |
| [Bernini Prompt Guide](#deno-bernini-prompt-guide) | 지시문 스타일의 positive·negative 프롬프트를 한 노드에서 | 순정 Bernini conditioning |
| [Multi LoRA Loader](#deno-multi-lora-loader) | 슬롯별 토글, strength, 메모를 갖춘 최대 64개 LoRA | — |
| [Easy Model Download Helper](#deno-easy-model-download-helper) | 공식 모델 링크와 정확한 대상 경로 확인 | — |
| [Text Encoder Unload](#deno-text-encoder-unload) | 프롬프트 인코딩 뒤에 선택해서 쓰는 VRAM 해제 지점 | — |
| [Prompt Text](#deno-prompt-text) | 긴 프롬프트를 위한 읽기 쉬운 multiline STRING 소스 | — |
| [Local LLM Loader and Reviewer](#deno-local-llm-loader-and-deno-local-llm-reviewer) | ComfyUI에서 로컬 LLM 프롬프트를 쓰고 저장 전에 검토 gate를 둡니다 | 로컬 LLM 서버 |

### 03 · 비교

저장하기 전에 캔버스에서 차이를 확인합니다.

<p align="center">
  <img src="images/readme/video-compare.webp" alt="선명한 호수 영상과 저해상도 호수 영상 사이의 Video Compare 슬라이더" width="370">&nbsp;&nbsp;
  <img src="images/readme/image-compare.webp" alt="선명한 도시 이미지와 픽셀화된 도시 이미지 사이의 Image Compare 슬라이더" width="370">
</p>

| 노드 | 기능 | 필요 조건 |
| --- | --- | --- |
| [Image Compare](#deno-image-compare) | 노드 안에서 슬라이더, 나란히 보기, 차이 보기, 토글 보기 | — |
| [Video Compare](#deno-video-compare) | 프레임 단위로 맞는 A/B 영상 재생, 오디오, 무손실 비교 출력 | — |
| [Video Preview](#deno-video-preview) | 그래프 어디서든 원본 해상도 H.264 미리보기를 노드 안에서 확인 | PyAV (최신 ComfyUI에 포함) |

### 04 · 마무리

최종 룩과 해상도를 정합니다.

<p align="center">
  <img src="images/readme/film-grain.webp" alt="그레인이 입혀진 인물 옆의 Film Grain 조절부" width="370">&nbsp;&nbsp;
  <img src="images/readme/rtx-vsr.webp" alt="RTX Video Super Resolution 패널" width="370">
</p>

| 노드 | 기능 | 필요 조건 |
| --- | --- | --- |
| [Film Grain](#deno-film-grain) | 해상도에 맞춰 조정되는 사진·영상용 CPU 필름 그레인 | — |
| [RTX Video Super Resolution](#deno-rtx-video-super-resolution) | NVIDIA VSR, High Bitrate, Denoise, Deblur와 명확한 리사이즈 선택지 | Windows, NVIDIA RTX, `nvidia-vfx` 0.2+ |
| [RTX Video Super Resolution (2 Pass)](#deno-rtx-video-super-resolution-2-pass) | 영상 전체 워크플로를 위한 정리 패스와 업스케일 패스 | Windows, NVIDIA RTX, `nvidia-vfx` 0.2+ |

### 05 · 정리

큰 그래프를 읽기 쉽게 유지합니다.

<p align="center">
  <img src="images/readme/visual-fold.webp" alt="Visual Fold: 선택한 노드 3개가 Folded · 3 알약 하나로 접힙니다" width="880">
</p>

| 도구 | 기능 | 필요 조건 |
| --- | --- | --- |
| [Visual Fold](#deno-visual-fold) | 서브그래프 없이 선택한 노드나 그룹을 알약 하나로 접습니다 | — |
| [Floating Tools](#deno-floating-tools) | VRAM 비우기, ComfyUI Stable 업데이트 상태, GPT/Gemini용 Error Help | 기본은 꺼짐 |
| [Node info button](#node-info-button) | 각 Deno 노드의 빠른 도움말과 업데이트 안내 | — |

## 웹 도구

브라우저에서 바로 실행할 수 있는 도구입니다. 설치할 것이 없습니다.

- [Deno Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - 두 렌더 영상을 슬라이더, 나란히 보기, 차이 보기, 토글 방식으로 비교하고, 비교 결과를 MP4로 저장합니다.
- [Deno Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - 짧은 영상을 자르고, 크롭하고, 리사이즈해서 GIF 또는 작은 WebP로 내보냅니다.
- [Deno Discord Media Compressor](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-discord/) - 영상이나 이미지를 줄여 가능하면 10MB 이하 디스코드용 파일로 저장합니다. 이 도구의 화면은 한국어로만 제공됩니다.

## 포함된 노드

워크플로 순서대로 정리한 전체 레퍼런스입니다. 각 항목은 노드가 하는 일로 시작하며, 예외 상황과 호환성 안내는 **자세히**를 열어 확인하세요.

### 01 · 준비

#### `(Deno) Resize Box`

ComfyUI용 해상도 도우미와 이미지 리사이즈 노드입니다.

<img src="images/readme/resize-box.webp" alt="크롭 상자가 원본 위에 놓이고 결과 미리보기가 함께 보이는 Crop Position 모드의 Resize Box" width="652">

주요 기능:

- `Preset Ratio`와 `Manual Input` 모드
- 자주 쓰는 비율 프리셋
- 메가픽셀 기반 크기 계산
- `divisible_by` 정렬
- `Center Crop (Fill)`, 비율이 고정되고 확대할 수 있는 `Crop Position (Fill)`, `Fit (Letterbox/Pillarbox)` 리사이즈 모드
- 기본 보간은 `lanczos`
- 실시간 비율 미리보기. `Crop Position (Fill)`은 연결된 원본 전체를 보여 주고, 크롭 상자를 끌어 위치를 옮기며, 모서리를 끌어 확대하는 동안에도 출력 비율과 메가픽셀은 고정됩니다
- 출력: `image`, `width`, `height`

#### `(Deno) Multi Image Loader`

배치 가이드 워크플로우에 맞춘 다중 이미지 로더입니다. **WhatDreamsCost**의 워크플로 아이디어에서 출발해 Deno 워크플로 스타일에 맞게 다듬었습니다.

<img src="images/readme/multi-image-loader.webp" alt="번호가 붙은 카드와 꺼진 카드 하나가 있는 Multi Image Loader 갤러리" width="452">

주요 기능:

- 노드 높이가 끝없이 늘어나지 않는 고정 높이 스크롤 갤러리
- 자리 표시가 안정적으로 들어가는 드래그 정렬
- 썸네일을 클릭해 이미지를 삭제하지 않고 켜고 끌 수 있음. 켜진 이미지만 출력되며 카드 순서대로 1, 2, 3… 번호가 붙고, 개수와 번호는 즉시 갱신됨
- 꺼진 이미지와 그 위치는 워크플로우에 저장되며, 실행하려면 한 장 이상 켜야 함
- 업로드 버튼, 드래그 앤 드롭 업로드, 이미지 붙여넣기
- 기존 ComfyUI `input` 이미지를 다시 쓰는 `Input Folder` 탐색기
- `Keep Input Ratio`, `Preset Ratio`, `Manual Input` 크기 모드. 비율 프리셋, 메가픽셀, divisible-by 크기 또는 가로·세로 직접 입력
- 리사이즈 방식과 보간 선택, 내보낼 때 선택형 크롭 또는 fit 리사이즈
- 출력: `multi_output`, `width`, `height`

<details>
<summary>자세히</summary>

- 폴더 타일, 더블클릭 이동, `Parent` 버튼으로 input 하위 폴더 탐색
- 중첩된 input 이미지를 ComfyUI 하위 폴더 경로를 유지한 채 추가
- 보안을 위해 ComfyUI `input` 폴더 밖으로 나가는 외부 심볼릭 링크·정션은 건너뜁니다. 이런 이미지는 `input` 폴더에 업로드하세요
- 파일 수정 시간 기준 최신순 input 이미지 정렬
- 이미지가 많아도 부드럽게 탐색할 수 있는 반응형 input 폴더 썸네일

</details>

#### `(Deno) Advanced Image Source Loader`

업로드한 이미지, ComfyUI input 폴더, 연결된 IMAGE 배치를 받아 크기가 섞인 이미지 리스트로 출력하는 고급 이미지 소스 로더입니다. 일반적인 ComfyUI `input` 폴더 워크플로에는 더 단순한 `(Deno) Multi Image Loader`를 계속 권장합니다.

<img src="images/readme/advanced-loader.webp" alt="업로드, 붙여넣기, 폴더, 경로 버튼과 masonry 갤러리가 있는 Advanced Image Source Loader" width="612">

주요 기능:

- 익숙한 Deno 이미지 로더 갤러리 사용 방식 유지
- 기존 ComfyUI `input` 폴더 탐색과 `Input Path`의 상대경로 입력 지원
- `Upload Folder`로 브라우저에서 고른 폴더를 ComfyUI input으로 가져오기
- 브라우저가 허용하는 범위에서 업로드, 드래그 앤 드롭, 붙여넣기, 폴더 업로드를 지원하며 눈에 보이는 `Paste` 버튼과 일반 Ctrl+V 이미지 붙여넣기도 지원
- 썸네일을 클릭해 소스를 삭제하지 않고 켜고 끌 수 있음. 켜진 카드에만 순서대로 출력 번호가 붙음
- 썸네일 카드를 끌어 출력 순서 변경
- 선택형 `images` 입력으로 상위 이미지 배치·리스트를 같은 출력 흐름에 이어 붙일 수 있음
- 일반 배치 워크플로용으로 리사이즈된 `batch` 텐서를, 이미지별 리스트 처리용으로 `image_list`를 출력
- 출력: `batch`, `image_list`, `width`, `height`, `image_count`

<details>
<summary>자세히</summary>

**0.7.120 이하에서 옮길 때:** 외부 폴더와 이미지 URL은 더 이상 읽거나 내려받지 않습니다. `Upload` 또는 `Upload Folder`를 사용한 뒤, 켜져 있는 예전 소스마다 업로드한 input 경로로 바꿔 주세요. 저장된 소스, 순서, 켜짐 상태, 연결은 그대로 보존됩니다. 꺼진 예전 소스는 실행을 막지 않습니다. `DENO_EXTERNAL_IMAGE_ROOTS`는 더 이상 접근을 허용하지 않습니다. ComfyUI input 안의 절대경로로 저장된 소스는 그대로 실행되며, 썸네일을 복원하려면 input 기준 상대경로로 다시 선택하세요.

- 폴더 타일, 중첩 폴더 탐색, `Parent` 버튼 지원
- 소스, 켜짐 상태, 순서를 바꾸지 않고 썸네일을 다시 읽으려면 `Refresh previews`를 사용하세요. 실패한 미리보기에 마우스를 올리면 안내가 표시됩니다
- 꺼진 소스는 다시 켜거나 삭제할 때까지 읽을 수 있는 상태로 워크플로우에 저장됩니다. 켜고 끄거나 순서를 바꾸면 출력 번호가 즉시 갱신됩니다
- 갤러리는 기존 캔버스와 Nodes 2.0 모두에서 노드의 가용 높이에 맞춰 배치됩니다
- 썸네일은 masonry 방식으로 배치되어 세로·가로 참조가 섞여 있어도 훑어보기 쉽습니다
- 중첩 폴더 이미지를 불러오는 `recursive_folders` 옵션
- `Keep Input Ratio`, `Preset Ratio`, `Manual Input` 크기 모드. 비율 프리셋, 메가픽셀, divisible-by 크기 또는 가로·세로 직접 입력
- 리사이즈 방식과 보간 선택. 중앙, 위, 아래 크롭 fill 모드 포함
- `Original Size` 리스트 모드는 `image_list`에서 섞인 원본 해상도를 그대로 유지
- `Match Batch Size` 리스트 모드는 `image_list`를 리사이즈된 배치와 같은 크기로 맞춤

</details>

#### `(Deno) MiniMax H3 Multi Reference Image Loader`

MiniMax H3 워크플로용 참조 로더입니다. 이미지는 한 줄로 연결하고 오디오는 파일별로 출력합니다.

<img src="images/readme/h3-reference-loader.webp" alt="참조 3개와 파형이 있는 오디오 행 2개가 보이는 MiniMax H3 참조 로더" width="483">

주요 기능:

- `(Deno) Multi Image Loader`와 같은 업로드, 붙여넣기, 드래그 앤 드롭, Input Folder, 카드 정렬, 삭제 사용감
- 전용 소켓 하나로 순서가 있는 참조 이미지 최대 9장 전달
- 각 이미지의 디코딩된 원본 크기와 비율을 리사이즈·크롭·패딩·레터박스 없이 개별 보존
- 미리보기 카드도 각 원본 비율을 그대로 사용하므로 가로·세로 참조가 섞여 있어도 잘림 없이 표시
- 썸네일을 클릭해 참조를 켜고 끌 수 있음. 켜진 카드는 `<Picture 1>`, `<Picture 2>`에 맞게 즉시 다시 번호가 붙고, 그 이미지들만 두 출력으로 전달됨
- 꺼진 이미지는 카드 위치를 유지한 채 저장되며 최대 9장 갤러리 공간 중 하나를 차지함. 실행하려면 이미지 또는 오디오 참조를 하나 이상 켜야 함
- `(Deno) MiniMax H3 Reference to Video`의 단일 `ref_images` 입력에 연결
- 같은 순서의 소스를 `image_list` 출력으로도 제공하여 `(Deno) Local LLM Loader`의 `image` 입력에 바로 연결 가능
- H3 노드는 ComfyUI 순정의 참조 영상, 영상에 딸린 오디오, 단독 오디오 Autogrow 입력을 그대로 유지

이미지 갤러리 아래의 접이식 오디오 목록에서는 `Add audio`, Input Folder 또는 파일 드롭으로 최대 3개 파일을 받습니다. 각 파일에는 파형, 측정된 길이, 미리듣기, 별도의 Use 토글, 순서 손잡이, 삭제 버튼이 있습니다. 미리듣기는 생성에 사용할지 여부를 바꾸지 않습니다. 영상 파일은 이 로더에서 받지 않습니다.

이 두 MiniMax H3 노드는 ComfyUI 0.30.0 이상이 필요합니다. 순정 H3 전체 구성에서 `Load Image` 노드 두 개만 Deno 한 줄 로더로 교체한 이식용 [MiniMax H3 다중 참조 워크플로](workflows/minimax-h3-multi-reference.json)를 함께 제공합니다.

<details>
<summary>자세히</summary>

오디오를 등록하면 기존 이미지 출력 두 개 뒤에 파일별 `AUDIO` 출력이 추가됩니다. 각 출력을 `(Deno) MiniMax H3 Reference to Video`의 늘어나는 단독 오디오 입력에 연결하고, 소리를 인코딩하려면 `audio_vae`도 연결하세요. 켜진 오디오 카드에만 카드 순서대로 `<Audio 1>`, `<Audio 2>` 번호가 붙습니다. 예를 들어 3개를 등록하고 앞의 두 파일을 끄면 세 번째 파일이 `<Audio 1>`로 표시되고 인코딩됩니다. 꺼진 파일과 그 케이블은 저장된 채 유지되며, 해당 파일에서 이어지는 일반 오디오 하위 분기는 실행에서 건너뜁니다. 순서를 바꿔도 케이블은 같은 파일에 붙어 있고, 파일을 삭제하면 그 파일의 오디오 케이블만 제거됩니다. 오디오만 불러와 사용하는 것도 가능합니다.

오디오 파일을 추가하면 노드 높이가 자동으로 늘어나 모든 오디오 행이 내부 스크롤 없이 보입니다. 파일을 삭제하거나 오디오 목록을 접으면 그 공간이 줄어듭니다. 직접 늘린 높이와 너비는 유지하며, 예전에 작게 저장한 워크플로우도 다시 열면 저장된 오디오 행이 보이도록 확장됩니다.

표시되는 번호와 H3 참조를 일치시키려면 같은 DENO 로더의 켜진 오디오 출력을 모두 같은 DENO H3 노드에 연결하세요. 연결하지 않을 파일은 끄면 됩니다. 이 DENO 오디오 출력을 사용할 때는 해당 H3 노드의 다른 단독 오디오 소스와 참조 영상의 사운드트랙을 분리해야 합니다. 번호가 충돌하면 서로 다른 번호를 몰래 붙이지 않고 노드가 충돌 이유를 안내합니다. 다른 오디오 로더만 사용하는 기존 워크플로우는 순정 입력 동작을 유지합니다.

오디오는 ComfyUI input 폴더에서 읽습니다. WAV, MP3, FLAC, OGG/OGA, Opus, M4A, AAC, AIF, AIFF를 지원하며 실제 디코딩 가능 여부는 설치된 PyAV가 결정합니다. 파일당 256 MiB, 디코딩한 PCM 128 MiB, CPU 디코딩 30초로 제한합니다. 미리보기 실패 시에는 Retry로 복구할 수 있고, 저장된 파일과 연결은 바뀌지 않습니다.

전용 H3 소켓을 둔 것은 의도된 설계입니다. 일반 ComfyUI `IMAGE` 배치는 가로·세로 크기가 모두 같아야 하므로 섞인 참조 크기를 보존할 수 없습니다. 추가된 `image_list`는 같은 크기의 배치가 아니라 리스트 출력이므로, 리스트를 받는 노드에서 재사용해도 원본 크기, 순서, 비율이 각각 분리되어 유지됩니다. MiniMax H3는 자체 `ref_image_size` 처리에서 비율을 유지한 채 참조 이미지를 축소할 수 있습니다.

H3의 VAE 선택 입력을 지원하는 ComfyUI에서는 `(Deno) MiniMax H3 Reference to Video`의 `vae` 또는 `audio_vae`를 연결하지 않아도 실행할 수 있습니다. 둘 다 연결하면 기존 참조 인코딩 방식이 유지됩니다.

- `vae`를 생략하면 참조 이미지·영상은 텍스트/시각 인코더에 전달되지만, VAE로 인코딩한 참조 잠재값은 전달되지 않습니다.
- `audio_vae`를 생략하면 참조 음성의 실제 소리는 인코딩되지 않습니다. 텍스트 인코더에는 음성 파형 대신 `<Audio 1>` 같은 표시만 남으므로, 목소리나 소리를 참조하려면 `audio_vae`를 연결하세요. 이 입력을 생략하는 것은 생성 오디오를 끄는 기능이 아닙니다.

참조 영상에 딸린 오디오(`ref_video_audio`)는 `vae`와 `audio_vae`를 모두 연결해야 참조 영상과 실제 소리가 인코딩되며, 단독 참조 오디오(`ref_audio`)는 `audio_vae`만 연결해도 됩니다.

이 선택은 이 노드의 참조 인코딩에만 적용됩니다. 뒤쪽 영상·오디오 디코딩 노드에 필요한 VAE 연결은 유지하세요. 순정 H3가 두 VAE를 필수로 요구하는 이전 ComfyUI에서는 여전히 둘 다 연결해야 하며, 선택 입력을 사용하려면 ComfyUI를 업데이트해야 합니다.

</details>

### 02 · 생성

#### `(Deno) Ideogram Director`

구조화된 JSON 캡션과 bbox 배치 작업을 위한 시각형 Ideogram 4 프롬프트 빌더입니다. [Ideogram Director 워크플로 데모 보기](https://youtu.be/Z8s27skkIDM).

<img src="images/readme/ideogram-director.webp" alt="같은 레이아웃으로 생성한 포스터 위에 레이아웃 박스 네 개가 놓인 Ideogram Director 보드" width="640">

위 배경은 같은 박스 네 개로 로컬에서 생성한 Ideogram 4 결과입니다.

주요 기능:

- 캔버스 위에서 bbox 영역을 직접 그리고 편집
- 개별 bbox 요소를 삭제하거나 순서를 바꾸지 않고 임시로 비활성화
- bbox를 더블클릭하면 포인터 옆에서 편집하고, 겹친 영역은 `Alt`+클릭을 반복해 아래쪽 bbox까지 순환 선택
- Local LLM Loader 또는 다른 STRING 출력에서 JSON 프롬프트 가져오기
- Summary와 Background STRING 입력을 연결하면 해당 실행에서 두 보드 값을 덮어쓰며, 연결하지 않으면 저장된 보드 내용을 그대로 사용
- 기존 보드가 있을 때 새 JSON으로 교체할지 먼저 확인하거나, 항상 교체하도록 전환
- 잘못된 JSON은 명확하게 거절하고 깨진 프롬프트를 뒤쪽 노드로 보내지 않음
- 스타일/레이아웃 프리셋 갤러리와 가벼운 미리보기 썸네일
- Language 보기로 장면 설명을 원하는 언어로 읽고 수정할 수 있으며, 최종 출력은 생성용 영어로 유지. 실제 TEXT 박스 단어는 간판, 로고, 제목처럼 그대로 보존
- 출력: `prompt`, `width`, `height`, `seed`, `bboxes`

<details>
<summary>자세히</summary>

기존 `bboxes` 출력은 일반 `BBOX` 소비자와 `Ideogram4_MultiLora_BoundingBoxNode_Fedor` 같은 `BOUNDING_BOX` 입력에 모두 연결할 수 있으며, 저장 필드를 추가하지 않고 Director의 활성 박스 수에 맞춰 해당 노드의 region 행 수를 동기화합니다. 상대 노드는 현재 박스 ID가 아니라 개수만 동기화하므로 중간 박스를 삭제하거나 순서를 바꾼 뒤에는 LoRA 행 배치를 다시 확인하세요.

번역 기능은 기본 제공되는 Google, MyMemory, LibreTranslate만 사용합니다. [파일·번역 접근 설정](SECURITY_CONFIGURATION.md)을 참고하세요.

</details>

#### `(Deno) MiniMax H3 Acc LoRA Loader`

Alibaba PAI가 공개한 공식 [MiniMax-H3-Acc-LoRAs](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs)를 변환하거나 safetensors 복사본을 만들지 않고 직접 불러옵니다.

1. 공식 FL2VA 또는 Ref2VA `Acc-8Step.safetensors`를 내려받아 기존 `ComfyUI/models/loras/` 또는 전용 `ComfyUI/models/minimax_h3_acc_loras/` 폴더 중 한 곳에 넣습니다.
2. 계열이 맞는 순정 MiniMax H3 diffusion model을 `model`에 연결합니다. 완전판과 Comfy-Org `*_pruned_*` 모델을 모두 연결할 수 있습니다.
3. FL2VA/T2VA 모델에는 FL2VA Acc-LoRA, Ref2VA 모델에는 Ref2VA Acc-LoRA를 선택합니다.
4. 노드의 단일 `model` 출력을 기존 guider 경로에 연결합니다.
5. ComfyUI 순정 노드로 샘플링 구성을 만듭니다. `BasicScheduler: simple, steps: 8`, `KSamplerSelect: euler`로 시작해 `SamplerCustomAdvanced`에 연결하는 구성을 권장합니다.

Deno Custom Nodes에는 LoRA 가중치와 워크플로우를 포함하지 않습니다. 가중치는 Alibaba 저장소에서 각자 내려받고, ComfyUI 순정 워크플로우를 직접 구성하거나 기존 그래프에 연결해 사용합니다.

<details>
<summary>자세히</summary>

노드가 일반 LoRA 가중치와 체크포인트의 32개 시간 구간별 PDD 출력 헤드를 함께 적용합니다. 샘플링할 때 ComfyUI가 넘겨주는 실제 sigma 경계를 읽고 해당 구간에 필요한 PDD 헤드를 자동으로 다시 묶으므로 sampler, scheduler, step은 ComfyUI 순정 노드에서 조절할 수 있습니다. 공식 학습·권장 설정은 Simple/Euler 8-step입니다. 사용자는 로더를 바꾸지 않고 Simple Scheduler의 4~12 step을 선택할 수 있으며, 그 밖의 내림차순 스케줄과 레이턴트 업스케일용 분할 sigma 패스도 실험할 수 있습니다. 다만 공식값 밖의 설정이 화질 향상을 보장하지는 않습니다. 영상/오디오 sigma shift는 순정 값인 `12.0 / 3.0`, LoRA strength는 `1.0`을 유지하세요.

완전판 non-pruned 모델은 ComfyUI 순정 INT8 모델을 포함해 전체 어댑터를 일반 양자화 대응 LoRA 경로로 적용합니다. 곡선 압축된 pruned 모델을 연결하면 `models/diffusion_models/`에 이미 있는 같은 계열의 non-pruned MiniMax H3 체크포인트를 자동으로 찾습니다. 그 파일 전체를 올리지 않고 작은 FP32 time-embedder 부분만 읽어, 폭이 전체인 AdaLN LoRA 50개를 pruned 8차원 곡선에 맞게 메모리에서 변환합니다. 맞는 full 체크포인트가 없더라도 실행을 막지 않습니다. 경고를 한 번 남기고 그 50개만 건너뛴 뒤 나머지 LoRA와 PDD 헤드는 모두 적용합니다.

v0.7.92~v0.7.94의 3출력 버전으로 저장한 표준 활성 UI 워크플로우는 ComfyUI 캔버스에서 열 때 자동 변환됩니다. 기존 model 연결은 그대로 두고, 예전 sampler와 sigmas 연결을 각각 사용자가 수정할 수 있는 순정 `KSamplerSelect: euler`와 `BasicScheduler: simple, steps: 8` 노드로 옮깁니다. 열린 뒤 UI 워크플로우를 한 번 저장하세요. 현재 단일 출력 워크플로우는 건드리지 않습니다. mute/bypass 상태, 정확히 판별할 수 없는 사용자 변경형, 손상된 그래프도 임의로 바꾸지 않습니다. raw API prompt JSON에는 이 frontend 변환이 실행되지 않으므로 변환된 UI 워크플로우에서 다시 API 형식으로 내보내야 합니다. 예전 sampler/sigmas 링크가 이미 사라진 채 저장된 파일은 순정 노드를 수동으로 다시 연결해야 합니다.

</details>

#### `(Deno) MiniMax H3 Tiled Sampler`

확대한 MiniMax H3 영상+오디오 latent를 겹치는 조각으로 나눠 마무리합니다. 16GB GPU에서도 고해상도 마지막 패스를 돌릴 수 있습니다. 매 스텝 모든 조각이 같은 화면을 읽고, 겹친 부분의 예측을 코사인 가중치로 섞은 뒤 한 번에 갱신합니다. 모델은 모든 조각에 한 번만 올리고, 원래 오디오 latent는 바꾸지 않고 그대로 내보냅니다.

<img src="images/readme/h3-tiled-sampler.webp" alt="조각 크기와 겹침 설정이 있는 MiniMax H3 Tiled Sampler" width="375">

순정 H3 그래프에서의 위치:

```text
First pass: SamplerCustomAdvanced with SplitSigmas high_sigmas
-> MiniMax H3 Latent Upscale With Model (ComfyUI 0.44.0+) or another H3 latent upscaler
-> (Deno) MiniMax H3 Tiled Sampler with SplitSigmas low_sigmas
-> VAE Decode for video, audio decode for sound
```

- `model`: LoRA, sigma shift, 어텐션·메모리 노드를 거친 H3 모델입니다. H3-Optimizations의 sparse attention과 memory optimization은 이 노드 앞에 두면 됩니다. ComfyUI 코어 `BlockSparseAttention`은 아직 지원하지 않아 안내와 함께 거절합니다.
- `positive`: 1차 패스와 같은 positive conditioning입니다. R2V 참조 이미지는 전체 화면 기준으로 그대로 쓰고, 키프레임 conditioning은 조각마다 잘라 조각별로 준비합니다. 영역 conditioning과 ControlNet은 거절합니다.
- `latent`: noise mask가 없는 확대된 H3 latent입니다.
- `sigmas`: 1차 스케줄의 마지막 1~3스텝만 연결합니다(예: `SplitSigmas`의 `low_sigmas`). 다른 스케줄은 안내와 함께 거절합니다.
- `seed`: 확대된 latent에 그 스케줄의 첫 sigma만큼 노이즈를 다시 입힐 때 쓰는 값입니다.
- `Tile width`, `Tile height`, `Overlap X`, `Overlap Y`: 32의 배수인 픽셀 크기입니다. 겹침은 조각보다 작아야 합니다. 조각 수는 화면 크기에서 정해지고, 조각이 화면보다 크거나 같으면 나누지 않고 한 번에 처리합니다.

기본값(조각 896 x 704, 겹침 최소 256 x 320)은 16GB에서 시험한 설정입니다. 16GB GPU·시스템 메모리 32GB에서 15초 1920 x 1088 영상이 6조각으로 나뉘었고, 마지막 1스텝이 약 520초 걸렸습니다. 조각이 클수록 겹침을 다시 계산하는 양은 줄지만 VRAM이 더 필요합니다. 기본값보다 큰 크기는 아직 DENO가 측정하지 않았습니다.

실행할 때마다 조각 수, 배치, 크기, 조각별 시간, PyTorch 최대 메모리를 콘솔에 남기고 같은 보고를 노드 출력 텍스트에도 붙입니다. 사용자나 에이전트가 이 값을 보고 다음 크기를 정할 수 있습니다. 순정 MiniMax H3를 지원하는 ComfyUI(0.30.0 이상)가 필요하며, ComfyUI 0.41.3~0.44.0에서 시험했습니다.

#### MiniMax H3 R2V Audio Reference workflow

[초보자용 오디오 레퍼런스 워크플로](workflows/minimax-h3-r2v-audio-reference.json)는 ComfyUI 순정 MiniMax H3 오디오 레퍼런스 경로를 유지하면서 자동 프롬프트 연출 단계를 더합니다.

- `(Deno) Audio Transcript`: 로컬 OpenAI Whisper로 가사·대사, 구간 시간, 감지 언어, 신뢰도 요약을 만듭니다. 사용자가 직접 입력한 가사·대사가 있으면 그 문구를 최우선으로 사용합니다.
- `(Deno) Audio Analysis Finalizer`: ComfyUI `TextGenerate` 결과에서 문서화된 음향 분석 항목만 남기고, 선택에 따라 분석용 CLIP 모델을 실행 후 내립니다.
- `(Deno) Local LLM Loader`: 선택형 `audio_context` STRING 입력으로 받아쓰기와 음향 보고서를 받습니다. 원본 AUDIO를 로컬 LLM에 직접 보내지 않으며, 자동 분석 결과는 지시가 아니라 참고 데이터로 취급합니다.
- 선택한 원본 오디오 구간은 H3의 `<Audio 1>` 레퍼런스이면서 최종 MP4에 그대로 들어가는 소리입니다. 이 워크플로에서는 H3 내부 생성음을 디코딩하지 않습니다.

필수 준비:

- MiniMax H3와 오디오 입력 `TextGenerate`를 지원하는 최신 ComfyUI Stable
- `Load Audio (Upload)`용 [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite)
- 음향 분석용 `gemma4_e4b_it_fp8_scaled.safetensors`를 `ComfyUI/models/text_encoders/`에 저장
- 최종 프롬프트 감독용 LM Studio의 `google/gemma-4-12b-qat` 모델과 실행 중인 Local Server

`openai-whisper`는 노드 의존성으로 설치됩니다. 선택한 Whisper 체크포인트는 `(Deno) Audio Transcript` 첫 실행 때 OpenAI 공식 주소에서 내려받고 공식 Whisper 로더가 체크섬을 검증하며, `ComfyUI/models/stt/whisper/`에 캐시됩니다.

#### `(Deno) LTX Model Loader`

LTX 2.3 모델 로딩 패턴을 한 노드로 정리한 로더입니다.

<img src="images/readme/ltx-model-loader.webp" alt="Checkpoint, KJ Style, GGUF Style 버튼이 있는 LTX Model Loader" width="372">

주요 기능:

- `Checkpoint Style`, `KJ Style`, `GGUF Style` 모드
- 출력: `model`, `clip`, `video_vae`, `audio_vae`
- 가능한 곳에서는 ComfyUI 기본 checkpoint / diffusion / DualCLIP 로딩 경로 사용
- 영상/오디오 VAE를 나눈 워크플로에는 KJNodes `VAELoaderKJ` 사용
- GGUF 워크플로에는 ComfyUI-GGUF UNet 로딩 사용. 두 팩 모두 ComfyUI가 불러온 뒤에만 사용하며, 설치돼 있지만 불러오지 못한 팩은 명확하게 알려 줍니다
- ComfyUI와 KJNodes가 섞인 환경을 위한 더 명확한 의존성 오류 안내와 오디오 VAE 호환 대체 경로 포함

#### `(Deno) LTX Sequencer`

멀티 이미지 LTX 워크플로우에 맞춘 가이드 시퀀서입니다. **WhatDreamsCost**의 LTX 워크플로 접근에서 출발해, 일상적인 사용성에 초점을 맞춰 Deno 쪽에서 조정했습니다.

<img src="images/readme/ltx-sequencer.webp" alt="이미지별 프레임과 strength 행이 있는 LTX Sequencer에 연결된 Multi Image Loader" width="720">

주요 기능:

- `(Deno) Multi Image Loader`의 배치 출력과 함께 사용
- 가능한 경우 연결된 로더에서 `num_images` 자동 채움
- 기존 sync 스타일 유지
- 필요할 때 `strength` 값만 따로 수동 제어 가능
- `bypass` 스위치는 `positive`, `negative`, `latent`를 바꾸지 않고 그대로 통과시켜 빠른 A/B 테스트에 사용

#### `(Deno) LTX Multi LoRA Loader`

LTX 워크플로우용 Power-LoRA 스타일 다중 LoRA 로더입니다.

<img src="images/readme/ltx-multi-lora.webp" alt="strength, video, audio 열이 있는 LTX Multi LoRA Loader" width="502">

주요 기능:

- 하나의 작은 노드에 여러 LoRA 추가
- 슬롯별 enable 토글
- 슬롯별 `strength`, `video`, `audio` strength 조절
- 슬롯별 trigger word와 LoRA 메모 편집
- LoRA 행에서 저장된 trigger word 복사
- 패치된 `model`과 `clip` 출력
- 익숙한 Power LoRA Loader 사용감에 가깝게 유지하면서 LTX에 맞는 A/V 조절과 가벼운 LoRA 참고 메모를 더했습니다

#### `(Deno) LTX Prompt Guide`

LTX 프롬프트 인코딩, 선택적 negative prompt, LTX conditioning, 대사 길이 계획을 함께 다루는 프롬프트 도우미입니다.

<img src="images/readme/ltx-prompt-guide.webp" alt="따옴표 안 대사로 계산한 최소 영상 길이를 보여 주는 LTX Prompt Guide" width="572">

주요 기능:

- positive prompt 텍스트 인코딩
- 접을 수 있는 선택형 negative prompt
- `frame_rate`가 포함된 LTX conditioning
- 따옴표 안 대사로 최소 영상 길이 추정
- Auto, Korean, English, Japanese, Chinese 대사 추정 지원
- 출력: `positive`, `negative`, `frame_rate`

#### `(Deno) LTX Tiled Spatial Upscaler`

고해상도 LTX 비디오 latent 2차 패스를 위한 도우미입니다. 각 프레임을 겹치는 공간 조각으로 나눠 조각마다 LTX latent spatial upscaler를 실행한 뒤, 결과를 하나의 latent로 다시 섞습니다.

비디오 전용 LTX latent에 사용하세요. 비디오/오디오가 결합된 latent는 먼저 오디오 경로를 분리하고, 타일 비디오 패스 뒤에 다시 합치는 흐름을 권장합니다.

#### `(Deno) LTX High resolution Tiled Sampler`

고해상도 LTX AV refinement 패스를 위한 샘플러입니다. 하나의 global sampler trajectory를 유지하면서 video prediction을 겹치는 spatial tile로 계산하고, sampler 갱신 전에 합칩니다.

전체 audio latent를 모든 video tile에 문맥으로 전달하고, `freeze` mode에서는 반환되는 audio latent를 입력 상태 그대로 유지합니다.

#### `(Deno) Bernini Prompt Guide`

KJ Bernini 방식의 프롬프트 도우미로, positive/negative 프롬프트 인코딩을 초보자도 쓰기 쉬운 한 노드로 합쳤습니다.

<img src="images/readme/bernini-prompt-guide.webp" alt="Official Wan2.2 negative 프리셋이 선택된 Image Edit 모드의 Bernini Prompt Guide" width="640">

위에 보이는 `Official Wan2.2` negative 프리셋은 중국어로 작성되어 있습니다.

주요 기능:

- `Text to Video`, `Image to Video`, `Reference Video Edit` 같은 읽기 쉬운 모드의 `System Prompt` 선택
- 현재 System Prompt prefix를 노드 맨 위에 바로 표시
- 지시문 스타일로 프롬프트 작성. 예: `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`
- 참조 모드에서는 내부적으로 짧은 `image0`, `image1`, `image2` 이름 힌트를 자동으로 추가
- 접을 수 있는 negative prompt 영역
- negative 프리셋은 눈에 보이는 negative prompt 칸을 채웁니다. 최종 인코딩되는 negative prompt를 바꾸려면 그 칸을 직접 수정하세요
- 출력: `positive`, `negative`

이 노드는 텍스트 conditioning만 준비합니다. `positive`와 `negative` 출력을 현재 ComfyUI Stable의 순정 `(Bernini) Conditioning` 노드에 연결하면 Bernini visual/context-latent conditioning을 구성할 수 있습니다. 최신 ComfyUI에는 [Bernini backend가 정식 병합](https://github.com/Comfy-Org/ComfyUI/pull/14216)되어 있으므로 예전 preview backend updater가 필요하지 않습니다. 순정 conditioning 노드가 보이지 않으면 ComfyUI Stable을 먼저 업데이트하세요.

#### `(Deno) Multi LoRA Loader`

일반 ComfyUI diffusion 워크플로용 다중 LoRA 로더입니다.

<img src="images/readme/multi-lora.webp" alt="슬롯 4개 중 하나가 꺼진 Multi LoRA Loader" width="502">

연결한 `MODEL`과 선택형 `CLIP`에 최대 64개 LoRA를 적용하고, 저장된 선택을 잃지 않은 채 슬롯별 enable/disable, model/CLIP strength, trigger word와 note, 슬롯 순서 변경을 관리한 뒤 패치된 `model`과 `clip`을 출력합니다. `+ Add LoRA`로 필요한 만큼 슬롯을 추가할 수 있습니다. 기존 8개 슬롯 워크플로와 API 프롬프트의 선택값·강도·트리거·메모·연결은 그대로 유지합니다.

#### `(Deno) Easy Model Download Helper`

권장 모델 파일 세트를 안내하는 프리셋 기반 설치 도우미입니다. 내장 프리셋은 LTX 2.3 8GB VRAM GGUF 시작 세트와 공식 LTX 2.5 Distilled INT8 2단계 모델 세트를 함께 제공합니다.

<img src="images/readme/model-download-helper.webp" alt="LTX 2.3 8GB VRAM 프리셋과 누락 파일 행이 있는 Easy Model Download Helper" width="612">

주요 기능:

- Python에서 파일을 내려받지 않고 공식 모델 링크를 브라우저로 열기
- 2단계 워크플로에 필요한 LTX 2.5 diffusion model, projection이 포함된 Gemma 4 text encoder, video/audio VAE, x2 spatial upscaler 포함
- 감지된 ComfyUI 모델 루트를 보여 주고 선택한 루트를 복사
- workflow 안에 creator preset을 저장하고, 페이지를 새로고침하면 브라우저 저장소에서 복원
- Hugging Face 직접 링크와 Civitai 페이지/다운로드 링크를 Python 쪽 네트워크 요청 없이 지원
- `extra_model_paths`의 사용자 지정 폴더 이름을 포함해 ComfyUI에 등록된 모델 폴더 확인
- 관련 없는 중첩 프로젝트 폴더를 뒤지지 않고, 등록된 모델 폴더 안에서 각 프리셋의 정확한 대상 경로 확인
- 파일을 어느 ComfyUI 모델 하위 폴더에 넣어야 하는지 정확히 알 수 있도록 대상 폴더 표시

LTX 2.5 저장소는 Hugging Face 계정과 **Agree and Access** 승인이 있어야 파일을 내려받을 수 있습니다. 이 도우미는 접근 제한을 우회하거나 파일을 자동으로 내려받지 않습니다. 먼저 [LTX-2 Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md)를 확인하고 [공식 LTX 2.5 저장소](https://huggingface.co/Lightricks/LTX-2.5)에서 접근 권한을 받은 뒤, 도우미가 여는 브라우저 링크로 파일을 내려받아 화면에 표시된 ComfyUI 모델 폴더에 옮기세요.

<details>
<summary>크리에이터 프리셋 링크 안내</summary>

- Hugging Face: 대상 파일 옆의 작은 다운로드 아이콘을 우클릭해 `링크 주소 복사`를 선택한 뒤, 그 직접 파일 URL을 프리셋 `URL` 칸에 붙여넣으세요.
- Civitai: 브라우저 주소창에서 모델 페이지 URL을 복사해 프리셋 `URL` 칸에 붙여넣고, 편집기의 `Civitai` 버튼을 눌러 직접 브라우저 다운로드 링크로 바꾸세요. URL에 파일명이 보이지 않으면 내려받은 파일명을 직접 입력하세요.
- Civitai 페이지에서는 직접 API 다운로드 URL을 제공하려는 의도가 아니라면 파란색 `Download` 버튼의 링크를 복사하지 마세요.
- `File name`은 대상 경로 확인에만 쓰입니다. 특히 Civitai/API 링크에서는 디스크에 내려받은 파일과 같아야 합니다.

![Hugging Face 링크 안내](images/easy-model-download-helper-huggingface-link.png)

[Civitai 모델 페이지 예시 (중국어 모델 설명 포함)](images/easy-model-download-helper-civitai-link.png).

![Civitai 프리셋 편집기 안내](images/easy-model-download-helper-civitai-node.png)

</details>

#### `(Deno) Text Encoder Unload`

일반적인 positive-only 또는 positive/negative 프롬프트 흐름에 직접 넣는 선택형 VRAM 장벽 노드입니다.

<img src="images/text-encoder-unload-workflow.png" alt="프롬프트 인코딩 뒤에 놓인 Text Encoder Unload" width="720">

- positive conditioning을 필수 `Positive Conditioning`에 연결하면 같은 객체가 그대로 출력됩니다.
- 실제 negative prompt의 인코딩 결과나 `Conditioning Zero Out`은 선택 `Negative Conditioning`에 연결하면 그대로 출력됩니다.
- 위쪽 Text Encode가 실제 사용한 정확한 CLIP을 `Text Encoder (CLIP)`에 연결합니다.
- positive-only guider 흐름에서는 `Negative Conditioning`을 비워 둡니다.
- 연결한 CLIP/text encoder와 clone, 그 관리 구성요소만 ComfyUI 모델 관리 경로로 내리며 diffusion model, VAE, ControlNet을 전역으로 내리지 않습니다.
- ComfyUI의 일반 입력 캐시를 따르므로 conditioning이나 CLIP 경로가 바뀌면 unload를 다시 실행하고, 입력이 같은 프리뷰 샘플링은 캐시를 재사용할 수 있습니다.

<details>
<summary>자세히</summary>

Dynamic VRAM은 메모리 압력에 따라 weight를 옮기므로 text encoder 일부가 의도적으로 남을 수 있습니다. 이 노드는 그 인코더를 확실히 내릴 시점을 직접 만드는 기능이지만, ComfyUI 프로세스 전체를 `0 MiB`로 만들지는 않습니다. CUDA context, conditioning tensor, 다른 모델과 커스텀 노드 할당, 다른 앱의 VRAM은 별개입니다. 또한 샘플링 품질 자체를 높이는 기능이 아니라, model offload나 OOM을 줄일 VRAM 여유를 만드는 기능입니다. 다음 text encode에서는 모델을 다시 불러오므로 더 느릴 수 있고, `--gpu-only`에서는 인코더를 VRAM 밖으로 옮길 수 없습니다.

</details>

#### `(Deno) Prompt Text`

system prompt, user prompt, template, JSON 같은 긴 문구를 담는 작은 multiline STRING 소스 노드입니다. 길고 재사용하는 프롬프트를 별도 노드에서 읽기 쉽게 보관했다가, 문구를 바꾸지 않은 채 Ideogram Director, Local LLM Loader 또는 다른 STRING 입력으로 연결할 때 사용합니다.

<img src="images/readme/prompt-text.webp" alt="multiline system prompt가 들어 있는 Prompt Text 노드" width="472">

#### `(Deno) Local LLM Loader` and `(Deno) Local LLM Reviewer`

내 PC에서 이미 실행 중인 모델을 호출하고, 텍스트 리뷰로 저장될 결과를 제어하는 Local LLM 워크플로 도우미입니다.

<p>
  <img src="images/readme/local-llm.webp" alt="LM Studio로 설정되고 Thinking·Result 패널이 보이는 Local LLM Loader" width="370">&nbsp;&nbsp;
  <img src="images/readme/review-gate.webp" alt="Review, Pass, Approve Once 컨트롤이 있는 Local LLM Reviewer" width="300">
</p>

주요 기능:

- ComfyUI에서 로컬 Ollama, LM Studio, llama.cpp, vLLM, Custom OpenAI-compatible, llama-swap, Unsloth Studio 모델 호출
- 기본 localhost 서버 안전 제한: `127.0.0.1` 또는 `localhost`를 사용하거나, `DENO_LOCAL_LLM_ALLOWED_HOSTS`로 사설 LAN `IP:port` 하나를 명시적으로 허용
- 노드에서 provider별 모델 목록 새로고침
- 모델을 내리기 전에 실행 중인 로컬 LLM 요청 중단
- prompt batch를 한 번의 노드 실행으로 연결해 batch가 끝날 때까지 로컬 모델을 유지
- vision 모델 호출에 IMAGE를 선택적으로 첨부
- 노드에서 Thinking과 Result 텍스트를 바로 미리보기
- Local LLM 노드가 실행될 때마다 노드의 최종 Result를 PNG/워크플로 메타데이터에 넣어, 파일을 다시 열면 노드 안에서 복원. Thinking/reasoning은 미리보기 전용이며 저장하지 않음
- 이름 붙인 System Prompt 프리셋을 ComfyUI 사용자 데이터에 보관하여 브라우저 프로필을 정리해도 유지
- `video seconds`에 양수 FLOAT를 연결하면 저장된 Prompt 텍스트를 바꾸지 않고 각 LLM user prompt에 `This is an 8-second video.` 같은 문장을 덧붙임
- `(Deno) Local LLM Reviewer`를 Save 노드 앞 gate로 사용: 리뷰 텍스트 결과에 따라 IMAGE와 AUDIO 출력을 통과시키거나 막고, 현재 리뷰된 결과를 한 번 승인하거나, reviewer 앞 경로를 다시 실행

<details>
<summary>서버 주소, API 키, provider 안내</summary>

Custom, llama.cpp, vLLM, llama-swap, Unsloth 서버 칸에는 서버 주소와 포트, 선택적으로 `/v1`만 넣을 수 있습니다. 예: `http://127.0.0.1:8000/v1`. 쿼리나 다른 경로는 안내와 함께 거절됩니다. Ollama와 LM Studio의 모델 새로고침, Unload, Stop은 노드가 실행할 때 쓰는 것과 같은 고정 로컬 서버를 항상 사용합니다. 서버 오류는 원본 응답 대신 서버의 JSON 오류 메시지로 표시됩니다.

- 모델 목록을 반복 새로고침하거나 provider를 바꿔도 감지된 모델 선택창은 하나만 유지됩니다. 이전 frontend에서 생긴 알려진 중복 선택창은 정리하며, 선택한 모델은 유지합니다
- 수동 또는 실행 후 unload에는 llama-swap의 실시간 실행 상태와 관리 API를 사용합니다. llama-swap에 설정된 서버 timeout이 자동 unload 시점을 계속 관리합니다
- `Unsloth` provider는 Unsloth Studio 서버 전용이며 기본 주소는 `http://127.0.0.1:8888/v1`입니다. Unsloth에서 받은 GGUF를 LM Studio에 불러 실행하는 경우에는 `LM Studio`를 선택하세요
- Unsloth Studio의 모델 조회와 OpenAI-compatible chat 요청을 사용하고 tool definition/tool choice 필드는 보내지 않으며, 수동 unload와 실행 후 unload에는 Unsloth Studio 관리 API를 사용합니다. `Keep for minutes`는 Unsloth timed unload를 예약하지 않습니다
- 기존 브라우저 System Prompt 프리셋은 한 번 가져올 수 있으며, 브라우저의 원본은 백업으로 그대로 남습니다
- 실제로 적용된 System Prompt 프리셋 이름을 노드와 편집기에서 확인할 수 있습니다. 수정해서 어느 프리셋과도 맞지 않는 텍스트는 `Custom`으로 표시됩니다

API 인증 키는 ComfyUI를 실행하는 PC의 환경변수에서 읽습니다.

| Provider | API key 환경변수 |
| --- | --- |
| LM Studio | 선택형 `DENO_LOCAL_LLM_LM_STUDIO_API_KEY`; 전용 키가 없으면 `DENO_LOCAL_LLM_API_KEY` 사용 |
| llama.cpp, vLLM, Custom, llama-swap | 선택형 `DENO_LOCAL_LLM_API_KEY` |
| Unsloth | 필수 `DENO_LOCAL_LLM_UNSLOTH_API_KEY`; 공통 키는 사용하지 않음 |
| Ollama | 공통 키를 보내지 않음 |

ComfyUI를 시작하기 전에 해당 환경변수를 설정하고, 키를 변경한 뒤에는 ComfyUI를 완전히 다시 시작하세요. 키는 모델 조회, chat과 provider가 지원하는 관리 요청에 Bearer token으로 보내며 LM Studio unload와 llama-swap 관리 요청에도 적용됩니다. 선택형 인증 provider는 키가 없으면 기존처럼 인증 헤더 없이 연결합니다. 키는 workflow나 PNG 메타데이터에 저장되지 않습니다.

같은 PC의 Docker에서 LLM 서버를 실행한다면 서버 포트를 host loopback에 공개하고 해당 로컬 URL을 사용하세요. 인증을 설정해도 localhost/사설 LAN 주소 제한은 그대로입니다. 설정한 키는 선택한 지원 provider의 서버로 보내므로 신뢰하는 서버만 사용하세요.

원격 LM Studio 참고: 현재 전용 `LM Studio` provider 주소는 `http://127.0.0.1:1234/v1`로 고정되어 있습니다. 같은 신뢰 가능한 LAN에 있는 본인의 다른 PC에서 LM Studio를 호출하려면, 그 PC의 LM Studio에서 **Serve on Local Network**를 켜고 ComfyUI를 시작하기 전에 정확한 주소를 허용 목록에 넣으세요(예: `DENO_LOCAL_LLM_ALLOWED_HOSTS=192.168.1.50:1234`). ComfyUI를 다시 시작한 뒤 `Custom`을 선택하고 Custom Server URL을 `http://192.168.1.50:1234/v1`로 설정하면 됩니다. 서버에서 인증을 요구하면 재시작 전에 ComfyUI PC의 `DENO_LOCAL_LLM_API_KEY`도 설정하세요. 허용 목록은 정확한 사설 IP와 포트 조합만 받으며 workflow나 PNG 메타데이터에는 저장되지 않습니다. Custom은 LM Studio 전용 unload 기능을 사용하지 않으므로, 방화벽에서 해당 포트를 ComfyUI PC로 제한하고 원격 모델 관리는 LM Studio에서 직접 하세요.

LM Studio 호환 참고: LM Studio가 생성 출력을 시작하기 전에 선택형 reasoning 제어 필드를 거부하면 노드는 그 필드만 뺀 요청으로 한 번 재시도합니다. 그 이후 reasoning 기본 동작은 선택한 서버와 모델이 결정하므로, Thinking toggle만으로 서버가 노출하지 않는 reasoning 모드를 강제할 수는 없습니다.

오디오 참고: Local LLM Loader는 원본 AUDIO를 로컬 모델에 직접 보내지 않습니다. 선택형 `audio_context` STRING 입력으로 상위 노드의 받아쓰기와 음향 보고서를 사용자 prompt를 바꾸지 않는 참고 데이터로 받을 수 있습니다. ComfyUI 기본 또는 다른 audio-capable text generation 노드가 review text를 만들면, Reviewer가 그 review text 기준으로 AUDIO도 함께 통과하거나 차단할 수 있습니다.

</details>

### 03 · 비교

#### `(Deno) Image Compare`

ComfyUI 캔버스에서 두 이미지를 빠르게 확인하는 시각형 A/B 비교 노드입니다.

<img src="images/readme/image-compare.webp" alt="선명한 도시 이미지와 픽셀화된 도시 이미지 사이의 Image Compare 슬라이더" width="640">

주요 기능:

- 노드 안에서 `image_a`와 `image_b`를 바로 비교
- 모드: `Slider`, `Side by Side`, `Difference`, `Toggle`
- 빠른 before/after 확인을 위한 마우스 이동 슬라이더
- 눈에 보이는 A/B 라벨과 양쪽 방향을 확인하는 `Swap` 버튼
- 노드 크기에 맞춰 내부 미리보기 영역이 바뀌므로 세로·가로 이미지 모두 읽기 쉬움
- 출력 연결이 없는 시각 전용 노드라서, 비교가 확인용일 때 그래프가 더 깔끔함

#### `(Deno) Video Compare`

업스케일과 FPS 보간 결과를 ComfyUI 캔버스에서 바로 확인하기 위한 비디오 A/B 비교 노드입니다.

<img src="images/readme/video-compare.webp" alt="슬라이더, 모드 버튼, 재생 컨트롤이 있는 Video Compare" width="720">

주요 기능:

- `video_a` / `video_b`(IMAGE 배치)와 선택형 `audio_a` / `audio_b`(AUDIO, 예: VHS *Load Video*)
- 모드: `Slider`, `Side by Side`, `Difference`, `Toggle`(정지 화면 A/B 전환), 그리고 `Swap`
- 마우스 이동 슬라이더, 클릭으로 재생/일시정지, 스크럽바, 프레임 스텝, 속도, 루프. 미리보기에 마우스를 올리면 선택한 쪽의 소리가 들림
- 클립 비율에 맞춰 노드 크기가 바뀜. 휠과 가운데 버튼 드래그는 ComfyUI 캔버스로 전달됨
- `🏷 Output Badges` 토글: 저장 출력에 A/B + 해상도 배지를 선택적으로 추가(기본은 꺼짐, 노드 안 미리보기에는 항상 표시)
- `comparison`: 선택한 모드(Slider / Side by Side / Difference / Toggle)의 원본 해상도 **무손실** IMAGE 출력으로, 선택한 FPS에서 VHS *Video Combine* 같은 저장/인코딩 노드에 바로 연결할 수 있음. `Toggle`은 선택한 A/B 쪽을 전체 구간에서 출력함

노드를 돌리기에 무겁다면 설치가 필요 없는 브라우저 도구를 사용하세요: **https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/** (노드 아래쪽에도 링크가 있습니다).

<details>
<summary>자세히 및 브라우저 도구</summary>

모든 합성은 외부 인코더 없이 순수 텐서 연산으로 처리합니다. 노드 안 플레이어는 축소한 WebP 프레임 시퀀스를 가상 시계에 맞춰 `<canvas>`에 그려 A/B가 프레임 단위로 맞게 하고, 오디오는 WebAudio로 재생합니다. 파일은 ComfyUI의 temp 폴더에 쓰이고 기존 `/view` 경로로 제공되며, 재시작하면 자동으로 정리됩니다.

공유 타임라인: A의 프레임 수와 선택한 FPS가 길이를 정합니다(A가 없으면 B 사용). 미리보기 양쪽과 저장 출력 모두 `Swap` 이후에도 이 길이를 사용하며, B는 A의 출력 프레임 수에 맞춰 전체 구간에서 샘플링됩니다. FPS 보간 결과는 같은 길이에서도 미리보기에서 더 부드럽게 보일 수 있습니다.

브라우저 도구에서 불러온 파일명에 마우스를 올리면 전체 이름이 표시됩니다. **Side by Side**를 고른 뒤 **Left / Right**(좌우) 또는 **Top / Bottom**(위아래)을 선택해 합본 배치를 미리 확인하세요. **Save MP4**는 두 영상 전체를 H.264 MP4로 내보내며, 24·30(기본)·60 fps를 지원하고 현재 Swap 순서, Sync 모드, 선택한 A/B 오디오(또는 음소거)를 반영합니다. 좌우는 두 영상의 높이, 위아래는 너비를 맞추고 원본 비율을 유지해 잘림 없이 합칩니다. 저장 길이는 A 전체 길이 기준이며, Time sync에서는 B가 먼저 끝나면 B의 마지막 화면을 유지하고, Ratio sync에서는 선택된 B 오디오를 포함해 B 전체 길이를 A에 맞춥니다. 확대와 미리보기 재생 속도는 저장된 영상에 영향을 주지 않습니다.

저장은 브라우저 안에서만 처리하며 파일을 업로드하지 않습니다. 영상 엔진을 처음 쓸 때 약 30 MB를 내려받으므로 준비하려면 인터넷 연결이 필요합니다. 크거나 긴 영상은 처리 시간과 브라우저 메모리가 많이 필요할 수 있으며, **Cancel**로 내보내기를 중단할 수 있습니다. 저장이 끝나면 저장 창에서 같은 MP4를 다시 내려받을 수 있습니다.

</details>

#### `(Deno) Video Preview`

그래프 어느 지점에서든 실제로 인코딩된 결과를 확인하는 원본 해상도 미리보기 노드입니다. PyAV로 프로세스 안에서(외부 프로세스 실행 없음) 원본 해상도 H.264 영상을 인코딩하고, 브라우저가 안정적으로 바로 재생하도록 `+faststart`를 사용합니다. 이미지는 그대로 통과시키므로 선을 갈라 연결하지 않고 **여러 샘플링 지점에 인라인으로** 넣을 수 있습니다.

<img src="images/readme/video-preview.webp" alt="해상도, FPS, 프레임 수 배지와 함께 인코딩된 클립을 재생하는 Video Preview" width="692">

주요 기능:

- `images`(IMAGE 배치) 입력, `images` 그대로 통과 출력, `frame_rate`, 그리고 미리보기에 AAC로 합쳐지는 선택형 `audio` 입력(dict / object / `(waveform, sr)` AUDIO와 `[C,N]` / `[N,C]` 형태 모두 처리. 오디오를 쓸 수 없으면 로그만 남기고 영상은 그대로 미리보기됨)
- VHS 미리보기처럼 조작 UI 없이 깔끔하게 자동 반복되는 노드 안 플레이어: **마우스를 올리면 소리**, **클릭으로 재생/일시정지**, **Full screen** 버튼, 휠은 ComfyUI 캔버스로 전달됨
- 왼쪽 위의 작은 정보 배지에 현재 미리보기의 해상도, FPS, 프레임 수, 길이 표시
- 노드가 클립 비율에 맞춰지고 크기를 바꿔도 맞춤 상태 유지
- 노드마다 임시 파일 하나를 실행할 때마다 덮어써서, 반복 작업을 해도 임시 저장 공간이 쌓이지 않음
- PyAV(`pip install av`)가 필요하며, 없으면 그래프를 실패시키지 않고 한 줄의 설치 안내를 표시

### 04 · 마무리

#### `(Deno) Film Grain`

사진 또는 디코딩된 영상 `IMAGE` 배치에 CPU로 단색 필름 그레인을 더합니다. 모델이나 추가 패키지 설치 없이 사용할 수 있습니다. 기본값은 미세·굵은 입자 75:25 혼합, 강한 입자의 부드러운 제한, 밝은 끝·깊은 검정에서의 강도 감소입니다. 입자 무늬에만 퍼짐을 적용하므로 원본 사진의 디테일은 흐리지 않습니다.

<img src="images/readme/film-grain.webp" alt="그레인이 입혀진 인물 미리보기 옆의 Film Grain 조절부" width="720">

최종 이미지 처리 뒤에 연결하세요.

- 사진: 최종 이미지 / 크기 조절 → **Film Grain** → **Save Image**.
- 순정 영상: 디코딩된 프레임 / 최종 크기 조절 → **Film Grain** → **Create Video** → **Save Video**. 원래 오디오와 FPS는 Create Video에 유지하세요.
- Video Helper Suite: 디코딩된 프레임 → **Film Grain** → **Video Combine**. 기존 오디오·FPS 설정을 유지하세요.

조절부는 ComfyUI의 언어 설정과 관계없이 영어로 표시되며, 다른 Deno 노드와 같은 작은 초록색 스타일을 사용합니다. **Strength**, **Grain size**, **Roughness**, **Tone protection**과 **Processing** 선택지 하나를 보여 줍니다. **Strength는 0~1**이며, 선택한 기본값 **`0.50`은 기존 코드 강도 `6`**, 최대 **`1.00`은 강도 `12`**에 대응합니다. **Low RAM**(기본)은 한 프레임씩 처리하고, **Balanced**는 2프레임, **Faster**는 4프레임을 함께 처리합니다. 그레인 결과는 같으며, 더 빠른 처리는 임시 RAM을 더 사용할 수 있습니다.

<details>
<summary>설정, 해상도 맞춤, 메모리</summary>

**Advanced**의 **Frames at once**에서 정확한 1~4 값을 지정할 수 있고, 이전에 쓰던 3프레임 설정도 그대로 유지됩니다. 그레인은 CPU에서 처리하며 생성 단계의 VRAM이나 저장 영상의 길이·파일 수를 바꾸지 않습니다. 출력 프레임 배치 전체를 담는 RAM은 별도로 필요합니다. 자세한 내용은 Processing 툴팁에서 확인하세요. 시드와 영상 구간 설정도 Advanced에 있습니다.

기존 워크플로의 값과 연결은 유지합니다. 저장된 강도가 새 슬라이더 범위보다 높아도 직접 조절하기 전에는 바꾸지 않습니다. 연결된 매개변수 입력은 기존 단위로 값을 전달하며, 해당 조절부는 비활성화되고 순정 입력 단자가 표시됩니다.

새 노드는 **Advanced → Grain scale → Match resolution**이 기본입니다. 입자 크기는 화면에 대한 상대값입니다. 노드는 **짧은 변 1536px**의 같은 비율 격자(선택한 2752×1536 기준)에서 원래 그레인을 만든 뒤, **단색 그레인만** 입력 크기에 맞춥니다. 강도와 미세·굵은 입자 혼합비는 그대로이며, 2752×1536에서는 원래 프리셋과 결과가 완전히 같습니다. 기존에 저장한 워크플로는 **Fixed pixels**로 이전 결과를 유지합니다. 새 동작을 쓰려면 Match resolution으로 바꾸세요. 이전 API 프롬프트에서 `grain_scale_mode`를 생략한 경우도 기존 픽셀 기준 결과를 유지합니다.

기준 무늬는 작은 프레임에 맞출 때 필터링하며, 줄어든 픽셀별 분산을 다시 증폭하지 않습니다. 다른 해상도를 같은 화면 크기로 볼 때 입자 크기와 보이는 세기를 더 일관되게 맞추기 위한 방식입니다. 아주 미세한 입자, 영상 압축, 플레이어 확대·축소 방식에 따른 차이는 남을 수 있으며 모든 플레이어에서 똑같이 보이는 것을 보장하지는 않습니다. 기준 격자가 16,777,216픽셀을 넘는 극단적으로 길쭉한 입력은 할당 전에 실패하며 Fixed pixels를 사용할 수 있습니다.

| 설정 | 기본값 | 용도 |
| --- | --- | --- |
| `enabled` | 켜짐 | 끄면 입력을 복사하지 않고 그대로 전달합니다. |
| `amount` | `6` | 저장·API의 8비트 밝기 기준 강도입니다. 패널 `0.5`는 강도 `6`, `1`은 강도 `12`이며 `0`이면 그대로 전달합니다. 기존 워크플로 보존을 위해 backend의 이전 범위는 유지합니다. |
| `grain_size` | `1` | Match resolution에서는 화면에 대한 상대적 입자 크기입니다. 1536px 기준의 퍼짐은 `0.45 / 1.15 px`이며 Fixed pixels에서는 입력 해상도에 그대로 적용합니다. |
| `roughness` | `0.25` | 굵은 입자의 비중입니다. 기본 혼합비는 미세·굵은 입자 `75:25`입니다. |
| `tone_weighted` | 켜짐 | 약간 어두운 중간톤에 질감을 주고 밝은 끝·깊은 검정에서는 줄입니다. |
| `temporal_mode` | `changing` | 프레임마다 무늬를 바꿉니다. `fixed`는 같은 무늬로 비교할 때 사용합니다. |
| `seed` | `2026100701` | 같은 입자와 프레임 순서를 재현합니다. |
| `frame_offset` | `0` | 영상을 나누어 처리할 때 해당 구간의 첫 프레임 번호를 입력합니다. |
| `processing_batch_size` | `1` | CPU에서 한 번에 처리할 프레임 수입니다. 1~4를 지원하며 1이 임시 RAM을 가장 적게 사용합니다. |
| `grain_scale_mode` | 새 노드 `resolution` | Match resolution은 기준 입자를 프레임 크기에 맞춥니다. `pixels`는 기존 픽셀 기준이며 이전 API에서 생략한 경우도 `pixels`입니다. |

같은 입자로 설정을 비교하려면 `seed`를 유지하고, ComfyUI의 시드 **생성 후 제어**를 `fixed`로 두세요.

선택한 묶음(1~4프레임)씩 계산해 임시 메모리가 영상 길이에 따라 늘지 않으며, 출력은 CPU에 두므로 VRAM에 전체 배치를 하나 더 만들지 않습니다. Match resolution은 기준 그레인 격자도 필요하므로 낮은 해상도에서도 Fixed pixels보다 임시 RAM을 더 사용할 수 있습니다. Low RAM은 이 작업을 한 프레임씩 처리합니다. **출력 IMAGE 배치 전체를 담는 RAM은 필요합니다.** 앞선 노드의 입력과 ComfyUI 캐시는 별도입니다. float32 RGB 기준 출력만 `프레임 수 × 가로 × 세로 × 12`바이트로, **1080p 한 프레임 약 23.7 MiB, 120프레임 약 2.78 GiB**입니다. 영상 파일 전체를 스트리밍하거나 앞선 노드의 캐시를 비우는 기능은 아니므로 긴 영상·고해상도 영상은 짧은 배치로 나누세요. 꺼짐·강도 0에서는 입력 객체를 그대로 전달합니다.

크기·채널 수·dtype를 유지하고 RGBA 알파는 바꾸지 않습니다. 이 노드는 픽셀만 처리하며 워크플로 metadata·인코딩·파일 생성은 기존 Save Image/Save Video가 담당합니다. 순정 `VIDEO` 단자는 Create Video 뒤에 연결하며 이 노드에 직접 연결하지 않습니다. 영상 압축에서는 미세 입자가 약해지거나 저장 파일 크기가 커질 수 있습니다.

</details>

#### `(Deno) RTX Video Super Resolution`

NVIDIA VFX에 맞는 Python 환경을 직접 찾아다니지 않고도 ComfyUI 안에서 NVIDIA RTX Video Super Resolution을 시도해 볼 수 있는 선택형 Windows/NVIDIA RTX 도우미 노드입니다.

<img src="images/readme/rtx-vsr.webp" alt="효과, 품질, 리사이즈 컨트롤이 있는 RTX Video Super Resolution 패널" width="612">

이 노드는 의도적으로 핵심 Deno 노드와 분리되어 있습니다. NVIDIA VFX는 업스케일을 실행할 때만 가져오므로, 일반적인 Deno 노드 설치에는 NVIDIA VFX가 필요하지 않습니다. ComfyUI Manager는 노드 팩만 설치하고 NVIDIA VFX는 자동으로 설치하지 않습니다.

| 이미지 상태 | 사용할 효과 |
| --- | --- |
| 작거나 해상도가 낮거나 압축이 심함 | `VSR` |
| 이미 깨끗하지만 더 크고 선명한 출력이 필요함 | `High Bitrate` |
| 노이즈나 그레인이 많음 | `Denoise` |
| 흐리거나 초점이 나갔거나 약간 번짐 | `Deblur` |

초보자용 설치 흐름:

1. `deno-custom-nodes`를 설치하거나 업데이트한 뒤 ComfyUI를 시작합니다.
2. `(Deno) RTX Video Super Resolution`을 추가하고 이미지 한 장으로 한 번 실행합니다.
3. NVIDIA VFX가 없거나 구버전을 갱신하려면 노드의 `How to install` 버튼을 누릅니다.
4. 설치 프로그램을 실행하기 전에 ComfyUI 창과 프로세스를 모두 닫습니다.
5. 시각적인 웹 설치 가이드를 따릅니다. 그 페이지에서 ZIP을 내려받아 `ComfyUI\custom_nodes\deno-custom-nodes\tools`로 옮기고, `Extract All`로 압축 해제 대상 폴더를 `tools` 폴더 자체로 지정한 뒤 `tools\install_rtx_vfx.bat`을 실행합니다. Windows가 `install_rtx_vfx_bat` 하위 폴더를 만들었다면, BAT를 실행하기 전에 `install_rtx_vfx.bat`과 `README_RTX_VFX_EASY_INSTALL.md` 두 파일을 `tools` 바로 아래로 옮기세요.
6. BAT가 `Install RTX VFX here?`라고 물으면, 표시된 Windows 경로가 방금 닫은 ComfyUI 앱 안일 때만 `Y`를 입력합니다. 경로가 이상해 보이면 `N`을 입력하고 중단하세요.
7. 녹색 `INSTALL COMPLETE` 메시지가 나올 때까지 기다립니다.
8. ComfyUI를 완전히 다시 시작한 뒤 `(Deno) RTX Video Super Resolution`을 다시 사용합니다.

초보자용 전체 시각 안내는 [Deno RTX VFX 설치 페이지](https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/)에서 확인하세요.
ComfyUI Manager로 설치한 뒤 `tools` 폴더를 열라고 안내하는 튜토리얼 영상을 보고 있다면 `tools/OPEN_INSTALL_GUIDE.txt`를 여세요. 같은 최신 설치 페이지를 가리킵니다.

<details>
<summary>런타임 요구사항, 업그레이드, 전체 기능</summary>

권장 NVIDIA 런타임은 `nvidia-vfx 0.2.0.0` 이상(VFX SDK 1.3)이며, 현재 설치 도우미도 이 버전 이상을 요구합니다. Windows 비교 시험에서 `0.1.0.1`의 반복 실행 중 나타난 NVIDIA 업데이트 확인 프로세스 누적이 `0.2.0.0`에서는 나타나지 않았습니다. 확인한 환경의 결과이며 모든 PC에서의 해결을 보장하지는 않습니다.

현재 런타임은 Windows 10/11 x64, 지원하는 NVIDIA RTX GPU, Python 3.10 이상 환경을 사용하세요. [현재 Comfy Org NVIDIA 노드](https://github.com/Comfy-Org/ComfyUI_Nvidia_VFX_Nodes#requirements)와 같은 CUDA 13 이상 PyTorch 환경을 권장합니다. NVIDIA의 x64 Windows 드라이버 최소 버전은 570.65(TCC 장치는 595)입니다. 설치 도우미는 실제 ComfyUI 환경에서 NVIDIA 효과를 검증하며 PyTorch나 드라이버를 자동으로 바꾸지 않습니다. 검증이 실패하면 그 안내에 따라 ComfyUI 환경을 준비하세요. NVIDIA 패키지 안에 VFX 런타임이 포함되어 별도 VFX SDK 설치 파일이나 CUDA Toolkit을 설치할 필요는 없습니다.

이미 `nvidia-vfx 0.1.x`를 사용한다면 **DENO 노드 업데이트만으로 이 선택형 NVIDIA 라이브러리가 갱신되지는 않습니다.** ComfyUI를 완전히 종료하고 위와 같은 가이드의 최신 설치 파일을 다시 실행하세요. 기존 워크플로의 연결과 설정은 유지되지만, NVIDIA 라이브러리를 올리면 처리한 이미지가 이전 결과와 달라질 수 있습니다. 이전 렌더 결과를 정확히 재현해야 한다면 이전 환경도 보존하세요.

NVIDIA 공식 참고 링크:

- [Video Super Resolution 필터](https://docs.nvidia.com/maxine/vfx/latest/Filters/VideoSuperResolution.html)
- [NVIDIA VFX Python 바인딩](https://docs.nvidia.com/maxine/vfx-python/latest/index.html)
- [현재 NVIDIA 패키지 요구사항·변경 이력](https://pypi.org/project/nvidia-vfx/)
- [현재 VFX SDK Windows 요구사항](https://docs.nvidia.com/maxine/vfx/latest/WindowsVFXSDK/GetStartedonWindows.html)
- [VideoSuperRes Python API](https://docs.nvidia.com/maxine/vfx-python/latest/api.html)

주요 기능:

- NVIDIA 공식 `nvidia-vfx` / `nvvfx.VideoSuperRes` 패키지 경로 사용
- 노드 UI에서 NVIDIA 공식 Video Super Resolution 문서로 연결
- 효과 버튼, 별도 품질 선택, 모드 안내 줄, 선택한 효과에 해당하는 리사이즈 컨트롤만 보여 주는 작은 RTX 패널
- 단일 패스와 2-pass RTX 패널 모두 마우스 휠 스크롤을 ComfyUI 캔버스로 전달하므로, 포인터가 노드 위에 있어도 일반 캔버스 확대·축소가 동작함
- 설치 도우미는 현재 ComfyUI 설치가 사용하는 Python을 대상으로 함
- 해당 Python으로 ComfyUI가 아직 실행 중이면 설치 도우미가 진행을 거부함
- 감지한 Python에 설치하기 전에 설치 도우미가 먼저 확인을 요청함
- NVIDIA GPU가 감지되지 않으면, 사용자가 확인을 명시적으로 무시하지 않는 한 설치 도우미가 중단됨
- 사용자가 대상 Python을 확인하면 설치 도우미가 `nvidia-vfx >= 0.2.0.0`을 깨끗하게 재설치하며, 이전 `0.1.x` 설치에서의 업그레이드도 포함됨
- 설치 도우미는 현재 ComfyUI Python이 쓰는 일반 `nvvfx` 패키지 경로를 먼저 검증함
- 일반 `nvvfx` 경로의 검증이 실패했을 때만 ASCII Windows 런타임 대체 경로를 사용함
- 노드 시작 시 기록된 ASCII 대체 경로는 그 대체 경로가 실제로 선택된 경우에만 우선 사용함
- 다른 NVIDIA VFX 네이티브 모듈이 충돌하는 경로에서 이미 로드되어 있으면, 네이티브 확장을 다시 로드하려 하지 않고 노드가 멈춘 뒤 ComfyUI 완전 재시작을 안내함
- 설치 도우미는 설치 후 NVIDIA `VideoSuperRes` 효과를 실제로 만들 수 있는지 검증함
- NVIDIA VFX가 지원하지 않는 런타임 기능을 보고하면, 노드가 원본 스택 트레이스 대신 읽기 쉬운 GPU/드라이버/런타임 경로 메시지를 표시함
- 다른 RTX 노드의 NVIDIA Broadcast/NGX VFX DLL이 이미 로드되어 있으면, 노드가 GPU/드라이버 지원 문제와 구분해 그 네이티브 런타임 충돌을 알려 줌
- 다른 Broadcast 기반 RTX 노드는 동작하는데 Deno가 실패한다면, Deno 설치가 깨졌다는 증거가 아니라 네이티브 런타임 충돌로 보세요
- 설치 BAT와 ZIP은 Manager 패키지 안이 아니라 GitHub에 두고, 노드 UI의 `How to install` 버튼이 시각적인 웹 설치 페이지와 `Copy steps` 도우미를 제공함
- 예전 튜토리얼 영상을 따라 하는 사용자도 `tools` 폴더를 찾을 수 있도록, Manager 설치본에 작은 `tools/OPEN_INSTALL_GUIDE.txt` 파일을 둠
- 네 가지 명확한 효과 버튼 제공: Video SR, High Bitrate, Denoise, Deblur
- 선택한 효과를 쉬운 말로 설명하는 작은 모드 안내 줄 표시
- Low, Medium, High, Ultra 품질은 별도 선택으로 유지
- Video SR과 High Bitrate에서 `Scale`, `Keep Ratio`, `Manual`, `Preset Ratio` 리사이즈 선택 지원
- `Keep Ratio`와 `Preset Ratio`는 목표 메가픽셀을 사용하고, `Manual`은 가로·세로를 사용
- 크기를 바꿀 수 있는 모드에 `divisible_by` 정렬을 제공하며 기본값 `1`이라 1920x1080 같은 표준 영상 크기가 정확히 유지됨
- 워크플로가 N의 배수 출력을 꼭 필요로 할 때를 위해 `32` 같은 더 큰 정렬 값도 계속 사용할 수 있음
- manual, preset-ratio, 정렬된 keep-ratio 리사이즈로 화면 비율이 달라질 수 있을 때 `Center Crop (Fill)` / `Fit (Letterbox/Pillarbox)` 표시
- `Denoise`와 `Deblur`는 원본 크기를 유지하고 리사이즈 컨트롤을 숨기며, 이는 NVIDIA의 같은 크기 VSR 모드와 같음
- Easy Upscale 출력: `images`
- 노드에는 조작부만 표시됩니다. 처리한 이미지는 `images` 출력을 Preview Image 또는 Image Compare에 연결해 확인하세요.

</details>

#### `(Deno) RTX Video Super Resolution (2 Pass)`

영상 전체 워크플로를 위한 2-pass RTX 마무리 노드입니다. 먼저 같은 크기의 `Denoise` 또는 `Deblur`를 선택적으로 실행하고, 그 다음 `VSR` 또는 `High Bitrate` 업스케일을 선택적으로 실행할 수 있습니다.

<img src="images/readme/rtx-2pass.webp" alt="정리 패스와 업스케일 패스가 있는 RTX Video Super Resolution 2 Pass 패널" width="632">

예제 워크플로우: [RTX 2-pass upscale workflow](workflows/deno-rtx-lowram-metabatch.json)

주요 기능:

- 예제 워크플로에 `Low System Memory`와 `High System Memory` 흐름이 모두 포함됨
- 저메모리 흐름은 VHS Meta Batch를 사용하므로 긴 영상도 더 작은 프레임 묶음으로 처리 가능
- `VHS_VideoInfoSource`로 원본 FPS를 `VHS_VideoCombine`에 전달
- VHS 불러오기/합치기 경로를 통해 원본 오디오 보존
- 이미지 배치 하나를 시험하는 데 그치지 않고 실제 인코딩된 비디오 결과를 마감할 때 유용
- 출력: `images`

### 05 · 정리

#### Deno Visual Fold

Deno Visual Fold는 큰 ComfyUI 그래프를 시각적으로 정리하는 전용 도우미입니다. 최신 Deno Custom Nodes 패키지를 설치하거나 업데이트하면 자동으로 활성화됩니다.

<img src="images/readme/visual-fold.webp" alt="초록색 Fold 배지가 붙은 선택 노드가 Folded · 3 알약 하나로 접힌 모습" width="880">

두 개 이상의 노드를 선택하면 ComfyUI의 기본 선택 툴바에 읽기 쉬운 초록색 `Fold` 배지가 나타납니다. 누르면 선택한 노드가 하나의 작은 시각적 그룹으로 접히고, `Unfold`로 다시 펼칠 수 있습니다.

일반 ComfyUI 그룹 하나를 선택하면 `Fold Group`으로 워크플로우 로직은 건드리지 않은 채 그룹 안의 노드를 접을 수 있습니다. 여러 그룹을 선택하면 같은 툴바에 왼쪽/오른쪽/위/아래 정렬과 가로/세로 간격 맞춤을 위한 읽기 쉬운 `Align` 배지도 나타납니다.

ComfyUI Subgraph와는 다릅니다. Subgraph는 노드를 하위 그래프로 옮기는 강력한 기능이지만, `Get` / `Set` 노드나 부모-자식 그래프 구조를 메인 그래프에 그대로 보이게 두어야 하는 워크플로우에는 맞지 않을 수 있습니다. Visual Fold는 단순한 시각 정리용입니다. 선택한 노드를 서브그래프로 바꾸거나 워크플로우 로직을 바꾸지 않습니다.

#### Deno Floating Tools

Deno Floating Tools는 `Settings > DENO > Tools`에서 직접 켜는 선택 기능이며 기본값은 꺼짐입니다.

활성화하면 ComfyUI 화면에 드래그할 수 있는 작은 Deno 아이콘이 나타납니다. 이 패널에서 ComfyUI 기본 메모리 정리 endpoint를 이용해 VRAM을 비우고, 현재 ComfyUI Stable과 최신 공개 버전을 읽기 전용으로 비교하며, 실행 실패 시 Error Help 보고서를 열 수 있습니다.

Error Help는 현재 워크플로, Python 실행 파일과 환경 종류, 패키지 버전, GPU 정보, 최근 traceback·로그 문맥, 커스텀 노드 요약을 담아 GPT/Gemini에 바로 전달할 수 있는 보고서를 만듭니다. 읽기 전용이며 먼저 별도 창에 보고서를 보여 주고, 사용자가 `Copy Report`를 눌렀을 때만 복사합니다. token, cookie, password, private key, URL credential처럼 흔한 비밀 값은 복사 전에 가립니다.

Floating Tools 자체는 설치, 업데이트, 재시작, 복구 또는 워크플로 수정을 실행하지 않습니다. 도구를 켜 둔 동안에만 ComfyUI의 요청 함수에 연결됩니다.

#### Node info button

대부분의 Deno 노드는 오른쪽 위에 작은 초록색 `i` 버튼을 포함합니다. 누르면 캔버스를 벗어나지 않고 노드의 용도, 주요 설정, 현재 릴리스 노트를 볼 수 있습니다. 새 Deno Custom Nodes 버전이 있으면 버튼이 노란색으로 바뀌고 작은 `!` 배지가 표시됩니다.

<img src="images/readme/node-help.webp" alt="버전과 릴리스 노트가 표시된 Resize Box의 노드 정보 팝업" width="720">

## 안전과 개인정보

Deno Custom Nodes는 파일, 네트워크, 비밀 정보 처리를 기본적으로 좁게 유지합니다.

- **파일:** 이미지 로더는 ComfyUI `input` 폴더만 읽습니다. 외부 경로나 URL을 쓰던 워크플로를 다시 열기 전에 외부 이미지를 먼저 업로드하세요. Ideogram Director의 Save Image는 이미지 파일만 복사합니다.
- **Local LLM:** 서버는 기본적으로 localhost입니다. 사설 LAN 서버는 정확한 `DENO_LOCAL_LLM_ALLOWED_HOSTS` 허용 목록으로만 쓸 수 있으며, API 키는 ComfyUI를 실행하는 PC의 환경변수에서 읽고 워크플로나 PNG 메타데이터에는 저장하지 않습니다.
- **번역:** Ideogram 번역은 기본 제공되는 Google, MyMemory, LibreTranslate만 사용합니다.
- **모델 링크:** Easy Model Download Helper는 공식 웹 링크를 브라우저로 열 뿐, Python에서 파일을 내려받지 않습니다.
- **보고서:** Error Help는 읽기 전용이며, 복사하기 전에 보고서를 먼저 보여 주고 token, cookie, password, private key 같은 흔한 비밀 값을 가립니다.

정확한 규칙은 [파일·번역 접근 설정](SECURITY_CONFIGURATION.md)을 참고하세요.

## 만든 이유

이 노드들은 실제 ComfyUI 제작 과정에서 반복되는 세팅 피로를 줄이기 위해 만들어졌습니다. 목표는 거대한 기능 목록이 아니라, 매일 반복하는 워크플로우를 더 빠르고 깨끗하고 가르치기 쉽게 만드는 것입니다.

## 검색 팁

- ComfyUI Manager와 Registry에서는 `Deno Custom Nodes`를 검색하세요.
- 캔버스에서는 `(Deno)` 또는 `Resize Box` 같은 노드 이름을 검색하세요.
- 도구와 요구사항은 [워크플로 맵](#워크플로-맵)에서 찾을 수 있습니다.

## 설치

권장하는 Manager 설치 방법은 [빠른 시작](#빠른-시작)을 참고하세요.

<details>
<summary>수동 설치와 업데이트</summary>

수동 설치는 ComfyUI의 `custom_nodes` 폴더 안에서 clone하고, ComfyUI를 실행하는 동일한 Python으로 의존성을 설치합니다.

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
cd comfyui-deno-custom-nodes
python -m pip install -r requirements.txt
```

수동 업데이트는 `git pull --ff-only`를 실행하고, 같은 Python으로 `requirements.txt`를 다시 설치한 뒤 ComfyUI를 재시작하세요. ComfyUI Manager/Registry 설치는 패키지 의존성을 자동으로 처리합니다.

</details>

## 라이선스

Deno 소유 노드, 문서, 예시, 워크플로우, 프로젝트 내 에셋은 GNU GPL v3.0 (`GPL-3.0-only`)으로 배포됩니다. [GPL-3.0 조건](../LICENSE)에 따라 사용, 학습, 수정, 재배포할 수 있으며 상업적 이용도 가능합니다. 수정본을 배포할 때는 GPL-3.0을 따르고 필요한 라이선스와 저작권 고지를 유지해야 합니다.

외부 모델, 체크포인트, LoRA, 라이브러리, 도구, 서비스는 각각의 라이선스와 이용 조건을 따릅니다. 특정 모델이나 에셋을 사용하거나 그 결과물을 공유·판매하기 전에 해당 조건을 확인하세요.

## 릴리스 노트

업데이트 내용은 [최신 릴리스](https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest)와 [CHANGELOG.md](../CHANGELOG.md)에서 확인할 수 있습니다.

## 링크

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
