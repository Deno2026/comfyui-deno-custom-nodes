# (Deno) MiniMax H3 Acc LoRA Loader

Loads Alibaba PAI's official MiniMax H3 Acc-LoRA/PDD safetensors directly. No converted copy is required.

1. Download the matching FL2VA or Ref2VA `Acc-8Step.safetensors` from [Alibaba PAI](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs).
2. Put it in either the normal `ComfyUI/models/loras/` folder or the dedicated `ComfyUI/models/minimax_h3_acc_loras/` folder, then refresh or restart ComfyUI.
3. Connect a matching native MiniMax H3 diffusion model. Full and Comfy-Org `*_pruned_*` variants are accepted.
4. Connect the single returned `model` to your guider.
5. Use stock ComfyUI sampling nodes. Start with `BasicScheduler: simple, steps: 8` and `KSamplerSelect: euler`, then connect them to `SamplerCustomAdvanced`.

The node applies both the ordinary LoRA updates and the checkpoint's 32 time-dependent PDD output heads. It reads the actual sigma boundaries from the active sampling pass and automatically fuses the required PDD heads for each interval. Sampler, scheduler, and step controls therefore stay in the normal ComfyUI nodes.

Use FL2VA Acc-LoRA with FL2VA/T2VA and Ref2VA Acc-LoRA with Ref2VA. The official 8-step Simple/Euler setup is still the trained and recommended configuration. You can select any Simple Scheduler step count from 4 through 12 without changing this loader, and other descending schedules or split sigma passes remain open for experimentation; settings outside the official recipe are not guaranteed to improve quality. Keep strength `1.0` and the native video/audio sigma shifts `12.0 / 3.0`.

Full non-pruned models, including native ComfyUI INT8 variants, apply the complete adapter through ComfyUI's quantization-aware LoRA path. With a curve-pruned model, the loader automatically looks for a matching non-pruned H3 checkpoint in `models/diffusion_models/`. It reads only that file's small FP32 time-embedder section and derives an in-memory bridge for all 50 AdaLN LoRA updates; the full checkpoint is not loaded. If no matching full checkpoint is installed, the loader stays usable in compatibility mode, warns once, skips those 50 AdaLN updates, and still applies every other LoRA update and the PDD heads.

Workflows saved with the earlier three-output version must reconnect sampler and sigmas through stock ComfyUI nodes.

Deno Custom Nodes does not bundle the LoRA weights or a workflow.
