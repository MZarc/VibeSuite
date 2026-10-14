import { z } from "zod";
import { loadSpec, saveSpec } from "../core/store.js";
import { SpecSchema, nextId, type Spec } from "../core/types.js";

export const MAX_STR = 8000;

const ReqInput = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(MAX_STR),
  priority: z.enum(["must", "should", "could", "wont"]).default("must"),
  provenance: z.enum(["user_confirmed", "agent_inferred", "derived", "imported"]),
  status: z.enum(["draft", "confirmed", "unresolved", "rejected"]).default("draft"),
  acceptanceCriteria: z.array(z.object({ statement: z.string().min(1).max(2000) })).default([]),
  dependsOn: z.array(z.string().max(64)).max(50).default([]),
  id: z.string().max(64).optional(),
});

export const UpdateOperation = z.enum([
  "set-project",
  "add-requirement",
  "add-nfr",
  "add-test",
  "add-decision",
  "add-assumption",
  "add-question",
  "resolve-question",
  "record-finding",
  "set-export-config",
]);

export async function applyUpdate(spec: Spec, operation: z.infer<typeof UpdateOperation>, payload: Record<string, unknown>): Promise<Spec> {
  const clone: Spec = JSON.parse(JSON.stringify(spec));
  const bump = () => {
    clone.revision.version += 1;
    clone.revision.history.push(`${operation} @ ${new Date().toISOString()}`);
  };
  switch (operation) {
    case "set-project": {
      const p = z.object({ name: z.string().min(1).max(200).optional(), description: z.string().max(MAX_STR).optional(), profile: z.string().max(80).optional() }).parse(payload);
      if (p.name !== undefined) clone.project.name = p.name;
      if (p.description !== undefined) clone.project.description = p.description;
      if (p.profile !== undefined) {
        clone.project.profile = p.profile;
        clone.exportConfig.profile = p.profile;
      }
      bump();
      break;
    }
    case "add-requirement":
    case "add-nfr": {
      const r = ReqInput.parse(payload);
      const coll = operation === "add-requirement" ? clone.functionalRequirements : clone.nonFunctionalRequirements;
      const prefix = operation === "add-requirement" ? "REQ" : "NFR";
      const id = r.id ?? nextId(prefix, [...clone.functionalRequirements, ...clone.nonFunctionalRequirements].map((x) => x.id));
      if (coll.some((x) => x.id === id) || clone.testCases.some((t) => t.id === id)) throw new Error(`duplicate id '${id}'`);
      const acPrefix = "AC";
      const existingAc = new Set([...clone.functionalRequirements, ...clone.nonFunctionalRequirements].flatMap((x) => x.acceptanceCriteria.map((a) => a.id)));
      const ac = r.acceptanceCriteria.map((a, i) => {
        let cand = `${id}:${acPrefix}-${i + 1}`;
        let n = 1;
        while (existingAc.has(cand)) cand = `${id}:${acPrefix}-${i + 1}-${n++}`;
        existingAc.add(cand);
        return { id: cand, statement: a.statement, testable: true };
      });
      coll.push({ id, title: r.title, description: r.description, priority: r.priority, provenance: r.provenance, status: r.status, acceptanceCriteria: ac, verifiesBy: [], dependsOn: r.dependsOn, tags: [] });
      bump();
      break;
    }
    case "add-test": {
      const t = z.object({
        title: z.string().min(1).max(300),
        verifies: z.array(z.string().max(64)).min(1).max(50),
        steps: z.array(z.string().max(1000)).max(50).default([]),
        expected: z.string().max(4000).default(""),
        category: z.string().max(80).default("functional"),
        id: z.string().max(64).optional(),
      }).parse(payload);
      const id = t.id ?? nextId("TC", clone.testCases.map((x) => x.id));
      if (clone.testCases.some((x) => x.id === id)) throw new Error(`duplicate id '${id}'`);
      clone.testCases.push({ id, title: t.title, verifies: t.verifies, steps: t.steps, expected: t.expected, category: t.category });
      bump();
      break;
    }
    case "add-decision": {
      const d = z.object({ title: z.string().min(1).max(300), rationale: z.string().max(4000).default(""), provenance: z.enum(["user_confirmed", "agent_inferred", "derived", "imported"]), status: z.enum(["draft", "confirmed", "unresolved", "rejected"]).default("draft") }).parse(payload);
      const id = nextId("DEC", clone.decisions.map((x) => x.id));
      clone.decisions.push({ id, ...d, decidedBy: "", date: new Date().toISOString().slice(0, 10) });
      bump();
      break;
    }
    case "add-assumption": {
      const a = z.object({ statement: z.string().min(1).max(2000), provenance: z.enum(["user_confirmed", "agent_inferred", "derived", "imported"]).default("agent_inferred") }).parse(payload);
      const id = nextId("ASM", clone.assumptions.map((x) => x.id));
      clone.assumptions.push({ id, statement: a.statement, provenance: a.provenance, status: "unresolved" });
      bump();
      break;
    }
    case "add-question": {
      const q = z.object({ question: z.string().min(1).max(2000), critical: z.boolean().default(false) }).parse(payload);
      const id = nextId("Q", clone.openQuestions.map((x) => x.id));
      clone.openQuestions.push({ id, question: q.question, critical: q.critical, status: "unresolved", resolution: "" });
      bump();
      break;
    }
    case "resolve-question": {
      const q = z.object({ id: z.string().max(64), resolution: z.string().max(4000) }).parse(payload);
      const item = clone.openQuestions.find((x) => x.id === q.id);
      if (!item) throw new Error(`unknown question '${q.id}'`);
      item.status = "confirmed";
      item.resolution = q.resolution;
      bump();
      break;
    }
    case "record-finding": {
      const f = z.object({ finding: z.string().min(1).max(4000), severity: z.enum(["info", "warning", "blocking"]).default("warning") }).parse(payload);
      const id = nextId("F", clone.semanticFindings.map((x) => x.id));
      clone.semanticFindings.push({ id, finding: f.finding, severity: f.severity, status: "open" });
      bump();
      break;
    }
    case "set-export-config": {
      const c = z.object({ profile: z.string().max(80).optional(), outputDir: z.string().max(300).optional(), artifacts: z.array(z.string().max(80)).max(20).optional() }).parse(payload);
      if (c.profile !== undefined) {
        clone.exportConfig.profile = c.profile;
        clone.project.profile = c.profile;
      }
      if (c.outputDir !== undefined) {
        if (
          c.outputDir.includes("..") ||
          c.outputDir.startsWith("/") ||
          c.outputDir.startsWith("\\") ||
          /^[A-Za-z]:/.test(c.outputDir)
        ) {
          throw new Error("outputDir must be workspace-relative without '..'");
        }
        clone.exportConfig.outputDir = c.outputDir;
      }
      if (c.artifacts !== undefined) clone.exportConfig.artifacts = c.artifacts;
      bump();
      break;
    }
  }
  // Full schema check before returning (reject malformed updates)
  SpecSchema.parse(clone);
  return clone;
}

export async function loadAndSave(workspaceRoot: string, fn: (s: Spec) => Promise<Spec> | Spec): Promise<Spec> {
  const spec = await loadSpec(workspaceRoot);
  const next = await fn(spec);
  await saveSpec(workspaceRoot, next);
  return next;
}
