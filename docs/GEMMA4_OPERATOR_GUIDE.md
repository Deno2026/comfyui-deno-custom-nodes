# Gemma4 Operator Guide for ComfyUI Deno Custom Nodes

This guide is written for a weaker model that needs explicit instructions.

If you are asked to add or fix a node in this repository, follow this guide exactly.
Do not improvise when you are unsure.

## 1. Mission

Build or fix ComfyUI custom nodes in a way that is:

1. Safe
2. Testable
3. Easy to review
4. Ready for GitHub PR workflow
5. Ready for Comfy Registry publishing

## 2. Non negotiable rules

1. Never install Python packages directly on the host machine for this project.
   Use Docker for tests and validation.
2. Never work directly on `main`.
   Create a branch first.
3. Never claim something works unless you ran a command that proves it.
4. Never guess the root cause of a bug.
   Reproduce it, gather evidence, then fix it.
5. Never publish the same package version twice.
   If public metadata or release content changes, update the version in `pyproject.toml` before publishing.
6. Never say ComfyUI Manager search is live until it is actually visible.
   Registry and Manager indexing can lag behind GitHub merge time.

## 3. Repository map

Important files:

1. `__init__.py`
   - Main node definitions
   - `NODE_CLASS_MAPPINGS`
   - `NODE_DISPLAY_NAME_MAPPINGS`
2. `tests/test_image_resize_node.py`
   - Behavior tests for the current node
3. `tests/test_registry_metadata.py`
   - Registry metadata and publish workflow checks
4. `pyproject.toml`
   - Package name, description, version, registry metadata
5. `.github/workflows/ci.yml`
   - Pull request and main branch test workflow
6. `.github/workflows/publish_registry.yml`
   - Registry publish workflow
7. `README.md`
   - Install instructions and public project description
8. `docs/GEMMA4_TASK_PROMPT.md`
   - Reusable execution checklist prompt for future sessions

## 4. Current project facts

1. Repository slug: `deno-custom-nodes`
2. GitHub repository: `https://github.com/Deno2026/comfyui-deno-custom-nodes`
3. Publisher ID: `deno2026`
4. Display name: `Deno Custom Nodes`
5. Current package description: `ComfyUI Deno Custom Nodes`
6. Initial implemented node: `Deno Image Resize`

## 5. Standard feature workflow

Use this exact order for any new node or node change.

### Step 1. Sync and branch

Run:

```bash
git checkout main
git pull origin main
git checkout -b feat/short-description
```

Branch name examples:

1. `feat/add-long-side-resize-node`
2. `fix/image-resize-bicubic-shape-bug`
3. `docs/update-gemma4-guide`

### Step 2. Read the current implementation before editing

Read at minimum:

1. `__init__.py`
2. Relevant tests in `tests/`
3. `pyproject.toml` if release metadata may change
4. `README.md` if public behavior or install steps change

### Step 3. Write or update tests first

For node logic:

1. Add or update tests under `tests/`
2. Cover registration contract
3. Cover node input contract
4. Cover the core behavior
5. Cover at least one edge case if the change is not trivial

Current tests use import based loading from `__init__.py` and fake objects.
That pattern is preferred because it avoids full ComfyUI boot requirements.

### Step 4. Implement the minimal change

Keep the implementation focused.
Do not refactor unrelated code.
Do not add extra abstractions unless the tests force them.

### Step 5. Run validation in Docker

Run:

```bash
docker compose run --rm test
```

If a specific test is enough during debugging, you may run a narrower command by editing the compose service or using a temporary container command, but the final verification must still run the full test suite.

### Step 6. Update docs if behavior changed

Update these files when needed:

1. `README.md`
2. `docs/GEMMA4_OPERATOR_GUIDE.md`
3. `docs/GEMMA4_TASK_PROMPT.md`
4. `pyproject.toml` description or version if public release metadata changed

### Step 7. Commit clearly

Run:

```bash
git add __init__.py tests README.md docs pyproject.toml .github/workflows
git commit -m "feat: short description"
```

Use conventional commit prefixes:

1. `feat`
2. `fix`
3. `docs`
4. `test`
5. `ci`
6. `chore`

### Step 8. Push and open a PR

Run:

```bash
git push -u origin HEAD
```

Then create a pull request against `main`.

### Step 9. Wait for CI before merge

The repository CI runs through `.github/workflows/ci.yml`.
Do not report success before the CI run is green.

### Step 10. Merge safely

Preferred merge flow:

1. Review PR diff
2. Confirm tests passed
3. Merge to `main`
4. Pull latest `main`

## 6. ComfyUI node implementation checklist

When adding a node, verify all of these:

1. Class has `CATEGORY`
2. Class has `FUNCTION`
3. Class has `RETURN_TYPES`
4. Class has `RETURN_NAMES` when useful
5. Class has `INPUT_TYPES()` returning the proper ComfyUI schema
6. `NODE_CLASS_MAPPINGS` contains the public node name
7. `NODE_DISPLAY_NAME_MAPPINGS` contains the display label
8. The returned value matches the declared return contract
9. Image tensors stay in the expected shape before and after processing
10. Outputs are clamped or normalized if the operation can exceed valid ranges

## 7. Minimal node skeleton

Use this as a starting pattern inside `__init__.py`.
Adjust names and data handling to fit the feature.

```python
class ExampleNode:
    CATEGORY = "Deno/Image"
    FUNCTION = "run"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 4.0, "step": 0.05}),
            }
        }

    def run(self, image, strength):
        result = image
        return (result,)


NODE_CLASS_MAPPINGS = {
    "Example Node": ExampleNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Example Node": "Example Node",
}
```

## 8. Debugging workflow

If anything fails, use this order.

### Phase 1. Reproduce exactly

1. Run the failing test or command
2. Copy the exact error message
3. Identify the file and line involved

### Phase 2. Find the real cause

Check these common sources:

1. Wrong tensor shape ordering
2. Wrong return tuple structure
3. Node name missing from `NODE_CLASS_MAPPINGS`
4. `INPUT_TYPES()` structure does not match ComfyUI expectations
5. Tests assert old metadata after a version or description change
6. Registry publish failed because version was not bumped
7. Manager search is delayed even though registry page already updated

### Phase 3. Fix the smallest thing that explains the failure

Do not stack multiple speculative fixes.
Make one focused change.
Run the relevant test.
Then run the full suite.

### Phase 4. Verify no regression

Run:

```bash
docker compose run --rm test
```

If the bug involved metadata or release flow, also inspect:

1. `pyproject.toml`
2. `.github/workflows/publish_registry.yml`
3. `README.md`

## 9. Release and GitHub deployment workflow

Use this process when a change should land on GitHub and eventually reach the registry.

### A. Normal code or docs change

1. Create branch
2. Make change
3. Run Docker tests
4. Commit
5. Push branch
6. Open PR
7. Wait for CI success
8. Merge PR

### B. Registry visible release change

Use this when public metadata or releasable node content changed and the registry should receive a new package version.

1. Update code and tests
2. Update `pyproject.toml` version
3. Confirm description and publisher fields are correct
4. Run Docker tests
5. Push PR and merge after CI success
6. After merge, confirm GitHub Actions publish workflow ran
7. Check the registry page for the new version
8. Remember that ComfyUI Manager search may appear later than the registry page

## 10. Exact metadata fields that matter for registry publishing

Check these fields in `pyproject.toml`:

```toml
[project]
name = "deno-custom-nodes"
description = "ComfyUI Deno Custom Nodes"
version = "0.1.1"

[tool.comfy]
PublisherId = "deno2026"
DisplayName = "Deno Custom Nodes"
Icon = "https://raw.githubusercontent.com/Deno2026/comfyui-deno-custom-nodes/main/icon.svg"
requires-comfyui = ">=0.3.0"
```

If any of those are wrong, registry publishing or discovery can break.

## 11. Definition of done

A task is done only when all of the following are true:

1. The code change exists on a branch
2. Tests pass in Docker
3. README or docs are updated when behavior changed
4. PR is created if the work should go to GitHub
5. CI is green
6. If applicable, version is bumped
7. If applicable, registry page reflects the new release
8. Claims made to the user are backed by an actual check

## 12. Anti failure reminders for weaker models

1. Read before editing
2. Test before claiming success
3. One change at a time
4. Do not hallucinate GitHub or registry status
5. If you cannot verify something, say you could not verify it
6. If Manager search does not show the node yet, report that indexing may still be pending
7. Keep explanations simple and explicit

## 13. Quick command reference

```bash
# Create feature branch
git checkout main && git pull origin main && git checkout -b feat/short-description

# Run tests
docker compose run --rm test

# Show changed files
git status --short

# Commit
git add .
git commit -m "feat: short description"

# Push
git push -u origin HEAD
```

## 14. Final instruction

If you are unsure, stop and inspect the repository again.
Correctness is more important than speed.
