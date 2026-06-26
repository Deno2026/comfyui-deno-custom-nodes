# (Deno) LTX AV Step-Fused Tiled Sampler

LTX AV latent의 비디오 부분을 겹치는 프레임 타일로 refinement하면서, 모든 비디오 타일에 전체 오디오 latent를 문맥으로 전달합니다.

v1의 `audio_mode`는 `freeze`입니다. 오디오는 비디오 refinement의 문맥으로 쓰지만, 반환되는 오디오 latent 자체는 입력 상태 그대로 유지합니다. AV final pass에서는 예전 video-only tiled sampler 대신 이 경로를 사용합니다.

## 입력값

| 이름 | 설명 |
| --- | --- |
| noise | global AV sampler trajectory에 한 번 사용하는 노이즈 소스입니다. |
| guider | LTX AV 2차 패스에 쓰는 BasicGuider 또는 CFGGuider입니다. |
| sampler | ComfyUI sampler 객체입니다. 이 노드는 sampler update를 전역으로 유지합니다. |
| sigmas | low-denoise AV refinement 패스의 sigma schedule입니다. |
| latent_image | 비디오와 오디오가 들어 있는 LTX AV nested latent입니다. 비디오는 타일 처리하고 오디오는 그대로 유지합니다. |
| Frame width split count | 각 프레임의 가로폭을 몇 칸으로 나눌지 정합니다. `2`는 왼쪽/오른쪽 타일입니다. |
| Frame height split count | 각 프레임의 세로높이를 몇 칸으로 나눌지 정합니다. `3`은 위/가운데/아래 타일입니다. |
| overlap | 각 모델 예측 타일에서 겹칠 비디오 latent 토큰 수입니다. |
| audio_mode | `freeze`는 오디오를 비디오 디노이즈 문맥으로 쓰되 오디오 자체는 바꾸지 않습니다. |
| blend_mode | 겹친 구간의 가중 곡선입니다. 기본 시작점은 `hann`을 권장합니다. |
| aggressive_memory_cleanup | AV 타일 예측 사이에 추가 정리를 실행합니다. 속도는 느려질 수 있지만 VRAM 조각화 완화에 도움이 될 수 있습니다. |
| debug | AV hook 호출, sigma label, 타일 진단 정보를 ComfyUI 콘솔에 출력합니다. |

## 출력값

| 이름 | 설명 |
| --- | --- |
| output | refinement된 AV latent입니다. 비디오는 타일 처리되고 오디오는 입력 상태 그대로 유지됩니다. |
| denoised_output | callback x0에서 나온 denoised AV latent입니다. 비디오는 x0이고 오디오는 입력 상태 그대로 유지됩니다. |
