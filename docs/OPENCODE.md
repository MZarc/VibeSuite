# OpenCode integration (verified 2026-10-13)

Docs: https://docs.opencode.ai/docs/mcp-servers/ · https://docs.opencode.ai/docs/skills/

## MCP

Config file: `<workspace>/opencode.json` (or `opencode.jsonc` / `.opencode/opencode.json`; global `~/.config/opencode/opencode.json`).

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "universal-prd": {
      "type": "local",
      "command": ["node", "<abs>/dist/mcp/stdio.js"],
      "environment": { "PRD_WORKSPACE": "<workspace>" },
      "enabled": true
    }
  }
}
```

Install: `node dist/cli/cli.js install --target opencode --scope workspace --apply` (use `--dry-run` first; backups consolidate into `.vibesuite/backups/`, duplicates skipped, JSON re-validated). Reload MCP in OpenCode after install.

## Skill

Path (project-local, auto-discovered): `.agents/skills/universal-prd/SKILL.md` (also valid: `.opencode/skills/`, `.claude/skills/`). Frontmatter `name: universal-prd` matches the directory; `description` routes auto-invoke; `metadata.opencode/slash: "true"` exposes `/universal-prd`. Invoke: `/universal-prd` or *"Use Universal PRD to define this application properly before implementing it."*

Manual host verification (GUI pickers) is not automated; server + config artifacts are covered by integration/e2e tests.
