import { readFile, rename, writeFile } from "node:fs/promises";

import { canonicalJson, sha256Canonical } from "./phase6-evidence-core.ts";
import type { PublicResultEntry } from "./phase10b-publication.ts";
import {
  recordAttemptFailure,
  recordAttemptSuccess,
  recordScanIssues,
  validateSchedulerState,
  type FailureClassification,
  type IsolatedScanIssue,
  type SchedulerSnapshot,
  type SchedulerState,
} from "./phase10b-scheduler.ts";

export const PHASE10B_TRANSITION_SCHEMA = "sicher.expected-publication-transition/1.0" as const;

export type ExpectedTransitionOutcome =
  | Readonly<{ kind: "NO_CANDIDATE" }>
  | Readonly<{ kind: "FAILURE"; classification: FailureClassification; code: string }>
  | Readonly<{ kind: "SUCCESS"; entry: PublicResultEntry }>;

export type ExpectedPublicationTransition = Readonly<{
  schemaVersion: typeof PHASE10B_TRANSITION_SCHEMA;
  priorSchedulerDigest: string;
  observedAt: string;
  scanIssues: readonly IsolatedScanIssue[];
  candidateId: string | null;
  outcome: ExpectedTransitionOutcome;
}>;

const digest = /^[0-9a-f]{64}$/;
const positiveId = /^[1-9][0-9]*$/;
const code = /^[A-Z][A-Z0-9_]{2,63}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
const validTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

export function schedulerSnapshotDigest(snapshot: SchedulerSnapshot): string {
  return sha256Canonical({ hasSchedulerFile: snapshot.hasSchedulerFile, scheduler: snapshot.scheduler });
}

export function createExpectedPublicationTransition(input: {
  prior: SchedulerSnapshot;
  observedAt: string;
  scanIssues: readonly IsolatedScanIssue[];
  candidateId: string | null;
  outcome: ExpectedTransitionOutcome;
}): ExpectedPublicationTransition {
  return validateExpectedPublicationTransition({
    schemaVersion: PHASE10B_TRANSITION_SCHEMA,
    priorSchedulerDigest: schedulerSnapshotDigest(input.prior),
    observedAt: input.observedAt,
    scanIssues: input.scanIssues,
    candidateId: input.candidateId,
    outcome: input.outcome,
  });
}

export function validateExpectedPublicationTransition(value: unknown): ExpectedPublicationTransition {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "priorSchedulerDigest", "observedAt", "scanIssues", "candidateId", "outcome"]) || value.schemaVersion !== PHASE10B_TRANSITION_SCHEMA || typeof value.priorSchedulerDigest !== "string" || !digest.test(value.priorSchedulerDigest) || !validTime(value.observedAt) || !Array.isArray(value.scanIssues) || !record(value.outcome)) throw new Error("Expected publication transition is malformed.");
  const issues = value.scanIssues as unknown[];
  const seen = new Set<string>();
  for (const raw of issues) {
    if (!record(raw) || !exactKeys(raw, ["id", "classification", "code"]) || typeof raw.id !== "string" || !positiveId.test(raw.id) || seen.has(raw.id) || (raw.classification !== "TRANSIENT" && raw.classification !== "UNRESOLVED") || typeof raw.code !== "string" || !code.test(raw.code)) throw new Error("Expected scan issue is malformed.");
    seen.add(raw.id);
  }
  if (value.candidateId !== null && (typeof value.candidateId !== "string" || !positiveId.test(value.candidateId))) throw new Error("Expected candidate ID is malformed.");
  const outcome = value.outcome;
  if (outcome.kind === "NO_CANDIDATE") {
    if (!exactKeys(outcome, ["kind"]) || value.candidateId !== null) throw new Error("No-candidate transition is malformed.");
  } else if (outcome.kind === "FAILURE") {
    if (!exactKeys(outcome, ["kind", "classification", "code"]) || value.candidateId === null || (outcome.classification !== "TRANSIENT" && outcome.classification !== "UNRESOLVED") || typeof outcome.code !== "string" || !code.test(outcome.code)) throw new Error("Expected failure transition is malformed.");
  } else if (outcome.kind === "SUCCESS") {
    if (!exactKeys(outcome, ["kind", "entry"]) || value.candidateId === null || !record(outcome.entry) || outcome.entry.commitmentId !== value.candidateId) throw new Error("Expected success transition is malformed.");
  } else throw new Error("Expected publication outcome is malformed.");
  const frozenIssues = Object.freeze(issues.map((raw) => Object.freeze({ ...(raw as IsolatedScanIssue) })));
  const frozenOutcome: ExpectedTransitionOutcome = outcome.kind === "SUCCESS"
    ? Object.freeze({ kind: "SUCCESS", entry: Object.freeze({ ...(outcome.entry as PublicResultEntry) }) })
    : outcome.kind === "FAILURE"
      ? Object.freeze({ kind: "FAILURE", classification: outcome.classification as FailureClassification, code: outcome.code as string })
      : Object.freeze({ kind: "NO_CANDIDATE" });
  return Object.freeze({ schemaVersion: PHASE10B_TRANSITION_SCHEMA, priorSchedulerDigest: value.priorSchedulerDigest, observedAt: value.observedAt, scanIssues: frozenIssues, candidateId: value.candidateId as string | null, outcome: frozenOutcome });
}

export function deriveExpectedSchedulerState(before: SchedulerSnapshot, rawExpected: unknown): Readonly<{ expected: ExpectedPublicationTransition; scheduler: SchedulerState }> {
  const expected = validateExpectedPublicationTransition(rawExpected);
  validateSchedulerState(before.scheduler);
  if (schedulerSnapshotDigest(before) !== expected.priorSchedulerDigest) throw new Error("Expected transition does not match the authoritative prior scheduler state.");
  let scheduler = recordScanIssues(before.scheduler, expected.scanIssues, expected.observedAt);
  if (expected.outcome.kind === "FAILURE") scheduler = recordAttemptFailure({ scheduler, id: expected.candidateId!, classification: expected.outcome.classification, code: expected.outcome.code, attemptedAt: expected.observedAt });
  if (expected.outcome.kind === "SUCCESS") scheduler = recordAttemptSuccess(scheduler, expected.candidateId!);
  return Object.freeze({ expected, scheduler });
}

export async function writeExpectedPublicationTransition(path: string, expected: ExpectedPublicationTransition): Promise<void> {
  const checked = validateExpectedPublicationTransition(expected);
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(checked, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

export async function readExpectedPublicationTransition(path: string): Promise<ExpectedPublicationTransition> {
  return validateExpectedPublicationTransition(JSON.parse(await readFile(path, "utf8")));
}
