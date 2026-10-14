// Graft auto-rebuild plugin for OpenCode.
// Rebuilds the `graft/` context graph after code files change so the graph
// never drifts across sessions. Best-effort by design: a failed rebuild must
// never break editing.
//
// Installed by the Vibe Suite installer (see suite/suite.json for the pinned
// graft version; the GRAFT_PKG token below is substituted at install time).
// Host-execution note: written against the documented OpenCode plugin API
// (opencode.ai/docs/plugins, `file.edited` event). If your OpenCode build
// does not load project plugins, the universal-prd skill instructs the agent
// to run `graft build` manually instead.

import { existsSync } from "node:fs";
import { join } from "node:path";

const GRAFT_PKG = "__GRAFT_PKG__";

export const GraftRebuild = async (ctx: any) => {
  return {
    "file.edited": async (event: { path: string }) => {
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|dart|cs|php|rb|swift)$/.test(event.path || "")) return;
      const root = ctx && (ctx.worktree || ctx.directory);
      if (!root) return;
      // Only act in projects the suite wired up (graft/ marker present).
      if (!existsSync(join(root, "graft"))) return;
      try {
        await ctx.$`npx -y ${GRAFT_PKG} build`;
      } catch {
        // Swallow: graph rebuild is a cache refresh, never load-bearing for edits.
      }
    },
  };
};
