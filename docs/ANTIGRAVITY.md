# Antigravity integration (verified against docs 2026-10-13)

Docs: https://antigravity.google/docs/mcp

## MCP

Workspace file: `<workspace>/.agents/mcp_config.json`. Global: `~/.gemini/config/mcp_config.json`. Shape uses `mcpServers` with `command/args/env/cwd` (stdio) — note: remote entries use `serverUrl`, **not** `url`.

```json
{
  "mcpServers": {
    "universal-prd": {
      "command": "node",
      "args": ["<abs>/dist/mcp/stdio.js"],
      "cwd": "<workspace>",
      "env": { "PRD_WORKSPACE": "<workspace>" }
    }
  }
}
```

Install: `node dist/cli/cli.js install --target antigravity --scope workspace --apply` (`--dry-run` previews; backup + no-duplicate + JSON validation included). Then in Antigravity: Settings → Installed MCP Servers → Add/Refresh, or `/mcp` overlay → reload + connection logs. CLI/SDK auto-discovers workspace `.agents/mcp_config.json`.

## Skill

Same portable Skill at `.agents/skills/universal-prd/SKILL.md` (Agent Skills spec). Antigravity SDK discovers `.agents/mcp_config.json` alongside it; do not assume MCP install implies Skill install.

Manual GUI verification (Store/pickers) is out of scope for automation; see final report §11.
