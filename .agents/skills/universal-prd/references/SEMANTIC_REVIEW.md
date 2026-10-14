# Semantic review checklist — Universal PRD

Deterministic validation cannot catch meaning problems. Review separately and record each item with `record-finding`:

1. Contradictory requirements (e.g. "offline-first" + "realtime server validation required").
2. Ambiguous wording ("fast", "user-friendly", "secure" without criteria).
3. Missing workflows (happy path present, error/empty/loading states absent).
4. Inconsistent permissions across stories, requirements, and architecture.
5. Missing error states, retry, idempotency, data-loss scenarios.
6. Impossible/conflicting constraints (deadline vs scope vs quality).
7. Unstated assumptions (bandwidth, auth provider, data residency).
8. Requirement ↔ architecture ↔ task ↔ test mismatches (IDs dangling, coverage gaps).
9. Gold-plating: features/architecture disproportionate to stated goals.
10. Profile mismatch: e.g. REST rules applied to a pure static site.

Severity: `blocking` stops readiness handoff; `warning` must be shown to the user; `info` is advisory. Keep these separate from `prd_validate` output.
