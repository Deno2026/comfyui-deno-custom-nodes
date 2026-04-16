# ComfyUI Deno Custom Nodes

ComfyUI custom nodes by Deno.

The first node in this repository is a simple test node called Deno Image Resize.
It resizes a ComfyUI IMAGE batch to a target width and height with one of four interpolation modes.

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

## ComfyUI Manager and Registry readiness

This repository now includes Comfy Registry metadata in `pyproject.toml`.
That is the official path to become searchable in the ComfyUI Registry and ComfyUI Manager.

To finish public searchability, these two items still need to exist on the Comfy Registry side.

1. A publisher account for `Deno`
2. A repository secret named `REGISTRY_ACCESS_TOKEN`

Once those are ready, the included publish workflow can push the node metadata to the registry.

## Repository URL

https://github.com/Deno2026/comfyui-deno-custom-nodes
