import "dotenv/config";
import { Buffer } from "node:buffer";
import { RESULTS_BRANCH, publishThroughProtectedPullRequest, validateStoreSnapshot, type GitHubPublicationApi, type PullRequestState, type StoreSnapshot } from "./phase10b-pr-publication.ts";

const token = process.env.GITHUB_TOKEN?.trim(); const repository = process.env.GITHUB_REPOSITORY?.trim();
const temporaryBranch = process.env.PHASE10B_TEMPORARY_BRANCH?.trim(); const expectedTargetSha = process.env.PHASE10B_EXPECTED_TARGET_SHA?.trim(); const expectedHeadSha = process.env.PHASE10B_EXPECTED_HEAD_SHA?.trim();
if (!token || !repository || !temporaryBranch || !expectedTargetSha || !expectedHeadSha) throw new Error("GitHub PR publication environment is incomplete.");
if (!temporaryBranch.startsWith("sicher-results-publish-")) throw new Error("Unexpected temporary publication branch name.");
const apiBase = process.env.GITHUB_API_URL?.trim() || "https://api.github.com";
async function request(path: string, init: RequestInit = {}, acceptedStatuses: readonly number[] = []): Promise<any> {
  const response = await fetch(`${apiBase}/repos/${repository}${path}`, { ...init, headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", ...init.headers }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok && !acceptedStatuses.includes(response.status)) throw new Error(`GitHub API ${init.method ?? "GET"} ${path} failed with ${response.status}.`);
  return response.status === 204 || acceptedStatuses.includes(response.status) ? undefined : response.json();
}
async function loadStore(commitSha: string): Promise<StoreSnapshot> {
  const tree = await request(`/git/trees/${encodeURIComponent(commitSha)}?recursive=1`) as { truncated?: boolean; tree: Array<{ path: string; type: string; sha: string }> };
  if (tree.truncated) throw new Error("GitHub returned a truncated result-store tree.");
  if (tree.tree.some((item) => item.path.startsWith("receipts/") && item.type !== "blob" && item.type !== "tree")) throw new Error("Result store contains an unsupported Git object.");
  const publicationBlobs = tree.tree.filter((item) => item.type === "blob" && (item.path === "index.json" || item.path.startsWith("receipts/")));
  const files = new Map<string, string>();
  for (const item of publicationBlobs) { const blob = await request(`/git/blobs/${item.sha}`) as { content: string; encoding: string }; if (blob.encoding !== "base64") throw new Error("Unexpected GitHub blob encoding."); files.set(item.path, Buffer.from(blob.content.replace(/\s/g, ""), "base64").toString("utf8")); }
  const indexText = files.get("index.json"); if (!indexText) throw new Error("Result index is missing from Git commit.");
  return validateStoreSnapshot(JSON.parse(indexText), files);
}
const api: GitHubPublicationApi = {
  async getBranchHead(branch) { const value = await request(`/git/ref/heads/${encodeURIComponent(branch)}`) as { object: { sha: string } }; return value.object.sha; },
  loadStore,
  async openPullRequest(input) { const value = await request("/pulls", { method: "POST", body: JSON.stringify(input) }) as { number: number }; return value.number; },
  async getPullRequest(number) { const value = await request(`/pulls/${number}`) as { head: { sha: string }; base: { sha: string } }; const files: string[] = []; for (let page = 1; ; page += 1) { const batch = await request(`/pulls/${number}/files?per_page=100&page=${page}`) as Array<{ filename: string }>; files.push(...batch.map(({ filename }) => filename)); if (batch.length < 100) break; } return { number, headSha: value.head.sha, baseSha: value.base.sha, changedFiles: files } satisfies PullRequestState; },
  async mergePullRequest(number, headSha) { const value = await request(`/pulls/${number}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash", sha: headSha }) }) as { merged: boolean; sha: string }; return value; },
  async closePullRequest(number) { await request(`/pulls/${number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) }); },
  async deleteBranch(branch) { await request(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: "DELETE" }, [404]); },
};
const result = await publishThroughProtectedPullRequest({ api, temporaryBranch, expectedTargetSha, expectedHeadSha });
console.log(`pull=${result.pullNumber} commitment=${result.newId} merge=${result.mergeSha}`);
