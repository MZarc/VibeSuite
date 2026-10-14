# Architecture

```
┌──────────── coding agent (OpenCode / Antigravity / other) ────────────┐
│ Skill (.agents/skills/universal-prd) — workflow, provenance, review  │
│ MCP tools (stdio) / CLI for deterministic ops                        │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼
src/core:   types (Zod) · store (.prd/spec.json) · validator (rules) · readiness
src/profiles: 6 versioned profiles (generic, typescript-web, python-app,
               flutter-android, tauri-desktop, rest-api) + ARTIFACTS contract
src/export: renderer (9 conditional .md) · exporter (preview/apply/manifest)
src/security: workspace root, resolveInside, symlink checks
src/inspect: allowlisted bounded workspace scan → evidence + confidence
src/mcp:    updates (typed ops) · server (9 tools) · stdio entry
src/cli:    cli (exit codes 0/1/2/3, --json) · installer (merge+backup, dry-run)
```

Design decisions: Zod as single source of truth (no competing JSON Schema file); profiles as data not conditionals; markdown as rendered artifacts (never parsed back); temp+rename atomic writes with post-write hash verification; MCP stdio only (no HTTP surface); no CLI library (manual parsing avoids a dependency); vitest for all suites.
