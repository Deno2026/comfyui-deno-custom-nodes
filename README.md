# Deno Custom Nodes

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

Practical ComfyUI custom nodes focused on fast real-world workflow improvements.
This repo is built for global creators and production workflows, with a focus on practical UX and reliable daily use.

## Included Nodes

### `(Deno) Resize Box`

Resolution helper and image resize node for ComfyUI.

![Deno Resize Box](docs/images/resize-box.jpg)

Main features:

- `Preset Ratio` and `Manual Input` modes
- common ratio presets
- megapixel-based size calculation
- `divisible_by` alignment
- `Center Crop (Fill)` and `Fit (Letterbox/Pillarbox)` resize modes
- `lanczos` default interpolation
- live ratio preview inside the node
- outputs: `image`, `width`, `height`

### `(Deno) Multi Image Loader`

Minor-upgrade multi-image loader designed for batch guide workflows.

Credit: Inspired by the original workflow ideas from **WhatDreamsCost**, then adapted and refined for the Deno workflow style.

![Deno Multi Image Loader](docs/images/multi-image-loader.jpg)

Main features:

- scrollable fixed-height gallery instead of endlessly growing node height
- drag reorder with stable placeholder insertion
- upload button, drag-and-drop upload, and paste image support
- `Input Folder` browser for reusing existing ComfyUI `input` images
- input subfolder browsing with folder tiles, double-click navigation, and an `Up` button
- nested input images can be added while preserving their ComfyUI subfolder paths
- newest-first input image sorting based on file modified time
- responsive input-folder thumbnails for smoother browsing with many images
- `Keep Input Ratio`, `Preset Ratio`, or `Manual Input` size mode
- ratio preset, megapixels, divisible-by sizing, or direct width/height control
- resize method and interpolation selection
- outputs: `multi_output`, `width`, `height`
- optional crop or fit resizing during export

### `(Deno) LTX Sequencer`

LTX guide sequencer tuned for multi-image workflows.

Credit: Inspired by **WhatDreamsCost**'s LTX workflow approach, with Deno-side adjustments focused on day-to-day usability.

![Deno LTX Sequencer](docs/images/ltx-sequencer.jpg)

Main features:

- works with the batch output from `(Deno) Multi Image Loader`
- auto-fills `num_images` from the connected loader when possible
- keeps the existing sync-style workflow
- allows only `strength` values to break out into manual control when needed
- `bypass` switch passes `positive`, `negative`, and `latent` through unchanged for quick A/B tests

### `(Deno) LTX Model Loader`

One compact loader for the common LTX 2.3 model-loading patterns.

![Deno LTX Model Loader](docs/images/ltx-model-loader.jpg)

Main features:

- `Checkpoint Style`, `KJ Style`, and `GGUF Style` modes
- outputs: `model`, `clip`, `video_vae`, `audio_vae`
- uses ComfyUI's built-in checkpoint / diffusion / DualCLIP loading paths where possible
- uses KJNodes `VAELoaderKJ` for split video/audio VAE workflows
- uses ComfyUI-GGUF UNet loading for GGUF workflows
- includes clearer dependency errors and an audio VAE compatibility fallback for mixed ComfyUI/KJNodes environments

### `(Deno) Easy Model Download Helper`

Preset-based setup helper for recommended model file sets. The first built-in preset is the LTX 2.3 8GB VRAM GGUF starter set.

![Deno Easy Model Download Helper](docs/images/easy-model-download-helper.png)

Main features:

- opens official model links in the browser instead of downloading files in Python
- shows detected ComfyUI model roots and lets users copy the selected root
- supports saved creator presets inside the workflow and restores them from browser storage after a page reload
- supports Hugging Face direct links and Civitai page/download links without Python-side network requests
- checks ComfyUI-registered model folders, including custom folder names from `extra_model_paths`
- can find matching files inside model subfolders when users organize large model libraries by project or model family
- shows target ComfyUI model subfolders so viewers know exactly where files should go

Creator preset link guide:

- Hugging Face: right-click the small download icon next to the target file, choose `Copy link address`, then paste that direct file URL into the preset `URL` field.
- Civitai: copy the model page URL from the browser address bar, paste it into the preset `URL` field, then press the `Civitai` button in the editor to convert it to a direct browser download link. If the filename is not visible in the URL, enter the downloaded filename manually.
- For Civitai pages, do not copy the blue `Download` button link unless you intentionally want to provide a direct API download URL.
- `File name` is used only for the target-path check. It should match the downloaded file on disk, especially for Civitai/API links.

![Hugging Face link guide](docs/images/easy-model-download-helper-huggingface-link.png)

![Civitai page URL guide](docs/images/easy-model-download-helper-civitai-link.png)

![Civitai preset editor guide](docs/images/easy-model-download-helper-civitai-node.png)

### `(Deno) LTX Multi LoRA Loader`

Power-LoRA-style multi LoRA loader for LTX workflows.

![Deno LTX Multi LoRA Loader](docs/images/ltx-multi-lora-loader.png)

Main features:

- add multiple LoRAs in one compact node
- per-slot enable toggle
- per-slot `strength`, `video`, and `audio` strength controls
- per-slot trigger word and LoRA note editor
- copy saved trigger words from the LoRA row
- outputs patched `model` and `clip`
- designed to stay close to the familiar Power LoRA Loader workflow while adding LTX-friendly A/V controls and lightweight LoRA reference notes

### `(Deno) LTX Prompt Guide`

Prompt helper that combines LTX prompt encoding, optional negative prompt handling, built-in LTX conditioning, and dialogue-length planning.

![Deno LTX Prompt Guide](docs/images/ltx-prompt-guide.png)

Main features:

- positive prompt text encoding
- optional collapsible negative prompt
- built-in LTX conditioning with `frame_rate`
- estimates minimum video length from quoted dialogue
- supports Auto, Korean, English, Japanese, and Chinese dialogue estimates
- outputs: `positive`, `negative`, `frame_rate`

## Why This Exists

These nodes are built to reduce repeated setup friction in actual ComfyUI production work.
The goal is not to chase huge feature lists. The goal is to make the workflows people repeat every day feel faster, cleaner, and easier to teach.

## Search Tips

Try searching with:

- `deno`
- `resize`
- `ltx`
- `(deno)`

## Install

Clone inside your `custom_nodes` folder:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

Then restart ComfyUI.

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
