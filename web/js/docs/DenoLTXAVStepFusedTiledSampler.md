# (Deno) LTX AV Step-Fused Tiled Sampler

Refines the video part of an LTX AV latent with overlapping frame tiles while giving every video tile the full audio latent as context.

In v1, `audio_mode` is `freeze`: audio is used for video refinement, but the returned audio latent is kept unchanged. This is the audio-sync path that replaces the old video-only tiled sampler for AV final passes.

## Inputs

| Name | Description |
| --- | --- |
| noise | Noise source used once for the global AV sampler trajectory. |
| guider | BasicGuider or CFGGuider for the LTX AV second pass. |
| sampler | ComfyUI sampler object. The node keeps the sampler update global. |
| sigmas | Sigma schedule for the low-denoise AV refinement pass. |
| latent_image | LTX AV nested latent containing video and audio. Video is tiled; audio is kept unchanged. |
| Frame width split count | Splits each frame from left to right. `2` means left and right tiles. |
| Frame height split count | Splits each frame from top to bottom. `3` means top, middle, and bottom tiles. |
| overlap | Overlap in latent video tokens for each model-prediction tile. |
| audio_mode | `freeze` keeps audio unchanged while still using it as context for video denoising. |
| blend_mode | Overlap weighting curve. `hann` is the recommended starting point. |
| aggressive_memory_cleanup | Runs extra cleanup between AV tile predictions. Slower, but can help fragmented VRAM. |
| debug | Prints AV hook calls, sigma labels, and tile diagnostics to the ComfyUI console. |

## Outputs

| Name | Description |
| --- | --- |
| output | Refined AV latent. Video is tiled and audio is preserved from the input. |
| denoised_output | Denoised AV latent from the callback x0. Video is x0 and audio is preserved from the input. |
