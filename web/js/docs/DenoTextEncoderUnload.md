# (Deno) Text Encoder Unload

Use this node when positive-only or positive/negative text encoding can finish before sampling. It is an inline dependency barrier, not a global VRAM cleanup command.

For a classic positive/negative KSampler path:

```text
CLIP -> positive Text Encode -> Positive Conditioning -> KSampler positive
   |     negative Text Encode -> Negative Conditioning -> KSampler negative
   +---------------------------> Text Encoder (CLIP)
```

`Positive Conditioning` is required and passes the original positive conditioning through unchanged. `Negative Conditioning` is optional and accepts either an encoded negative prompt or `Conditioning Zero Out`; leave it empty for a positive-only guider workflow. Both connected branches finish before unload. `Text Encoder (CLIP)` must receive the exact CLIP used by the encoding nodes.

The node calls ComfyUI's targeted model-management path for the connected `clip.patcher` and its clones. It does not use `unload_all_models()`, so it does not intentionally unload the diffusion model, VAE, or ControlNet. If the CLIP was configured with the same GPU load and offload device, such as `--gpu-only`, the node stops with a clear error because it cannot move that encoder out of VRAM.

This releases Comfy-managed text-encoder weights from accelerator memory and clears unused allocator cache. It cannot guarantee that the whole process reaches `0 MiB`; CUDA context, live conditioning tensors, other models, custom-node tensors, and other processes are outside this node's target.

The node follows normal ComfyUI input caching. When its conditioning and CLIP graph inputs are unchanged, the pass-through result and downstream preview sampling can stay cached; when those inputs change, the node runs again and unloads the connected encoder. This allows Group Bypasser and similar preview-to-upscale workflows to reuse an accepted preview instead of restarting it. A later text encode must still reload the model. Specialized guiders that require more than positive and negative conditioning are intentionally outside this beginner-facing node.
