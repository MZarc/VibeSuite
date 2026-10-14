import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const run = promisify(execFile);
let dir = "";
const CLI = path.resolve("dist/cli/cli.js");
const SRV = path.resolve("dist/mcp/stdio.js");

async function tool(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  const res = (await client.callTool({ name, arguments: args })) as unknown as { content: { text?: string }[] };
  return JSON.parse(res.content.map((c) => c.text ?? "").join("\n"));
}

describe("e2e fixture journey", () => {
  let client: Client;
  beforeAll(async () => {
    for (const f of [CLI, SRV]) {
      if (!(await fs.stat(f).catch(() => null))) throw new Error(`missing ${f}; run npm run build first`);
    }
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "uprd-e2e-"));
    // 1. clean workspace with a fake existing project
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "fixture", scripts: { build: "tsc", test: "vitest run" }, dependencies: { react: "^19.0.0" } }), "utf8");
    const transport = new StdioClientTransport({ command: process.execPath, args: [SRV], env: { ...process.env, PRD_WORKSPACE: dir } });
    client = new Client({ name: "e2e", version: "0.0.1" });
    await client.connect(transport);
  }, 30000);
  afterAll(async () => {
    try { await client?.close(); } catch {}
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("steps 2-19: init→inspect→requirements→decisions→criteria→tests→validate→resolve→revalidate→preview(no writes)→apply→verify→manifest→ids→attacks→restart→no-AI-call", async () => {
    // 2. init
    expect(((await tool(client, "prd_initialize", { projectName: "fixture-app", profile: "typescript-web" })) as { created: boolean }).created).toBe(true);
    // 3. inspect
    const insp = (await tool(client, "prd_inspect_workspace", {})) as { frameworks: { name: string }[] };
    expect(JSON.stringify(insp)).toContain("react");
    // 4. metadata + requirements
    await tool(client, "prd_update_spec", { operation: "set-project", payload: { description: "Fixture app for e2e" } });
    await tool(client, "prd_update_spec", { operation: "add-requirement", payload: { title: "Health check", description: "API exposes /healthz", provenance: "user_confirmed", acceptanceCriteria: [{ statement: "GET /healthz returns 200" }] } });
    await tool(client, "prd_update_spec", { operation: "add-nfr", payload: { title: "Auth required", description: "Endpoints require auth tokens", provenance: "user_confirmed", acceptanceCriteria: [{ statement: "Unauthenticated request is rejected" }] } });
    // 5. user-confirmed + unresolved critical decisions
    await tool(client, "prd_update_spec", { operation: "add-decision", payload: { title: "Use npm", rationale: "matches repo", provenance: "user_confirmed", status: "confirmed" } });
    await tool(client, "prd_update_spec", { operation: "add-question", payload: { question: "Which database?", critical: true } });
    // 6. acceptance criteria + test cases
    await tool(client, "prd_update_spec", { operation: "add-test", payload: { title: "Healthz returns 200", verifies: ["REQ-1"], steps: ["GET /healthz"], expected: "200", category: "contract" } });
    await tool(client, "prd_update_spec", { operation: "add-test", payload: { title: "Auth enforced", verifies: ["NFR-1"], steps: ["GET /private without token"], expected: "401", category: "contract" } });
    // 7. validate → blocking reported
    const v1 = (await tool(client, "prd_validate", {})) as { readiness: string; blockers: string[] };
    expect(v1.readiness).toBe("invalid");
    expect(v1.blockers.join(" ")).toMatch(/Q-1|blocking/i);
    // 8. resolve blockers
    await tool(client, "prd_update_spec", { operation: "resolve-question", payload: { id: "Q-1", resolution: "Postgres (user confirmed 2026-10-13)" } });
    // 9. revalidate
    const v2 = (await tool(client, "prd_validate", {})) as { readiness: string };
    expect(v2.readiness).toBe("ready");
    // 10. preview
    const before = await listFiles(dir);
    const prev = (await tool(client, "prd_export_preview", {})) as { files: unknown[]; conflicts: string[] };
    expect(prev.files.length).toBeGreaterThan(0);
    // 11. preview writes nothing
    expect(await listFiles(dir)).toEqual(before);
    // 12. apply
    const applied = (await tool(client, "prd_export_apply", { authorizeOverwrite: [] })) as { written: { rel: string }[]; manifestPath: string };
    expect(applied.written.length).toBeGreaterThan(0);
    // 13. verify files + manifest
    for (const w of applied.written.filter((x) => x.rel.endsWith(".md"))) {
      expect(await fs.stat(path.join(dir, w.rel))).toBeTruthy();
    }
    const manifest = JSON.parse(await fs.readFile(path.join(dir, ".prd", "export-manifest.json"), "utf8"));
    expect(manifest.files.every((f: { sha256: string }) => f.sha256.length === 64)).toBe(true);
    // 14. exported structured artifacts valid JSON
    JSON.parse(await fs.readFile(path.join(dir, ".prd", "validation-report.json"), "utf8"));
    JSON.parse(await fs.readFile(path.join(dir, ".prd", "decisions.json"), "utf8"));
    // 15. ids + refs consistent
    const spec = JSON.parse(await fs.readFile(path.join(dir, ".prd", "spec.json"), "utf8"));
    const reqIds = new Set([...spec.functionalRequirements, ...spec.nonFunctionalRequirements].map((r: { id: string }) => r.id));
    for (const t of spec.testCases) for (const v of t.verifies) expect(reqIds.has(v)).toBe(true);
    // 16. traversal rejected, nothing changed
    const filesBeforeAttack = await listFiles(dir);
    // direct path-level attack via update of evil outputDir is blocked at update layer:
    const evil = (await tool(client, "prd_update_spec", { operation: "set-export-config", payload: { outputDir: "../escape" } })) as { error?: string };
    expect(evil.error).toMatch(/workspace-relative|traversal/i);
    // 17. unauthorized overwrite rejected
    const prev2 = (await tool(client, "prd_export_preview", {})) as { conflicts: string[] };
    expect(prev2.conflicts.length).toBeGreaterThan(0);
    const denied = (await tool(client, "prd_export_apply", { authorizeOverwrite: [] })) as { error?: string };
    expect(denied.error).toMatch(/not authorized|aborted/i);
    expect(await listFiles(dir)).toEqual(filesBeforeAttack);
    // 18. both rejected without modifying unrelated files (package.json intact)
    expect(JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8")).name).toBe("fixture");
    // 19a. second export with authorization succeeds
    const ok2 = (await tool(client, "prd_export_apply", { authorizeOverwrite: prev2.conflicts })) as { written: unknown[] };
    expect(ok2.written).toBeTruthy();
    // 19b. restart persistence
    await client.close();
    const t2 = new StdioClientTransport({ command: process.execPath, args: [SRV], env: { ...process.env, PRD_WORKSPACE: dir } });
    client = new Client({ name: "e2e2", version: "0.0.1" });
    await client.connect(t2);
    const got = (await tool(client, "prd_get_spec", { section: "project" })) as { data: { name: string } };
    expect(got.data.name).toBe("fixture-app");
    // 20. no external AI API called: assert no network config + offline grep
    const src = await fs.readFile(path.resolve("src/mcp/server.ts"), "utf8");
    expect(src).not.toMatch(/api-key|openai|anthropic|fetch\(/i);
  }, 60000);

  it("CLI covers init/inspect/status/validate/export", async () => {
    const d2 = await fs.mkdtemp(path.join(os.tmpdir(), "uprd-cli-"));
    try {
      const env = { ...process.env, PRD_WORKSPACE: d2 };
      await run(process.execPath, [CLI, "init", "--name", "cli-app"], { env });
      const ins = await run(process.execPath, [CLI, "inspect"], { env });
      expect(String(ins.stdout)).toContain("workspaceRoot");
      const st = await run(process.execPath, [CLI, "status"], { env });
      expect(String(st.stdout)).toContain("readiness");
      // empty spec is vacuously ready (documented); introduce a real error then expect exit 2
      const specPath = path.join(d2, ".prd", "spec.json");
      const specJson = JSON.parse(await fs.readFile(specPath, "utf8"));
      specJson.functionalRequirements.push({ id: "REQ-1", title: "Broken", description: "no AC", priority: "must", provenance: "user_confirmed", status: "draft", acceptanceCriteria: [], verifiesBy: [], dependsOn: [], tags: [] });
      await fs.writeFile(specPath, JSON.stringify(specJson, null, 2), "utf8");
      await expect(run(process.execPath, [CLI, "validate"], { env })).rejects.toThrow(); // invalid spec exits 2
      const prev = await run(process.execPath, [CLI, "export", "--preview"], { env });
      expect(String(prev.stdout)).toContain("docs/spec");
    } finally {
      await fs.rm(d2, { recursive: true, force: true });
    }
  }, 60000);
});

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(path.relative(dir, p));
    }
  }
  try { await walk(dir); } catch {}
  return out.sort();
}
