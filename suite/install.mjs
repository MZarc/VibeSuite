#!/usr/bin/env node
// Universal Vibe Suite installer — chronological, pinned, fail-closed.
// Order (see suite.json): prereqs -> telemetry-off -> graft-init -> preserve-merge
//   -> skills -> prd -> graft-mcp -> verify.
// Only Node.js builtins. All third-party versions pinned in suite.json.
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const MANIFEST = JSON.parse(await fs.readFile(path.join(HERE, "suite.json"), "utf8"));
const GRAFT = MANIFEST.components.find((c) => c.id === "graft");
const HALL = MANIFEST.components.find((c) => c.id === "hallmark");
const GRAFT_PKG = `${GRAFT.npm}@${GRAFT.pin}`;
const NPX = "npx";
function npxCall(args, opts = {}) {
  // Windows cannot spawn .cmd directly (EINVAL) and shell:true triggers DEP0190;
  // route through cmd.exe with a fully-static, quoted command line instead.
  if (process.platform === "win32") {
    const line = ["npx.cmd", ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a)).join(" ");
    return run("cmd.exe", ["/d", "/s", "/c", line], opts);
  }
  return run(NPX, args, opts);
}

// ---------- pure helpers (unit-tested) ----------
export function unionTextLines(original, current) {
  const seen = new Set();
  const out = [];
  for (const raw of (original + "\n" + current).split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "") continue;
    if (seen.has(line.trim())) continue;
    seen.add(line.trim());
    out.push(line);
  }
  return out.join("\n") + "\n";
}

export function dedupeFenceBlocks(text, start = "<!-- graft:start -->", end = "<!-- graft:end -->") {
  const idx = text.indexOf(start);
  if (idx === -1) return text;
  const head = text.slice(0, idx);
  let rest = text.slice(idx);
  const blocks = [];
  for (;;) {
    const s = rest.indexOf(start);
    if (s === -1) break;
    const e = rest.indexOf(end, s);
    if (e === -1) {
      blocks.push(rest.slice(s));
      rest = "";
      break;
    }
    blocks.push(rest.slice(s, e + end.length));
    rest = rest.slice(e + end.length);
  }
  return head + blocks[0] + rest;
}

export function mergeAgentsMd(backupOrNull, current) {
  if (!backupOrNull) return dedupeFenceBlocks(current);
  const firstLine = backupOrNull.split("\n").map((l) => l.trim()).find((l) => l !== "");
  if (firstLine && current.includes(firstLine)) return dedupeFenceBlocks(current);
  return dedupeFenceBlocks(backupOrNull.replace(/\s+$/, "") + "\n\n" + current);
}

export function validateSkillFrontmatter(skillDirName, raw) {
  const m = raw.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { errs: ["missing frontmatter block"], bodyLines: 0 };
  const fm = m[1];
  const name = (fm.match(/^name:\s*["']?(.+?)["']?\s*$/m) || [])[1]?.trim();
  const desc = (fm.match(/^description:\s*(.+)$/m) || [])[1]?.trim();
  const errs = [];
  if (!name) errs.push("name required");
  else {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) errs.push(`name '${name}' violates skill naming`);
    if (name !== skillDirName) errs.push(`name '${name}' must match directory '${skillDirName}'`);
  }
  if (!desc) errs.push("description required");
  else if (desc.length > 1024) errs.push("description > 1024 chars");
  const bodyLines = raw.slice(m[0].length).split("\n").length;
  return { errs, bodyLines };
}

export function mergeMcpEntry(kind, existing, key, entry) {
  const next = JSON.parse(JSON.stringify(existing ?? {}));
  const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  if (kind === "opencode") {
    if (next.mcp !== undefined && !isPlainObject(next.mcp)) {
      throw new Error(`existing 'mcp' section is not an object (refusing to merge; fix or back up the file)`);
    }
    next.mcp = next.mcp ?? {};
    if (!next.mcp[key]) next.mcp[key] = entry;
  } else {
    if (next.mcpServers !== undefined && !isPlainObject(next.mcpServers)) {
      throw new Error(`existing 'mcpServers' section is not an object (refusing to merge; fix or back up the file)`);
    }
    next.mcpServers = next.mcpServers ?? {};
    if (!next.mcpServers[key]) next.mcpServers[key] = entry;
  }
  return next;
}

/** Replace __TOKENS__ in template text. Throws on unknown/missing tokens (fail-closed). */
export function renderTemplate(text, vars) {
  const missing = [];
  const out = text.replace(/__([A-Z][A-Z0-9_]*)__/g, (m, k) => {
    if (!(k in vars)) {
      missing.push(k);
      return m;
    }
    return vars[k];
  });
  if (missing.length) throw new Error(`template has unfilled tokens: ${[...new Set(missing)].join(", ")}`);
  return out;
}

/** Additively merge a plugin path into opencode.json `plugin` array (no duplicates). */
export function mergePluginEntry(existing, entry) {
  const next = JSON.parse(JSON.stringify(existing ?? {}));
  const cur = next.plugin ?? [];
  if (!Array.isArray(cur)) throw new Error(`existing 'plugin' section is not an array (refusing to merge)`);
  if (!cur.includes(entry)) cur.push(entry);
  next.plugin = cur;
  return next;
}

// ---------- io helpers ----------
function log(...a) {
  console.log(...a);
}
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts });
    let out = "";
    let err = "";
    p.stdout?.on("data", (d) => (out += d));
    p.stderr?.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}
async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
function ts() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
async function backupFile(target, p) {
  // All backups consolidate into <target>/.vibesuite/backups/ (one folder).
  if (!(await exists(p))) return null;
  const dir = path.join(target, ".vibesuite", "backups");
  await fs.mkdir(dir, { recursive: true });
  const bak = path.join(dir, `${path.basename(p)}.bak-${ts()}`);
  await fs.copyFile(p, bak);
  return bak;
}

/** Ensure <target>/.gitignore ignores the local .vibesuite/ state dir. */
async function ignoreVibesuiteDir(target) {
  const gi = path.join(target, ".gitignore");
  const cur = (await exists(gi)) ? await fs.readFile(gi, "utf8") : "";
  await fs.writeFile(gi, unionTextLines(cur, ".vibesuite/"), "utf8");
}
async function writeJsonAtomic(p, obj) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  JSON.parse(await fs.readFile(tmp, "utf8"));
  await fs.rename(tmp, p);
}
async function copyDir(src, dest) {
  // Crash-safe: never rm the destination before the replacement is fully staged.
  // A kill between staging and swap leaves dest untouched; a kill between rm and
  // rename loses dest but src is intact, so re-running the installer restores it.
  if (!(await exists(src))) throw new Error(`copy source missing: ${src}`);
  if (path.resolve(src) === path.resolve(dest)) return;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.swap-${process.pid}`;
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.cp(src, tmp, { recursive: true });
  await fs.rm(dest, { recursive: true, force: true });
  await fs.rename(tmp, dest);
}
function graftMcpEntries(target) {
  const args = ["-y", GRAFT_PKG, "mcp"];
  if (process.platform === "win32") {
    return {
      open: { type: "local", command: ["cmd", "/c", "npx", ...args], cwd: target, environment: {}, enabled: true },
      ag: { command: "cmd", args: ["/c", "npx", ...args], cwd: target, env: {} },
    };
  }
  return {
    open: { type: "local", command: ["npx", ...args], cwd: target, environment: {}, enabled: true },
    ag: { command: "npx", args, cwd: target, env: {} },
  };
}

/** Fetch live latest versions. Network read-only. Returns {graft:{...}, hallmark:{sha,date,message}}. */
export async function fetchLatest() {
  const out = {};
  const g = await run(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/s", "/c", "npm view @nanonets/graft dist-tags.latest version --json"] : ["view", "@nanonets/graft", "dist-tags.latest", "version", "--json"]);
  if (g.code !== 0) throw new Error(`npm lookup failed: ${(g.err || g.out).slice(0, 200)}`);
  out.graft = JSON.parse(g.out);
  const r = await fetch(`https://api.github.com/repos/${HALL.repo}/commits/main`, { headers: { "User-Agent": "vibe-suite" } });
  if (!r.ok) throw new Error(`GitHub lookup failed: status ${r.status}`);
  const j = await r.json();
  out.hallmark = { sha: j.sha, date: j.commit?.committer?.date, message: (j.commit?.message || "").split("\n")[0] };
  return out;
}

/** Compare pins against live. Pure. Returns rows [{id, pinned, latest, stale}]. */
export function comparePins(latest) {
  const norm = (v) => String(v).replace(/^v/, "");
  return [
    { id: "graft", pinned: GRAFT.pin, latest: norm(latest.graft["dist-tags.latest"] ?? latest.graft.version), stale: norm(latest.graft["dist-tags.latest"] ?? latest.graft.version) !== norm(GRAFT.pin) },
    { id: "hallmark", pinned: HALL.sha.slice(0, 12), latest: latest.hallmark.sha.slice(0, 12), stale: latest.hallmark.sha !== HALL.sha, latestDate: latest.hallmark.date, latestMessage: latest.hallmark.message },
    { id: "universal-prd", pinned: "local", latest: "local", stale: false },
  ];
}

// ---------- lockfile + doctor (also usable standalone) ----------
export const LOCK_NAME = "vibesuite.lock";

export async function writeLockfile(target, components) {
  const lock = {
    lockVersion: 1,
    installer: "universal-prd-suite",
    installerVersion: "1.0.0",
    manifestVersion: MANIFEST.version,
    installedAt: new Date().toISOString(),
    components,
  };
  await fs.writeFile(path.join(target, LOCK_NAME), JSON.stringify(lock, null, 2) + "\n", "utf8");
  return lock;
}

export async function readLockfile(target) {
  try {
    return JSON.parse(await fs.readFile(path.join(target, LOCK_NAME), "utf8"));
  } catch {
    return null;
  }
}

/** Re-verify an installed project. No writes, no installs. Returns {ok, checks[], problems[], warnings[]}. */
export async function doctorSuite(target, expect = { graft: true, hallmark: true, prd: true }, opts = {}) {
  const { checkLock = true } = opts;
  const checks = [];
  const problems = [];
  const warnings = [];
  const check = (id, title, ok, detail = "") => {
    checks.push({ id, title, ok, detail });
    if (!ok) problems.push(`${id}: ${detail || "failed"}`);
  };
  const lock = await readLockfile(target);
  if (checkLock) {
    check("lockfile", "vibesuite.lock present", !!lock, lock ? `manifest v${lock.manifestVersion}, installed ${lock.installedAt}` : "not installed via suite (or lock deleted)");
  }
  if (expect.prd) {
    for (const f of ["opencode.json", path.join(".agents", "mcp_config.json"), path.join(".prd", "spec.json")]) {
      try {
        JSON.parse(await fs.readFile(path.join(target, f), "utf8"));
        check(`json:${f}`, `${f} parses`, true);
      } catch (e) {
        check(`json:${f}`, `${f} parses`, false, e.message);
      }
    }
    try {
      const oc = JSON.parse(await fs.readFile(path.join(target, "opencode.json"), "utf8"));
      check("mcp:opencode-prd", "opencode.json registers universal-prd", !!(oc.mcp && oc.mcp["universal-prd"]));
    } catch (e) {
      check("mcp:opencode-prd", "opencode.json registers universal-prd", false, e.message);
    }
    check("uprd:command", ".opencode/commands/uprd.md present", await exists(path.join(target, ".opencode", "commands", "uprd.md")), "OpenCode /uprd command missing; re-run the installer");
  }
  for (const s of [...(expect.hallmark ? [HALL.destSkill] : []), ...(expect.prd ? ["universal-prd", "uprd"] : [])]) {
    try {
      const raw = await fs.readFile(path.join(target, ".agents", "skills", s, "SKILL.md"), "utf8");
      const c = validateSkillFrontmatter(s, raw);
      check(`skill:${s}`, `skill ${s} valid`, !(c.errs?.length), (c.errs || []).join("; "));
      if (c.bodyLines > 500) warnings.push(`${s} SKILL.md is ${c.bodyLines} lines (loaded on demand only)`);
    } catch (e) {
      check(`skill:${s}`, `skill ${s} valid`, false, e.message);
    }
  }
  if (expect.graft) {
    check("graft:graph", "graft/ graph exists", await exists(path.join(target, "graft")), "run the suite installer (graft-init) to rebuild");
    try {
      const oc = JSON.parse(await fs.readFile(path.join(target, "opencode.json"), "utf8"));
      check("mcp:opencode-graft", "opencode.json registers graft", !!(oc.mcp && oc.mcp.graft));
    } catch (e) {
      check("mcp:opencode-graft", "opencode.json registers graft", false, e.message);
    }
    const { open } = graftMcpEntries(target);
    const [cmd, ...rest] = open.command;
    try {
      const r = await run(cmd, [...rest.slice(0, -1), "--version"], { cwd: target });
      check("graft:launch", `graft MCP launch answers ${GRAFT.pin}`, r.code === 0 && r.out.includes(GRAFT.pin), (r.err || r.out).slice(0, 200));
    } catch (e) {
      check("graft:launch", `graft MCP launch answers ${GRAFT.pin}`, false, `could not launch: ${e.message}`);
    }
  }
  return { ok: problems.length === 0, checks, problems, warnings };
}
const HELP = `vibesuite — chronological, pinned, fail-closed project setup (graft + hallmark + universal-prd)

Usage:
  node suite/install.mjs --target <dir> [options]
  node suite/install.mjs --doctor --target <dir> [--json]
  node suite/install.mjs --check-updates [--json]

Options:
  --target <dir>   project folder (default: current directory)
  --dry-run        print the ordered plan, change nothing
  --only a,b       run only these components (graft,hallmark,prd)
  --skip a,b       skip these components
  --offline        PRD-only install, no network (implies --skip graft,hallmark)
  --doctor         re-verify an installed project (no writes)
  --check-updates  compare pins against live registries (no writes)
  --json           machine-readable output
  --help, -h       this help
  --version        print version

Examples:
  node suite/install.mjs --target D:\\my-app
  node suite/install.mjs --target . --dry-run
  node suite/install.mjs --target . --offline
  node suite/install.mjs --doctor --target D:\\my-app
  node suite/install.mjs --check-updates

Exit codes: 0 ok · 1 error · 2 updates available (--check-updates only).
Chronology: prereqs -> telemetry-off -> graft-init(+build) -> skills -> prd
  -> graft-mcp -> verify (+vibesuite.lock). Full order rationale: suite/suite.json.
`;

const VALID_IDS = ["graft", "hallmark", "prd"];
const KNOWN_FLAGS = new Set(["--target", "--dry-run", "--only", "--skip", "--offline", "--doctor", "--check-updates", "--json", "--help", "-h", "--version"]);

async function main() {
  const argv = process.argv.slice(2);
  const get = (k) => {
    const eq = argv.find((a) => a.startsWith(k + "="));
    if (eq) return eq.slice(k.length + 1) || undefined;
    const i = argv.indexOf(k);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    // A flag with no value (end of args or followed by another flag) counts as missing.
    if (v === undefined || v.startsWith("--")) return undefined;
    return v;
  };
  const has = (k) => argv.includes(k);
  if (has("--help") || has("-h") || argv[0] === "help") {
    console.log(HELP);
    return;
  }
  if (has("--version") || argv[0] === "version") {
    console.log("vibesuite 1.0.0 (manifest v" + MANIFEST.version + ")");
    return;
  }
  for (const a of argv) {
    if (a.startsWith("--") && !KNOWN_FLAGS.has(a) && !a.startsWith("--target=") && !a.startsWith("--only=") && !a.startsWith("--skip=")) {
      console.error(`[ERROR] args: unknown flag '${a}'. Run with --help.`);
      process.exit(1);
    }
  }
  if ((has("--target") || argv.some((a) => a.startsWith("--target="))) && get("--target") === undefined) {
    console.error("[ERROR] args: --target needs a directory value (e.g. --target D:\\my-app)");
    process.exit(1);
  }
  for (const k of ["--only", "--skip"]) {
    const raw = get(k);
    if (raw !== undefined) {
      const bad = raw.split(",").map((s) => s.trim()).filter(Boolean).filter((s) => !VALID_IDS.includes(s));
      if (bad.length) {
        console.error(`[ERROR] args: ${k} has unknown component(s): ${bad.join(", ")}. Valid: ${VALID_IDS.join(",")}.`);
        process.exit(1);
      }
    }
  }
  const target = path.resolve(get("--target") || process.env.VIBE_TARGET || process.cwd());
  const dryRun = has("--dry-run");
  const asJson = has("--json");
  const offline = has("--offline");
  const only = (get("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const skip = new Set((get("--skip") || "").split(",").map((s) => s.trim()).filter(Boolean));
  const runComp = (id, needsNetwork) => {
    if (skip.has(id)) return false;
    if (only.length > 0 && !only.includes(id)) return false;
    if (offline && needsNetwork) return false;
    return true;
  };
  const wantGraft = runComp("graft", true);
  const wantHall = runComp("hallmark", true);
  const wantPrd = runComp("prd", false);
  const summary = { target, dryRun, offline, phases: [], warnings: [] };

  const phase = async (id, title, active, fn) => {
    if (typeof active === "function") {
      fn = active;
      active = true;
    }
    if (dryRun) {
      log(`[dry-run] ${active ? title : `${title} (skipped by --only/--skip/--offline)`}`);
      summary.phases.push({ id, title, mode: active ? "dry-run" : "skipped" });
      return;
    }
    if (!active) return;
    log(`[${summary.phases.length + 1}] ${title}...`);
    const r = await fn();
    summary.phases.push({ id, title, mode: "done", ...(r || {}) });
  };
  const fail = (where, msg) => {
    if (asJson) console.log(JSON.stringify({ error: msg, where, summary }, null, 2));
    else console.error(`[ERROR] ${where}: ${msg}`);
    process.exit(1);
  };

  if (has("--check-updates")) {
    let latest;
    try {
      latest = await fetchLatest();
    } catch (e) {
      fail("--check-updates", e.message);
    }
    const rows = comparePins(latest);
    const stale = rows.filter((r) => r.stale);
    if (asJson) console.log(JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2));
    else {
      log("suite freshness check:");
      for (const r of rows) {
        log(`  [${r.stale ? "STALE" : "fresh"}] ${r.id}: pinned ${r.pinned} / live ${r.latest}${r.latestDate ? ` (${r.latestDate}: ${r.latestMessage || ""})` : ""}`);
      }
      if (stale.length) log("  To update: bump the pin in suite/suite.json, reinstall into an empty temp dir, run the test gates, then commit. Never bump pins blindly.");
    }
    process.exitCode = stale.length ? 2 : 0;
    return;
  }

  if (has("--doctor")) {
    const lock = await readLockfile(target);
    // Lock stores installer component ids (graft/hallmark/universal-prd); map to doctor expects.
    const ids = new Set(lock ? lock.components.map((c) => c.id) : ["graft", "hallmark", "universal-prd"]);
    const expect = { graft: ids.has("graft"), hallmark: ids.has("hallmark"), prd: ids.has("prd") || ids.has("universal-prd") };
    const d = await doctorSuite(target, expect);
    if (asJson) console.log(JSON.stringify({ target, ...d }, null, 2));
    else {
      log(`doctor: ${target} — ${d.ok ? "HEALTHY" : "PROBLEMS FOUND"}`);
      for (const c of d.checks) log(`  [${c.ok ? "ok" : "FAIL"}] ${c.title}${c.ok ? "" : " — " + c.detail}`);
      for (const w of d.warnings) log(`  warning: ${w}`);
    }
    process.exitCode = d.ok ? 0 : 1;
    return;
  }

  if (dryRun) log(`Vibe Suite install plan for ${target} (nothing will be written):`);

  // 0. prereqs
  await phase("prereqs", "Checking prerequisites (node, git, network)", async () => {
    const major = parseInt(process.versions.node.split(".")[0], 10);
    if (major < 20) throw new Error(`node >= 20 required, found ${process.version}`);
    const g = await run("git", ["--version"]);
    if (g.code !== 0) throw new Error("git not found in PATH (required for pinned skill fetch)");
    if ((wantGraft || wantHall) && !dryRun) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      try {
        const r = await fetch("https://api.github.com/zen", { signal: ctrl.signal, headers: { "User-Agent": "vibe-suite" } });
        if (!r.ok) throw new Error(`status ${r.status}`);
      } catch (e) {
        throw new Error(`network check failed (${e.message}). Re-run with --offline for PRD-only install.`);
      } finally {
        clearTimeout(t);
      }
    }
    return { node: process.version };
  }).catch((e) => fail("prereqs", e.message));

  // 1. telemetry consent FIRST
  if (wantGraft) {
    await phase("telemetry-off", `Disabling graft telemetry (${GRAFT_PKG} telemetry disable)`, wantGraft, async () => {
      const r = await npxCall(["-y", GRAFT_PKG, "telemetry", "disable"], { cwd: target });
      if (r.code !== 0) throw new Error(`telemetry disable failed: ${(r.err || r.out).slice(0, 500)}`);
      return { note: "machine-wide telemetry preference; the only out-of-project write graft makes under this installer" };
    }).catch((e) => fail("telemetry-off", e.message));
  }

  // 2. graft init (cwd=target; builds graph BEFORE prd)
  if (wantGraft) {
    await phase("graft-init", "graft init: wire agents + build context graph (no global writes)", wantGraft, async () => {
      const bakAgents = (await exists(path.join(target, "AGENTS.md"))) ? await backupFile(target, path.join(target, "AGENTS.md")) : null;
      const bakIgnore = (await exists(path.join(target, ".gitignore"))) ? await backupFile(target, path.join(target, ".gitignore")) : null;
      const origAgents = bakAgents ? await fs.readFile(bakAgents, "utf8") : null;
      const origIgnore = bakIgnore ? await fs.readFile(bakIgnore, "utf8") : null;
      const r = await npxCall(["-y", GRAFT_PKG, "init", "--agents", "antigravity", "--no-global", "--no-mcp", "-y"], { cwd: target });
      if (r.code !== 0) throw new Error(`graft init failed: ${(r.err || r.out).slice(0, 800)}`);
      // preserve-merge: graft overwrites .gitignore; union user lines back. AGENTS.md: keep graft merge, dedupe fence.
      if (origIgnore !== null) {
        const cur = (await exists(path.join(target, ".gitignore"))) ? await fs.readFile(path.join(target, ".gitignore"), "utf8") : "";
        await fs.writeFile(path.join(target, ".gitignore"), unionTextLines(origIgnore, cur), "utf8");
      }
      if (await exists(path.join(target, "AGENTS.md"))) {
        const cur = await fs.readFile(path.join(target, "AGENTS.md"), "utf8");
        await fs.writeFile(path.join(target, "AGENTS.md"), mergeAgentsMd(origAgents, cur), "utf8");
      }
      await ignoreVibesuiteDir(target);
      if (!(await exists(path.join(target, "graft")))) throw new Error("graft/ graph directory missing after init");
      return { backups: [bakAgents, bakIgnore].filter(Boolean) };
    }).catch((e) => fail("graft-init", e.message));
  }

  // 3. skills (hallmark pinned SHA + PRD skill copy)
  if (wantHall || wantPrd) {
    const skillsTitle = `Installing Agent Skills (${[wantHall && "hallmark pinned", wantPrd && "universal-prd local"].filter(Boolean).join(", ")})`;
    await phase("skills", skillsTitle, wantHall || wantPrd, async () => {
      const out = {};
      if (wantHall) {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-hall-"));
        try {
          const g = async (args) => {
            const r = await run("git", args, { cwd: tmp });
            if (r.code !== 0) throw new Error(`git ${args.slice(0, 3).join(" ")} failed: ${(r.err || r.out).slice(0, 400)}`);
            return r;
          };
          await g(["init", "-q"]);
          await g(["remote", "add", "origin", `https://github.com/${HALL.repo}.git`]);
          await g(["fetch", "--depth", "1", "origin", HALL.sha]);
          await g(["checkout", "--detach", "-q", "FETCH_HEAD"]);
          const src = path.join(tmp, HALL.srcSubdir);
          if (!(await exists(path.join(src, "SKILL.md")))) throw new Error("hallmark SKILL.md missing at pinned SHA");
          const dest = path.join(target, ".agents", "skills", HALL.destSkill);
          await copyDir(src, dest);
          await fs.writeFile(path.join(dest, ".suite-provenance.json"), JSON.stringify({ repo: HALL.repo, sha: HALL.sha, license: HALL.license }, null, 2));
          const check = validateSkillFrontmatter(HALL.destSkill, await fs.readFile(path.join(dest, "SKILL.md"), "utf8"));
          if (check.errs?.length) throw new Error(`hallmark frontmatter invalid: ${check.errs.join("; ")}`);
          if (check.bodyLines > 500) out.hallmarkSizeNote = `${check.bodyLines} lines (reported by verify step)`;
          out.hallmark = { sha: HALL.sha };
        } finally {
          await fs.rm(tmp, { recursive: true, force: true });
        }
      }
      if (wantPrd) {
        const src = path.join(REPO_ROOT, ".agents", "skills", "universal-prd");
        const dest = path.join(target, ".agents", "skills", "universal-prd");
        await copyDir(src, dest);
        const check = validateSkillFrontmatter("universal-prd", await fs.readFile(path.join(dest, "SKILL.md"), "utf8"));
        if (check.errs?.length) throw new Error(`universal-prd frontmatter invalid: ${check.errs.join("; ")}`);
        out.prdSkill = true;
        // /uprd trigger alias: portable skill (both hosts) + OpenCode native command.
        const uprdSrc = path.join(REPO_ROOT, "templates", "skills", "uprd");
        const uprdDest = path.join(target, ".agents", "skills", "uprd");
        await copyDir(uprdSrc, uprdDest);
        const uprdCheck = validateSkillFrontmatter("uprd", await fs.readFile(path.join(uprdDest, "SKILL.md"), "utf8"));
        if (uprdCheck.errs?.length) throw new Error(`uprd frontmatter invalid: ${uprdCheck.errs.join("; ")}`);
        const cmdSrc = path.join(REPO_ROOT, "templates", "opencode", "commands", "uprd.md");
        const cmdDest = path.join(target, ".opencode", "commands", "uprd.md");
        await fs.mkdir(path.dirname(cmdDest), { recursive: true });
        await fs.copyFile(cmdSrc, cmdDest);
        out.uprd = true;
      }
      return out;
    }).catch((e) => fail("skills", e.message));
  }

  // 4. PRD init + host registration via this repo's CLI
  if (wantPrd) {
    await phase("prd", "PRD init + OpenCode/Antigravity registration", wantPrd, async () => {
      const cli = path.join(REPO_ROOT, "dist", "cli", "cli.js");
      if (!(await exists(cli))) throw new Error(`PRD CLI not built at ${cli}; run npm run build in ${REPO_ROOT} first`);
      const env = { ...process.env, PRD_WORKSPACE: target };
      const name = path.basename(target) || "project";
      let r = await run(process.execPath, [cli, "init", "--name", name], { cwd: target, env });
      if (r.code !== 0) throw new Error(`prd init failed: ${(r.err || r.out).slice(0, 400)}`);
      r = await run(process.execPath, [cli, "install", "--target", "both", "--scope", "workspace", "--apply"], { cwd: target, env });
      if (r.code !== 0) throw new Error(`prd install failed: ${(r.err || r.out).slice(0, 400)}`);
      await ignoreVibesuiteDir(target);
      return {};
    }).catch((e) => fail("prd", e.message));
  }

  // 5. workspace-local graft MCP entries (graft init skips these with --no-mcp/--no-global)
  //    + OpenCode graft-rebuild file-hook plugin (pin substituted at copy time).
  if (wantGraft && wantPrd) {
    await phase("graft-mcp", "Registering graft MCP server (workspace-local, both hosts)", wantGraft && wantPrd, async () => {
      const { open, ag } = graftMcpEntries(target);
      const ocPath = path.join(target, "opencode.json");
      const oc = (await exists(ocPath)) ? JSON.parse(await fs.readFile(ocPath, "utf8")) : {};
      await backupFile(target, ocPath);
      let merged = mergeMcpEntry("opencode", oc, "graft", open);
      const pluginTpl = await fs.readFile(path.join(REPO_ROOT, "templates", "opencode", "plugins", "graft-rebuild.ts"), "utf8");
      const pluginDest = path.join(target, ".opencode", "plugins", "graft-rebuild.ts");
      await fs.mkdir(path.dirname(pluginDest), { recursive: true });
      await fs.writeFile(pluginDest, renderTemplate(pluginTpl, { GRAFT_PKG }), "utf8");
      merged = mergePluginEntry(merged, "./.opencode/plugins/graft-rebuild.ts");
      await writeJsonAtomic(ocPath, merged);
      const agPath = path.join(target, ".agents", "mcp_config.json");
      const am = (await exists(agPath)) ? JSON.parse(await fs.readFile(agPath, "utf8")) : {};
      await backupFile(target, agPath);
      await writeJsonAtomic(agPath, mergeMcpEntry("antigravity", am, "graft", ag));
      return {};
    }).catch((e) => fail("graft-mcp", e.message));
  }

  // 6. verify everything actually works (+ write lockfile)
  await phase("verify", "Verifying suite (configs parse, skills valid, servers launch)", async () => {
    const d = await doctorSuite(target, { graft: wantGraft, hallmark: wantHall, prd: wantPrd }, { checkLock: false });
    if (!d.ok) throw new Error(d.problems.join(" | "));
    summary.warnings.push(...d.warnings);
    await writeLockfile(target, [
      ...(wantGraft ? [{ id: "graft", repo: GRAFT.repo, pin: GRAFT.pin, license: GRAFT.license, paths: ["graft/", "AGENTS.md"] }] : []),
      ...(wantHall ? [{ id: "hallmark", repo: HALL.repo, sha: HALL.sha, license: HALL.license, paths: [`.agents/skills/${HALL.destSkill}/`] }] : []),
      ...(wantPrd ? [{ id: "universal-prd", repo: "local", version: "1.0.0", license: "MIT", paths: [".prd/spec.json", "opencode.json", ".agents/mcp_config.json", ".agents/skills/universal-prd/"] }] : []),
    ]);
    return { warnings: summary.warnings };
  }).catch((e) => fail("verify", e.message));

  const next = [
    "OpenCode: reload MCP servers. Antigravity: refresh servers or /mcp -> reload.",
    'Tell your agent: "Use Universal PRD to define this application properly before implementing it."' + (wantPrd ? " Shortcut: /uprd <brief>." : ""),
    ...(wantHall ? ["For UI work the agent will pick up the hallmark skill automatically."] : []),
    ...(wantGraft ? ["For repo questions the agent uses the graft/ graph (rebuilt after code changes)."] : []),
  ];
  const done = {
    ok: true,
    target,
    components: { graft: wantGraft, hallmark: wantHall, prd: wantPrd },
    next,
    warnings: summary.warnings,
    phases: summary.phases,
  };
  if (asJson) console.log(JSON.stringify(done, null, 2));
  else {
    log("\nDONE. Vibe suite ready in " + target);
    for (const n of done.next) log("  - " + n);
    if (done.warnings.length) for (const w of done.warnings) log("  warning: " + w);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => {
  console.error(`[ERROR] ${e.message}`);
  process.exit(1);
});
