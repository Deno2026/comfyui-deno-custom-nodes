# (Deno) Text Encoder Unload

샘플링 전에 필요한 텍스트 인코딩을 모두 끝낼 수 있는 워크플로에서만 사용하세요. 이 노드는 전역 VRAM 정리 명령이 아니라 그래프 안에 직접 넣는 실행 순서 장벽입니다.

순정 positive/negative KSampler 연결 예시:

```text
CLIP -> positive Text Encode -> value -> Text Encoder Unload -> KSampler positive
   |     negative Text Encode ---------------------> KSampler negative
   |             +-----------------> wait_for
   +--------------------------------> clip
```

`value`는 샘플러로 보낼 값을 받아 같은 객체를 그대로 반환합니다. 최신 ComfyUI에서는 연결된 입력 타입을 출력이 그대로 따르는 타입 매칭 소켓을 사용합니다. `clip`에는 인코딩 노드들이 실제 사용한 동일한 CLIP을 연결해야 합니다. `wait_for`는 값을 바꾸거나 반환하지 않는 의존성 전용 입력이며, 별도의 negative/positive 또는 다른 인코딩 분기가 unload 전에 끝나도록 보장합니다.

이 노드는 연결된 `clip.patcher`와 clone만 ComfyUI의 선택 해제 경로로 내립니다. `unload_all_models()`를 사용하지 않으므로 diffusion model, VAE, ControlNet을 의도적으로 내리지 않습니다. `--gpu-only`처럼 CLIP의 load device와 offload device가 같은 GPU라면 인코더를 VRAM 밖으로 옮길 수 없으므로 명확한 오류로 중단합니다.

ComfyUI가 관리하는 text encoder weight를 GPU에서 내리고 사용하지 않는 allocator cache를 정리하지만, 프로세스 전체가 `0 MiB`가 된다고 보장하지는 않습니다. CUDA context, 살아 있는 conditioning tensor, 다른 모델과 커스텀 노드 tensor, 다른 프로세스는 이 노드의 대상이 아닙니다.

캐시 때문에 unload 동작이 생략되지 않도록 이 노드는 매 queue마다 변경된 것으로 처리됩니다. 따라서 입력이 같아도 아래쪽 샘플링은 다시 실행되며, 이후 text encode는 모델을 다시 올려야 합니다. 반복 프롬프트 인코딩 속도보다 샘플링 VRAM 여유가 더 중요할 때만 사용하세요.
