# (Deno) MiniMax H3 Tiled Sampler

확대한 MiniMax H3 영상+오디오 latent를 겹치는 조각으로 나눠 마무리합니다. 16GB GPU에서도 고해상도 마지막 패스를 돌릴 수 있습니다. 매 스텝 모든 조각이 같은 화면을 읽고, 겹친 부분의 예측을 코사인 가중치로 섞은 뒤 한 번에 갱신합니다. 모델은 모든 조각에 한 번만 올리고, 원래 오디오 latent는 바꾸지 않고 그대로 내보냅니다.

```text
1차 패스: SplitSigmas high_sigmas를 쓰는 SamplerCustomAdvanced
-> MiniMax H3 Latent Upscale With Model(ComfyUI 0.44.0 이상) 또는 다른 H3 latent 확대 노드
-> SplitSigmas low_sigmas를 연결한 (Deno) MiniMax H3 Tiled Sampler
-> 영상은 VAE Decode, 소리는 오디오 디코드
```

## 입력값

| 이름 | 설명 |
| --- | --- |
| model | LoRA, sigma shift, 어텐션·메모리 노드를 거친 H3 모델입니다. H3-Optimizations의 sparse attention과 memory optimization은 이 노드 앞에 둡니다. ComfyUI 코어 `BlockSparseAttention`은 아직 거절합니다. |
| positive | 1차 패스와 같은 positive conditioning입니다. R2V 참조 이미지는 전체 화면 기준 그대로, 키프레임 conditioning은 조각마다 잘라 준비합니다. 영역 conditioning과 ControlNet은 거절합니다. |
| latent | noise mask가 없는 확대된 H3 영상+오디오 latent입니다. |
| sigmas | 1차 스케줄의 마지막 1~3스텝만 연결합니다(예: `SplitSigmas`의 `low_sigmas`). |
| seed | 확대된 latent에 그 스케줄의 첫 sigma만큼 노이즈를 다시 입힐 때 쓰는 값입니다. |
| Tile width | 조각 가로 픽셀, 32의 배수입니다. 기본 896(16GB에서 시험). |
| Tile height | 조각 세로 픽셀, 32의 배수입니다. 기본 704(16GB에서 시험). |
| Overlap X | 좌우로 붙은 조각의 최소 겹침 픽셀입니다. 32의 배수이고 조각 가로보다 작아야 합니다. 기본 256. |
| Overlap Y | 위아래로 붙은 조각의 최소 겹침 픽셀입니다. 32의 배수이고 조각 세로보다 작아야 합니다. 기본 320. |

조각 수는 화면 크기에서 정해지고, 조각이 화면보다 크거나 같으면 나누지 않고 한 번에 처리합니다. 기본값이면 1920 x 1088은 3 x 2 = 6조각입니다. 조각이 클수록 겹침을 다시 계산하는 양은 줄지만 VRAM이 더 필요합니다. 기본값보다 큰 크기는 아직 DENO가 측정하지 않았습니다.

## 출력값

| 이름 | 설명 |
| --- | --- |
| latent | 마무리된 H3 영상+오디오 latent입니다. 오디오 latent는 입력 오디오 그대로입니다. |

실행할 때마다 조각 수, 배치, 크기, 조각별 시간, PyTorch 최대 메모리를 콘솔에 남기고 같은 보고를 노드 출력 텍스트에도 붙입니다.
