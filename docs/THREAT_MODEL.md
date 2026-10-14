# Threat model — workspace access & file operations

Assets: user source tree, `.prd/` state, generated docs, host configs (`opencode.json`, `mcp_config.json`).

Actors: hostile/erroneous model output (tool args), malicious workspace content (symlinks, huge files), concurrent export runs.

| Threat | Control | Test |
|---|---|---|
| Path traversal (`../`, absolute escape) | `resolveInside` + relative check | `tests/security` |
| Symlink escape | ancestor lstat/realpath walk | posix test (win skipped w/o privilege) |
| Unrestricted root override via tool call | root only from env/cwd config, never args | server code review + e2e |
| Secret exfiltration via inspect | allowlist + 40-file/32 KiB caps + excluded names + no content for non-allowlisted | `.env` test |
| Silent overwrite of user docs | preview/conflict + per-file `authorizeOverwrite`; compiler-owned `.prd/*` only auto-modified | e2e double-export |
| Partial multi-file failure | temp+rename, round-trip + post-write hash verify, abort with written set | failure test |
| Protocol corruption | stderr-only logging | integration (client parses stdio cleanly) |
| Config destruction | merge (not replace), backups in `.vibesuite/backups/`, validate JSON, skip duplicates, `--dry-run` + explicit `--apply` | unit merge tests |
| Oversized/malformed input | Zod bounds, JSON parse guards, actionable `{error}` | security tests |
| AI-key exfiltration | No model calls, no fetch, no telemetry (lint-enforced) | lint + e2e source grep |

Residual: GUI host pickers require manual verification; OS file ACLs and concurrent-process races outside adapter scope (documented).
