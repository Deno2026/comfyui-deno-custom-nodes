# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

ComfyUI에서 반복되는 이미지, 비디오, LTX, RTX, 모델 설치 작업을 더 빠르고 편하게 정리하기 위한 Deno 커스텀 노드 모음입니다.

이 문서는 한국어 빠른 안내입니다. 노드별 전체 세부 기능은 원문 [README](../README.md)를 기준으로 유지합니다.

![DENO Visual Fold](images/deno-visual-fold.webp)

## 바로 열기

- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- ComfyUI Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
- YouTube: https://www.youtube.com/@Denoise-AI
- Video Compare: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/
- Video to GIF/WebP: https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/
- RTX VFX 설치 가이드: https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/

## 설치

가장 쉬운 방법은 ComfyUI Manager 또는 Registry에서 `deno-custom-nodes`를 설치하는 것입니다.

직접 설치하려면 ComfyUI의 `custom_nodes` 폴더 안에서 아래 명령을 실행한 뒤 ComfyUI를 다시 시작하세요.

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

## 주요 기능

- DENO Visual Fold: 여러 노드나 그룹을 시각적으로 접어서 큰 워크플로우를 정리합니다. 워크플로우 로직은 바꾸지 않습니다.
- Video Compare 웹 도구: 설치 없이 브라우저에서 두 영상을 슬라이더, 나란히 보기, 차이 보기로 비교합니다.
- Video to GIF/WebP 웹 도구: 짧은 영상을 잘라 GIF 또는 작은 WebP로 변환합니다.
- RTX Video Super Resolution 노드: NVIDIA RTX VFX 기반 업스케일을 ComfyUI에서 테스트할 수 있게 돕습니다.
- LTX 도구: LTX 2.3 모델 로딩, 시퀀스, LoRA, 프롬프트 흐름을 더 편하게 정리합니다.
- 이미지 로더와 비교 노드: 여러 이미지를 불러오고, 리사이즈하고, 결과를 캔버스 안에서 바로 비교합니다.

## 포함된 노드 요약

- `(Deno) Resize Box`: 해상도, 비율, 메가픽셀, 크롭/핏 리사이즈를 정리합니다.
- `(Deno) Multi Image Loader`: 여러 이미지를 업로드, 붙여넣기, 폴더 탐색으로 불러와 배치 워크플로우에 사용합니다.
- `(Deno) Advanced Image Source Loader`: 외부 폴더, 로컬 경로, 웹 이미지 URL, 혼합 크기 이미지 리스트를 다룹니다.
- `(Deno) Image Compare`: 두 이미지를 ComfyUI 캔버스 안에서 바로 비교합니다.
- `(Deno) Video Compare`: 두 비디오 배치를 프레임 기준으로 비교하고 결과 이미지를 출력합니다.
- `(Deno) Video Preview`: 중간 결과 비디오를 실제 인코딩 상태로 확인합니다.
- `(Deno) RTX Video Super Resolution`: NVIDIA VFX 업스케일을 간단히 실행합니다.
- `(Deno) RTX Video Super Resolution (2 Pass)`: 디노이즈/디블러 1차 처리와 업스케일 2차 처리를 나누어 실행합니다.
- `(Deno) LTX Sequencer`: LTX 멀티 이미지 워크플로우의 strength 흐름을 정리합니다.
- `(Deno) LTX Model Loader`: LTX 2.3 체크포인트, KJ, GGUF 로딩 패턴을 한 노드로 정리합니다.
- `(Deno) Easy Model Download Helper`: 권장 모델 파일 세트를 직접 링크와 경로 안내로 설치할 수 있게 돕습니다.
- `(Deno) LTX Multi LoRA Loader`: 여러 LTX LoRA와 트리거 단어를 한 노드에서 관리합니다.
- `(Deno) LTX Prompt Guide`: LTX 프롬프트, 네거티브 프롬프트, 대사 길이 예측을 함께 정리합니다.

## 초보자 안내

- 막히면 오류 메시지와 ComfyUI 화면 스크린샷을 함께 남겨주세요.
- 토큰, 비밀번호, 인증 코드가 보이는 화면은 가리고 공유하세요.
- RTX VFX 관련 문제는 먼저 ComfyUI를 완전히 종료한 뒤 설치 가이드를 순서대로 따라가세요.
- 전체 노드 옵션과 스크린샷은 영어 원문 [README](../README.md)를 참고하세요.
