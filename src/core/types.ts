import { z } from "zod";

export const SPEC_SCHEMA_VERSION = "1.0.0";
export const SUPPORTED_SPEC_VERSIONS = ["1.0.0"] as const;

export const ProvenanceSchema = z.enum([
  "user_confirmed",
  "agent_inferred",
  "derived",
  "imported",
]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const StatusSchema = z.enum([
  "draft",
  "confirmed",
  "unresolved",
  "rejected",
]);
export type ItemStatus = z.infer<typeof StatusSchema>;

export const PrioritySchema = z.enum(["must", "should", "could", "wont"]);
export type Priority = z.infer<typeof PrioritySchema>;

const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Z]+-[0-9]+$|^[A-Za-z0-9-]+:[A-Z]+-[0-9]+(-[0-9]+)?$/, "ID must look like REQ-1, AC-2, TC-3, DEC-1, etc.");

export const AcceptanceCriterionSchema = z.object({
  id: IdSchema,
  statement: z.string().min(1).max(2000),
  testable: z.boolean().default(true),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export const RequirementSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(8000),
  priority: PrioritySchema.default("must"),
  provenance: ProvenanceSchema,
  status: StatusSchema.default("draft"),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema).default([]),
  verifiesBy: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]),
  tags: z.array(z.string().max(64)).default([]),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const DecisionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  rationale: z.string().max(4000).default(""),
  provenance: ProvenanceSchema,
  status: StatusSchema.default("draft"),
  decidedBy: z.string().max(200).default(""),
  date: z.string().max(30).default(""),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const AssumptionSchema = z.object({
  id: z.string().min(1).max(64),
  statement: z.string().min(1).max(2000),
  provenance: ProvenanceSchema.default("agent_inferred"),
  status: StatusSchema.default("unresolved"),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const OpenQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  question: z.string().min(1).max(2000),
  critical: z.boolean().default(false),
  status: StatusSchema.default("unresolved"),
  resolution: z.string().max(4000).default(""),
});
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>;

export const TestCaseSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  verifies: z.array(z.string().min(1)).min(1, "test must verify at least one requirement"),
  steps: z.array(z.string().min(1)).default([]),
  expected: z.string().max(4000).default(""),
  category: z.string().max(80).default("functional"),
});
export type TestCase = z.infer<typeof TestCaseSchema>;

export const EntitySchema = z.object({
  name: z.string().min(1).max(120),
  attributes: z.array(z.string().max(200)).default([]),
  relations: z.array(z.string().max(300)).default([]),
});
export type Entity = z.infer<typeof EntitySchema>;

export const InterfaceSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["rest", "graphql", "grpc", "event", "ui", "cli", "other"]).default("rest"),
  contract: z.string().max(8000).default(""),
});
export type ApiInterface = z.infer<typeof InterfaceSchema>;

export const RiskSchema = z.object({
  id: z.string().min(1).max(64),
  description: z.string().min(1).max(2000),
  mitigation: z.string().max(4000).default(""),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
});
export type Risk = z.infer<typeof RiskSchema>;

export const StorySchema = z.object({
  id: z.string().min(1).max(64),
  narrative: z.string().min(1).max(3000),
  roles: z.array(z.string().max(120)).default([]),
});
export type Story = z.infer<typeof StorySchema>;

export const SpecSchema = z.object({
  schemaVersion: z.string().min(1),
  project: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(8000).default(""),
    profile: z.string().max(80).default("generic"),
    version: z.string().max(40).default("0.1.0"),
  }),
  goals: z.array(z.string().min(1).max(1000)).default([]),
  outcomes: z.array(z.string().min(1).max(1000)).default([]),
  users: z.array(z.string().min(1).max(500)).default([]),
  scope: z
    .object({
      inScope: z.array(z.string().min(1).max(1000)).default([]),
      outOfScope: z.array(z.string().min(1).max(1000)).default([]),
      nonGoals: z.array(z.string().min(1).max(1000)).default([]),
    })
    .default({ inScope: [], outOfScope: [], nonGoals: [] }),
  functionalRequirements: z.array(RequirementSchema).default([]),
  nonFunctionalRequirements: z.array(RequirementSchema).default([]),
  decisions: z.array(DecisionSchema).default([]),
  assumptions: z.array(AssumptionSchema).default([]),
  openQuestions: z.array(OpenQuestionSchema).default([]),
  dependencies: z.array(z.string().min(1).max(1000)).default([]),
  entities: z.array(EntitySchema).default([]),
  interfaces: z.array(InterfaceSchema).default([]),
  risks: z.array(RiskSchema).default([]),
  stories: z.array(StorySchema).default([]),
  testCases: z.array(TestCaseSchema).default([]),
  semanticFindings: z
    .array(
      z.object({
        id: z.string().min(1),
        finding: z.string().min(1),
        severity: z.enum(["info", "warning", "blocking"]).default("warning"),
        status: z.enum(["open", "resolved", "waived"]).default("open"),
      }),
    )
    .default([]),
  exportConfig: z
    .object({
      profile: z.string().max(80).default("generic"),
      outputDir: z.string().max(300).default("docs/spec"),
      artifacts: z.array(z.string().max(80)).default([]),
    })
    .default({ profile: "generic", outputDir: "docs/spec", artifacts: [] }),
  revision: z
    .object({
      version: z.number().int().nonnegative().default(1),
      updatedAt: z.string().max(40).default(""),
      history: z.array(z.string().max(500)).default([]),
    })
    .default({ version: 1, updatedAt: "", history: [] }),
});

export type Spec = z.infer<typeof SpecSchema>;

export function createInitialSpec(projectName: string, profile = "generic"): Spec {
  return {
    schemaVersion: SPEC_SCHEMA_VERSION,
    project: { name: projectName, description: "", profile, version: "0.1.0" },
    goals: [],
    outcomes: [],
    users: [],
    scope: { inScope: [], outOfScope: [], nonGoals: [] },
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    decisions: [],
    assumptions: [],
    openQuestions: [],
    dependencies: [],
    entities: [],
    interfaces: [],
    risks: [],
    stories: [],
    testCases: [],
    semanticFindings: [],
    exportConfig: { profile, outputDir: "docs/spec", artifacts: [] },
    revision: { version: 1, updatedAt: new Date().toISOString(), history: ["initialized"] },
  };
}

/** ID prefixes per collection. */
export const ID_PREFIX: Record<string, string> = {
  functionalRequirements: "REQ",
  nonFunctionalRequirements: "NFR",
  testCases: "TC",
  decisions: "DEC",
  assumptions: "ASM",
  openQuestions: "Q",
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function nextId(prefix: string, existing: string[]): string {
  let max = 0;
  const re = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`);
  for (const id of existing) {
    const m = id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${max + 1}`;
}
