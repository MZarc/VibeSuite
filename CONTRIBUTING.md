# Contributing

1. Node ≥ 20, `npm install`, `npm run build`.
2. Change in vertical slices; keep `npm run typecheck` + `npm run lint` green.
3. Add/extend tests in `tests/`; run `npm run test`, `npm run test:integration`, `npm run test:e2e`.
4. No paid APIs, telemetry, or network calls in `src/`. All deterministic ops offline.
5. Never overwrite fixtures outside temp dirs. Respect workspace boundaries.
6. Update `docs/` + `CHANGELOG.md` when behavior changes.
