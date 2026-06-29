# (Deno) LTX High resolution Tiled Sampler

Refines the video part of an LTX AV latent with overlapping frame tiles while giving every video tile the full audio latent as context. Guide-bearing LTX video latents from upstream Sequencer/Add Guide nodes are supported.

`audio_mode` is currently `freeze`: audio is used for video refinement, but the returned audio latent is kept unchanged. This is the audio-sync path that replaces the old video-only tiled sampler for AV final passes.

For guide-bearing workflows, separate the AV latent after this sampler, then connect `LTXVCropGuides` to the video latent before decode. The sampler preserves appended guide frames during sampling; official `LTXVCropGuides` is a video-latent node and removes those guide frames and clears guide metadata for the decode path.

Recommended guide-bearing path:

```text
LTX Sequencer / Add Guide
-> LTXVConcatAVLatent
-> (Deno) LTX High resolution Tiled Sampler
-> LTXVSeparateAVLatent
-> LTXVCropGuides on the video latent
-> Decode video and audio / mux
```

## Inputs

| Name | Description |
| --- | --- |
| noise | Noise source used once for the global AV sampler trajectory. |
| guider | BasicGuider or CFGGuider for the LTX AV second pass, including LTX guide metadata from upstream Sequencer/Add Guide nodes. |
| sampler | ComfyUI sampler object. The node keeps the sampler update global. |
| sigmas | Sigma schedule for the low-denoise AV refinement pass. |
| latent_image | LTX AV nested latent containing video and audio. Guide-bearing video frames are supported; video is tiled and audio is kept unchanged. If guide frames are present, run `LTXVSeparateAVLatent` after this sampler, then apply `LTXVCropGuides` to the video latent before decode. |
| Frame width split count | Splits each frame from left to right. `2` means left and right tiles. |
| Frame height split count | Splits each frame from top to bottom. `3` means top, middle, and bottom tiles. |
| overlap | Overlap in latent video tokens for each model-prediction tile, including guide-bearing video frames. |
| audio_mode | `freeze` keeps audio unchanged while still using it as context for video denoising. |
| blend_mode | Overlap weighting curve. `hann` is the recommended starting point. |
| aggressive_memory_cleanup | Runs extra cleanup between AV tile predictions. Slower, but can help fragmented VRAM. |
| debug | Prints AV hook calls, sigma labels, and tile diagnostics to the ComfyUI console. |

## Outputs

| Name | Description |
| --- | --- |
| output | Refined AV latent. Video is tiled with guide metadata preserved and audio is preserved from the input. |
| denoised_output | Denoised AV latent from the callback x0. Video is x0 with guide metadata preserved and audio is preserved from the input. |
