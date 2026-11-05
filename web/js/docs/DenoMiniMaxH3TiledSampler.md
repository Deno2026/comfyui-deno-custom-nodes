# (Deno) MiniMax H3 Tiled Sampler

Finishes an upscaled MiniMax H3 video+audio latent in overlapping tiles, so a 16GB GPU can run the final high-resolution pass. At every step all tiles read the same frame, their predictions are blended with cosine weights in the overlaps, and one shared update follows. The model loads once for all tiles, and the original audio latent passes through unchanged.

```text
First pass: SamplerCustomAdvanced with SplitSigmas high_sigmas
-> MiniMax H3 Latent Upscale With Model (ComfyUI 0.44.0+) or another H3 latent upscaler
-> (Deno) MiniMax H3 Tiled Sampler with SplitSigmas low_sigmas
-> VAE Decode for video, audio decode for sound
```

## Inputs

| Name | Description |
| --- | --- |
| model | H3 model after LoRAs, sigma shift and any attention or memory nodes. H3-Optimizations sparse attention and memory optimization work in front of this node. ComfyUI's core `BlockSparseAttention` is rejected for now. |
| positive | The same positive conditioning as the first pass. R2V reference images stay global; keyframe conditioning is cropped and prepared per tile. Regional conditioning and ControlNet are rejected. |
| latent | Upscaled H3 video+audio latent without a noise mask. |
| sigmas | Only the final 1-3 steps of the first-pass schedule, for example `SplitSigmas` `low_sigmas`. |
| seed | Noise that brings the upscaled latent back to the first of those sigmas. |
| Tile width | Tile width in pixels, a multiple of 32. Default 896 (tested on 16GB). |
| Tile height | Tile height in pixels, a multiple of 32. Default 704 (tested on 16GB). |
| Overlap X | Minimum overlap between side-by-side tiles in pixels, a multiple of 32 and smaller than the tile width. Default 256. |
| Overlap Y | Minimum overlap between stacked tiles in pixels, a multiple of 32 and smaller than the tile height. Default 320. |

The tile count follows from the frame size. A tile at least as large as the frame runs it in one piece. With the defaults, 1920 x 1088 becomes 3 x 2 = 6 tiles. Larger tiles repeat less overlap work but need more VRAM; sizes above the defaults have not been measured by DENO yet.

## Outputs

| Name | Description |
| --- | --- |
| latent | Finished H3 video+audio latent. The audio latent is the input audio, unchanged. |

Each run prints the tile count, grid, sizes, per-tile seconds and PyTorch peak memory to the console and adds the same report to the node's output text.
