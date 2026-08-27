# (Deno) MiniMax H3 Acc LoRA Loader

Alibaba PAI의 공식 MiniMax H3 Acc-LoRA/PDD safetensors를 변환 복사본 없이 직접 불러옵니다.

1. [Alibaba PAI 저장소](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs)에서 사용할 모델 계열에 맞는 FL2VA 또는 Ref2VA `Acc-8Step.safetensors`를 내려받습니다.
2. 파일을 기존 `ComfyUI/models/loras/` 또는 전용 `ComfyUI/models/minimax_h3_acc_loras/` 폴더 중 한 곳에 넣고 모델 목록을 새로고침하거나 ComfyUI를 재시작합니다.
3. 같은 계열의 순정 MiniMax H3 diffusion model을 연결합니다. 완전판과 Comfy-Org `*_pruned_*` 모델을 모두 사용할 수 있습니다.
4. 하나뿐인 `model` 출력을 guider에 연결합니다.
5. ComfyUI 순정 샘플링 노드를 사용합니다. 먼저 `BasicScheduler: simple, steps: 8`, `KSamplerSelect: euler`로 설정한 뒤 `SamplerCustomAdvanced`에 연결하는 구성을 권장합니다.

노드는 일반 LoRA 업데이트와 체크포인트에 들어 있는 32개 시간 구간별 PDD 출력 헤드를 함께 적용합니다. 샘플링할 때 실제로 들어온 sigma 경계를 읽고 각 구간에 필요한 PDD 헤드를 자동으로 다시 묶습니다. 따라서 sampler, scheduler, step 조절은 ComfyUI 순정 노드에서 그대로 할 수 있습니다.

FL2VA/T2VA에는 FL2VA Acc-LoRA를, Ref2VA에는 Ref2VA Acc-LoRA를 사용하세요. 공식 학습·권장 설정은 여전히 Simple/Euler 8-step입니다. 로더를 바꾸지 않고 Simple Scheduler의 4~12 step을 선택할 수 있으며, 그 밖의 내림차순 스케줄이나 레이턴트 업스케일용 분할 sigma 패스도 실험할 수 있습니다. 공식값 밖의 설정이 화질 향상을 보장하지는 않습니다. strength는 `1.0`, 영상/오디오 sigma shift는 순정 값인 `12.0 / 3.0`을 유지하세요.

완전판 non-pruned 모델은 ComfyUI 순정 INT8 모델을 포함해 전체 어댑터를 양자화 대응 LoRA 경로로 적용합니다. 곡선 압축된 pruned 모델에서는 `models/diffusion_models/`에 이미 있는 같은 계열의 non-pruned H3 체크포인트를 자동으로 찾습니다. 파일 전체를 올리지 않고 작은 FP32 time-embedder 부분만 읽어 AdaLN LoRA 50개를 pruned 곡선에 맞게 메모리에서 변환합니다. 맞는 full 체크포인트가 없더라도 실행을 막지 않으며, 경고를 남기고 그 50개만 건너뛴 뒤 나머지 LoRA와 PDD 헤드는 모두 적용합니다.

이전의 3출력 버전으로 저장한 워크플로우는 업데이트 후 sampler와 sigmas를 ComfyUI 순정 노드로 다시 연결해야 합니다.

Deno Custom Nodes에는 LoRA 가중치와 워크플로우를 포함하지 않습니다.
