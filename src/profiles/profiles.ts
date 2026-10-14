export interface StackProfile {
  id: string;
  name: string;
  stacks: string[];
  characteristics: string[];
  artifacts: string[];
  requiredChecks: string[];
  testCategories: string[];
  constraints: string[];
  conventions: string[];
  unsupported: string[];
  version: string;
}

export const ARTIFACTS = [
  "PRD.md",
  "REQUIREMENTS.md",
  "ACCEPTANCE_CRITERIA.md",
  "ARCHITECTURE.md",
  "DATA_MODEL.md",
  "API_CONTRACTS.md",
  "EDGE_CASES.md",
  "TEST_PLAN.md",
  "TASKS.md",
] as const;

const PROFILES: StackProfile[] = [
  {
    id: "generic",
    name: "Generic (stack-independent)",
    stacks: ["any"],
    characteristics: ["unknown stack", "early discovery", "cross-stack"],
    artifacts: [...ARTIFACTS],
    requiredChecks: [],
    testCategories: ["functional", "acceptance"],
    constraints: ["No framework assumed. All stack claims must be user-confirmed."],
    conventions: ["Keep artifacts stack-neutral until a profile is confirmed."],
    unsupported: ["Framework-specific code generation"],
    version: "1.0.0",
  },
  {
    id: "typescript-web",
    name: "TypeScript Web Application",
    stacks: ["typescript", "node", "react", "next", "vite"],
    characteristics: ["web", "spa", "ssr"],
    artifacts: ["PRD.md", "REQUIREMENTS.md", "ACCEPTANCE_CRITERIA.md", "ARCHITECTURE.md", "API_CONTRACTS.md", "EDGE_CASES.md", "TEST_PLAN.md", "TASKS.md"],
    requiredChecks: ["security-requirements", "error-handling"],
    testCategories: ["unit", "integration", "e2e", "accessibility"],
    constraints: ["Verify build/test commands against package.json; never assume Next vs Vite."],
    conventions: ["TypeScript strict", "npm scripts as quality gates"],
    unsupported: ["Native mobile packaging"],
    version: "1.0.0",
  },
  {
    id: "python-app",
    name: "Python Application",
    stacks: ["python"],
    characteristics: ["cli", "service", "data"],
    artifacts: ["PRD.md", "REQUIREMENTS.md", "ACCEPTANCE_CRITERIA.md", "ARCHITECTURE.md", "DATA_MODEL.md", "EDGE_CASES.md", "TEST_PLAN.md", "TASKS.md"],
    requiredChecks: ["error-handling"],
    testCategories: ["unit", "integration"],
    constraints: ["Verify interpreter and pytest configuration in the actual project."],
    conventions: ["pytest", "type hints where practical"],
    unsupported: ["Browser bundling"],
    version: "1.0.0",
  },
  {
    id: "flutter-android",
    name: "Flutter / Android Application",
    stacks: ["flutter", "dart", "kotlin", "android"],
    characteristics: ["mobile", "offline-first"],
    artifacts: ["PRD.md", "REQUIREMENTS.md", "ACCEPTANCE_CRITERIA.md", "ARCHITECTURE.md", "DATA_MODEL.md", "EDGE_CASES.md", "TEST_PLAN.md", "TASKS.md"],
    requiredChecks: ["security-requirements", "error-handling"],
    testCategories: ["unit", "widget", "integration"],
    constraints: ["Offline behavior and persistence requirements must be explicit where relevant."],
    conventions: ["Confirm flutter SDK version from project metadata"],
    unsupported: ["Web SSR specifics"],
    version: "1.0.0",
  },
  {
    id: "tauri-desktop",
    name: "Tauri Desktop Application",
    stacks: ["tauri", "rust", "typescript"],
    characteristics: ["desktop", "hybrid"],
    artifacts: ["PRD.md", "REQUIREMENTS.md", "ACCEPTANCE_CRITERIA.md", "ARCHITECTURE.md", "EDGE_CASES.md", "TEST_PLAN.md", "TASKS.md"],
    requiredChecks: ["security-requirements", "error-handling"],
    testCategories: ["unit", "integration", "e2e"],
    constraints: ["IPC permissions and updater behavior must be requirements, not assumptions."],
    conventions: ["Verify cargo + npm toolchain from project files"],
    unsupported: ["Mobile store deployment specifics"],
    version: "1.0.0",
  },
  {
    id: "rest-api",
    name: "REST API / Backend",
    stacks: ["node", "python", "go", "rust", "java", "csharp"],
    characteristics: ["api", "backend", "service"],
    artifacts: ["PRD.md", "REQUIREMENTS.md", "ACCEPTANCE_CRITERIA.md", "ARCHITECTURE.md", "DATA_MODEL.md", "API_CONTRACTS.md", "EDGE_CASES.md", "TEST_PLAN.md", "TASKS.md"],
    requiredChecks: ["security-requirements", "error-handling"],
    testCategories: ["unit", "contract", "integration", "load"],
    constraints: ["Every endpoint needs auth, error, and versioning requirements."],
    conventions: ["OpenAPI-style contract tables in API_CONTRACTS.md"],
    unsupported: ["UI component specs"],
    version: "1.0.0",
  },
];

export function listProfiles(): StackProfile[] {
  return PROFILES.map((p) => ({ ...p }));
}

export function getProfile(id: string): StackProfile {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`unknown profile '${id}'. Available: ${PROFILES.map((x) => x.id).join(", ")}`);
  return {
    ...p,
    stacks: [...p.stacks],
    characteristics: [...p.characteristics],
    artifacts: [...p.artifacts],
    requiredChecks: [...p.requiredChecks],
    testCategories: [...p.testCategories],
    constraints: [...p.constraints],
    conventions: [...p.conventions],
    unsupported: [...p.unsupported],
  };
}
