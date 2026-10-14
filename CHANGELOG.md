# Changelog

## Unreleased

- Suite wrappers consolidated into `suite/` (repo root stays clean); all docs updated.
- `/uprd` shortcut everywhere: `templates/skills/uprd/` portable skill (both hosts, no duplicate slash metadata) + `templates/opencode/commands/uprd.md` native OpenCode command; installed by suite and PRD-only wrappers; covered by `--doctor` and unit tests.
- Graft auto-rebuild: `templates/opencode/plugins/graft-rebuild.ts` (pin substituted at install, registered in `opencode.json` plugins); Antigravity fallback is a skill instruction (`graft build` per work block) — no unverified hooks file shipped.
- Skill upgrade: full UI/UX discovery bank, counter-questions, context-upkeep rule in `references/WORKFLOW.md`; `uprd` routing keyword in skill description.
- Bug fixes: `--doctor` lock-id mapping (`universal-prd`→`prd`), valueless-flag guard (+ explicit error for bare `--target`), dry-run marks skipped phases, `mergeMcpEntry` rejects non-object sections, `unionTextLines` CRLF-safe, VibeSuite bat passes all args (`%*`) + truthful header, removed dead `resolve-question.promoteTo` input, removed dead e2e helper, wired dead `loadAndSave` into the update tool.

- Vibe Suite one-click installers (`suite/Install-VibeSuite.bat/.sh` + `suite/install.mjs` + `suite/suite.json`): chronological install of Graft 0.21.1 (telemetry disabled first, graph built before PRD, workspace-local MCP, `.gitignore`/`AGENTS.md` preservation merge), Hallmark @ 13ac0ec7 (pinned SHA, MIT) + Universal PRD skill, PRD init + host registration, full verification. Flags: `--dry-run/--only/--skip/--offline/--json`. See `docs/SUITE.md`.
- `suite/Install-UniversalPRD.bat/.sh` remain as the PRD-only path.

## 1.0.0 — 2026-10-13

- Initial release: core spec engine (schema 1.0.0), deterministic validator (10 rules), readiness model, 6 stack profiles, artifact renderer (9 conditional docs), safe exporter (preview/apply + manifest + hashes), MCP server with 9 tools (SDK v2 stdio), CLI (init/inspect/status/validate/export/install/profiles), Agent Skill + references, OpenCode + Antigravity installers, unit/security/integration/e2e suites, docs.
