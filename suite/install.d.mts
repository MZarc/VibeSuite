export function unionTextLines(original: string, current: string): string;
export const LOCK_NAME: string;
export interface DoctorExpect {
  graft: boolean;
  hallmark: boolean;
  prd: boolean;
}
export interface DoctorResult {
  ok: boolean;
  checks: { id: string; title: string; ok: boolean; detail: string }[];
  problems: string[];
  warnings: string[];
}
export function writeLockfile(target: string, components: unknown[]): Promise<unknown>;
export function readLockfile(target: string): Promise<unknown | null>;
export function doctorSuite(
  target: string,
  expect?: DoctorExpect,
  opts?: { checkLock?: boolean },
): Promise<DoctorResult>;
export function fetchLatest(): Promise<unknown>;
export function comparePins(latest: unknown): {
  id: string;
  pinned: string;
  latest: string;
  stale: boolean;
}[];
export function dedupeFenceBlocks(text: string, start?: string, end?: string): string;
export function mergeAgentsMd(backupOrNull: string | null, current: string): string;
export function validateSkillFrontmatter(
  skillDirName: string,
  raw: string,
): { errs: string[]; bodyLines: number };
export function mergeMcpEntry(
  kind: "opencode" | "antigravity",
  existing: Record<string, unknown>,
  key: string,
  entry: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any;
export function renderTemplate(text: string, vars: Record<string, string>): string;
export function mergePluginEntry(existing: Record<string, unknown>, entry: string): any;
