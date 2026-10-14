import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export type InstallTarget = "opencode" | "antigravity" | "both";

export interface InstallPlan {
  target: InstallTarget;
  files: { path: string; action: string; detail: string }[];
  serverCommand: string[];
  workspaceNote: string;
}

function serverCommandFor(installDir: string): string[] {
  // Prefer a local absolute node entry so hosts can launch without a published package.
  const entry = path.join(installDir, "dist", "mcp", "stdio.js");
  return ["node", entry];
}

export function openCodeConfigPaths(): string[] {
  const home = os.homedir();
  const cwdFiles = [
    path.resolve("opencode.json"),
    path.resolve("opencode.jsonc"),
    path.resolve(".opencode", "opencode.json"),
  ];
  const configBase = process.platform === "win32"
    ? path.join(home, ".config")
    : (process.env.XDG_CONFIG_HOME || path.join(home, ".config"));
  const globalFiles = [path.join(configBase, "opencode", "opencode.json")];
  return [...cwdFiles, ...globalFiles];
}

export function antigravityConfigPaths(workspaceRoot: string): string[] {
  const home = os.homedir();
  return [
    path.join(workspaceRoot, ".agents", "mcp_config.json"),
    path.join(home, ".gemini", "config", "mcp_config.json"),
  ];
}

export function buildInstallPlan(target: InstallTarget, opts: { installDir: string; workspaceRoot: string }): InstallPlan {
  const cmd = serverCommandFor(opts.installDir);
  const files: InstallPlan["files"] = [];
  if (target === "opencode" || target === "both") {
    files.push({
      path: "<workspace>/opencode.json (+ ~/.config/opencode/opencode.json global alt.)",
      action: "merge mcp.universal-prd { type: local, command: [node, <abs>/dist/mcp/stdio.js], environment: { PRD_WORKSPACE: <workspace> } }",
      detail: `command=${JSON.stringify(cmd)}`,
    });
    files.push({ path: "<workspace>/.agents/skills/universal-prd/SKILL.md", action: "present (skill discovery via .agents/skills)", detail: "no config edit needed" });
  }
  if (target === "antigravity" || target === "both") {
    files.push({
      path: "<workspace>/.agents/mcp_config.json (workspace) or ~/.gemini/config/mcp_config.json (global)",
      action: "merge mcpServers.universal-prd { command, args, env: { PRD_WORKSPACE } }",
      detail: `command=node args=[<abs>/dist/mcp/stdio.js]`,
    });
    files.push({ path: "<workspace>/.agents/skills/universal-prd/SKILL.md", action: "present (Antigravity SDK auto-discovers .agents/mcp_config.json + skills)", detail: "no config edit needed" });
  }
  return {
    target,
    files,
    serverCommand: cmd,
    workspaceNote: "Server resolves the client workspace at runtime via PRD_WORKSPACE env (set by the host config) falling back to process cwd. No unrestricted workspace-root override is accepted from model tool calls.",
  };
}

/** Merge an OpenCode config object with our server entry (pure, testable). */
export function mergeOpenCodeConfig(existing: Record<string, unknown>, cmd: string[], workspaceRoot: string): Record<string, unknown> {
  const next: Record<string, unknown> = JSON.parse(JSON.stringify(existing ?? {}));
  const mcp = (next.mcp ?? {}) as Record<string, unknown>;
  if (!mcp["universal-prd"]) {
    mcp["universal-prd"] = {
      type: "local",
      command: cmd,
      cwd: workspaceRoot,
      environment: { PRD_WORKSPACE: workspaceRoot },
      enabled: true,
    };
  }
  next.mcp = mcp;
  return next;
}

/** Merge an Antigravity mcp_config.json object (pure, testable). */
export function mergeAntigravityConfig(existing: Record<string, unknown>, entryAbs: string, workspaceRoot: string): Record<string, unknown> {
  const next: Record<string, unknown> = JSON.parse(JSON.stringify(existing ?? {}));
  const servers = (next.mcpServers ?? {}) as Record<string, unknown>;
  if (!servers["universal-prd"]) {
    servers["universal-prd"] = {
      command: "node",
      args: [entryAbs],
      cwd: workspaceRoot,
      env: { PRD_WORKSPACE: workspaceRoot },
    };
  }
  next.mcpServers = servers;
  return next;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function applyInstall(opts: {
  target: InstallTarget;
  installDir: string;
  workspaceRoot: string;
  scope: "workspace" | "global";
  dryRun: boolean;
}): Promise<{ changed: string[]; backups: string[]; dryRun: boolean }> {
  const changed: string[] = [];
  const backups: string[] = [];
  const entryAbs = path.join(opts.installDir, "dist", "mcp", "stdio.js");
  const cmd = ["node", entryAbs];

  async function writeJson(file: string, merge: (ex: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
    let existing: Record<string, unknown> = {};
    let hadFile = false;
    try {
      existing = JSON.parse(await fs.readFile(file, "utf8"));
      hadFile = true;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") throw new Error(`cannot parse ${file}: ${(e as Error).message}`);
    }
    const next = merge(existing);
    if (JSON.stringify(next) === JSON.stringify(existing) && hadFile) return; // avoid duplicates, no write
    if (opts.dryRun) {
      changed.push(`[dry-run] would update ${file}`);
      return;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    if (hadFile) {
      // Workspace-scope backups consolidate into <workspace>/.vibesuite/backups/;
      // global-scope backups stay beside the file (no project to own them).
      const bakDir = opts.scope === "workspace"
        ? path.join(opts.workspaceRoot, ".vibesuite", "backups")
        : path.dirname(file);
      await fs.mkdir(bakDir, { recursive: true });
      const bak = path.join(bakDir, `${path.basename(file)}.bak-${timestamp()}`);
      await fs.copyFile(file, bak);
      backups.push(bak);
    }
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await fs.writeFile(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
      JSON.parse(await fs.readFile(tmp, "utf8")); // validate before rename
      await fs.rename(tmp, file);
    } finally {
      try { await fs.unlink(tmp); } catch {}
    }
    changed.push(file);
  }

  if (opts.target === "opencode" || opts.target === "both") {
    const dest =
      opts.scope === "global"
        ? path.join(os.homedir(), ".config", "opencode", "opencode.json")
        : path.resolve(opts.workspaceRoot, "opencode.json");
    await writeJson(dest, (ex) => mergeOpenCodeConfig(ex, cmd, opts.workspaceRoot));
  }
  if (opts.target === "antigravity" || opts.target === "both") {
    const dest =
      opts.scope === "global"
        ? path.join(os.homedir(), ".gemini", "config", "mcp_config.json")
        : path.resolve(opts.workspaceRoot, ".agents", "mcp_config.json");
    await writeJson(dest, (ex) => mergeAntigravityConfig(ex, entryAbs, opts.workspaceRoot));
  }
  return { changed, backups, dryRun: opts.dryRun };
}
