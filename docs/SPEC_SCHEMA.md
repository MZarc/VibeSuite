# Spec schema (v1.0.0)

Canonical file: `.prd/spec.json`, validated by `SpecSchema` (`src/core/types.ts` — the single source of truth).

Top-level: `schemaVersion` (must be `1.0.0`; unsupported versions fail validation, never silently migrated), `project{name,description,profile,version}`, `goals[]`, `outcomes[]`, `users[]`, `scope{inScope,outOfScope,nonGoals}`, `functionalRequirements[]`, `nonFunctionalRequirements[]`, `decisions[]`, `assumptions[]`, `openQuestions[]`, `dependencies[]`, `entities[]{name,attributes,relations}`, `interfaces[]{name,kind,contract}`, `risks[]`, `stories[]`, `testCases[]{id,title,verifies[≥1],steps,expected,category}`, `semanticFindings[]{id,finding,severity,status}`, `exportConfig{profile,outputDir(relative,no ..),artifacts[]}`, `revision{version,updatedAt,history[]}`.

## Provenance & status

- Provenance: `user_confirmed | agent_inferred | derived | imported`.
- Status: `draft | confirmed | unresolved | rejected`.
- Rule: `agent_inferred` items must never be `confirmed` without explicit user confirmation (validator `provenance` fails otherwise).
- IDs stable (`REQ-n`, `NFR-n`, `TC-n`, `DEC-n`, `ASM-n`, `Q-n`, `REQ-n:AC-m`); edits never rename IDs; duplicates fail.

## Readiness

- `invalid`: any `fail` check (missing acceptance criteria, broken refs, provenance violation, blocking items, bad export config, unknown profile, bad schema version…).
- `needs_decisions`: reserved for future non-failing blockers; currently any critical unresolved question yields `fail` → `invalid` (documented, tested).
- `ready`: no `fail`. `warning`s (e.g. must-requirement without test, profile suggestions) are shown, not hidden. Ready means declared validators passed — not that the app is correct/secure/complete.
