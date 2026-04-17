# ComfyUI Deno Custom Nodes

ComfyUI Deno Custom Nodes.

The repository starts with a simple Deno Image Resize node and is intended to expand over time with more general-purpose custom nodes.

## Included node

1. Deno Image Resize
   - Input: IMAGE, width, height, interpolation
   - Output: IMAGE
   - Interpolation modes: nearest, bilinear, bicubic, area

## Install in ComfyUI

1. Open your ComfyUI `custom_nodes` directory.
2. Clone this repository into that directory.
3. Restart ComfyUI.
4. Search for `Deno Image Resize` in the node menu.

Example:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

## Development

This repository is set up to avoid local Python package installation.
Development and tests run through Docker.

### Run tests

```bash
docker compose run --rm test
```

## Safe mode workflow

This repository is prepared for a safe workflow.

1. Work happens on a feature branch.
2. CI runs on pull requests.
3. Review the PR.
4. Merge to `main` after review.

## ComfyUI Manager and Registry status

This repository includes Comfy Registry metadata in `pyproject.toml` and has been published to the Comfy Registry.

Registry page:

https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes

Important note:

1. Registry updates can appear before ComfyUI Manager search updates.
2. If the node does not show up in Manager yet, indexing may still be catching up.
3. Git clone installation can still work even while Manager search visibility is delayed.

## Repository URL

https://github.com/Deno2026/comfyui-deno-custom-nodes
