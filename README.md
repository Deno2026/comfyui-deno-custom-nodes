# Deno Custom Nodex

한국 사용자가 ComfyUI에서 바로 써먹을 수 있는 실전형 커스텀 노드를 만드는 레포입니다.

이 프로젝트는 "기능은 많은데 복잡한 노드"보다,  
"자주 쓰는 작업을 더 빠르고 직관적으로 끝내는 노드"를 만드는 데 집중합니다.

## Project Goal

이 레포의 방향성은 명확합니다.

- 한국 사용자 친화적인 UX
- 직관적인 노드 이름과 검색성
- 실무에서 자주 쓰는 비율과 해상도 우대
- 초보자도 바로 이해할 수 있는 인터페이스
- 반복 작업을 줄여주는 실전형 도구 제공

앞으로 `(Deno)` 접두어를 공통으로 사용해서,  
노드가 늘어나도 한눈에 찾기 쉽고 브랜드가 정리되도록 구성할 예정입니다.

## Included Node

### `(Deno) Resize Box`

해상도 설정과 이미지 리사이즈를 한 번에 처리하는 실전형 노드입니다.

주요 기능:

- `Preset Ratio` / `Manual Input` 두 가지 모드
- 자주 쓰는 비율 프리셋 제공
  - `1:1`, `3:4`, `4:3`, `16:9`, `9:16`, `21:9`, `9:21` 등
- `megapixels` 기반 목표 해상도 계산
- `divisible_by`
  - `8`, `16`, `32`, `64`, `128`
- 리사이즈 방식 선택
  - `Center Crop (Fill)`
  - `Fit (Letterbox/Pillarbox)`
- 보간 방식 선택
  - 기본값 `lanczos`
- 노드 하단 실시간 비율 프리뷰
- 결과 출력
  - `image`
  - `width`
  - `height`

## Why This Exists

ComfyUI에서 해상도와 비율을 맞추는 작업은 생각보다 자주 반복됩니다.

예를 들면:

- 비율은 유지하면서 대략 몇 MP 정도로 갈지 정하고 싶을 때
- 8배수, 16배수, 64배수처럼 모델 친화적으로 맞추고 싶을 때
- 입력 이미지를 crop 할지 fit 할지 바로 정하고 싶을 때
- 세로형인지 가로형인지 노드 안에서 즉시 시각적으로 보고 싶을 때

`(Deno) Resize Box`는 이런 반복을 줄이기 위해 만든 노드입니다.

## Practical Tuning

이 노드는 단순히 "전체 픽셀 수만 가까우면 된다"는 방식으로 계산하지 않습니다.

실사용에서 자주 선호되는 해상도 숫자:

- `1920`
- `1536`
- `1088`
- `1024`
- `768`
- `720`
- `512`

이런 대표 숫자들을 더 자연스럽게 우대하도록 계산 로직을 튜닝했습니다.

즉, 비슷한 후보가 여러 개 있을 때는  
사용자 체감상 더 익숙하고 많이 쓰이는 해상도 조합이 먼저 선택되도록 설계되어 있습니다.

## Search Tips

노드 검색창에서는 아래 키워드로 찾기 쉽습니다.

- `deno`
- `resize`
- `box`
- `(deno)`

노드 이름 앞에 `(Deno)` 접두어를 붙인 이유도  
검색성과 정리감을 높이기 위해서입니다.

## Install

ComfyUI의 `custom_nodes` 폴더에서 설치:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

설치 후 ComfyUI를 재시작하면 됩니다.

## Who This Is For

이 레포는 특히 이런 사용자에게 잘 맞습니다.

- ComfyUI를 자주 쓰지만 해상도 세팅이 번거로운 사람
- 세로형/가로형 콘텐츠를 자주 만드는 사람
- 실전에서 많이 쓰는 숫자 위주로 빠르게 설정하고 싶은 사람
- 한국어 감성과 사용 흐름에 맞는 커스텀 노드를 선호하는 사람

## Roadmap

앞으로는 이런 방향으로 확장할 예정입니다.

- 한국 사용자가 자주 쓰는 실전형 커스텀 노드 추가
- 비율/해상도 관련 보조 노드 확장
- 초보자도 바로 이해할 수 있는 UI 강화
- 예제 워크플로우와 사용 가이드 보강
- 한국 사용자 중심의 반복 작업 자동화형 노드 추가

## Registry / Repository

- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes

## Notes

ComfyUI Registry에 배포할 때는 `pyproject.toml`의 버전 업데이트와 함께  
`REGISTRY_ACCESS_TOKEN`이 설정된 GitHub Actions 또는 Comfy CLI publish 흐름을 사용할 수 있습니다.
