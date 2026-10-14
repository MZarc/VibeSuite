# Implementation handoff — Universal PRD

Only hand off when `prd_status.readiness === "ready"`.

Give implementers:

1. Paths: `.prd/spec.json`, `docs/spec/*.md`, `.prd/export-manifest.json` (hashes).
2. Requirement IDs that must be implemented (exclude `rejected`).
3. Acceptance criteria IDs per requirement + covering test IDs.
4. Open non-blocking items (`warning` checks, `info` findings) they must not silently drop.
5. Instruction: **verify the built application against ACCEPTANCE_CRITERIA.md and TEST_PLAN.md** by executing the tests/build, not by asserting from text. Report results with evidence.

A ready spec means declared validators passed. It does not guarantee the app is correct, secure, complete, or bug-free.
