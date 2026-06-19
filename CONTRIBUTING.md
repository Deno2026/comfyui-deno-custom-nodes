# Contributing

Thanks for helping improve Deno Custom Nodes.

This repo is the stable beginner-facing channel for DENO ComfyUI custom nodes. Please keep reports and pull requests focused on behavior that affects normal ComfyUI users.

## Before Opening an Issue

Please check:

- you are using the latest Deno Custom Nodes release
- ComfyUI has been fully restarted after updating
- browser or ComfyUI Desktop has been hard-refreshed if the issue is frontend/UI related
- there is no duplicate old DENO node folder under `custom_nodes`

For UI issues, screenshots or short videos are very helpful.

## Bug Reports

Good bug reports include:

- Deno Custom Nodes version
- ComfyUI version and frontend version
- runtime type: portable/browser, ComfyUI-Easy-Install/EZi, or ComfyUI Desktop
- exact node name
- exact steps to reproduce
- relevant console or backend log text
- workflow file only if it contains no secrets or private paths

## Pull Requests

Pull requests are welcome, but please keep them narrow.

Expected PR shape:

- one bug or feature per PR
- no unrelated formatting churn
- no broad rewrites of existing node behavior
- tests or clear manual verification notes when possible
- screenshots for visible UI changes

For public nodes, saved workflow compatibility matters. Avoid changing node IDs, widget order, input names, output names, or visible labels unless the migration path is clear.

The maintainer may adapt the idea into a different patch instead of merging a PR directly, especially when the branch conflicts with current release work or changes unrelated behavior.

## Stable vs Experimental Work

This repository is for stable public nodes. Experimental, scanner-sensitive, approval-heavy, or manual-only node work may be moved to a separate advanced/manual channel.
