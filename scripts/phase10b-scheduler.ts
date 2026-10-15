import type { RegistryCommitment, RegistrySnapshot } from "../frontend/src/registryDiscovery.ts";
import { STEST_ADDRESS } from "../frontend/src/chainConfig.js";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PublicResultIndex } from "./phase10b-publication.ts";

export const PHASE10B_SCHEDULER_SCHEMA = "sicher.result-scheduler/1.0" as const;
export const SCHEDULER_PATH = "scheduler.json" as const;

export type FailureClassification = "TRANSIENT" | "UNRESOLVED";
export type SchedulerFailure = Readonly<{
  attempts: number;
  classification: FailureClassification;
  code: string;
  lastAttemptAt: string;
  nextAttemptAt: string;
}>;
export type SchedulerScanIssue = Readonly<{
  classification: FailureClassification;
  code: string;
  observedAt: string;
}>;
export type SchedulerState = Readonly<{
  schemaVersion: typeof PHASE10B_SCHEDULER_SCHEMA;
  cursorAfterId: string;
  failures: Readonly<Record<string, SchedulerFailure>>;
  scanIssues: Readonly<Record<string, SchedulerScanIssue>>;
}>;

export type IsolatedScanIssue = Readonly<{ id: string; classification: FailureClassification; code: string }>;
export type IsolatedRegistrySnapshot = RegistrySnapshot & Readonly<{ issues: readonly IsolatedScanIssue[] }>;

const canonicalId = /^(0|[1-9][0-9]*)$/;
const positiveId = /^[1-9][0-9]*$/;
const code = /^[A-Z][A-Z0-9_]{2,63}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const validTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

export function emptySchedulerState(): SchedulerState {
  return Object.freeze({ schemaVersion: PHASE10B_SCHEDULER_SCHEMA, cursorAfterId: "0", failures: Object.freeze({}), scanIssues: Object.freeze({}) });
}

export async function readSchedulerState(storeRoot: string): Promise<SchedulerState> {
  try { return validateSchedulerState(JSON.parse(await readFile(join(storeRoot, SCHEDULER_PATH), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptySchedulerState(); throw error; }
}

export async function writeSchedulerState(storeRoot: string, scheduler: SchedulerState): Promise<void> {
  const checked = validateSchedulerState(scheduler);
  const path = join(storeRoot, SCHEDULER_PATH); const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(checked, null, 2)}\n`, "utf8"); await rename(temp, path);
}

export function validateSchedulerState(value: unknown): SchedulerState {
  if (!record(value) || value.schemaVersion !== PHASE10B_SCHEDULER_SCHEMA || typeof value.cursorAfterId !== "string" || !canonicalId.test(value.cursorAfterId) || !record(value.failures) || !record(value.scanIssues)) throw new Error("Result scheduler state is malformed.");
  for (const [id, raw] of Object.entries(value.failures)) {
    if (!positiveId.test(id) || !record(raw) || !Number.isSafeInteger(raw.attempts) || Number(raw.attempts) < 1 || (raw.classification !== "TRANSIENT" && raw.classification !== "UNRESOLVED") || typeof raw.code !== "string" || !code.test(raw.code) || !validTime(raw.lastAttemptAt) || !validTime(raw.nextAttemptAt) || Date.parse(raw.nextAttemptAt) <= Date.parse(raw.lastAttemptAt)) throw new Error(`Scheduler failure #${id} is malformed.`);
  }
  for (const [id, raw] of Object.entries(value.scanIssues)) {
    if (!positiveId.test(id) || !record(raw) || (raw.classification !== "TRANSIENT" && raw.classification !== "UNRESOLVED") || typeof raw.code !== "string" || !code.test(raw.code) || !validTime(raw.observedAt)) throw new Error(`Scheduler scan issue #${id} is malformed.`);
  }
  return value as unknown as SchedulerState;
}

export function selectFairCandidate(input: { snapshot: RegistrySnapshot; index: PublicResultIndex; scheduler: SchedulerState; now: string; manualCommitmentId?: string }): RegistryCommitment | undefined {
  if (!validTime(input.now)) throw new Error("Scheduler time is invalid.");
  const eligible = (item: RegistryCommitment) => BigInt(item.endBlock) < input.snapshot.head && item.token.toLowerCase() === STEST_ADDRESS.toLowerCase() && !input.index.results[item.id];
  if (input.manualCommitmentId !== undefined && input.manualCommitmentId !== "") {
    if (!positiveId.test(input.manualCommitmentId)) throw new Error("Manual commitment ID must be a canonical positive integer.");
    const selected = input.snapshot.commitments.find((item) => item.id === input.manualCommitmentId);
    if (!selected) throw new Error(`Manual commitment #${input.manualCommitmentId} does not exist in the agreed finalized registry snapshot.`);
    if (input.index.results[selected.id]) throw new Error(`Manual commitment #${selected.id} is already published.`);
    if (selected.token.toLowerCase() !== STEST_ADDRESS.toLowerCase()) throw new Error(`Manual commitment #${selected.id} uses an unsupported token.`);
    if (BigInt(selected.endBlock) >= input.snapshot.head) throw new Error(`Manual commitment #${selected.id} has not ended at the finalized head.`);
    return selected;
  }
  const due = input.snapshot.commitments.filter(eligible).filter((item) => {
    const failure = input.scheduler.failures[item.id];
    return !failure || Date.parse(failure.nextAttemptAt) <= Date.parse(input.now);
  }).sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
  if (due.length === 0) return undefined;
  return due.find((item) => BigInt(item.id) > BigInt(input.scheduler.cursorAfterId)) ?? due[0];
}

const transientDelayHours = (attempts: number) => attempts <= 1 ? 6 : attempts === 2 ? 12 : 24;
export function retryDelayMilliseconds(classification: FailureClassification, attempts: number): number {
  return (classification === "UNRESOLVED" ? 7 * 24 : transientDelayHours(attempts)) * 60 * 60 * 1000;
}

export function classifyVerificationFailure(error: unknown, previousAttempts: number): Readonly<{ classification: FailureClassification; code: string }> {
  const message = error instanceof Error ? error.message : String(error);
  if (/disagreement|malformed|immutable|unsupported|fingerprint|receipt v3|digest mismatch/i.test(message)) return Object.freeze({ classification: "UNRESOLVED", code: "DETERMINISTIC_VERIFICATION_FAILURE" });
  if (previousAttempts + 1 >= 3 && !/timeout|timed out|429|rate limit|5\d\d|econn|fetch failed|temporar/i.test(message)) return Object.freeze({ classification: "UNRESOLVED", code: "REPEATED_VERIFICATION_FAILURE" });
  return Object.freeze({ classification: "TRANSIENT", code: "VERIFICATION_RETRY" });
}

export function recordAttemptFailure(input: { scheduler: SchedulerState; id: string; classification: FailureClassification; code: string; attemptedAt: string }): SchedulerState {
  if (!positiveId.test(input.id) || !validTime(input.attemptedAt) || !code.test(input.code)) throw new Error("Scheduler attempt failure input is malformed.");
  const attempts = (input.scheduler.failures[input.id]?.attempts ?? 0) + 1;
  const nextAttemptAt = new Date(Date.parse(input.attemptedAt) + retryDelayMilliseconds(input.classification, attempts)).toISOString();
  return validateSchedulerState({ ...input.scheduler, cursorAfterId: input.id, failures: { ...input.scheduler.failures, [input.id]: { attempts, classification: input.classification, code: input.code, lastAttemptAt: input.attemptedAt, nextAttemptAt } } });
}

export function recordAttemptSuccess(scheduler: SchedulerState, id: string): SchedulerState {
  if (!positiveId.test(id)) throw new Error("Scheduler success ID is malformed.");
  const failures = { ...scheduler.failures }; delete failures[id];
  return validateSchedulerState({ ...scheduler, cursorAfterId: id, failures });
}

export function recordScanIssues(scheduler: SchedulerState, issues: readonly IsolatedScanIssue[], observedAt: string): SchedulerState {
  if (!validTime(observedAt)) throw new Error("Scheduler scan observation time is invalid.");
  const scanIssues = Object.fromEntries(issues.map((issue) => {
    if (!positiveId.test(issue.id) || !code.test(issue.code)) throw new Error("Scanner diagnostic is malformed.");
    return [issue.id, { classification: issue.classification, code: issue.code, observedAt }];
  }));
  return validateSchedulerState({ ...scheduler, scanIssues });
}
