# (Deno) Easy Model Download Helper

Checks the model files needed by built-in LTX presets and opens their official download pages. It never downloads or writes model files automatically.

The built-in presets cover the existing LTX 2.3 8GB VRAM GGUF workflow and the official LTX 2.5 Distilled INT8 two-stage workflow. Custom presets saved in a workflow or browser are kept alongside the built-ins.

## LTX 2.5 access

Before using the LTX 2.5 links:

1. Sign in to Hugging Face.
2. Open the [Lightricks/LTX-2.5 model page](https://huggingface.co/Lightricks/LTX-2.5).
3. Complete **Agree and Access**.
4. Review the [LTX-2 Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md).

The LTX 2.5 preset includes the distilled INT8 transformer, projected Gemma 4 text encoder, video VAE, audio VAE, and x2 latent spatial upscaler. The node opens each Hugging Face link in the browser so the account access requirement remains visible.

## Inputs

| Name | Description |
| --- | --- |
| model_root | ComfyUI models root to check. The panel can automatically select a registered root that already contains the most required files. |
| presets_json | Saved preset library. Built-in presets are refreshed while custom and unknown preset IDs are preserved. |

## Usage

Select a preset, open each missing file link, then move the downloaded file into the exact target folder shown by the node. Press **Refresh Check** after the files are in place.
