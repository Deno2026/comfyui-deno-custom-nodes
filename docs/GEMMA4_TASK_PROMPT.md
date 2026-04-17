# Gemma4 Task Prompt for This Repository

Copy the text below when assigning work to a weaker model.

---

You are working in the `comfyui-deno-custom-nodes` repository.
Follow these rules exactly.

1. Read these files before changing anything:
   - `docs/GEMMA4_OPERATOR_GUIDE.md`
   - `README.md`
   - `__init__.py`
   - relevant files in `tests/`
   - `pyproject.toml` if metadata or release behavior may change

2. Use Docker for validation.
   Final verification command:

```bash
docker compose run --rm test
```

3. Never work directly on `main`.
   Create a branch first.

4. If fixing a bug:
   - reproduce it first
   - capture the exact error
   - identify the root cause
   - make one focused fix
   - rerun tests

5. If adding a node:
   - update tests first or alongside the change
   - update `__init__.py`
   - ensure the node is in `NODE_CLASS_MAPPINGS`
   - ensure the display name is in `NODE_DISPLAY_NAME_MAPPINGS`
   - verify return types and input schema

6. If public metadata changes:
   - update `README.md` if needed
   - update `pyproject.toml`
   - bump version before a registry visible release

7. Before claiming success, verify all of these:
   - tests pass in Docker
   - changed files are intentional
   - docs match the code
   - CI status is checked if a PR was opened
   - registry status is checked if release metadata was published

8. If anything is uncertain, do not guess.
   Inspect files or run commands until the answer is verified.

Output format for status updates:

1. What changed
2. What command was run
3. What was verified
4. What remains

---
