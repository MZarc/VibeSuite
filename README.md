# VibeSuite — one command, full AI coding setup

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js >= 20](https://img.shields.io/badge/Node.js-%3E%3D20-339933.svg)](https://nodejs.org/)
[![Windows](https://img.shields.io/badge/Windows-%E2%9C%93-0078D6.svg)](#quick-start)
[![macOS / Linux](https://img.shields.io/badge/macOS%20%7C%20Linux-%E2%9C%93-000000.svg)](#quick-start)
[![No API key](https://img.shields.io/badge/AI%20API%20key-not%20needed-blue.svg)](#no-api-key-no-subscription-no-telemetry)

**VibeSuite turns any folder — empty or existing — into a fully-equipped AI development project with one double-click.** It installs three pinned, MIT-licensed, non-overlapping tools in dependency order, wires them into **OpenCode** and **Google Antigravity**, verifies everything actually works, and hands you a single command (`/uprd`) to drive it all.

```text
┌──────────────────────────────────────────────────────────────┐
│  VIBESUITE   graft graph + hallmark design + universal prd   │
├──────────────────────────────────────────────────────────────┤
│   project : D:\my-app                                        │
│   suite   : GitHub MZarc/VibeSuite (auto-fetched, pinned)    │
│                                                              │
│   [ ok ] preflight: node, git, installer present             │
│   | working... 3s   [3] graft init: wire agents + build...   │
│   [4] Installing Agent Skills (hallmark pinned, ...)         │
│   [5] PRD init + OpenCode/Antigravity registration...        │
│   DONE. Your project is ready for AI-assisted building.      │
└──────────────────────────────────────────────────────────────┘
```

No AI API key. No subscription. No telemetry (graft's is disabled before anything else runs). No account. Your coding agent's own model setup is unchanged.

---

## ⚡ Quick start (60 seconds)

**You don't need this repository.** Get the one-file installer into your project folder, then run it — it fetches everything else from GitHub automatically. Most reliable (works on every network):

```bash
git clone --depth 1 https://github.com/MZarc/VibeSuite.git /tmp/vibesuite-src
# Windows: copy suite\Install-VibeSuite.bat into your project and double-click it
# macOS/Linux: copy suite/Install-VibeSuite.sh into your project and run bash Install-VibeSuite.sh
```

Or download just the installer file directly (needs `raw.githubusercontent.com` reachable):

**Windows** — download `Install-VibeSuite.bat` into your project, then double-click it:

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/MZarc/VibeSuite/main/suite/Install-VibeSuite.bat" -OutFile ".\Install-VibeSuite.bat"
```

**macOS / Linux:**

```bash
curl -LO "https://raw.githubusercontent.com/MZarc/VibeSuite/main/suite/Install-VibeSuite.sh"
bash Install-VibeSuite.sh
```

Then:

1. **Reload MCP** in your host — OpenCode: reload MCP servers / restart the session · Antigravity: Settings → Installed MCP Servers → refresh (or `/mcp` → reload).
2. **Say one sentence** to your agent:
   > *"Use Universal PRD to define this application properly before implementing it."*
   
   Shortcut: `/uprd i wanna make expense tracker`

That's it. Details for the curious below; nothing below is required reading.

Prefer PRD-only without the graph and design skill? Same pattern with the smaller installer (`suite/Install-UniversalPRD.*`, also self-bootstrapping from GitHub):

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/MZarc/VibeSuite/main/suite/Install-UniversalPRD.bat" -OutFile ".\Install-UniversalPRD.bat"
```

```bash
curl -LO "https://raw.githubusercontent.com/MZarc/VibeSuite/main/suite/Install-UniversalPRD.sh"
bash Install-UniversalPRD.sh
```

---

## 🧩 What gets installed (and why these three)

| # | Tool | Pinned version | License | Job |
|---|---|---|---|---|
| 1 | **[Graft](https://github.com/trailhq/Graft)** — codebase context graph | `@nanonets/graft@0.21.1` | MIT | Indexes your repo once (`graft/`) so the agent queries a map instead of re-grepping every session. 6 MCP tools. Structural pass needs no key. |
| 2 | **[Hallmark](https://github.com/Nutlope/hallmark)** — anti-AI-slop design skill | commit `13ac0ec7` | MIT | Opinionated UI taste (build / audit / redesign / study verbs, 21 themes, slop-test gates) so generated UI stops looking generated. |
| 3 | **Universal PRD Compiler** (this repo) | local `1.0.0` | MIT | Requirements discipline: structured spec, deterministic validation, provenance, traceability, safe two-stage export. 9 MCP tools + CLI + skill. |

Three tools, three jobs, zero overlap. Full pins, licenses, and order rationale live in [`suite/suite.json`](suite/suite.json).

**Deliberately excluded:** lookalike/overlapping UI kits (contradictory doctrines fight each other), `graft-org/graft` and `AEndrix03/Graft` (different products sharing a name), bulk marketplaces wholesale (bloat). Each rejection is recorded with its reason in `suite.json` → `notIncluded`. See [`docs/SUITE.md`](docs/SUITE.md).

---

## 🔄 How it works (chronology is load-bearing)

```
prereqs → telemetry-off → graft-init(+build) → skills → prd → graft-mcp → verify
```

1. **Prereqs** — Node ≥ 20, git, network. Fail fast with actionable errors.
2. **Telemetry off** — `graft telemetry disable` runs *before any other graft command*. The suite's only machine-wide write.
3. **Graft init + build** — wires `AGENTS.md`, builds the `graft/` graph **before** planning so every later step can query it. Runs fully workspace-local (`--no-global --no-mcp`); your `.gitignore`/`AGENTS.md` are backed up and merged (graft overwrites `.gitignore` — the installer repairs that).
4. **Skills** — hallmark fetched by pinned commit SHA (detached checkout, frontmatter-validated) + universal-prd + `uprd` alias copied.
5. **PRD** — `init` (never replaces an existing spec) + host registration for both targets.
6. **Graft MCP** — workspace-local `graft` server entries merged into both host configs (no machine-wide files).
7. **Verify** — configs parse, skills validate, servers launch, then `vibesuite.lock` is written.

Afterwards your project looks like this (`.vibesuite/` holds timestamped backups; everything else is where its host mandates it):

```text
my-app/
├── graft/                    context graph (git-ignored cache)
├── AGENTS.md                 agent instructions (graft section)
├── .prd/spec.json            canonical requirements (source of truth)
├── docs/spec/*.md            rendered engineering docs
├── opencode.json             OpenCode MCP: universal-prd + graft
├── .agents/
│   ├── mcp_config.json       Antigravity MCP: universal-prd + graft
│   └── skills/               universal-prd/ · uprd/ · hallmark/
├── .opencode/
│   ├── commands/uprd.md      native /uprd (OpenCode)
│   └── plugins/              graft auto-rebuild on file edits
├── .vibesuite/backups/       every backup, one folder
└── vibesuite.lock            pins, SHAs, licenses, timestamp
```

---

## ⌨️ `/uprd` — the one command

```text
/uprd i wanna make expense tracker
```

- **OpenCode**: native command (`.opencode/commands/uprd.md` → `/uprd` in the TUI).
- **Antigravity**: the `uprd` skill auto-converts to `/uprd`.
- **Either host, as text**: *"use uprd…"* routes through skill descriptions.

It runs the full Universal PRD workflow on your brief: inspect → discover (goals, users, scope, **full UI/UX discovery**, **counter-questions that challenge the brief**) → record with provenance → deterministic validation → separate semantic review → two-stage export → readiness handoff. Implementation starts only at `ready`. UI work picks up hallmark automatically; repo questions use the graft graph.

---

## 🖥️ Host setup

| | OpenCode | Google Antigravity |
|---|---|---|
| MCP config | `opencode.json` (`mcp.*`, `type: local`) | `.agents/mcp_config.json` (`mcpServers.*`) |
| Skills | `.agents/skills/*` (auto-discovered) | `.agents/skills/*` (+ auto `/slash` commands) |
| `/uprd` | `.opencode/commands/uprd.md` | skill auto-conversion |
| Auto-rebuild graph | `.opencode/plugins/graft-rebuild.ts` (`file.edited`) | skill instruction (`graft build` per work block) |
| After install | reload MCP / restart session | refresh servers or `/mcp` → reload |

Verified against the official docs during implementation; GUI clicks are documented as manual steps, never faked. Full guides: [`docs/OPENCODE.md`](docs/OPENCODE.md), [`docs/ANTIGRAVITY.md`](docs/ANTIGRAVITY.md).

---

## 🛠️ CLI reference

```bash
# Full suite (runs from a checkout OR auto-fetches; also: vibesuite --target … after npm link)
node suite/install.mjs --target D:/my-app
node suite/install.mjs --target . --dry-run        # plan only, zero writes
node suite/install.mjs --target . --offline        # PRD-only, no network
node suite/install.mjs --target . --only prd       # subset (graft,hallmark,prd)
node suite/install.mjs --doctor --target D:/my-app # re-verify, exit 0/1, no writes
node suite/install.mjs --check-updates             # pin freshness, exit 0/2
node suite/install.mjs --help | --version
```

```bash
# Universal PRD on its own
node dist/cli/cli.js init|inspect|status|validate|export|install|profiles --help
```

Unknown flags, unknown `--only`/`--skip` ids, and a valueless `--target` are rejected (exit 1) — never silently installed into the wrong folder.

**Staying fresh:** `--check-updates` compares pins against npm/GitHub live state. To update: bump the pin in `suite/suite.json`, reinstall into an empty temp dir, run the gates below, then commit. Never bump blindly.

**Quality gates** (same in CI): `npm run typecheck` · `npm run lint` · `npm run validate:skill` · `npm run test` · `npm run test:integration` · `npm run test:e2e`.

---

## 📁 Repository layout

```text
suite/                  one-click installers + manifest + templates
  Install-VibeSuite.*   full suite (color TUI on Windows)
  Install-UniversalPRD.*PRD-only path
  install.mjs           chronological FAIL-CLOSED installer (--help for all flags)
  suite.json            pins, order rationale, rejection log
  templates/            uprd skill · /uprd command · graft-rebuild plugin
src/                    universal-prd core, validator, MCP server, CLI
tests/                  unit + security + MCP integration + e2e (56 tests)
.agents/skills/         universal-prd skill + references
docs/                   architecture, schema, tools, hosts, threat model, suite
```

---

## 🛡️ Security & honesty rules

- Workspace-rooted everything: traversal, absolute escapes, and symlink escapes rejected; fail-closed without a configured root.
- Two-stage exports (preview writes nothing; apply needs per-file authorization); atomic writes with hash verification.
- Merges never replace configs; backups consolidate into `.vibesuite/backups/`; `--dry-run` + explicit `--apply`.
- Third-party code is installed verbatim and pinned — never edited, never auto-updated.
- Test counts and verification claims in this file describe runs that actually happened; host-GUI steps are marked manual. Threat model: [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). Reports: [`SECURITY.md`](SECURITY.md).

## 🤝 Contributing

Node ≥ 20, `npm install`, `npm run build`. Vertical slices, gates green, tests for new behavior, docs updated with behavior changes. Templates in `templates/` ship to user projects — treat them as production code. See [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CHANGELOG.md`](CHANGELOG.md).

## 🗺️ Roadmap

Release tags (`v1.0.0` → pin wrappers to tags instead of `main`) · single-skill cherry-picks from large marketplaces on request (evaluated, never bulk) · optional per-project QA toolchain profile · `vibesuite update` (pin bump + re-verify in one guided step).

## 📄 License

MIT — see [LICENSE](LICENSE). Runtime dependencies are MIT/Apache-2.0/ISC/BSD only (`npm audit --omit=dev`: 0 vulnerabilities).
