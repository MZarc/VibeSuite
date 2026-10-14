# Vibe Suite — what's installed, in what order, and why

One command installs three verified-MIT, non-overlapping tools into any project:

| # | Component | Version pin | License | Role |
|---|---|---|---|---|
| 1 | Graft context graph (`trailhq/Graft`, npm `@nanonets/graft`) | `0.21.1` | MIT | Codebase map (`graft/` + 6 MCP tools) so agents stop re-exploring the repo |
| 2 | Hallmark design skill (`Nutlope/hallmark`) | commit `13ac0ec7` (2026-08-06) | MIT | Anti-AI-slop UI opinions (build/audit/redesign/study) |
| 3 | Universal PRD (this repo) | local `1.0.0` | MIT | Requirements, validation, traceability, export |

Install: copy `suite/Install-VibeSuite.bat` (double-click) or `suite/Install-VibeSuite.sh` into the project and run it. Options: `--dry-run` (plan only), `--only graft,hallmark,prd`, `--skip <ids>`, `--offline` (PRD-only, no network), `--json`, `--doctor` (re-verify an installed project, exit 0/1, no writes), `--check-updates` (pin freshness, exit 0 fresh / 2 stale), `--help`, `--version`. Unknown flags and unknown `--only`/`--skip` ids are rejected with exit 1; a bare `--target` with no directory is rejected (never silently installs into the wrong folder).

All installer files live in `suite/` so the repo root stays clean: the two `.bat`/two `.sh` wrappers, `install.mjs`, `install.d.mts`, `suite.json`, plus `templates/` (uprd skill, OpenCode `/uprd` command, graft-rebuild plugin).

## One-folder rule (target projects)

The installer writes into **one state folder**, `.vibesuite/` (git-ignored, regenerable):

- `.vibesuite/backups/` — every timestamped backup of touched configs (replaces the old `*.bak` files scattered next to each config).

Everything else lives where its host mandates it — these paths are contractual and cannot move without breaking discovery: `opencode.json` / `.opencode/` (OpenCode), `.agents/mcp_config.json` + `.agents/skills/` (Antigravity + portable skills), `graft/` + `AGENTS.md` (graft), `.prd/spec.json` (PRD source of truth), `vibesuite.lock` (project manifest, intentionally at root like `package.json`).

## The .bat experience

`suite/Install-VibeSuite.bat` is a color ANSI TUI (set `NO_COLOR=1` for plain): banner, preflight checks, animated spinner with elapsed timer, live colorized installer log (phases cyan, errors red, DONE green), and a green/red result panel. On success temp files are deleted; on failure the log is kept and its tail shown. `suite/Install-UniversalPRD.bat` has the matching banner/colors with synchronous steps.

## /uprd shortcut

Every install (suite or PRD-only) provides `/uprd`:

- **OpenCode**: native command `.opencode/commands/uprd.md` (verified mechanism: filename → `/uprd` in the TUI).
- **Antigravity**: skill `.agents/skills/uprd/` auto-converts to `/uprd` (verified: skill name → slash command).
- **Either host, by text**: "use uprd" / "uprd, build me an expense tracker" routes via the `uprd` + `universal-prd` skill descriptions.

The `uprd` skill carries no `opencode/slash` metadata on purpose — that would register a second, duplicate `/uprd` in OpenCode next to the native command. Both paths converge on the `universal-prd` skill workflow.

## Graft auto-rebuild after code changes

- **OpenCode**: the installer copies `.opencode/plugins/graft-rebuild.ts` (graft version pin substituted at copy time, fail-closed on missing tokens) and registers it in `opencode.json`'s `plugin` array. On every code-file edit it runs `graft build`; failures are swallowed so a stale cache can never break editing. Written against the documented plugin API (`file.edited`); host-side execution needs one manual confirmation in your OpenCode build.
- **Antigravity and fallback**: no verified app-level file-hook API exists (plugin `hooks.json` is CLI-scoped and its schema is unverified), so no hooks file is shipped. Instead the `universal-prd` skill instructs the agent to run `graft build` at the end of each work block (see `references/WORKFLOW.md` → Context upkeep).

A successful install writes **`vibesuite.lock`** at the project root (component pins, SHAs, licenses, paths, timestamp). `--doctor` checks the lock, configs, skills, graph, and server launch paths.

## Staying fresh (best + fresh only)

Pins rot. Check any time (read-only, no writes):

```
node suite/install.mjs --check-updates   # exit 0 = all fresh, 2 = updates available
```

Last check 2026-10-13: graft 0.21.1 = npm latest; hallmark `13ac0ec7` = GitHub HEAD (no newer commits). To update a stale pin: bump it in `suite/suite.json`, reinstall into an **empty temp dir**, run the test gates, then commit. Never bump pins blindly — a new upstream release re-runs the full verification (telemetry re-check, frontmatter validation, MCP tool listing).

## Chronological order (load-bearing)

1. **prereqs** — node ≥ 20, git, network check. Fail fast.
2. **telemetry-off** — `graft telemetry disable` runs BEFORE any other graft command, so nothing is ever recorded. This is the suite's only machine-wide write.
3. **graft-init** — `graft init --agents antigravity --no-global --no-mcp -y` with cwd=target. Builds the `graft/` graph **before** PRD so inspection and all later agent work can query it. Runs with `--no-global --no-mcp` so graft cannot touch machine-wide files; user `.gitignore`/`AGENTS.md` are backed up and merged (graft overwrites `.gitignore` — verified).
4. **skills** — hallmark fetched by pinned SHA (`git fetch --depth 1 origin <sha>` + detached checkout, verified `skills/hallmark/SKILL.md`) into `.agents/skills/hallmark/` with `.suite-provenance.json`; universal-prd skill copied from this repo.
5. **prd** — `init` + `install --target both` via this repo's CLI (backups, no duplicates, never replaces spec).
6. **graft-mcp** — workspace-local `graft` entries merged into `opencode.json` + `.agents/mcp_config.json` (Windows: `cmd /c npx …`; POSIX: `npx …`, pinned version).
7. **verify** — both configs parse, both skills pass frontmatter validation, spec parses, and the exact configured graft launch command answers `--version`.

## Deliberately NOT included

- **`uiux-skills` (exact name): does not exist.** Searched 2026-10-13.
- Overlapping UI kits (`ui-ux-kit`, `ux-ui-agent-skills`, `ui-ux-pro-max`, `ultimate.UIUX.design.skills`): contradictory design doctrines in one project fight each other and bloat agent context. Hallmark covers the need.
- `graft-org/graft`: different product (private-beta enterprise contracts, waitlist).
- `JSLEEKR/graft`: Claude-only, unproven. Not portable.
- **`AEndrix03/Graft`: a different, tiny (33-star) persistent-memory tool** — not the codebase-graph graft. The suite pins `trailhq/Graft` (MIT, ~10k stars), which is the verified upstream of npm `@nanonets/graft`.
- **`enulus/OpenPackage`**: real (Apache-2.0) installer for skills/agents/MCPs with OpenCode+Antigravity support — but it installs latest with **no pin, lock, rollback, or offline concept** (verified in its README). Fine as a manual alternative; the suite keeps deterministic pinned installs instead of adopting it.
- **`OlegHQ/agentpack`**: real (MIT, Go, v0.4.8) manifest+lockfile manager for agents — but 16 stars and days old. Its good ideas (**lockfile, doctor/verify**) were adopted natively (`vibesuite.lock`, `--doctor`) rather than adding a Go toolchain dependency on an unproven binary.
- **`wshobson/agents` wholesale**: real (MIT, 40k stars) marketplace, but bulk inclusion violates the no-bloat rule. Cherry-picks possible later via the manifest workflow below.

## Honest limitations

- Graft ships a telemetry module (consent-gated; we disable it first). Its `--deep` enrichment needs a provider key and is never run by the installer.
- Graft's `--dir` flag is unreliable on Windows (verified: silent no-op); the installer uses cwd=target instead.
- `npx`-launched MCP servers need network on first run (package cache).
- Hallmark's `SKILL.md` is ~554 lines upstream; agents load it on demand only.
- Third-party file contents are installed verbatim and never edited; only pins/provenance are recorded.

## Adding a component

1. Verify it exists, is OSI-licensed, free, and needs no paid key for its bundled use.
2. Pin it (npm version or commit SHA) in `suite/suite.json` with install order.
3. Implement the step in `suite/install.mjs` (backup before modify, atomic writes, fail-closed).
4. Add unit tests for pure helpers + execute a real install in a temp dir before claiming it works.
