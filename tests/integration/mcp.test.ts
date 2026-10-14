import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

let dir = "";

async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const res = (await client.callTool({ name, arguments: args })) as unknown as {
    content: { type: string; text?: string }[];
  };
  return res.content.map((c) => c.text ?? "").join("\n");
}

describe("mcp integration (real stdio server)", () => {
  let client: Client;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "uprd-mcp-"));
    const entry = path.resolve("dist/mcp/stdio.js");
    const st = await fs.stat(entry).catch(() => null);
    if (!st) throw new Error("dist not built; run npm run build before integration tests");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      env: { ...process.env, PRD_WORKSPACE: dir },
    });
    client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    try { await client?.close(); } catch {}
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("discovers all 9 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t: { name: string }) => t.name).sort();
    for (const n of ["prd_initialize", "prd_inspect_workspace", "prd_get_spec", "prd_update_spec", "prd_validate", "prd_list_profiles", "prd_export_preview", "prd_export_apply", "prd_status"]) {
      expect(names).toContain(n);
    }
    expect(tools.length).toBe(9);
  });

  it("rejects bad input schema", async () => {
    const res = (await client.callTool({ name: "prd_update_spec", arguments: { operation: "nope", payload: {} } })) as unknown as { isError?: boolean; content: { text?: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content.map((c) => c.text ?? "").join(" ")).toMatch(/Invalid|validation/i);
  });

  it("full tool journey + persistence", async () => {
    expect(JSON.parse(await callTool(client, "prd_initialize", { projectName: "mcp-test" })).created).toBe(true);
    expect(JSON.parse(await callTool(client, "prd_initialize", {})).created).toBe(false); // no replace
    const insp = JSON.parse(await callTool(client, "prd_inspect_workspace", {}));
    expect(insp.workspaceRoot).toBeTruthy();
    expect(JSON.parse(await callTool(client, "prd_list_profiles", {})).profiles.length).toBeGreaterThanOrEqual(6);
    expect(JSON.parse(await callTool(client, "prd_update_spec", { operation: "add-requirement", payload: { title: "R", description: "d", provenance: "user_confirmed" } })).ok).toBe(true);
    const spec = JSON.parse(await callTool(client, "prd_get_spec", { section: "functionalRequirements" }));
    expect(JSON.stringify(spec)).toContain("REQ-1");
    const v = JSON.parse(await callTool(client, "prd_validate", {}));
    expect(v.summary).toBeTruthy();
    expect(["pass", "fail", "warning", "not-run"]).toContain(v.checks[0].status);
    const prev = JSON.parse(await callTool(client, "prd_export_preview", {}));
    expect(prev.files.length).toBeGreaterThan(0);
    const st = JSON.parse(await callTool(client, "prd_status", {}));
    expect(st.readiness).toBeTruthy();
    const specRaw = await fs.readFile(path.join(dir, ".prd", "spec.json"), "utf8");
    expect(specRaw).toContain("REQ-1");
  });

  it("malformed update returns structured error, stdout uncorrupted", async () => {
    const r = JSON.parse(await callTool(client, "prd_update_spec", { operation: "add-test", payload: { title: "x", verifies: [] } }));
    expect(r.error).toBeTruthy();
  });
});
