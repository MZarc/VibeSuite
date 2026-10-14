import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Spec } from "../core/types.js";
import { validateSpec } from "../core/validator.js";
import { renderArtifacts, sha256, buildDecisionsDoc } from "./renderer.js";
import { resolveInside, toWorkspaceRel } from "../security/paths.js";
import { getProfile } from "../profiles/profiles.js";

export interface ExportFilePlan {
  rel: string;
  action: "create" | "modify" | "conflict" | "skip-not-applicable";
  hash?: string;
  reason?: string;
}

export interface ExportPreview {
  profile: string;
  outputDir: string;
  files: ExportFilePlan[];
  conflicts: string[];
  readiness: string;
  blockers: string[];
  error?: string;
}

export interface ExportApplyResult {
  written: { rel: string; bytes: number; hash: string }[];
  manifestPath: string;
  skipped: string[];
  aborted?: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function previewExport(
  workspaceRoot: string,
  spec: Spec,
  requestedArtifacts?: string[],
): Promise<ExportPreview> {
  const profileId = spec.exportConfig.profile || spec.project.profile || "generic";
  const profile = getProfile(profileId);
  const outputDir = spec.exportConfig.outputDir || "docs/spec";
  const report = validateSpec(spec);
  const artifacts = renderArtifacts(spec, requestedArtifacts);
  const files: ExportFilePlan[] = [];
  const conflicts: string[] = [];

  for (const a of artifacts) {
    const rel = `${outputDir}/${a.filename}`.replace(/\\/g, "/");
    const abs = await resolveInside(workspaceRoot, rel);
    if (await fileExists(abs)) {
      files.push({ rel, action: "conflict", reason: "existing file requires per-file authorization" });
      conflicts.push(rel);
    } else {
      files.push({ rel, action: "create", hash: sha256(a.content) });
    }
  }
  // Managed .prd files (always overwritten by design — they are compiler-owned)
  for (const rel of [".prd/validation-report.json", ".prd/decisions.json", ".prd/export-manifest.json"]) {
    const abs = await resolveInside(workspaceRoot, rel);
    files.push({ rel, action: (await fileExists(abs)) ? "modify" : "create", reason: "compiler-owned state file" });
  }
  return {
    profile: profile.id,
    outputDir,
    files,
    conflicts,
    readiness: report.readiness,
    blockers: report.blockers,
    ...(report.readiness === "invalid" ? { error: `spec is invalid: ${report.blockers.join("; ")}` } : {}),
  };
}

export async function applyExport(
  workspaceRoot: string,
  spec: Spec,
  opts: { authorizeOverwrite?: string[]; artifacts?: string[] } = {},
): Promise<ExportApplyResult> {
  // Revalidate immediately before writing (fail-closed)
  const report = validateSpec(spec);
  if (report.readiness === "invalid") {
    throw new Error(`export refused: spec is invalid (${report.blockers.join("; ")})`);
  }
  const preview = await previewExport(workspaceRoot, spec, opts.artifacts);
  const authorized = new Set((opts.authorizeOverwrite ?? []).map((s) => s.replace(/\\/g, "/")));
  for (const c of preview.conflicts) {
    if (!authorized.has(c)) {
      throw new Error(`export aborted: '${c}' exists and was not authorized. Re-run preview and pass authorizeOverwrite for that exact path.`);
    }
  }
  const artifacts = renderArtifacts(spec, opts.artifacts);
  const written: ExportApplyResult["written"] = [];
  const writtenAbs: string[] = [];
  try {
    for (const a of artifacts) {
      const rel = `${preview.outputDir}/${a.filename}`.replace(/\\/g, "/");
      const abs = await resolveInside(workspaceRoot, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      // Atomic write via temp + rename (same directory)
      const tmp = `${abs}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await fs.writeFile(tmp, a.content, "utf8");
        // Verify content round-trip before rename
        const back = await fs.readFile(tmp, "utf8");
        if (back !== a.content) throw new Error(`round-trip verification failed for ${rel}`);
        await fs.rename(tmp, abs);
      } finally {
        try { await fs.unlink(tmp); } catch {}
      }
      written.push({ rel, bytes: Buffer.byteLength(a.content, "utf8"), hash: sha256(a.content) });
      writtenAbs.push(abs);
    }
    // Compiler-owned state
    const reportJson = JSON.stringify(report, null, 2) + "\n";
    const decisionsJson = buildDecisionsDoc(spec);
    for (const [rel, content] of [
      [".prd/validation-report.json", reportJson],
      [".prd/decisions.json", decisionsJson],
    ] as const) {
      const abs = await resolveInside(workspaceRoot, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      const tmp = `${abs}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await fs.writeFile(tmp, content, "utf8");
        JSON.parse(await fs.readFile(tmp, "utf8")); // validate structured output before rename
        await fs.rename(tmp, abs);
      } finally {
        try { await fs.unlink(tmp); } catch {}
      }
      written.push({ rel, bytes: Buffer.byteLength(content, "utf8"), hash: sha256(content) });
      writtenAbs.push(abs);
    }
    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      profile: preview.profile,
      outputDir: preview.outputDir,
      readiness: report.readiness,
      files: written.map((w) => ({ path: w.rel, sha256: w.hash, bytes: w.bytes })),
    };
    const manifestContent = JSON.stringify(manifest, null, 2) + "\n";
    const manifestAbs = await resolveInside(workspaceRoot, ".prd/export-manifest.json");
    await fs.mkdir(path.dirname(manifestAbs), { recursive: true });
    const mtmp = `${manifestAbs}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await fs.writeFile(mtmp, manifestContent, "utf8");
      JSON.parse(await fs.readFile(mtmp, "utf8"));
      await fs.rename(mtmp, manifestAbs);
    } finally {
      try { await fs.unlink(mtmp); } catch {}
    }
    // Post-write verification: every rendered file exists with expected hash
    for (const w of written.filter((x) => !x.rel.startsWith(".prd/") || x.rel === ".prd/validation-report.json" || x.rel === ".prd/decisions.json")) {
      const abs = await resolveInside(workspaceRoot, w.rel);
      const content = await fs.readFile(abs, "utf8");
      if (sha256(content) !== w.hash) throw new Error(`post-write verification failed for ${w.rel}`);
    }
    return { written, manifestPath: toWorkspaceRel(workspaceRoot, manifestAbs), skipped: [] };
  } catch (e) {
    // Safe failure: do not silently continue; report what was written. Rollback only temp files.
    throw new Error(`export failed after ${written.length} file(s): ${(e as Error).message}. Written files are left in place and listed in the error context; re-run after fixing the cause. Files: ${writtenAbs.map((a) => toWorkspaceRel(workspaceRoot, a)).join(", ")}`);
  }
}
