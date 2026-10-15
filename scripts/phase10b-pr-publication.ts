import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { canonicalJson } from "./phase6-evidence-core.ts";
import { validatePublicResultIndex, verifyPublicResultDocument, type PublicResultDocument, type PublicResultIndex } from "./phase10b-publication.ts";
import { emptySchedulerState, retryDelayMilliseconds, SCHEDULER_PATH, validateSchedulerState, type SchedulerState } from "./phase10b-scheduler.ts";

export const RESULTS_BRANCH = "sicher-results";
export type StoreSnapshot = Readonly<{ index: PublicResultIndex; scheduler: SchedulerState; hasSchedulerFile: boolean; files: ReadonlyMap<string, string> }>;
export type PullRequestState = Readonly<{ number: number; headSha: string; baseSha: string; changedFiles: readonly string[] }>;
export type PublicationTransition = Readonly<{ newId: string | null; changedFiles: readonly string[]; schedulerChanged: boolean }>;

const normalize = (path: string) => path.replaceAll("\\", "/");
const receiptPaths = (index: PublicResultIndex) => Object.values(index.results).map(({ receiptPath }) => receiptPath).sort();

export function validateStoreSnapshot(indexValue: unknown, files: ReadonlyMap<string, string>): StoreSnapshot {
  const index = validatePublicResultIndex(indexValue);
  const schedulerText = files.get(SCHEDULER_PATH); const hasSchedulerFile = schedulerText !== undefined;
  const scheduler = hasSchedulerFile ? validateSchedulerState(JSON.parse(schedulerText)) : emptySchedulerState();
  const expected = ["index.json", ...(hasSchedulerFile ? [SCHEDULER_PATH] : []), ...receiptPaths(index)].sort();
  const actual = [...files.keys()].map(normalize).sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error("Result store contains an unexpected, missing, or unindexed publication file.");
  for (const entry of Object.values(index.results)) {
    const raw = files.get(entry.receiptPath); if (raw === undefined) throw new Error(`Receipt document #${entry.commitmentId} is missing.`);
    const document = verifyPublicResultDocument(JSON.parse(raw));
    if (document.documentDigest !== entry.documentDigest || document.envelope.receipt.receiptDigest !== entry.receiptDigest || document.envelope.receipt.commitmentId !== entry.commitmentId) throw new Error(`Index and receipt document #${entry.commitmentId} disagree.`);
  }
  return Object.freeze({ index, scheduler, hasSchedulerFile, files: new Map(files) });
}

export async function readStoreDirectory(root: string): Promise<StoreSnapshot> {
  const indexText = await readFile(join(root, "index.json"), "utf8");
  const indexValue = JSON.parse(indexText) as unknown;
  const index = validatePublicResultIndex(indexValue);
  const files = new Map<string, string>([["index.json", indexText]]);
  try { files.set(SCHEDULER_PATH, await readFile(join(root, SCHEDULER_PATH), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const receiptRoot = join(root, "receipts");
  async function walk(directory: string): Promise<void> {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, item.name);
      if (item.isDirectory()) await walk(absolute);
      else files.set(normalize(relative(root, absolute)), await readFile(absolute, "utf8"));
    }
  }
  await walk(receiptRoot);
  return validateStoreSnapshot(index, files);
}

function validateSchedulerTransition(before: StoreSnapshot, after: StoreSnapshot, newId: string | null): boolean {
  const changed = canonicalJson(before.scheduler) !== canonicalJson(after.scheduler) || before.hasSchedulerFile !== after.hasSchedulerFile;
  if (before.hasSchedulerFile && !after.hasSchedulerFile) throw new Error("Scheduler state cannot be deleted.");
  const ids = new Set([...Object.keys(before.scheduler.failures), ...Object.keys(after.scheduler.failures)]);
  const changedFailures = [...ids].filter((id) => canonicalJson(before.scheduler.failures[id] ?? null) !== canonicalJson(after.scheduler.failures[id] ?? null));
  if (changedFailures.length > 1) throw new Error("A scheduler transition may update at most one attempted commitment.");
  const changedId = changedFailures[0];
  if (changedId) {
    const prior = before.scheduler.failures[changedId]; const next = after.scheduler.failures[changedId];
    if (!next) {
      if (newId !== changedId) throw new Error("Scheduler failure metadata can be removed only by publication of that commitment.");
    } else {
      if (newId) throw new Error("A successful publication cannot also record a failed attempt.");
      if (next.attempts !== (prior?.attempts ?? 0) + 1) throw new Error("Scheduler attempt count must increase exactly once.");
      if (prior && Date.parse(next.lastAttemptAt) <= Date.parse(prior.lastAttemptAt)) throw new Error("Scheduler attempt time must advance.");
      const expectedNext = new Date(Date.parse(next.lastAttemptAt) + retryDelayMilliseconds(next.classification, next.attempts)).toISOString();
      if (next.nextAttemptAt !== expectedNext) throw new Error("Scheduler retry time does not match policy.");
      if (after.scheduler.cursorAfterId !== changedId) throw new Error("Scheduler cursor must advance to the attempted commitment.");
    }
  }
  if (newId) {
    if (!changed || after.scheduler.cursorAfterId !== newId || after.scheduler.failures[newId]) throw new Error("Result publication must atomically advance scheduler state and clear its failure metadata.");
  } else if (before.scheduler.cursorAfterId !== after.scheduler.cursorAfterId && !changedId) throw new Error("Scheduler cursor changed without a corresponding attempt.");
  return changed;
}

export function validatePublicationTransition(before: StoreSnapshot, after: StoreSnapshot): PublicationTransition {
  if (before.index.automation.operational !== after.index.automation.operational) throw new Error("Publication PR cannot change automation activation state.");
  const beforeIds = Object.keys(before.index.results); const afterIds = Object.keys(after.index.results);
  for (const id of beforeIds) {
    if (!after.index.results[id]) throw new Error(`Existing result #${id} was deleted.`);
    if (canonicalJson(before.index.results[id]) !== canonicalJson(after.index.results[id])) throw new Error(`Existing result #${id} was modified or remapped.`);
    const path = before.index.results[id].receiptPath;
    if (before.files.get(path) !== after.files.get(path)) throw new Error(`Existing receipt document #${id} changed.`);
  }
  const newIds = afterIds.filter((id) => !before.index.results[id]);
  if (newIds.length > 1) throw new Error("A publication PR may add at most one terminal result.");
  const newId = newIds[0] ?? null;
  const schedulerChanged = validateSchedulerTransition(before, after, newId);
  const permitted = new Set(["index.json", SCHEDULER_PATH, ...(newId ? [after.index.results[newId].receiptPath] : [])]);
  const allPaths = new Set([...before.files.keys(), ...after.files.keys()]);
  const changed = [...allPaths].filter((path) => before.files.get(path) !== after.files.get(path)).sort();
  if (changed.some((path) => !permitted.has(path))) throw new Error("Publication PR changes an unexpected file.");
  if (newId && canonicalJson(changed) !== canonicalJson(["index.json", SCHEDULER_PATH, after.index.results[newId].receiptPath].sort())) throw new Error("New publication must atomically change only its index, scheduler, and content-addressed receipt.");
  if (!newId && changed.length > 0 && canonicalJson(changed) !== canonicalJson([SCHEDULER_PATH])) throw new Error("A scheduler-only PR may change only scheduler.json.");
  if (changed.length === 0 || (!newId && !schedulerChanged)) throw new Error("Publication PR contains no validated result or scheduler transition.");
  return Object.freeze({ newId, changedFiles: Object.freeze(changed), schedulerChanged });
}

export function validatePullRequestState(input: { expectedTargetSha: string; currentTargetSha: string; expectedHeadSha: string; pull: PullRequestState; before: StoreSnapshot; after: StoreSnapshot }): PublicationTransition {
  if (input.currentTargetSha !== input.expectedTargetSha || input.pull.baseSha !== input.expectedTargetSha) throw new Error("Target branch head changed unexpectedly.");
  if (input.pull.headSha !== input.expectedHeadSha) throw new Error("Pull request head changed unexpectedly.");
  const transition = validatePublicationTransition(input.before, input.after);
  const listed = [...input.pull.changedFiles].map(normalize).sort();
  if (canonicalJson(listed) !== canonicalJson([...transition.changedFiles].sort())) throw new Error("Pull request changed-file list does not match the validated publication transition.");
  return transition;
}

export interface GitHubPublicationApi {
  getBranchHead(branch: string): Promise<string>;
  loadStore(commitSha: string): Promise<StoreSnapshot>;
  openPullRequest(input: { head: string; base: string; title: string; body: string }): Promise<number>;
  getPullRequest(number: number): Promise<PullRequestState>;
  mergePullRequest(number: number, headSha: string): Promise<{ merged: boolean; sha: string }>;
  closePullRequest(number: number): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
}

export async function publishThroughProtectedPullRequest(input: { api: GitHubPublicationApi; temporaryBranch: string; expectedTargetSha: string; expectedHeadSha: string }): Promise<{ pullNumber: number; mergeSha: string; newId: string | null }> {
  let pullNumber: number | undefined; let merged = false;
  try {
    const before = await input.api.loadStore(input.expectedTargetSha);
    const candidate = await input.api.loadStore(input.expectedHeadSha);
    const initial = validatePublicationTransition(before, candidate);
    const preOpenTargetSha = await input.api.getBranchHead(RESULTS_BRANCH);
    if (preOpenTargetSha !== input.expectedTargetSha) throw new Error("Target branch head changed before pull request creation.");
    pullNumber = await input.api.openPullRequest({ head: input.temporaryBranch, base: RESULTS_BRANCH, title: initial.newId ? `chore(results): publish commitment #${initial.newId}` : "chore(results): advance verification scheduler", body: initial.newId ? "Automated publication from the frozen off-browser verifier. This PR must contain exactly one content-addressed result and its atomic scheduler transition." : "Automated non-terminal scheduler progression. This PR must contain only validated scheduler state and cannot publish a result." });
    const currentTargetSha = await input.api.getBranchHead(RESULTS_BRANCH);
    const pull = await input.api.getPullRequest(pullNumber);
    const refreshedBefore = await input.api.loadStore(currentTargetSha);
    const refreshedCandidate = await input.api.loadStore(pull.headSha);
    const checked = validatePullRequestState({ expectedTargetSha: input.expectedTargetSha, currentTargetSha, expectedHeadSha: input.expectedHeadSha, pull, before: refreshedBefore, after: refreshedCandidate });
    const result = await input.api.mergePullRequest(pullNumber, input.expectedHeadSha);
    if (!result.merged) throw new Error("GitHub refused the protected squash merge.");
    merged = true;
    const resultingHead = await input.api.getBranchHead(RESULTS_BRANCH);
    if (resultingHead !== result.sha) throw new Error("Result branch head does not match the reported squash merge commit.");
    const mergedStore = await input.api.loadStore(resultingHead);
    validatePublicationTransition(before, mergedStore);
    return { pullNumber, mergeSha: result.sha, newId: checked.newId };
  } catch (error) {
    if (pullNumber !== undefined && !merged) await input.api.closePullRequest(pullNumber).catch(() => undefined);
    throw error;
  } finally { await input.api.deleteBranch(input.temporaryBranch); }
}
