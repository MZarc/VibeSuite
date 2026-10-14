#!/usr/bin/env node
import { runStdio } from "../mcp/server.js";

const workspace = process.env.PRD_WORKSPACE || process.env.UNIVERSAL_PRD_WORKSPACE;
runStdio(workspace).catch((e) => {
  process.stderr.write(`[universal-prd] fatal: ${(e as Error).message}\n`);
  process.exit(1);
});
