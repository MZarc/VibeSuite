import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { promises as fs } from "node:fs";
import { initSpec, loadSpec, getSpecSection, specExists } from "../core/store.js";
import { validateSpec } from "../core/validator.js";
import { listProfiles, getProfile } from "../profiles/profiles.js";
import { inspectWorkspace } from "../inspect/workspace.js";
import { previewExport, applyExport } from "../export/exporter.js";
import { applyUpdate, UpdateOperation, loadAndSave } from "./updates.js";
import { ensureWorkspaceRoot, toWorkspaceRel, resolveInside } from "../security/paths.js";

export const SERVER_NAME = "universal-prd";
export const SERVER_VERSION = "1.0.0";

function log(...args: unknown[]): void {
  process.stderr.write(`[universal-prd] ${args.map(String).join(" ")}\n`);
}

function textResult(obj: unknown): { content: { type: "text"; text: string }[] } {
  const text = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  // Keep outputs concise: cap at 24KB
  const capped = text.length > 24 * 1024 ? text.slice(0, 24 * 1024) + "\n…[truncated]" : text;
  return { content: [{ type: "text", text: capped }] };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function resolveWorkspace(): string {
  const fromEnv = process.env.PRD_WORKSPACE || process.env.UNIVERSAL_PRD_WORKSPACE || "";
  const cwd = process.cwd();
  const root = fromEnv.trim() !== "" ? fromEnv : cwd;
  return ensureWorkspaceRoot(root);
}

export function buildServer(workspaceOverride?: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const ws = () => (workspaceOverride ? ensureWorkspaceRoot(workspaceOverride) : resolveWorkspace());

  server.registerTool(
    "prd_initialize",
    {
      description: "Initialize or open a PRD workspace. Never replaces an existing spec.json. Returns state and workspace-relative paths.",
      inputSchema: z.object({
        projectName: z.string().max(200).optional().describe("Project name for a new spec; ignored if spec exists."),
        profile: z.string().max(80).default("generic").describe("Stack profile id for a new spec."),
      }),
    },
    async (args) => {
      try {
        const root = ws();
        const exists = await specExists(root);
        if (exists) {
          const spec = await loadSpec(root);
          return textResult({ created: false, workspaceRoot: root, specPath: ".prd/spec.json", project: spec.project, revision: spec.revision });
        }
        const trimmedName = (args.projectName ?? "").trim();
        const name = (trimmedName.length > 0 ? trimmedName : "untitled-project").slice(0, 200);
        try {
          getProfile(args.profile ?? "generic");
        } catch (e) {
          return textResult({ error: errMsg(e) });
        }
        const { spec } = await initSpec(root, name, args.profile ?? "generic");
        log(`initialized spec at ${root}`);
        return textResult({ created: true, workspaceRoot: root, specPath: ".prd/spec.json", project: spec.project });
      } catch (e) {
        return textResult({ error: errMsg(e) });
      }
    },
  );

  server.registerTool(
    "prd_inspect_workspace",
    {
      description: "Safely inspect project metadata (languages, frameworks, scripts). Read-only, allowlisted files, bounded. Never returns secrets.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const result = await inspectWorkspace(ws());
        return textResult(result);
      } catch (e) {
        return textResult({ error: errMsg(e) });
      }
    },
  );

  server.registerTool(
    "prd_get_spec",
    {
      description: "Read the canonical spec or one safe section (project, goals, scope, functionalRequirements, testCases, decisions, ...).",
      inputSchema: z.object({
        section: z.string().max(80).default("all").describe("Section name or 'all'."),
      }),
    },
    async (args) => {
      try {
        const spec = await loadSpec(ws());
        return textResult(getSpecSection(spec, args.section ?? "all"));
      } catch (e) {
        return textResult({ error: errMsg(e) });
      }
    },
  );

  server.registerTool(
    "prd_update_spec",
    {
      description: "Update the spec: set-project, add-requirement, add-nfr, add-test, add-decision, add-assumption, add-question, resolve-question, record-finding, set-export-config. Stable IDs preserved; malformed updates rejected.",
      inputSchema: z.object({
        operation: z.enum(["set-project", "add-requirement", "add-nfr", "add-test", "add-decision", "add-assumption", "add-question", "resolve-question", "record-finding", "set-export-config"]),
        payload: z.record(z.string(), z.unknown()).default({}),
      }),
    },
    async (args) => {
      try {
        const root = ws();
        const op = UpdateOperation.parse(args.operation);
        const next = await loadAndSave(root, (spec) => applyUpdate(spec, op, (args.payload ?? {}) as Record<string, unknown>));
        return textResult({ ok: true, operation: op, revision: next.revision });
      } catch (e) {
        return textResult({ error: errMsg(e) });
      }
    },
  );

  server.registerTool(
    "prd_validate",
    {
      description: "Run deterministic validators. Returns pass/fail/warning/not-run checks, readiness, and blockers.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const spec = await loadSpec(ws());
        return textResult(validateSpec(spec));
      } catch (e) {
        return textResult({ error: errMsg(e) });
      }
    },
  );

  server.registerTool(
    "prd_list_profiles",
    {
      description: "List stack profiles with artifacts, constraints, validators, and test categories.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult({ profiles: listProfiles() });
      } catch (e) {
        return textResult({ error: errMsg(e) });
      }
    },
  );

  server.registerTool(
    "prd_export_preview",
    {
      description: "Preview exports: files to create/modify/conflict. Performs no writes. Reports readiness blockers.",
      inputSchema: z.object({
        artifacts: z.array(z.string().max(80)).max(20).optional().describe("Subset of artifact filenames; omit for profile defaults."),
      }),
    },
    async (args) => {
      try {
        const root = ws();
        const spec = await loadSpec(root);
        return textResult(await previewExport(root, spec, args.artifacts));
      } catch (e) {
        return textResult({ error: errMsg(e) });
      }
    },
  );

  server.registerTool(
    "prd_export_apply",
    {
      description: "Apply a reviewed export plan. Revalidates, enforces workspace boundaries, requires per-file authorization for existing files, writes atomically with manifest + hashes.",
      inputSchema: z.object({
        authorizeOverwrite: z.array(z.string().max(300)).max(30).default([]).describe("Exact workspace-relative paths authorized for overwrite."),
        artifacts: z.array(z.string().max(80)).max(20).optional(),
      }),
    },
    async (args) => {
      try {
        const root = ws();
        const spec = await loadSpec(root);
        const res = await applyExport(root, spec, { authorizeOverwrite: args.authorizeOverwrite ?? [], artifacts: args.artifacts });
        return textResult(res);
      } catch (e) {
        return textResult({ error: errMsg(e) });
      }
    },
  );

  server.registerTool(
    "prd_status",
    {
      description: "Project state: version, validation summary, readiness, unresolved blockers, last export manifest, traceability counts.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const root = ws();
        const spec = await loadSpec(root);
        const report = validateSpec(spec);
        let lastExport: unknown = null;
        try {
          const mp = await resolveInside(root, ".prd/export-manifest.json");
          lastExport = JSON.parse(await fs.readFile(mp, "utf8"));
        } catch {
          lastExport = null;
        }
        const mustReqs = [...spec.functionalRequirements, ...spec.nonFunctionalRequirements].filter((r) => r.priority === "must" && r.status !== "rejected");
        const covered = mustReqs.filter((r) => spec.testCases.some((t) => t.verifies.includes(r.id))).length;
        return textResult({
          project: spec.project,
          schemaVersion: spec.schemaVersion,
          revision: spec.revision,
          readiness: report.readiness,
          summary: report.summary,
          blockers: report.blockers,
          traceability: {
            functional: spec.functionalRequirements.length,
            nonFunctional: spec.nonFunctionalRequirements.length,
            testCases: spec.testCases.length,
            mustCovered: `${covered}/${mustReqs.length}`,
            openCriticalQuestions: spec.openQuestions.filter((q) => q.critical && q.status === "unresolved").length,
            openBlockingFindings: spec.semanticFindings.filter((f) => f.severity === "blocking" && f.status === "open").length,
            inferredNotConfirmed:
              [...spec.functionalRequirements, ...spec.nonFunctionalRequirements].filter((r) => r.provenance === "agent_inferred" && r.status !== "confirmed").length,
          },
          lastExport,
          workspaceRel: { spec: ".prd/spec.json", manifest: ".prd/export-manifest.json", validation: ".prd/validation-report.json" },
          _rel_note: toWorkspaceRel(root, root),
        });
      } catch (e) {
        return textResult({ error: errMsg(e) });
      }
    },
  );

  return server;
}

export function runStdio(workspaceOverride?: string): Promise<void> {
  const server = buildServer(workspaceOverride);
  const handle = serveStdio(() => server);
  // Keep the process alive; resolve when the handle is closed (stdin EOF or signal)
  return new Promise<void>((resolve) => {
    const shutdown = () => { handle.close().then(resolve, resolve); };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}
