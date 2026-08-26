# (Deno) MiniMax H3 Acc LoRA Loader

Alibaba PAI의 공식 MiniMax H3 Acc-LoRA/PDD safetensors를 변환 복사본 없이 직접 불러옵니다.

1. [Alibaba PAI 저장소](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs)에서 사용할 모델 계열에 맞는 FL2VA 또는 Ref2VA `Acc-8Step.safetensors`를 내려받습니다.
2. 파일을 기존 `ComfyUI/models/loras/` 또는 전용 `ComfyUI/models/minimax_h3_acc_loras/` 폴더 중 한 곳에 넣고 모델 목록을 새로고침하거나 ComfyUI를 재시작합니다.
3. 같은 계열의 순정 MiniMax H3 diffusion model을 연결합니다. 완전판과 Comfy-Org `*_pruned_*` 모델을 모두 사용할 수 있습니다.
4. 출력 `model`은 guider에, `sampler`와 `sigmas`는 `SamplerCustomAdvanced`에 연결합니다.

노드는 일반 LoRA 업데이트와 시간 구간별 PDD 출력 헤드를 함께 적용합니다. Euler와 정확한 공식 8-step sigma 스케줄을 자동 출력하므로 샘플러나 step 위젯을 따로 설정하지 않습니다.

FL2VA/T2VA에는 FL2VA Acc-LoRA를, Ref2VA에는 Ref2VA Acc-LoRA를 사용하세요. 현재 공식 체크포인트는 strength `1.0`, 영상/오디오 sigma shift `12.0 / 3.0`, 정확한 전용 스케줄을 요구합니다. 다른 스케줄은 명확한 오류로 중단합니다. 곡선 압축된 pruned 모델에서는 직접 적용할 수 없는 full-width AdaLN LoRA 50개만 호환 모드에서 건너뛰고 나머지 LoRA와 PDD 헤드는 모두 적용합니다. 완전판 모델에서는 전체 어댑터를 적용합니다.

Deno Custom Nodes에는 LoRA 가중치와 워크플로우를 포함하지 않습니다.
