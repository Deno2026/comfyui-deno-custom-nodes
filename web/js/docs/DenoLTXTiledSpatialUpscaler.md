# (Deno) LTX Tiled Spatial Upscaler

Runs the LTX latent spatial upscaler on overlapping frame tiles, then blends the tiles back into one video latent.

Use it on video-only LTX latents. If a workflow carries combined video/audio latents, separate the audio path before this node and rejoin it after the tiled video pass.

## Inputs

| Name | Description |
| --- | --- |
| samples | Video-only LTX latent to upscale. |
| upscale_model | LTX latent spatial upscaler model. |
| vae | LTX VAE used for channel statistics around the upscaler. |
| Frame width split count | Splits each frame from left to right. `2` means left and right tiles. |
| Frame height split count | Splits each frame from top to bottom. `3` means top, middle, and bottom tiles. |
| overlap | Overlap in input latent tokens. Larger values blend more context but take more time. |
| blend_mode | Overlap weighting curve. `hann` is the recommended starting point. |
| aggressive_memory_cleanup | Runs extra cleanup between tiles. Slower, but can help fragmented VRAM. |
| debug | Prints tile plan and shape diagnostics to the ComfyUI console. |

## Output

| Name | Description |
| --- | --- |
| upscaled_latent | Upscaled video latent reconstructed from the tiled pass. |
