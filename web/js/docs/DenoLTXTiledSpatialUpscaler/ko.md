# (Deno) LTX Tiled Spatial Upscaler

LTX latent spatial upscaler를 프레임 타일 단위로 실행한 뒤, 겹치는 부분을 섞어서 하나의 비디오 latent로 다시 만듭니다.

비디오 전용 LTX latent에 사용하세요. 비디오/오디오가 결합된 latent를 쓰는 워크플로우라면, 이 노드 앞에서 오디오 경로를 분리하고 타일 비디오 패스 뒤에 다시 합치는 흐름을 권장합니다.

## 입력값

| 이름 | 설명 |
| --- | --- |
| samples | 업스케일할 비디오 전용 LTX latent입니다. |
| upscale_model | LTX latent spatial upscaler 모델입니다. |
| vae | 업스케일러 주변 latent 채널 통계를 맞추는 데 쓰는 LTX VAE입니다. |
| Frame width split count | 각 프레임의 가로폭을 몇 칸으로 나눌지 정합니다. `2`는 왼쪽/오른쪽 타일입니다. |
| Frame height split count | 각 프레임의 세로높이를 몇 칸으로 나눌지 정합니다. `3`은 위/가운데/아래 타일입니다. |
| overlap | 입력 latent 토큰의 겹침입니다. 값이 클수록 더 많은 문맥을 섞지만 시간이 더 걸립니다. |
| blend_mode | 겹친 구간의 가중 곡선입니다. 기본 시작점은 `hann`을 권장합니다. |
| aggressive_memory_cleanup | 타일 사이에 추가 정리를 실행합니다. 속도는 느려질 수 있지만 VRAM 조각화 완화에 도움이 될 수 있습니다. |
| debug | 타일 계획과 shape 진단 정보를 ComfyUI 콘솔에 출력합니다. |

## 출력값

| 이름 | 설명 |
| --- | --- |
| upscaled_latent | 타일 패스로 재구성한 업스케일 비디오 latent입니다. |
