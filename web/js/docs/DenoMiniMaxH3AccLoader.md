# (Deno) MiniMax H3 Acc LoRA Loader

Loads Alibaba PAI's official MiniMax H3 Acc-LoRA/PDD safetensors directly. No converted copy is required.

1. Download the matching FL2VA or Ref2VA `Acc-8Step.safetensors` from [Alibaba PAI](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs).
2. Put it in either the normal `ComfyUI/models/loras/` folder or the dedicated `ComfyUI/models/minimax_h3_acc_loras/` folder, then refresh or restart ComfyUI.
3. Connect a matching native MiniMax H3 diffusion model. Full and Comfy-Org `*_pruned_*` variants are accepted.
4. Connect the returned `model` to your guider, and connect `sampler` plus `sigmas` to `SamplerCustomAdvanced`.

The node applies both the ordinary LoRA updates and the checkpoint's time-dependent PDD output heads. It automatically supplies Euler and the exact trained 8-step sigma schedule, so there are no sampler or step widgets to set.

Use FL2VA Acc-LoRA with FL2VA/T2VA and Ref2VA Acc-LoRA with Ref2VA. The current official checkpoints require strength `1.0`, video/audio sigma shifts `12.0 / 3.0`, and their exact schedule. Another schedule stops with a clear error. With a curve-pruned model, compatibility mode skips only the 50 full-width AdaLN LoRA updates that cannot fit its compressed curve basis, while applying every other LoRA update and the PDD heads. A full non-pruned model applies the complete adapter.

Deno Custom Nodes does not bundle the LoRA weights or a workflow.
