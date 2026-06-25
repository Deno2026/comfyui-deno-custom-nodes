# Runtime Evidence Reference

Use explicit labels:

- `VERIFIED`: directly checked in the relevant runtime or artifact.
- `INFERRED`: reasoned from source/tests but not directly checked.
- `UNVERIFIED`: not checked.

Evidence categories:

- build proof: parse and unit tests
- deployment proof: source/runtime hash, served JS marker, object info
- source-contract proof: installed ComfyUI/frontend source identity
- contract proof: workflow/prompt payload shape
- behavior proof: real canvas interaction
- compatibility proof: old/current workflows and declared runtimes

Do not claim PASS for missing Portable, Desktop, or EZi surfaces unless the task explicitly scopes them out.
