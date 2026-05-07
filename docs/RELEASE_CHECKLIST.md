# Deno Node Release Checklist

Use this checklist before every GitHub or Comfy Registry release.

## Code

- Run Python compile checks for touched Python files.
- Run JS syntax checks for touched frontend files.
- Run the local Python test suite with the embedded ComfyUI Python.
- Confirm the active install copy matches the source repo for touched runtime files.
- Confirm `/object_info/<NodeName>` for every changed node.

## UI

- Check the node as a new user would see it after adding it to the canvas.
- Click every new or changed button.
- Check every mode switch, dropdown, toggle, add/remove action, collapse/expand action, and size-changing behavior.
- Confirm the node grows and shrinks correctly after dynamic UI changes.
- Confirm hidden fields preserve their values when that is the intended behavior.

## GitHub Docs

- Refresh screenshots or screenshot-style docs assets for every changed node.
- Include the main node view plus important menu states when they explain the feature.
- Avoid old test-node titles, cropped UI, accidental selection outlines, or messy canvas states.
- Update README and `docs/NODE_GUIDE.md` together.
- Verify every linked image path exists.

## Release

- For runtime or Registry releases, bump `pyproject.toml` version.
- For docs-only updates, do not bump the package version; use a `[skip ci]` commit when appropriate.
- Commit only the intended files.
- Push `main`.
- For runtime releases, check GitHub Actions `ci`.
- For runtime releases, check GitHub Actions `Publish to Comfy registry`.
- For runtime releases, check Comfy Registry version status: `Pending`, `Active`, or `Flagged`.
