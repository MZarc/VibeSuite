import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  unionTextLines,
  dedupeFenceBlocks,
  mergeAgentsMd,
  validateSkillFrontmatter,
  mergeMcpEntry,
  doctorSuite,
  writeLockfile,
  readLockfile,
  comparePins,
  renderTemplate,
  mergePluginEntry,
} from "../../suite/install.mjs";

describe("suite helpers", () => {
  it("unionTextLines preserves user lines and appends new ones", () => {
    const out = unionTextLines("node_modules/\nmy-keep/", "/graft/\nnode_modules/");
    expect(out).toContain("my-keep/");
    expect(out).toContain("/graft/");
    expect(out.match(/node_modules\//g)!.length).toBe(1);
  });
  it("dedupeFenceBlocks keeps first graft block", () => {
    const b = "<!-- graft:start -->\nA\n<!-- graft:end -->";
    const out = dedupeFenceBlocks(`head\n${b}\nmiddle\n${b}\ntail`);
    expect(out.match(/graft:start/g)!.length).toBe(1);
    expect(out).toContain("tail");
  });
  it("mergeAgentsMd keeps existing content when graft merged in place", () => {
    const out = mergeAgentsMd("# My project", "# My project\n<!-- graft:start -->\nx\n<!-- graft:end -->");
    expect(out).toContain("# My project");
    expect(out.match(/graft:start/g)!.length).toBe(1);
  });
  it("mergeAgentsMd appends when graft overwrote", () => {
    const out = mergeAgentsMd("# Mine", "<!-- graft:start -->\ng\n<!-- graft:end -->");
    expect(out.indexOf("# Mine")).toBeLessThan(out.indexOf("graft:start"));
  });
  it("validateSkillFrontmatter accepts hallmark-style frontmatter", () => {
    const raw = '---\nname: hallmark\ndescription: "Anti-AI-slop design skill."\nversion: 1.1.0\n---\n\n# H\n';
    const c = validateSkillFrontmatter("hallmark", raw);
    expect(c.errs).toEqual([]);
  });
  it("validateSkillFrontmatter rejects name/dir mismatch", () => {
    const c = validateSkillFrontmatter("other", '---\nname: hallmark\ndescription: x\n---\n');
    expect(c.errs.join(" ")).toMatch(/match directory/);
  });
  it("mergeMcpEntry is idempotent and preserves existing", () => {
    const once = mergeMcpEntry("opencode", { mcp: { a: 1 } }, "graft", { x: 1 });
    expect(once.mcp.a).toBe(1);
    const twice = mergeMcpEntry("opencode", once, "graft", { x: 2 });
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    const ag = mergeMcpEntry("antigravity", {}, "graft", { y: 1 });
    expect(ag.mcpServers.graft.y).toBe(1);
  });
});

describe("suite lockfile + doctor", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "uprd-doc-"));
    await fs.mkdir(path.join(dir, ".agents", "skills", "universal-prd"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".agents", "skills", "universal-prd", "SKILL.md"),
      "---\nname: universal-prd\ndescription: test skill for doctor\n---\n\n# T\n",
    );
    await fs.mkdir(path.join(dir, ".agents", "skills", "uprd"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".agents", "skills", "uprd", "SKILL.md"),
      "---\nname: uprd\ndescription: test alias skill\n---\n\n# T\n",
    );
    await fs.mkdir(path.join(dir, ".opencode", "commands"), { recursive: true });
    await fs.writeFile(path.join(dir, ".opencode", "commands", "uprd.md"), "---\ndescription: x\n---\nrun\n");
    await fs.writeFile(path.join(dir, "opencode.json"), JSON.stringify({ mcp: { "universal-prd": {} } }));
    await fs.writeFile(path.join(dir, ".agents", "mcp_config.json"), JSON.stringify({ mcpServers: {} }));
    await fs.mkdir(path.join(dir, ".prd"), { recursive: true });
    await fs.writeFile(path.join(dir, ".prd", "spec.json"), JSON.stringify({ ok: 1 }));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  it("lock round-trips", async () => {
    expect(await readLockfile(dir)).toBe(null);
    await writeLockfile(dir, [{ id: "universal-prd", version: "1.0.0" }]);
    const l = (await readLockfile(dir)) as { lockVersion: number; components: { id: string }[] };
    expect(l.lockVersion).toBe(1);
    expect(l.components[0].id).toBe("universal-prd");
  });
  it("doctor passes on healthy PRD-only target (no graft/hallmark expected)", async () => {
    await writeLockfile(dir, [{ id: "universal-prd", version: "1.0.0" }]);
    const d = await doctorSuite(dir, { graft: false, hallmark: false, prd: true });
    expect(d.problems).toEqual([]);
    expect(d.ok).toBe(true);
  });
  it("doctor reports missing spec + missing lock", async () => {
    await fs.rm(path.join(dir, ".prd", "spec.json"));
    const d = await doctorSuite(dir, { graft: false, hallmark: false, prd: true });
    expect(d.ok).toBe(false);
    expect(d.problems.join(" ")).toMatch(/spec\.json|lockfile/);
  });
  it("comparePins flags stale graft, matches exact hallmark SHA", () => {
    const rows = comparePins({
      graft: { "dist-tags.latest": "9.9.9" },
      hallmark: { sha: "13ac0ec7e148655948100b6396439e481361d690", date: "2026-08-06", message: "x" },
    });
    expect(rows.find((r) => r.id === "graft")!.stale).toBe(true);
    expect(rows.find((r) => r.id === "hallmark")!.stale).toBe(false);
    expect(rows.find((r) => r.id === "universal-prd")!.stale).toBe(false);
  });
  it("renderTemplate fills tokens and rejects unknown ones", () => {
    expect(renderTemplate("v=__GRAFT_PKG__", { GRAFT_PKG: "@nanonets/graft@0.21.1" })).toBe("v=@nanonets/graft@0.21.1");
    expect(() => renderTemplate("v=__NOPE__", {})).toThrow(/unfilled tokens/);
  });
  it("mergePluginEntry adds once and rejects non-arrays", () => {
    const once = mergePluginEntry({}, "./.opencode/plugins/graft-rebuild.ts");
    expect(once.plugin).toEqual(["./.opencode/plugins/graft-rebuild.ts"]);
    expect(mergePluginEntry(once, "./.opencode/plugins/graft-rebuild.ts")).toEqual(once);
    expect(() => mergePluginEntry({ plugin: "x" }, "./a")).toThrow(/not an array/);
  });
  it("mergeMcpEntry rejects non-object sections", () => {
    expect(() => mergeMcpEntry("opencode", { mcp: ["x"] }, "graft", {})).toThrow(/not an object/);
  });
  it("unionTextLines normalizes CRLF and dedupes", () => {
    const out = unionTextLines("a\r\nb", "b\r\na");
    expect(out).toBe("a\nb\n");
  });
  it("uprd template skill is valid (name matches dir)", async () => {
    const raw = await fs.readFile("templates/skills/uprd/SKILL.md", "utf8");
    const c = validateSkillFrontmatter("uprd", raw);
    expect(c.errs).toEqual([]);
  });
});
