# Deno Custom Nodes

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

한국 사용자가 ComfyUI에서 바로 써먹을 수 있는 실전형 커스텀 노드를 만드는 저장소입니다.

복잡한 기능을 무작정 많이 넣기보다, 자주 반복되는 작업을 더 빠르고 직관적으로 처리하는 데 초점을 맞추고 있습니다.

## Included Node

### `(Deno) Resize Box`

해상도 설정과 이미지 리사이즈를 한 번에 처리하는 노드입니다.

주요 기능:

- `Preset Ratio` / `Manual Input` 두 가지 모드
- 자주 쓰는 비율 프리셋 제공
- `megapixels` 기반 목표 해상도 계산
- `divisible_by` 정렬 지원
- `Center Crop (Fill)` / `Fit (Letterbox/Pillarbox)` 지원
- `lanczos` 기본 보간
- 노드 하단 실시간 비율 프리뷰
- 출력: `image`, `width`, `height`

## Why This Exists

ComfyUI에서는 해상도와 비율을 자주 바꾸게 됩니다.

예를 들면:

- 비율은 유지한 채 MP 기준으로 적당한 크기를 잡고 싶을 때
- 8, 16, 32, 64, 128 배수에 맞춰야 할 때
- 입력 이미지를 crop 할지 fit 할지 바로 바꾸고 싶을 때
- 지금 선택한 결과가 세로형인지 가로형인지 시각적으로 확인하고 싶을 때

`(Deno) Resize Box`는 이런 반복 작업을 더 편하게 만들기 위해 만든 노드입니다.

## Practical Tuning

이 노드는 단순히 총 픽셀 수만 맞추는 방식이 아니라, 실제로 많이 쓰는 대표 해상도를 우대하도록 계산됩니다.

우대 숫자 예시:

- `1920`
- `1536`
- `1088`
- `1024`
- `768`
- `720`
- `512`

그래서 비슷한 후보가 여러 개일 때, 실사용에서 더 익숙한 값이 우선 선택되도록 구성되어 있습니다.

## Search Tips

다음 키워드로 쉽게 찾을 수 있습니다.

- `deno`
- `resize`
- `box`
- `(deno)`

## Install

`custom_nodes` 폴더에서 설치:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

설치 후 ComfyUI를 재시작하면 됩니다.

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
