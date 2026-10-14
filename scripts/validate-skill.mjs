// Validate SKILL.md frontmatter per Agent Skills spec + OpenCode discovery paths.
// Covers repo skills (.agents/skills/*) and trigger templates (templates/skills/*).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function skillDirs(base) {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(base, e.name));
}

function validateSkill(p) {
  const dirName = basename(dirname(p));
  const errs = [];
  if (!existsSync(p)) return [`missing ${p}`];
  const raw = readFileSync(p, "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return [`${p}: missing frontmatter block`];
  const fm = m[1];
  const name = (fm.match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const desc = (fm.match(/^description:\s*(.+)$/m) || [])[1]?.trim();
  if (!name) errs.push("name required");
  else {
    if (name.length > 64) errs.push("name > 64 chars");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) errs.push(`name '${name}' violates ^[a-z0-9]+(-[a-z0-9]+)*$`);
    if (name !== dirName) errs.push(`name '${name}' must match directory '${dirName}'`);
  }
  if (!desc) errs.push("description required");
  else if (desc.length < 1 || desc.length > 1024) errs.push(`description length ${desc.length} out of 1..1024`);
  const body = raw.slice(m[0].length);
  if (body.split(/\r?\n/).length > 500) errs.push("body exceeds 500 lines (move detail to references/)");
  return errs.map((e) => `${p}: ${e}`);
}

const targets = [
  ...skillDirs(join(repoRoot, ".agents", "skills")).map((d) => join(d, "SKILL.md")),
  ...skillDirs(join(repoRoot, "templates", "skills")).map((d) => join(d, "SKILL.md")),
];
if (targets.length === 0) {
  console.error("skill validation failed: no skills found");
  process.exit(1);
}
let errs = [];
for (const t of targets) errs = errs.concat(validateSkill(t));

// Validate that referenced files exist (universal-prd only)
for (const ref of ["HANDOFF.md", "SEMANTIC_REVIEW.md", "WORKFLOW.md"]) {
  const refPath = join(repoRoot, ".agents/skills/universal-prd/references", ref);
  if (!existsSync(refPath)) {
    errs.push(`referenced file missing: ${refPath}`);
  }
}

if (errs.length) {
  console.error("skill validation failed:\n - " + errs.join("\n - "));
  process.exit(1);
}
console.log(`skills ok (${targets.length}): ${targets.join(", ")}`);
