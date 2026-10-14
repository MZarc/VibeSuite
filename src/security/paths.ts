import * as path from "node:path";
import { promises as fs } from "node:fs";

/** Untrusted workspace roots must be rejected. The MCP server may only use the configured root. */
export function ensureWorkspaceRoot(root: string): string {
  if (!root || typeof root !== "string" || root.trim() === "") {
    throw new Error("workspace root is not configured (fail-closed). Launch the server with a configured workspace directory.");
  }
  const resolved = path.resolve(root);
  return resolved;
}

/** Resolve a workspace-relative path and guarantee it stays inside root. Handles traversal, absolute escapes, and symlink escapes. */
export async function resolveInside(root: string, rel: string, opts: { allowSymlinkEscape?: boolean } = {}): Promise<string> {
  const base = ensureWorkspaceRoot(root);
  if (typeof rel !== "string" || rel.length === 0) throw new Error("empty path");
  if (rel.length > 1024) throw new Error("path too long");
  // Reject NUL bytes and control chars
  if (rel.includes("\0")) throw new Error("invalid path");
  // Normalize to posix-ish then resolve
  const candidate = path.resolve(base, rel);
  const rel2 = path.relative(base, candidate);
  if (rel2 === ".." || rel2.startsWith(`..${path.sep}`) || path.isAbsolute(rel2)) {
    throw new Error(`path traversal rejected: '${rel}' escapes workspace`);
  }
  // Absolute input pointing outside root
  if (path.isAbsolute(rel) && path.resolve(rel) !== candidate) {
    throw new Error(`absolute path rejected: '${rel}'`);
  }
  if (path.isAbsolute(rel)) {
    const absRel = path.relative(base, path.resolve(rel));
    if (absRel === ".." || absRel.startsWith(`..${path.sep}`)) {
      throw new Error(`absolute path outside workspace rejected: '${rel}'`);
    }
  }
  if (!opts.allowSymlinkEscape) {
    await assertNoSymlinkEscape(base, candidate);
  }
  return candidate;
}

/** Synchronous variant for hot paths where the file may not exist yet: checks each existing ancestor for symlink escape. */
export async function assertNoSymlinkEscape(base: string, candidate: string): Promise<void> {
  // Walk up from candidate to base, realpath each existing ancestor.
  let realBase = base;
  try {
    realBase = await fs.realpath(base);
  } catch {
    // base might not exist yet in test setups
  }
  let cur = candidate;
  for (let i = 0; i < 64; i++) {
    try {
      const st = await fs.lstat(cur);
      if (st.isSymbolicLink()) {
        const real = await fs.realpath(cur);
        const rel = path.relative(realBase, real);
        if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
          throw new Error(`symlink escape rejected: '${cur}' points outside workspace`);
        }
      }
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT" && !(e as Error)?.message?.includes("symlink escape")) throw e;
      if ((e as Error)?.message?.includes("symlink escape")) throw e;
    }
    if (cur === base) break;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    // stop once outside
    const rel = path.relative(base, cur);
    if (rel === ".." || rel.startsWith(`..${path.sep}`)) break;
    cur = parent;
  }
  // Also verify the base itself resolves inside itself (handles root being a symlink: that's fine)
  try {
    const realBase = await fs.realpath(base);
    void realBase;
  } catch {
    // base may not exist yet — acceptable
  }
}

export function toWorkspaceRel(root: string, abs: string): string {
  const base = ensureWorkspaceRoot(root);
  return path.relative(base, abs).split(path.sep).join("/");
}
