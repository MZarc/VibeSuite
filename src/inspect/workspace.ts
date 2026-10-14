import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ensureWorkspaceRoot } from "../security/paths.js";

const ALLOWLIST_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "pubspec.yaml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Tauri.toml",
  "tauri.conf.json",
  "README.md",
  "AGENTS.md",
  "Dockerfile",
  "docker-compose.yml",
  ".opencode.json",
  "opencode.json",
  "opencode.jsonc",
]);

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "target",
  "dist",
  "build",
  "out",
  ".next",
  "__pycache__",
  ".dart_tool",
  "Pods",
  ".idea",
  ".vscode",
]);

const EXCLUDED_FILES = [/^\.env(\..*)?$/, /.*\.pem$/, /.*\.key$/, /credentials.*/, /secrets.*/i, /id_rsa.*/];

const MAX_FILE_BYTES = 32 * 1024;
const MAX_FILES = 40;

export interface InspectEvidence {
  file: string;
  matched: string;
}

export interface InspectResult {
  workspaceRoot: string;
  languages: { name: string; confidence: "high" | "medium" | "low"; evidence: InspectEvidence[] }[];
  frameworks: { name: string; confidence: "high" | "medium" | "low"; evidence: InspectEvidence[] }[];
  packageManagers: string[];
  buildCommands: string[];
  testCommands: string[];
  docs: string[];
  notes: string[];
  filesScanned: number;
  filesSkipped: number;
}

function excludedFile(name: string): boolean {
  return EXCLUDED_FILES.some((re) => re.test(name));
}

export async function inspectWorkspace(workspaceRoot: string): Promise<InspectResult> {
  const root = ensureWorkspaceRoot(workspaceRoot);
  const result: InspectResult = {
    workspaceRoot: root,
    languages: [],
    frameworks: [],
    packageManagers: [],
    buildCommands: [],
    testCommands: [],
    docs: [],
    notes: [],
    filesScanned: 0,
    filesSkipped: 0,
  };
  const langHits: Record<string, InspectEvidence[]> = {};
  const fwHits: Record<string, InspectEvidence[]> = {};
  const push = (m: Record<string, InspectEvidence[]>, k: string, e: InspectEvidence) => {
    (m[k] = m[k] ?? []).push(e);
  };

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4 || result.filesScanned >= MAX_FILES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      result.filesSkipped++;
      return;
    }
    for (const ent of entries) {
      if (result.filesScanned >= MAX_FILES) break;
      if (ent.isDirectory()) {
        if (EXCLUDED_DIRS.has(ent.name)) {
          result.filesSkipped++;
          continue;
        }
        await walk(path.join(dir, ent.name), depth + 1);
      } else if (ent.isFile()) {
        const rel = path.relative(root, path.join(dir, ent.name)).split(path.sep).join("/");
        if (excludedFile(ent.name)) {
          result.filesSkipped++;
          continue;
        }
        // docs detection (bounded, name only)
        if (/\.md$/i.test(ent.name) && !rel.startsWith("node_modules")) {
          if (result.docs.length < 10) result.docs.push(rel);
        }
        if (!ALLOWLIST_FILES.has(ent.name)) {
          // Extension-based weak signals without reading content
          if (ent.name.endsWith(".py")) push(langHits, "python", { file: rel, matched: "extension .py" });
          else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) push(langHits, "typescript/javascript", { file: rel, matched: `extension ${path.extname(ent.name)}` });
          else if (ent.name.endsWith(".dart")) push(langHits, "dart", { file: rel, matched: "extension .dart" });
          else if (ent.name.endsWith(".rs")) push(langHits, "rust", { file: rel, matched: "extension .rs" });
          else if (ent.name.endsWith(".go")) push(langHits, "go", { file: rel, matched: "extension .go" });
          else if (ent.name.endsWith(".kt") || ent.name.endsWith(".java")) push(langHits, "kotlin/java", { file: rel, matched: `extension ${path.extname(ent.name)}` });
          else if (ent.name.endsWith(".cs")) push(langHits, "csharp", { file: rel, matched: "extension .cs" });
          else result.filesSkipped++;
          continue;
        }
        // Read allowlisted file bounded
        try {
          const st = await fs.stat(path.join(dir, ent.name));
          if (st.size > MAX_FILE_BYTES) {
            result.filesSkipped++;
            continue;
          }
          const content = await fs.readFile(path.join(dir, ent.name), "utf8");
          result.filesScanned++;
          analyzeFile(ent.name, rel, content, { langHits, fwHits, result, push });
        } catch {
          result.filesSkipped++;
        }
      }
    }
  }

  await walk(root, 0);

  const conf = (n: number): "high" | "medium" | "low" => (n >= 3 ? "high" : n === 2 ? "medium" : "low");
  for (const [k, v] of Object.entries(langHits)) {
    result.languages.push({ name: k, confidence: conf(v.length), evidence: v.slice(0, 5) });
  }
  for (const [k, v] of Object.entries(fwHits)) {
    result.frameworks.push({ name: k, confidence: conf(v.length), evidence: v.slice(0, 5) });
  }
  if (result.languages.length === 0 && result.frameworks.length === 0) {
    result.notes.push("No confident stack detected (empty workspace or only unlisted files). Treated as stack-independent; do not assume a framework.");
  } else {
    result.notes.push("Detections are evidence-based and uncertain; confirm with the user before locking a stack profile.");
  }
  return result;
}

function analyzeFile(
  name: string,
  rel: string,
  content: string,
  ctx: {
    langHits: Record<string, { file: string; matched: string }[]>;
    fwHits: Record<string, { file: string; matched: string }[]>;
    result: InspectResult;
    push: (m: Record<string, { file: string; matched: string }[]>, k: string, e: { file: string; matched: string }) => void;
  },
): void {
  const { langHits, fwHits, result, push } = ctx;
  if (name === "package.json") {
    push(langHits, "typescript/javascript", { file: rel, matched: "package.json present" });
    try {
      const j = JSON.parse(content);
      const deps = { ...(j.dependencies ?? {}), ...(j.devDependencies ?? {}) };
      if (deps.next) push(fwHits, "next.js", { file: rel, matched: "dependency next" });
      if (deps.react) push(fwHits, "react", { file: rel, matched: "dependency react" });
      if (deps.vue) push(fwHits, "vue", { file: rel, matched: "dependency vue" });
      if (deps["@tauri-apps/api"] || deps["@tauri-apps/cli"]) push(fwHits, "tauri", { file: rel, matched: "tauri dependency" });
      if (deps.express || deps.fastify || deps.nestjs || deps["@nestjs/core"]) push(fwHits, "node-backend", { file: rel, matched: "backend dependency" });
      if (!result.packageManagers.includes("npm")) result.packageManagers.push("npm");
      const scripts = j.scripts ?? {};
      if (scripts.build) result.buildCommands.push("npm run build (from package.json; verify locally)");
      if (scripts.test) result.testCommands.push("npm test (from package.json; verify locally)");
    } catch {
      result.notes.push(`${rel}: package.json unparsable; treated as uncertain evidence`);
    }
  } else if (name === "pyproject.toml" || name === "requirements.txt" || name === "setup.py") {
    push(langHits, "python", { file: rel, matched: name });
    if (!result.packageManagers.includes("pip")) result.packageManagers.push("pip");
    if (!result.testCommands.includes("pytest (verify locally)")) result.testCommands.push("pytest (verify locally)");
  } else if (name === "pubspec.yaml") {
    push(langHits, "dart", { file: rel, matched: "pubspec.yaml" });
    push(fwHits, "flutter", { file: rel, matched: "pubspec.yaml" });
    if (!result.testCommands.includes("flutter test (verify locally)")) result.testCommands.push("flutter test (verify locally)");
  } else if (name === "Cargo.toml") {
    push(langHits, "rust", { file: rel, matched: "Cargo.toml" });
    if (content.includes("tauri")) push(fwHits, "tauri", { file: rel, matched: "tauri in Cargo.toml" });
    if (!result.testCommands.includes("cargo test (verify locally)")) result.testCommands.push("cargo test (verify locally)");
  } else if (name === "go.mod") {
    push(langHits, "go", { file: rel, matched: "go.mod" });
  } else if (name === "tauri.conf.json" || name === "Tauri.toml") {
    push(fwHits, "tauri", { file: rel, matched: name });
  } else if (name === "AGENTS.md" || name === "README.md") {
    // keyword scan, low confidence only
    const low = content.toLowerCase();
    if (low.includes("flutter")) push(fwHits, "flutter", { file: rel, matched: "mentioned in doc (low confidence)" });
    if (low.includes("tauri")) push(fwHits, "tauri", { file: rel, matched: "mentioned in doc (low confidence)" });
  }
}
