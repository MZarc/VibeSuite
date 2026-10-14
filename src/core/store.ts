import { promises as fs } from "node:fs";
import * as path from "node:path";
import { SpecSchema, createInitialSpec, type Spec } from "./types.js";
import { resolveInside, ensureWorkspaceRoot } from "../security/paths.js";

export const SPEC_REL_PATH = ".prd/spec.json";

export async function specPath(workspaceRoot: string): Promise<string> {
  const root = ensureWorkspaceRoot(workspaceRoot);
  return resolveInside(root, SPEC_REL_PATH);
}

export async function specExists(workspaceRoot: string): Promise<boolean> {
  try {
    const p = await specPath(workspaceRoot);
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function loadSpec(workspaceRoot: string): Promise<Spec> {
  const p = await specPath(workspaceRoot);
  const raw = await fs.readFile(p, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`spec.json is malformed JSON: ${(e as Error).message}`);
  }
  const parsed = SpecSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`spec.json failed schema validation: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

export async function saveSpec(workspaceRoot: string, spec: Spec): Promise<string> {
  const parsed = SpecSchema.parse(spec);
  parsed.revision = {
    ...parsed.revision,
    updatedAt: new Date().toISOString(),
  };
  const p = await specPath(workspaceRoot);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await fs.writeFile(tmp, JSON.stringify(parsed, null, 2) + "\n", "utf8");
    await fs.rename(tmp, p);
  } finally {
    try { await fs.unlink(tmp); } catch {}
  }
  return p;
}

export async function initSpec(
  workspaceRoot: string,
  projectName: string,
  profile = "generic",
): Promise<{ spec: Spec; created: boolean; path: string }> {
  const p = await specPath(workspaceRoot);
  if (await specExists(workspaceRoot)) {
    const existing = await loadSpec(workspaceRoot);
    return { spec: existing, created: false, path: p };
  }
  const spec = createInitialSpec(projectName, profile);
  spec.exportConfig.profile = profile;
  await saveSpec(workspaceRoot, spec);
  return { spec, created: true, path: p };
}

/** Return a safe subsection (bounded) to avoid context explosion. */
export function getSpecSection(spec: Spec, section?: string): unknown {
  if (!section || section === "all") return spec;
  const allowed: Record<string, unknown> = {
    project: spec.project,
    goals: { goals: spec.goals, outcomes: spec.outcomes },
    users: spec.users,
    scope: spec.scope,
    functionalRequirements: spec.functionalRequirements,
    nonFunctionalRequirements: spec.nonFunctionalRequirements,
    decisions: spec.decisions,
    assumptions: spec.assumptions,
    openQuestions: spec.openQuestions,
    dependencies: spec.dependencies,
    entities: spec.entities,
    interfaces: spec.interfaces,
    risks: spec.risks,
    stories: spec.stories,
    testCases: spec.testCases,
    semanticFindings: spec.semanticFindings,
    exportConfig: spec.exportConfig,
    revision: spec.revision,
  };
  if (!(section in allowed)) {
    throw new Error(`unknown section '${section}'. Allowed: ${Object.keys(allowed).join(", ")}`);
  }
  return { section, data: allowed[section] };
}
