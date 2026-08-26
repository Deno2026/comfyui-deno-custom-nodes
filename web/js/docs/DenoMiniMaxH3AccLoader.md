# (Deno) MiniMax H3 Acc LoRA Loader

Loads Alibaba PAI's official MiniMax H3 Acc-LoRA/PDD safetensors directly. No converted copy is required.

1. Download the matching FL2VA or Ref2VA `Acc-8Step.safetensors` from [Alibaba PAI](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs).
2. Put it in `ComfyUI/models/minimax_h3_acc_loras/` and refresh or restart ComfyUI.
3. Connect a matching full, non-pruned native MiniMax H3 diffusion model.
4. Connect the returned `model` to your guider, and connect `sampler` plus `sigmas` to `SamplerCustomAdvanced`.

The node applies both the ordinary LoRA updates and the checkpoint's time-dependent PDD output heads. It automatically supplies Euler and the exact trained 8-step sigma schedule, so there are no sampler or step widgets to set.

Use FL2VA Acc-LoRA with FL2VA/T2VA and Ref2VA Acc-LoRA with Ref2VA. The current official checkpoints require full-width AdaLN layers, strength `1.0`, video/audio sigma shifts `12.0 / 3.0`, and their exact schedule. A pruned model or another schedule stops with a clear error instead of running an unsupported approximation.

Deno Custom Nodes does not bundle the LoRA weights or a workflow.
