# (Deno) Text Encoder Unload

Use this node only when every required text-encoding step can finish before sampling. It is an inline dependency barrier, not a global VRAM cleanup command.

For a classic positive/negative KSampler path:

```text
CLIP -> positive Text Encode -> value -> Text Encoder Unload -> KSampler positive
   |     negative Text Encode ---------------------> KSampler negative
   |             +-----------------> wait_for
   +--------------------------------> clip
```

`value` accepts a sampler-bound value and returns the same object unchanged. Current ComfyUI builds use a type-matching socket so the output follows the connected input type. `clip` must be the exact CLIP used by the encoding nodes. `wait_for` is dependency-only: it is not modified or returned, but it ensures an independent negative/positive or other encoding branch finishes before unload.

The node calls ComfyUI's targeted model-management path for the connected `clip.patcher` and its clones. It does not use `unload_all_models()`, so it does not intentionally unload the diffusion model, VAE, or ControlNet. If the CLIP was configured with the same GPU load and offload device, such as `--gpu-only`, the node stops with a clear error because it cannot move that encoder out of VRAM.

This releases Comfy-managed text-encoder weights from accelerator memory and clears unused allocator cache. It cannot guarantee that the whole process reaches `0 MiB`; CUDA context, live conditioning tensors, other models, custom-node tensors, and other processes are outside this node's target.

The node is deliberately treated as changed on every queue so ComfyUI cannot skip the unload side effect from cache. As a result, downstream sampling runs again even with otherwise identical inputs, and a later text encode must reload the model. Use the node only when sampler headroom matters more than repeated prompt-encoding speed.
