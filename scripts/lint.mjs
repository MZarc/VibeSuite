// Minimal lint: forbid stdout logging in MCP server, telemetry, placeholder claims.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "suite"];
const violations = [];

function checkBat(p) {
  // Unescaped parens in ECHO text inside (...) blocks prematurely close the
  // block at parse time (quotes do NOT protect). Track depth, flag offenders.
  const lines = readFileSync(p, "utf8").split(/\r?\n/);
  let depth = 0;
  lines.forEach((raw, i) => {
    const line = raw;
    const echoIdx = line.search(/\becho(\.|;|\s)/i);
    if (echoIdx >= 0) {
      const text = line.slice(echoIdx).split("|")[0]; // content piped away can't unbalance
      const clean = text.replace(/\^\(/g, "").replace(/\^\)/g, "");
      // Dangerous when nested in a (...) block OR sharing its line with an `if (...`.
      const inBlock = depth > 0 || /^\s*if\b/.test(line);
      if (inBlock && /[()]/.test(clean)) {
        violations.push(`${p}:${i + 1}: unescaped paren in echo inside (...) block (escape as ^( ^))`);
      }
    }
    // depth tracking: count unescaped parens (for-set command strings excluded roughly
    // by ignoring the line's quoted tail is overkill; labels/subroutines reset risk accepted:
    // a `goto :eof`-terminated subroutine keeps depth balanced in practice).
    const stripped = line.replace(/\^\(/g, "").replace(/\^\)/g, "");
    const opens = (stripped.match(/\(/g) || []).length;
    const closes = (stripped.match(/\)/g) || []).length;
    depth += opens - closes;
    if (depth < 0) depth = 0;
    if (/^:\w+/.test(line.trim())) depth = 0; // subroutine boundary resets tracking
  });
}

function walk(dir, isSrc) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, isSrc);
    else if (isSrc && /\.(ts|mjs|js)$/.test(p)) check(p);
    else if (!isSrc && /\.bat$/.test(p)) checkBat(p);
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
  walk(r, r === "src");
}

if (violations.length) {
  console.error("lint failed:");
  for (const v of violations) console.error(" - " + v);
  process.exit(1);
}
console.log("lint ok");
