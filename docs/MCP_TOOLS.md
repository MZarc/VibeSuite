# MCP tool reference

Server: `universal-prd@1.0.0`, stdio entry `dist/mcp/stdio.js`, workspace via `PRD_WORKSPACE` (else cwd). All outputs concise JSON in a single `text` block (24 KiB cap). Diagnostics → stderr only.

| Tool | Input | Effect |
|---|---|---|
| `prd_initialize` | `{projectName?, profile="generic"}` | Creates `.prd/spec.json` only if absent; otherwise returns existing. |
| `prd_inspect_workspace` | `{}` | Read-only bounded scan; evidence + confidence; excludes secrets/build dirs. |
| `prd_get_spec` | `{section="all"\|project\|goals\|…}` | Returns whole spec or one section (bounded context). Unknown section → error. |
| `prd_update_spec` | `{operation, payload}` | 10 ops: `set-project, add-requirement, add-nfr, add-test, add-decision, add-assumption, add-question, resolve-question, record-finding, set-export-config`. Zod-validated; stable IDs; malformed → `{error}`. |
| `prd_validate` | `{}` | 10 checks with `pass/fail/warning/not-run`, readiness, blockers. |
| `prd_list_profiles` | `{}` | 6 profiles with artifacts/constraints/validators/test categories. |
| `prd_export_preview` | `{artifacts?}` | No writes. Lists create/conflict(+compiler-owned modify), readiness, blockers. |
| `prd_export_apply` | `{authorizeOverwrite=[], artifacts?}` | Revalidates; per-file auth for conflicts; atomic writes + manifest with sha256; aborts safely. |
| `prd_status` | `{}` | Version, readiness, summary, blockers, traceability counts, last export manifest. |

Invalid args are rejected by the SDK schema (integration-tested). The server never accepts a workspace-root override from tool calls and never runs shell commands.
