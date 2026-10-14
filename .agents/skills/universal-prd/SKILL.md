---
name: universal-prd
description: Guide structured requirements discovery with Universal PRD Compiler. Use when the user wants a PRD, requirements, spec, acceptance criteria, UI/UX discovery, or says use Universal PRD, use uprd, or /uprd before implementing.
license: MIT
metadata:
  author: universal-prd
  version: "1.0"
  opencode/slash: "true"
---

# Universal PRD — agent workflow

You provide reasoning. Universal PRD provides structure, deterministic validation, persistence, traceability, and safe file writes. It needs **no AI API key** of its own; you use your configured model.

## 0. Locate the toolchain

1. CLI: `universal-prd --help` (or `node <repo>/dist/cli/cli.js --help` in this repo).
2. MCP server: entry `dist/mcp/stdio.js`, launched by the host with `PRD_WORKSPACE` set. If MCP tools `prd_*` are present, prefer them; otherwise use the CLI. Never assume installing one installs the other.
3. Canonical spec: `.prd/spec.json` (only source of truth). Markdown in `docs/spec/` is rendered output.

## 1. Inspect first, change nothing

Run `prd_inspect_workspace` (or `universal-prd inspect`). Record languages/frameworks with their **evidence and confidence**. Treat uncertain detections as uncertain. Never edit source files during discovery.

## 2. Discover (don't interrogate)

Gather: goals, measurable outcomes, users/roles, scope + non-goals, functional + non-functional expectations, constraints, integrations, entities, edge cases. Ask **targeted** clarification questions in small batches. Skip anything already answered by the project files or the user.

- If the project has (or needs) any user interface, run the full **UI/UX discovery** bank — surfaces, brand, accessibility floor, per-screen states — before writing requirements (see `references/WORKFLOW.md`).
- Ask **counter-questions** that challenge the brief (non-goals, failure states, false assumptions, the one shippable slice). Offer a default recommendation with each hard question so the user can accept instead of writing essays.
- After changing code in later implementation work, refresh the repo context graph (`graft build`) so it never drifts across sessions — an OpenCode file-hook plugin may already automate this; otherwise do it yourself.

## 3. Record with provenance

Every requirement/decision uses one of `user_confirmed | agent_inferred | derived | imported` plus status `draft | confirmed | unresolved | rejected`.

- User answers → `user_confirmed`.
- Your guesses → `agent_inferred`, never silently promoted to `confirmed`.
- Use `prd_update_spec` ops: `set-project`, `add-requirement`, `add-nfr`, `add-test`, `add-decision`, `add-assumption`, `add-question`.
- Critical unknowns → `add-question` with `critical: true`. These block readiness until resolved or explicitly waived with a documented assumption (requires user authorization).

## 4. Validate deterministically, then review semantically

1. Run `prd_validate` (or `universal-prd validate`). Fix every `fail`. Report `warning` items explicitly — never hide them behind a single score.
2. Then do a **separate semantic review** yourself: contradictions, ambiguity, missing workflows/permissions/error states, impossible constraints, unstated assumptions, requirement↔architecture↔task↔test mismatches, gold-plating. Record each via `record-finding` (`info | warning | blocking`) and resolve or leave `open` with an owner.

Deterministic results are proof of structure. Semantic review is judgment — never present it as deterministic proof.

## 5. Export in two stages

1. `prd_export_preview` — show creates / conflicts / non-applicable files + blockers. **Preview writes nothing.**
2. Only after the user reviews: `prd_export_apply` with `authorizeOverwrite` listing the **exact** conflicting paths. Revalidation happens automatically; partial failures abort with the written set reported.
3. Verify written files and hashes from the manifest. Default output: `docs/spec/` + `.prd/{validation-report,decisions,export-manifest}.json`.

Never overwrite user docs silently. Never write outside the workspace. Never execute shell from model-supplied paths.

## 6. Readiness handoff

- `ready` = declared validators passed (not a guarantee the app will be correct/secure/complete).
- `needs_decisions` = critical questions or blocking findings open.
- `invalid` = structural failures present.

Hand off implementation work only at `ready`. Instruct implementers to verify the built app against the accepted criteria (see `references/HANDOFF.md`).

Details: `references/WORKFLOW.md`, `references/SEMANTIC_REVIEW.md`, `references/HANDOFF.md`, and `docs/MCP_TOOLS.md` in this repo.
