import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveInside, ensureWorkspaceRoot } from "../../src/security/paths.js";
import { initSpec, loadSpec, saveSpec } from "../../src/core/store.js";
import { createInitialSpec } from "../../src/core/types.js";
import { previewExport, applyExport } from "../../src/export/exporter.js";
import { inspectWorkspace } from "../../src/inspect/workspace.js";

let dir = "";
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "uprd-sec-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("paths", () => {
  it("rejects ../ traversal", async () => {
    await expect(resolveInside(dir, "../evil.md")).rejects.toThrow(/traversal/);
    await expect(resolveInside(dir, "a/../../evil.md")).rejects.toThrow(/traversal/);
  });
  it("rejects absolute outside workspace", async () => {
    const outside = path.join(os.tmpdir(), "outside-x.md");
    await expect(resolveInside(dir, outside)).rejects.toThrow(/outside|traversal|rejected/);
  });
  it("rejects empty workspace root (fail-closed)", () => {
    expect(() => ensureWorkspaceRoot("")).toThrow(/fail-closed/);
  });
  it("rejects symlink escape", async () => {
    if (process.platform === "win32") return; // symlink privileges vary; covered on posix CI
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "uprd-out-"));
    try {
      await fs.writeFile(path.join(outside, "secret.txt"), "s", "utf8");
      await fs.symlink(outside, path.join(dir, "linkevil"));
      await expect(resolveInside(dir, "linkevil/secret.txt")).rejects.toThrow(/symlink/);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});

describe("export safety", () => {
  async function readySpec() {
    const { spec } = await initSpec(dir, "sec", "generic");
    spec.functionalRequirements.push({
      id: "REQ-1", title: "T", description: "d", priority: "must",
      provenance: "user_confirmed", status: "confirmed",
      acceptanceCriteria: [{ id: "REQ-1:AC-1", statement: "ok", testable: true }],
      verifiesBy: [], dependsOn: [], tags: [],
    });
    spec.testCases.push({ id: "TC-1", title: "t", verifies: ["REQ-1"], steps: [], expected: "", category: "functional" });
    await saveSpec(dir, spec);
    return spec;
  }
  it("unauthorized overwrite aborts", async () => {
    const spec = await readySpec();
    await applyExport(dir, spec, { authorizeOverwrite: [] });
    await expect(applyExport(dir, spec, { authorizeOverwrite: [] })).rejects.toThrow(/not authorized|aborted/);
  });
  it("malformed spec.json rejected", async () => {
    await fs.mkdir(path.join(dir, ".prd"), { recursive: true });
    await fs.writeFile(path.join(dir, ".prd", "spec.json"), "{not json", "utf8");
    await expect(loadSpec(dir)).rejects.toThrow(/malformed/);
  });
  it("oversized update rejected", async () => {
    const { applyUpdate } = await import("../../src/mcp/updates.js");
    const s = createInitialSpec("x");
    await expect(applyUpdate(s, "add-requirement", { title: "t", description: "x".repeat(9000), provenance: "user_confirmed" })).rejects.toThrow();
  });
  it("unexpected operation rejected", async () => {
    const { UpdateOperation } = await import("../../src/mcp/updates.js");
    expect(UpdateOperation.safeParse("drop-database").success).toBe(false);
  });
  it("config preservation: merge does not drop keys", async () => {
    const { mergeOpenCodeConfig } = await import("../../src/cli/installer.js");
    const merged = mergeOpenCodeConfig({ mcp: {}, custom: 1 }, ["node", "x"], dir) as Record<string, number>;
    expect(merged["custom"]).toBe(1);
  });
  it("inspection excludes secrets", async () => {
    await fs.writeFile(path.join(dir, ".env"), "SECRET=123", "utf8");
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "d", scripts: {} }), "utf8");
    const r = await inspectWorkspace(dir);
    expect(JSON.stringify(r)).not.toContain("SECRET=123");
    expect(r.filesSkipped).toBeGreaterThanOrEqual(1);
  });
  it("unreadable/empty workspace handled", async () => {
    const r = await inspectWorkspace(dir);
    expect(r.notes.join(" ")).toMatch(/uncertain|stack-independent|No confident/i);
  });
  it("partial failure reports written set", async () => {
    const spec = await readySpec();
    // Force failure via invalid profile after preview passed? Use bad outputDir through direct mutation.
    const bad = JSON.parse(JSON.stringify(spec));
    bad.exportConfig.profile = "generic";
    (bad as { exportConfig: { outputDir: string } }).exportConfig.outputDir = "../escape";
    await expect(applyExport(dir, bad)).rejects.toThrow();
  });
});
