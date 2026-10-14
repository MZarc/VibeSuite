# Security policy

Report vulnerabilities by opening a GitHub issue with `[security]` prefix (no private bounty process; do not include secrets in reports).

## Guarantees

- Workspace-rooted: every file op resolves inside the configured root; traversal, absolute escapes, and symlink escapes rejected (fail-closed when root unconfigured).
- No shell execution from tool arguments. Bounded inputs (paths ≤ 1024 chars, strings ≤ 8000, arrays capped).
- Inspection allowlists filenames, caps files (40) and bytes (32 KiB), excludes `.git`, `node_modules`, `.env*`, `*.pem/key`, credentials, build dirs; never returns secret contents.
- Two-stage export: preview writes nothing; apply revalidates, requires per-file `authorizeOverwrite`, writes atomically (temp + rename + hash verify), aborts with written set on partial failure.
- MCP logs to stderr only (stdout protocol preserved). Errors omit secrets/absolute internals where possible.

See `docs/THREAT_MODEL.md`.
