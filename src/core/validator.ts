import { SUPPORTED_SPEC_VERSIONS, type Spec } from "../core/types.js";
import { getProfile } from "../profiles/profiles.js";

export type CheckStatus = "pass" | "fail" | "warning" | "not-run";
export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  details: string;
  items?: string[];
}
export interface ValidationReport {
  version: number;
  generatedAt: string;
  summary: { pass: number; fail: number; warning: number; notRun: number };
  checks: CheckResult[];
  readiness: "ready" | "needs_decisions" | "invalid";
  blockers: string[];
}

export interface Rule {
  id: string;
  title: string;
  run: (spec: Spec) => CheckResult;
}

function result(id: string, title: string, status: CheckStatus, details: string, items: string[] = []): CheckResult {
  return { id, title, status, details, items: items.slice(0, 50) };
}

function collectIds(spec: Spec): { id: string; where: string }[] {
  const out: { id: string; where: string }[] = [];
  for (const r of spec.functionalRequirements) out.push({ id: r.id, where: "functionalRequirements" });
  for (const r of spec.nonFunctionalRequirements) out.push({ id: r.id, where: "nonFunctionalRequirements" });
  for (const t of spec.testCases) out.push({ id: t.id, where: "testCases" });
  for (const d of spec.decisions) out.push({ id: d.id, where: "decisions" });
  for (const a of spec.assumptions) out.push({ id: a.id, where: "assumptions" });
  for (const q of spec.openQuestions) out.push({ id: q.id, where: "openQuestions" });
  for (const k of spec.risks) out.push({ id: k.id, where: "risks" });
  for (const s of spec.stories) out.push({ id: s.id, where: "stories" });
  for (const ac of [...spec.functionalRequirements, ...spec.nonFunctionalRequirements].flatMap((r) => r.acceptanceCriteria)) {
    out.push({ id: ac.id, where: "acceptanceCriteria" });
  }
  return out;
}

const RULES: Rule[] = [
  {
    id: "schema-version",
    title: "Supported schema version",
    run: (spec) =>
      (SUPPORTED_SPEC_VERSIONS as readonly string[]).includes(spec.schemaVersion)
        ? result("schema-version", "Supported schema version", "pass", `version ${spec.schemaVersion} supported`)
        : result("schema-version", "Supported schema version", "fail", `unsupported schemaVersion '${spec.schemaVersion}'. Supported: ${SUPPORTED_SPEC_VERSIONS.join(", ")}`),
  },
  {
    id: "project-identity",
    title: "Project identity present",
    run: (spec) =>
      spec.project.name.trim().length > 0
        ? result("project-identity", "Project identity present", "pass", "project name present")
        : result("project-identity", "Project identity present", "fail", "project.name is required"),
  },
  {
    id: "unique-ids",
    title: "Unique identifiers",
    run: (spec) => {
      const ids = collectIds(spec);
      const seen = new Map<string, number>();
      const dups: string[] = [];
      for (const e of ids) {
        seen.set(e.id, (seen.get(e.id) ?? 0) + 1);
        if (seen.get(e.id) === 2) dups.push(`${e.id} (first duplicate in ${e.where})`);
      }
      return dups.length === 0
        ? result("unique-ids", "Unique identifiers", "pass", `${ids.length} IDs unique`)
        : result("unique-ids", "Unique identifiers", "fail", `${dups.length} duplicate ID(s)`, dups);
    },
  },
  {
    id: "req-acceptance",
    title: "Requirements carry acceptance criteria",
    run: (spec) => {
      const missing = [...spec.functionalRequirements, ...spec.nonFunctionalRequirements]
        .filter((r) => r.status !== "rejected" && r.acceptanceCriteria.length === 0)
        .map((r) => r.id);
      if (missing.length === 0) return result("req-acceptance", "Requirements carry acceptance criteria", "pass", "all active requirements have acceptance criteria");
      return result("req-acceptance", "Requirements carry acceptance criteria", "fail", `${missing.length} requirement(s) lack acceptance criteria`, missing);
    },
  },
  {
    id: "ref-integrity",
    title: "Reference integrity (dependsOn, verifies, verifiesBy)",
    run: (spec) => {
      const reqIds = new Set([...spec.functionalRequirements, ...spec.nonFunctionalRequirements].map((r) => r.id));
      const broken: string[] = [];
      for (const r of [...spec.functionalRequirements, ...spec.nonFunctionalRequirements]) {
        for (const d of r.dependsOn) if (!reqIds.has(d)) broken.push(`${r.id} dependsOn missing ${d}`);
        for (const v of r.verifiesBy) if (!spec.testCases.some((t) => t.id === v)) broken.push(`${r.id} verifiesBy missing test ${v}`);
      }
      for (const t of spec.testCases) {
        for (const v of t.verifies) if (!reqIds.has(v)) broken.push(`${t.id} verifies missing requirement ${v}`);
      }
      return broken.length === 0
        ? result("ref-integrity", "Reference integrity", "pass", "all references resolve")
        : result("ref-integrity", "Reference integrity", "fail", `${broken.length} broken reference(s)`, broken);
    },
  },
  {
    id: "traceability",
    title: "Requirement-to-test traceability",
    run: (spec) => {
      const uncovered = [...spec.functionalRequirements, ...spec.nonFunctionalRequirements]
        .filter((r) => r.status !== "rejected" && r.priority === "must")
        .filter((r) => !spec.testCases.some((t) => t.verifies.includes(r.id)));
      if (uncovered.length === 0) return result("traceability", "Requirement-to-test traceability", "pass", "all must-requirements covered by tests");
      return result("traceability", "Requirement-to-test traceability", "warning", `${uncovered.length} must-requirement(s) without a covering test`, uncovered.map((r) => r.id));
    },
  },
  {
    id: "provenance",
    title: "Provenance discipline (no silent promotion)",
    run: (spec) => {
      const bad: string[] = [];
      for (const r of [...spec.functionalRequirements, ...spec.nonFunctionalRequirements]) {
        if (r.status === "confirmed" && r.provenance === "agent_inferred") {
          bad.push(`${r.id} is agent_inferred but marked confirmed (requires user confirmation)`);
        }
      }
      for (const d of spec.decisions) {
        if (d.status === "confirmed" && d.provenance === "agent_inferred") {
          bad.push(`${d.id} is agent_inferred but marked confirmed`);
        }
      }
      return bad.length === 0
        ? result("provenance", "Provenance discipline", "pass", "no inferred item silently promoted to confirmed")
        : result("provenance", "Provenance discipline", "fail", `${bad.length} provenance violation(s)`, bad);
    },
  },
  {
    id: "blocking-decisions",
    title: "No unresolved blocking decisions",
    run: (spec) => {
      const blocking = spec.openQuestions.filter((q) => q.critical && q.status === "unresolved").map((q) => q.id);
      const blockingFindings = spec.semanticFindings.filter((f) => f.severity === "blocking" && f.status === "open").map((f) => f.id);
      const all = [...blocking, ...blockingFindings];
      if (all.length === 0) return result("blocking-decisions", "No unresolved blocking decisions", "pass", "no critical unresolved items");
      return result("blocking-decisions", "No unresolved blocking decisions", "fail", `${all.length} blocking item(s) unresolved`, all);
    },
  },
  {
    id: "profile-rules",
    title: "Stack-profile mandatory rules",
    run: (spec) => {
      const profileId = spec.exportConfig.profile || spec.project.profile || "generic";
      let profile;
      try {
        profile = getProfile(profileId);
      } catch {
        return result("profile-rules", "Stack-profile mandatory rules", "fail", `unknown profile '${profileId}'`);
      }
      const missing: string[] = [];
      const nfrText = spec.nonFunctionalRequirements.map((r) => `${r.title} ${r.description}`.toLowerCase()).join("\n");
      for (const req of profile.requiredChecks) {
        if (req === "security-requirements" && !/secur|auth|encrypt|privacy/.test(nfrText) && !/secur|auth/.test(spec.functionalRequirements.map((r) => `${r.title} ${r.description}`.toLowerCase()).join("\n"))) {
          missing.push("profile requires at least one security-related requirement");
        }
        if (req === "error-handling" && !/error|fail|recover|retry|edge/.test(JSON.stringify(spec).toLowerCase())) {
          missing.push("profile requires error-handling / failure coverage");
        }
      }
      if (missing.length === 0) return result("profile-rules", "Stack-profile mandatory rules", "pass", `profile '${profile.id}' mandatory rules satisfied`);
      return result("profile-rules", "Stack-profile mandatory rules", "warning", missing.join("; "), missing);
    },
  },
  {
    id: "export-config",
    title: "Valid export configuration",
    run: (spec) => {
      const profileId = spec.exportConfig.profile || "generic";
      try {
        const profile = getProfile(profileId);
        const unknown = spec.exportConfig.artifacts.filter((a) => !profile.artifacts.includes(a) && a !== "all");
        if (unknown.length > 0) return result("export-config", "Valid export configuration", "fail", `unknown artifact(s) for profile '${profileId}': ${unknown.join(", ")}`, unknown);
        if (
          spec.exportConfig.outputDir.includes("..") ||
          spec.exportConfig.outputDir.startsWith("/") ||
          spec.exportConfig.outputDir.startsWith("\\") ||
          /^[A-Za-z]:/.test(spec.exportConfig.outputDir)
        ) {
          return result("export-config", "Valid export configuration", "fail", `outputDir must be a workspace-relative path without traversal: '${spec.exportConfig.outputDir}'`);
        }
        return result("export-config", "Valid export configuration", "pass", `profile '${profileId}', outputDir '${spec.exportConfig.outputDir}'`);
      } catch {
        return result("export-config", "Valid export configuration", "fail", `unknown profile '${profileId}'`);
      }
    },
  },
];

export function validateSpec(spec: Spec): ValidationReport {
  const checks = RULES.map((r) => {
    try {
      return r.run(spec);
    } catch (e) {
      return result(r.id, r.title, "fail", `rule crashed: ${(e as Error).message}`);
    }
  });
  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    fail: checks.filter((c) => c.status === "fail").length,
    warning: checks.filter((c) => c.status === "warning").length,
    notRun: checks.filter((c) => c.status === "not-run").length,
  };
  const readiness = computeReadiness(checks, spec);
  const blockers = checks.filter((c) => c.status === "fail").map((c) => `${c.id}: ${c.details}`);
  return { version: 1, generatedAt: new Date().toISOString(), summary, checks, readiness, blockers };
}

/** Documented readiness rules: fail-closed. Any fail => invalid. Else critical unresolved => needs_decisions. Else ready. */
export function computeReadiness(checks: CheckResult[], _spec: Spec): "ready" | "needs_decisions" | "invalid" {
  const byId = new Map(checks.map((c) => [c.id, c]));
  if (checks.some((c) => c.status === "fail")) return "invalid";
  const blocking = byId.get("blocking-decisions");
  if (blocking && blocking.status !== "pass") return "needs_decisions";
  if (checks.some((c) => c.status === "warning")) return "ready"; // warnings do not block, reported explicitly
  return "ready";
}

export function listRules(): Pick<Rule, "id" | "title">[] {
  return RULES.map((r) => ({ id: r.id, title: r.title }));
}
