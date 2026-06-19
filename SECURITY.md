# Security Policy

## Supported Versions

Deno Custom Nodes is a fast-moving ComfyUI custom node pack. Security fixes are handled on the latest public release only.

Please update through ComfyUI Manager before reporting a security issue, unless the report is about the update path itself.

## Reporting a Security Issue

Do not post secrets, API keys, tokens, private model paths, or private workflow files in a public issue.

If GitHub private vulnerability reporting is available on this repository, use that path from the Security tab.

If private reporting is not available, open a short public issue titled `Security report request` without technical exploit details. Include only:

- affected Deno Custom Nodes version
- ComfyUI version and runtime type
- whether the issue can expose files, tokens, local network services, or arbitrary commands

The maintainer will follow up and decide the safest disclosure path.

## Scope

Security reports are most useful when they involve:

- unintended access to local files
- unsafe network access outside localhost
- token or credential exposure
- command execution or unsafe installer behavior
- dependency or packaging issues that affect normal users

Normal node errors, missing models, workflow compatibility issues, and UI bugs should use the regular bug report template.
