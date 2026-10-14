#!/usr/bin/env node
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { initSpec, loadSpec, specExists, getSpecSection } from "../core/store.js";
import { validateSpec } from "../core/validator.js";
import { previewExport, applyExport } from "../export/exporter.js";
import { inspectWorkspace } from "../inspect/workspace.js";
import { listProfiles } from "../profiles/profiles.js";
import { buildInstallPlan, applyInstall, type InstallTarget } from "./installer.js";

const HELP = `universal-prd — local-first requirements engineering toolkit (no AI key required)

Usage:
  universal-prd init [--workspace <dir>] [--name <project>] [--profile <id>] [--json]
  universal-prd inspect [--workspace <dir>] [--json]
  universal-prd status [--workspace <dir>] [--json]
  universal-prd validate [--workspace <dir>] [--json]
  universal-prd export [--workspace <dir>] [--preview] [--artifacts a,b] [--authorize rel/path.md,...] [--json]
  universal-prd install --target opencode|antigravity|both [--scope workspace|global] [--dry-run] [--json]
  universal-prd profiles [--json]
  universal-prd --help | --version

Full project setup (graft graph + design skill + PRD + hosts):
  node suite/install.mjs --help   (or: vibesuite --help after npm link/install)

Exit codes: 0 ok · 1 execution error · 2 validation failure · 3 config error.
Env: PRD_WORKSPACE overrides --workspace.
`;

function arg(name: string, argv: string[]): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) return undefined;
  const val = argv[i + 1];
  // Don't swallow the next flag as a value
  if (val.startsWith("--")) return undefined;
  return val;
}
function flag(name: string, argv: string[]): boolean {
  return argv.includes(name);
}
function workspaceOf(argv: string[]): string {
  return process.env.PRD_WORKSPACE || process.env.UNIVERSAL_PRD_WORKSPACE || arg("--workspace", argv) || process.cwd();
}
function out(obj: unknown, asJson: boolean): void {
  if (asJson) console.log(JSON.stringify(obj, null, 2));
  else if (typeof obj === "string") console.log(obj);
  else console.log(JSON.stringify(obj, null, 2));
}
function fail(msg: string, code: 1 | 2 | 3, asJson: boolean): never {
  if (asJson) console.log(JSON.stringify({ error: msg }, null, 2));
  else console.error(`error: ${msg}`);
  process.exit(code);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const asJson = flag("--json", argv) || flag("--porcelain", argv);
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return;
  }
  if (cmd === "--version" || cmd === "version") {
    console.log("universal-prd 1.0.0");
    return;
  }
  const ws = path.resolve(workspaceOf(argv));

  if (cmd === "init") {
    const name = arg("--name", argv) || path.basename(ws) || "untitled-project";
    const profile = arg("--profile", argv) || "generic";
    if (await specExists(ws)) {
      const spec = await loadSpec(ws);
      out({ created: false, path: ".prd/spec.json", project: spec.project }, asJson);
      return;
    }
    try {
      const { spec } = await initSpec(ws, name, profile);
      out({ created: true, path: ".prd/spec.json", project: spec.project }, asJson);
    } catch (e) {
      fail((e as Error).message, 3, asJson);
    }
    return;
  }
  if (cmd === "inspect") {
    try {
      out(await inspectWorkspace(ws), asJson);
    } catch (e) {
      fail((e as Error).message, 1, asJson);
    }
    return;
  }
  if (cmd === "status") {
    try {
      const spec = await loadSpec(ws);
      const report = validateSpec(spec);
      const { resolveInside } = await import("../security/paths.js");
      let lastExport: unknown = null;
      try {
        const mp = await resolveInside(ws, ".prd/export-manifest.json");
        lastExport = JSON.parse(await fs.readFile(mp, "utf8"));
      } catch { lastExport = null; }
      out({ project: spec.project, readiness: report.readiness, summary: report.summary, blockers: report.blockers, lastExport }, asJson);
    } catch (e) {
      fail((e as Error).message, 1, asJson);
    }
    return;
  }
  if (cmd === "validate") {
    try {
      const spec = await loadSpec(ws);
      const report = validateSpec(spec);
      out(report, asJson);
      if (report.readiness === "invalid") process.exit(2);
    } catch (e) {
      fail((e as Error).message, 1, asJson);
    }
    return;
  }
  if (cmd === "profiles") {
    out({ profiles: listProfiles() }, asJson);
    return;
  }
  if (cmd === "export") {
    const artifactsRaw = arg("--artifacts", argv);
    const artifacts = artifactsRaw ? artifactsRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    try {
      const spec = await loadSpec(ws);
      if (flag("--preview", argv)) {
        out(await previewExport(ws, spec, artifacts), asJson);
        return;
      }
      const authRaw = arg("--authorize", argv);
      const authorizeOverwrite = authRaw ? authRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
      // Refuse interactive ambiguity: if conflicts exist and none authorized, show preview and exit 2
      const prev = await previewExport(ws, spec, artifacts);
      if (prev.conflicts.length > 0 && authorizeOverwrite.length === 0) {
        out({ ...prev, note: "conflicts require --authorize <exact rel paths>. No files written." }, asJson);
        process.exit(2);
      }
      out(await applyExport(ws, spec, { authorizeOverwrite, artifacts }), asJson);
    } catch (e) {
      fail((e as Error).message, 1, asJson);
    }
    return;
  }
  if (cmd === "install") {
    const target = (arg("--target", argv) || "") as InstallTarget;
    if (!["opencode", "antigravity", "both"].includes(target)) fail("--target must be opencode|antigravity|both", 3, asJson);
    const scopeRaw = arg("--scope", argv) || "workspace";
    if (!["workspace", "global"].includes(scopeRaw)) fail("--scope must be workspace|global", 3, asJson);
    const scope = scopeRaw as "workspace" | "global";
    const dryRun = flag("--dry-run", argv) || flag("--preview", argv);
    const installDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    // When running from dist/cli/cli.js, installDir = package root
    const pkgRoot = path.resolve(installDir);
    const plan = buildInstallPlan(target, { installDir: pkgRoot, workspaceRoot: ws });
    if (dryRun) {
      out({ dryRun: true, plan, scope }, asJson);
      return;
    }
    const needApply = flag("--apply", argv) || flag("--yes", argv) || flag("-y", argv);
    if (!needApply) {
      out({ plan, scope, note: "Preview only. Re-run with --apply to modify configuration files (backup created automatically)." }, asJson);
      return;
    }
    try {
      out({ ...(await applyInstall({ target, installDir: pkgRoot, workspaceRoot: ws, scope, dryRun: false })), scope }, asJson);
    } catch (e) {
      fail((e as Error).message, 1, asJson);
    }
    return;
  }
  if (cmd === "get") {
    // debug helper: universal-prd get --section decisions
    try {
      const spec = await loadSpec(ws);
      out(getSpecSection(spec, arg("--section", argv) || "all"), asJson);
    } catch (e) {
      fail((e as Error).message, 1, asJson);
    }
    return;
  }
  fail(`unknown command '${cmd}'. Run with --help.`, 3, asJson);
}

main().catch((e) => {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
});
