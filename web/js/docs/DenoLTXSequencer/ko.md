# (Deno) LTX Sequencer

여러 장의 정지 이미지를 한 노드에서 LTX 비디오 latent의 guide로 추가합니다. 프레임 위치, 음수 인덱스, strength, guide attention metadata는 현재 ComfyUI의 LTX Add Guide 동작을 따릅니다.

이미지 입력은 lazy 방식입니다. `bypass`가 켜져 있거나 `num_images`가 `0`이면 upstream 이미지 경로를 실행하지 않습니다.

## 입력값

| 이름 | 설명 |
| --- | --- |
| positive / negative | guide keyframe과 attention metadata를 받을 LTX conditioning입니다. |
| vae | 각 guide 이미지를 인코딩할 LTX video VAE입니다. |
| latent | 비디오 전용 LTX latent입니다. 기반 guide 연산은 audio/video 결합 latent를 지원하지 않습니다. |
| multi_input | 이미지 배치입니다. 배치 순서대로 `num_images`만큼 사용합니다. |
| num_images | 배치에서 사용할 이미지 수입니다. `0`이면 이미지 경로를 비활성화합니다. |
| insert_mode | 각 guide 위치를 프레임 또는 초 단위로 해석합니다. |
| frame_rate | 초 단위 위치를 프레임 인덱스로 변환할 때 사용합니다. |
| strength_sync | 화면에 보이는 strength 값을 함께 편집하기 위한 프런트엔드 편의 기능입니다. |
| bypass | `multi_input`을 실행하지 않고 conditioning과 latent를 그대로 반환합니다. |
| insert_frame_N / insert_second_N | N번째 guide의 시작 위치입니다. 음수 프레임 인덱스는 현재 ComfyUI LTX Add Guide 방식에 따라 영상 끝에서부터 계산합니다. |
| strength_N | N번째 guide의 영향력입니다. `0`이면 인코딩과 guide 추가를 생략하고 `1`이면 최대 guide 강도입니다. |

## 출력값

positive와 negative conditioning에는 guide metadata가 포함되고, latent에는 guide frame과 noise mask가 추가됩니다. guide가 포함된 비디오 latent를 디코딩하기 전 적절한 위치에서 공식 `LTXVCropGuides`를 사용하세요.
