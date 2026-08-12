# (Deno) LTX Sequencer

Adds multiple still-image guides to an LTX video latent in one node while keeping the public LTX Add Guide behavior for frame placement, negative indexes, strength, and guide attention metadata.

The image input is lazy: when `bypass` is enabled or `num_images` is `0`, the upstream image branch is not evaluated.

## Inputs

| Name | Description |
| --- | --- |
| positive / negative | LTX conditioning to receive guide keyframe and attention metadata. |
| vae | LTX video VAE used to encode each guide image. |
| latent | Video-only LTX latent. Combined audio/video latents are not accepted by the underlying guide operation. |
| multi_input | Image batch. Images are consumed in batch order, up to `num_images`. |
| num_images | Number of images from the batch to use. Set to `0` to disable the image branch. |
| insert_mode | Interprets each guide position as frames or seconds. |
| frame_rate | Converts second positions to frame indexes. |
| strength_sync | Frontend convenience switch for editing the visible strength controls together. |
| bypass | Returns conditioning and latent unchanged without evaluating `multi_input`. |
| insert_frame_N / insert_second_N | Start position for guide N. Negative frame indexes count from the end according to the current ComfyUI LTX Add Guide behavior. |
| strength_N | Influence for guide N. `0` skips its encode and guide append; `1` is full guide strength. |

## Output

The positive and negative conditioning include the guide metadata, and the latent contains the appended guide frames and noise mask. Use the official `LTXVCropGuides` at the appropriate point before decoding a guide-bearing video latent.
