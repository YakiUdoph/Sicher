import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { canonicalJson } from "./phase6-evidence-core.ts";
import { validatePublicResultIndex, verifyPublicResultDocument, type PublicResultDocument, type PublicResultIndex } from "./phase10b-publication.ts";

export const RESULTS_BRANCH = "sicher-results";
export type StoreSnapshot = Readonly<{ index: PublicResultIndex; files: ReadonlyMap<string, string> }>;
export type PullRequestState = Readonly<{ number: number; headSha: string; baseSha: string; changedFiles: readonly string[] }>;

const normalize = (path: string) => path.replaceAll("\\", "/");
const receiptPaths = (index: PublicResultIndex) => Object.values(index.results).map(({ receiptPath }) => receiptPath).sort();

export function validateStoreSnapshot(indexValue: unknown, files: ReadonlyMap<string, string>): StoreSnapshot {
  const index = validatePublicResultIndex(indexValue);
  const expected = ["index.json", ...receiptPaths(index)].sort();
  const actual = [...files.keys()].map(normalize).sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error("Result store contains an unexpected, missing, or unindexed publication file.");
  for (const entry of Object.values(index.results)) {
    const raw = files.get(entry.receiptPath); if (raw === undefined) throw new Error(`Receipt document #${entry.commitmentId} is missing.`);
    const document = verifyPublicResultDocument(JSON.parse(raw));
    if (document.documentDigest !== entry.documentDigest || document.envelope.receipt.receiptDigest !== entry.receiptDigest || document.envelope.receipt.commitmentId !== entry.commitmentId) throw new Error(`Index and receipt document #${entry.commitmentId} disagree.`);
  }
  return Object.freeze({ index, files: new Map(files) });
}

export async function readStoreDirectory(root: string): Promise<StoreSnapshot> {
  const indexText = await readFile(join(root, "index.json"), "utf8");
  const indexValue = JSON.parse(indexText) as unknown;
  const index = validatePublicResultIndex(indexValue);
  const files = new Map<string, string>([["index.json", indexText]]);
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

export function validatePublicationTransition(before: StoreSnapshot, after: StoreSnapshot): { newId: string | null; changedFiles: readonly string[] } {
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
  const permitted = new Set(["index.json", ...(newId ? [after.index.results[newId].receiptPath] : [])]);
  const allPaths = new Set([...before.files.keys(), ...after.files.keys()]);
  const changed = [...allPaths].filter((path) => before.files.get(path) !== after.files.get(path)).sort();
  if (changed.some((path) => !permitted.has(path))) throw new Error("Publication PR changes an unexpected file.");
  if (newId && canonicalJson(changed) !== canonicalJson(["index.json", after.index.results[newId].receiptPath].sort())) throw new Error("New publication must change only its index and content-addressed receipt.");
  return Object.freeze({ newId, changedFiles: Object.freeze(changed) });
}

export function validatePullRequestState(input: { expectedTargetSha: string; currentTargetSha: string; expectedHeadSha: string; pull: PullRequestState; before: StoreSnapshot; after: StoreSnapshot }): { newId: string; changedFiles: readonly string[] } {
  if (input.currentTargetSha !== input.expectedTargetSha || input.pull.baseSha !== input.expectedTargetSha) throw new Error("Target branch head changed unexpectedly.");
  if (input.pull.headSha !== input.expectedHeadSha) throw new Error("Pull request head changed unexpectedly.");
  const transition = validatePublicationTransition(input.before, input.after);
  if (!transition.newId) throw new Error("Publication PR contains no new terminal result.");
  const listed = [...input.pull.changedFiles].map(normalize).sort();
  if (canonicalJson(listed) !== canonicalJson([...transition.changedFiles].sort())) throw new Error("Pull request changed-file list does not match the validated publication transition.");
  return { newId: transition.newId, changedFiles: transition.changedFiles };
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

export async function publishThroughProtectedPullRequest(input: { api: GitHubPublicationApi; temporaryBranch: string; expectedTargetSha: string; expectedHeadSha: string }): Promise<{ pullNumber: number; mergeSha: string; newId: string }> {
  let pullNumber: number | undefined; let merged = false;
  try {
    const before = await input.api.loadStore(input.expectedTargetSha);
    const candidate = await input.api.loadStore(input.expectedHeadSha);
    const initial = validatePublicationTransition(before, candidate);
    if (!initial.newId) throw new Error("No new terminal result to publish.");
    const preOpenTargetSha = await input.api.getBranchHead(RESULTS_BRANCH);
    if (preOpenTargetSha !== input.expectedTargetSha) throw new Error("Target branch head changed before pull request creation.");
    pullNumber = await input.api.openPullRequest({ head: input.temporaryBranch, base: RESULTS_BRANCH, title: `chore(results): publish commitment #${initial.newId}`, body: "Automated publication from the frozen off-browser verifier. This PR must contain exactly one content-addressed result and its index update." });
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
