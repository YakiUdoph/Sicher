import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { emptyPublicResultIndex, publishValidatedResult, validatePublicResultIndex } from "./phase10b-publication.ts";
import { scanFinalizedRegistry } from "./phase10b-scanner.ts";
import { classifyVerificationFailure, readSchedulerSnapshot, recordAttemptFailure, recordAttemptSuccess, recordScanIssues, selectFairCandidate, writeSchedulerState } from "./phase10b-scheduler.ts";
import { createExpectedPublicationTransition, writeExpectedPublicationTransition, type ExpectedTransitionOutcome } from "./phase10b-transition-provenance.ts";
import { verifyOneCommitment } from "./phase10b-verify-one.ts";

function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required.`); return value; }
if (process.env.PHASE10B_RESULTS_BRANCH_PROTECTED !== "true") throw new Error("Publication disabled: protected results branch has not been attested.");
const root = required("PHASE10B_RESULTS_ROOT");
const expectedTransitionPath = required("PHASE10B_EXPECTED_TRANSITION_PATH");
let index = emptyPublicResultIndex();
try { index = validatePublicResultIndex(JSON.parse(await readFile(join(root, "index.json"), "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
if (index.results["1"]?.receiptDigest !== "2b1fa85d2dbd00729218bbe09d327cfc2349f20df02921185d8a2ec3c43fbece" || index.results["2"]?.receiptDigest !== "bd8e5cfa63ff862d4e0b1efc93c6ae2ac0800b01b6806a5ea5146880ce1b67f7") throw new Error("Results branch must be bootstrapped with the exact frozen #1/#2 receipts before automation is enabled.");
if (!index.automation.operational) throw new Error("Results index is inactive; activation is a separate explicit operation.");
if (Number(process.env.PHASE10B_MAX_RESULTS ?? "1") !== 1) throw new Error("Phase 10B permits exactly one successful result per run.");
const attemptedAt = new Date().toISOString();
const priorScheduler = await readSchedulerSnapshot(root);
const originalScheduler = priorScheduler.scheduler;
const snapshot = await scanFinalizedRegistry([required("PHASE6_RPC_A_URL"), required("PHASE6_RPC_B_URL")]);
const scanIssues = snapshot.issues.filter(({ id }) => !index.results[id]);
let scheduler = recordScanIssues(originalScheduler, scanIssues, attemptedAt);
const manualCommitmentId = process.env.PHASE10B_MANUAL_COMMITMENT_ID?.trim() || undefined;
const terms = selectFairCandidate({ snapshot, index, scheduler, now: attemptedAt, manualCommitmentId });
let outcome: ExpectedTransitionOutcome = Object.freeze({ kind: "NO_CANDIDATE" });
if (terms) {
  let candidate: Awaited<ReturnType<typeof verifyOneCommitment>> | undefined;
  try { candidate = await verifyOneCommitment({ terms }); }
  catch (error) {
    const classified = classifyVerificationFailure(error, scheduler.failures[terms.id]?.attempts ?? 0);
    scheduler = recordAttemptFailure({ scheduler, id: terms.id, ...classified, attemptedAt });
    await writeSchedulerState(root, scheduler);
    outcome = Object.freeze({ kind: "FAILURE", classification: classified.classification, code: classified.code });
    console.log(`commitment=${terms.id} publication=unresolved classification=${classified.classification} code=${classified.code}`);
  }
  if (candidate) {
    const publishedAt = new Date().toISOString();
    const status = await publishValidatedResult({ candidate, storeRoot: root, publishedAt });
    if (status !== "published") throw new Error("Selected unpublished commitment unexpectedly resolved as an idempotent publication.");
    scheduler = recordAttemptSuccess(scheduler, terms.id);
    await writeSchedulerState(root, scheduler);
    const receiptPath = `receipts/${candidate.entry.chainId}/${candidate.entry.registryAddress.toLowerCase()}/${terms.id}/${candidate.entry.receiptDigest}.json`;
    outcome = Object.freeze({ kind: "SUCCESS", entry: Object.freeze({ ...candidate.entry, receiptPath, publishedAt }) });
    console.log(`commitment=${terms.id} publication=${status} digest=${candidate.entry.receiptDigest}`);
  }
}
if (!terms && JSON.stringify(scheduler) !== JSON.stringify(originalScheduler)) await writeSchedulerState(root, scheduler);
await writeExpectedPublicationTransition(expectedTransitionPath, createExpectedPublicationTransition({ prior: priorScheduler, observedAt: attemptedAt, scanIssues, candidateId: terms?.id ?? null, outcome }));
console.log(`eligible=${terms ? 1 : 0} finalizedHead=${snapshot.head} isolatedScanIssues=${snapshot.issues.length}`);
