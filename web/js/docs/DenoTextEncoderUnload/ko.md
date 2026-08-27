# (Deno) Text Encoder Unload

positive-only 또는 positive/negative 텍스트 인코딩을 샘플링 전에 끝낼 수 있는 워크플로에서 사용하세요. 이 노드는 전역 VRAM 정리 명령이 아니라 그래프 안에 직접 넣는 실행 순서 장벽입니다.

순정 positive/negative KSampler 연결 예시:

```text
CLIP -> positive Text Encode -> Positive Conditioning -> KSampler positive
   |     negative Text Encode -> Negative Conditioning -> KSampler negative
   +---------------------------> Text Encoder (CLIP)
```

`Positive Conditioning`은 필수이며 원래 positive conditioning을 그대로 통과시킵니다. `Negative Conditioning`은 선택이며 실제 negative prompt의 인코딩 결과 또는 `Conditioning Zero Out`을 받을 수 있습니다. positive-only guider 흐름에서는 비워 두면 됩니다. 연결된 두 분기가 모두 끝난 뒤 unload하며, `Text Encoder (CLIP)`에는 인코딩 노드들이 실제 사용한 동일한 CLIP을 연결해야 합니다.

이 노드는 연결된 `clip.patcher`와 clone만 ComfyUI의 선택 해제 경로로 내립니다. `unload_all_models()`를 사용하지 않으므로 diffusion model, VAE, ControlNet을 의도적으로 내리지 않습니다. `--gpu-only`처럼 CLIP의 load device와 offload device가 같은 GPU라면 인코더를 VRAM 밖으로 옮길 수 없으므로 명확한 오류로 중단합니다.

ComfyUI가 관리하는 text encoder weight를 GPU에서 내리고 사용하지 않는 allocator cache를 정리하지만, 프로세스 전체가 `0 MiB`가 된다고 보장하지는 않습니다. CUDA context, 살아 있는 conditioning tensor, 다른 모델과 커스텀 노드 tensor, 다른 프로세스는 이 노드의 대상이 아닙니다.

이 노드는 ComfyUI의 일반 입력 캐시를 따릅니다. conditioning과 CLIP 그래프 입력이 같으면 통과 결과와 아래쪽 프리뷰 샘플링을 캐시에서 재사용하고, 해당 입력이 바뀌면 노드를 다시 실행해 연결된 encoder를 내립니다. 따라서 Group Bypasser 같은 프리뷰 후 업스케일 워크플로에서 마음에 든 프리뷰를 다시 만들지 않고 업스케일 구간만 진행할 수 있습니다. 이후 text encode가 필요하면 모델을 다시 올려야 합니다. positive와 negative를 넘는 conditioning을 요구하는 특수 guider는 초보자용인 이 노드의 범위에서 의도적으로 제외합니다.
