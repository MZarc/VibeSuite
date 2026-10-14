// Minimal lint: forbid stdout logging in MCP server, telemetry, placeholder claims.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src"];
const violations = [];

function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|mjs|js)$/.test(p)) check(p);
  }
}

function check(p) {
  const s = readFileSync(p, "utf8");
  if (p.includes("mcp") && /console\.(log|info|dir|debug|table)|process\.stdout\.write/.test(s)) {
    violations.push(`${p}: MCP server must log to stderr, never stdout`);
  }
  if (/fetch\s*\(\s*["'`]https?:\/\//.test(s) || /require\(["']https?["']\)/.test(s)) {
    violations.push(`${p}: unexpected remote fetch (offline-first required)`);
  }
  if (/\btelemetry\b/i.test(s)) {
    violations.push(`${p}: telemetry forbidden`);
  }
  if (/\b(TODO|FIXME|PLACEHOLDER)\b/i.test(s)) {
    violations.push(`${p}: placeholder text in production source`);
  }
}

for (const r of roots) {
  walk(r);
}

if (violations.length) {
  console.error("lint failed:");
  for (const v of violations) console.error(" - " + v);
  process.exit(1);
}
console.log("lint ok");
