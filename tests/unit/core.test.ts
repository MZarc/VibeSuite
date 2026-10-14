import { describe, it, expect } from "vitest";
import { SpecSchema, createInitialSpec, nextId } from "../../src/core/types.js";
import { validateSpec, computeReadiness } from "../../src/core/validator.js";
import { renderArtifacts, sha256 } from "../../src/export/renderer.js";
import { getProfile, listProfiles } from "../../src/profiles/profiles.js";
import { mergeOpenCodeConfig, mergeAntigravityConfig } from "../../src/cli/installer.js";

function validSpec() {
  const s = createInitialSpec("demo", "generic");
  s.functionalRequirements.push({
    id: "REQ-1", title: "Login", description: "Users can log in",
    priority: "must", provenance: "user_confirmed", status: "confirmed",
    acceptanceCriteria: [{ id: "REQ-1:AC-1", statement: "Valid creds succeed", testable: true }],
    verifiesBy: [], dependsOn: [], tags: [],
  });
  s.testCases.push({ id: "TC-1", title: "Login test", verifies: ["REQ-1"], steps: ["open", "submit"], expected: "ok", category: "functional" });
  return s;
}

describe("schema", () => {
  it("accepts initial spec", () => {
    expect(SpecSchema.safeParse(createInitialSpec("x")).success).toBe(true);
  });
  it("rejects bad types and enums", () => {
    const s1 = createInitialSpec("x") as Record<string, unknown>;
    (s1 as { schemaVersion: unknown }).schemaVersion = 123;
    expect(SpecSchema.safeParse(s1).success).toBe(false);

    const s2 = createInitialSpec("x");
    const badReq = {
      id: "REQ-1",
      title: "Bad",
      description: "Test",
      priority: "super-critical" as unknown as "must",
      provenance: "magic" as unknown as "user_confirmed",
    };
    expect(SpecSchema.safeParse({ ...s2, functionalRequirements: [badReq] }).success).toBe(false);
  });
  it("nextId increments", () => {
    expect(nextId("REQ", ["REQ-1", "REQ-2"])).toBe("REQ-3");
    expect(nextId("REQ", [])).toBe("REQ-1");
  });
});

describe("validator", () => {
  it("ready spec passes", () => {
    const r = validateSpec(validSpec());
    expect(r.readiness).toBe("ready");
    expect(r.summary.fail).toBe(0);
  });
  it("duplicate ids fail", () => {
    const s = validSpec();
    s.decisions.push({ id: "REQ-1", title: "d", rationale: "", provenance: "user_confirmed", status: "draft", decidedBy: "", date: "" });
    const r = validateSpec(s);
    expect(r.checks.find((c) => c.id === "unique-ids")!.status).toBe("fail");
  });
  it("missing acceptance criteria fails", () => {
    const s = validSpec();
    s.functionalRequirements[0].acceptanceCriteria = [];
    expect(validateSpec(s).checks.find((c) => c.id === "req-acceptance")!.status).toBe("fail");
  });
  it("broken refs fail", () => {
    const s = validSpec();
    s.testCases[0].verifies = ["REQ-999"];
    expect(validateSpec(s).checks.find((c) => c.id === "ref-integrity")!.status).toBe("fail");
  });
  it("uncovered must warns (traceability)", () => {
    const s = validSpec();
    s.testCases = [];
    const c = validateSpec(s).checks.find((x) => x.id === "traceability")!;
    expect(c.status).toBe("warning");
  });
  it("provenance promotion fails", () => {
    const s = validSpec();
    s.functionalRequirements[0].provenance = "agent_inferred";
    s.functionalRequirements[0].status = "confirmed";
    expect(validateSpec(s).checks.find((c) => c.id === "provenance")!.status).toBe("fail");
  });
  it("critical question blocks readiness", () => {
    const s = validSpec();
    s.openQuestions.push({ id: "Q-1", question: "db?", critical: true, status: "unresolved", resolution: "" });
    const r = validateSpec(s);
    expect(r.readiness).toBe("invalid");
    expect(r.checks.find((c) => c.id === "blocking-decisions")!.status).toBe("fail");
  });
  it("unknown profile fails export-config", () => {
    const s = validSpec();
    s.exportConfig.profile = "nope";
    expect(validateSpec(s).checks.find((c) => c.id === "export-config")!.status).toBe("fail");
  });
  it("computeReadiness documents rules", () => {
    expect(computeReadiness([{ id: "a", title: "t", status: "fail", details: "x" }], validSpec())).toBe("invalid");
    expect(computeReadiness([{ id: "blocking-decisions", title: "t", status: "fail", details: "x" }], validSpec())).toBe("invalid");
  });
  it("report format has required states", () => {
    const r = validateSpec(validSpec());
    expect(r.version).toBe(1);
    expect(typeof r.generatedAt).toBe("string");
    for (const c of r.checks) expect(["pass", "fail", "warning", "not-run"]).toContain(c.status);
  });
});

describe("profiles", () => {
  it("lists 6 profiles incl generic + rest-api", () => {
    const ids = listProfiles().map((p) => p.id);
    expect(ids).toContain("generic");
    expect(ids).toContain("rest-api");
    expect(ids.length).toBeGreaterThanOrEqual(6);
  });
  it("getProfile throws usefully", () => {
    expect(() => getProfile("nope")).toThrow(/Available/);
  });
  it("conditional artifacts: ts-web omits DATA_MODEL", () => {
    const s = validSpec();
    s.exportConfig.profile = "typescript-web";
    s.project.profile = "typescript-web";
    const names = renderArtifacts(s).map((a) => a.filename);
    expect(names).not.toContain("DATA_MODEL.md");
    expect(names).toContain("API_CONTRACTS.md");
  });
  it("rest-api includes data model + contracts", () => {
    const s = validSpec();
    s.exportConfig.profile = "rest-api";
    s.project.profile = "rest-api";
    const names = renderArtifacts(s).map((a) => a.filename);
    expect(names).toContain("DATA_MODEL.md");
    expect(names).toContain("API_CONTRACTS.md");
  });
  it("rendering deterministic + requirement ids present", () => {
    const s = validSpec();
    const a = renderArtifacts(s).map((x) => x.content).join("\n");
    const b = renderArtifacts(JSON.parse(JSON.stringify(s))).map((x) => x.content).join("\n");
    expect(a).toBe(b);
    expect(a).toContain("REQ-1");
    expect(sha256("x").length).toBe(64);
  });
  it("tasks link back to requirements, tests link back", () => {
    const s = validSpec();
    const tasks = renderArtifacts(s).find((x) => x.filename === "TASKS.md")!.content;
    expect(tasks).toContain("REQ-1");
    const plan = renderArtifacts(s).find((x) => x.filename === "TEST_PLAN.md")!.content;
    expect(plan).toContain("TC-1");
    expect(plan).toContain("REQ-1");
  });
});

describe("config merging", () => {
  it("opencode merge preserves existing + no dup", () => {
    const ex = { mcp: { other: { type: "local", command: ["x"] } }, tools: {} };
    const once = mergeOpenCodeConfig(ex, ["node", "s.js"], "/w");
    expect((once.mcp as Record<string, unknown>)["other"]).toBeTruthy();
    expect((once.mcp as Record<string, unknown>)["universal-prd"]).toBeTruthy();
    const twice = mergeOpenCodeConfig(once, ["node", "other.js"], "/w");
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
  it("antigravity merge preserves + no dup", () => {
    const ex = { mcpServers: { db: { command: "x" } } };
    const once = mergeAntigravityConfig(ex, "/abs/stdio.js", "/w");
    expect((once.mcpServers as Record<string, unknown>)["db"]).toBeTruthy();
    const twice = mergeAntigravityConfig(once, "/other.js", "/w");
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
  it("platform-independent rel paths use /", async () => {
    const { toWorkspaceRel } = await import("../../src/security/paths.js");
    expect(toWorkspaceRel("/a/b", "/a/b/c/d.md")).toBe("c/d.md");
  });
});
