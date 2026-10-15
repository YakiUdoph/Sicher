import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { emptyPublicResultIndex, publishValidatedResult, validatePublicResultIndex } from "./phase10b-publication.ts";
import { scanFinalizedRegistry, selectCompletedVerificationJobs } from "./phase10b-scanner.ts";
import { verifyOneCommitment } from "./phase10b-verify-one.ts";

function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required.`); return value; }
if (process.env.PHASE10B_RESULTS_BRANCH_PROTECTED !== "true") throw new Error("Publication disabled: protected results branch has not been attested.");
const root = required("PHASE10B_RESULTS_ROOT");
let index = emptyPublicResultIndex();
try { index = validatePublicResultIndex(JSON.parse(await readFile(join(root, "index.json"), "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
if (index.results["1"]?.receiptDigest !== "2b1fa85d2dbd00729218bbe09d327cfc2349f20df02921185d8a2ec3c43fbece" || index.results["2"]?.receiptDigest !== "bd8e5cfa63ff862d4e0b1efc93c6ae2ac0800b01b6806a5ea5146880ce1b67f7") throw new Error("Results branch must be bootstrapped with the exact frozen #1/#2 receipts before automation is enabled.");
if (!index.automation.operational) throw new Error("Results index is inactive; activation is a separate explicit operation.");
const snapshot = await scanFinalizedRegistry([required("PHASE6_RPC_A_URL"), required("PHASE6_RPC_B_URL")]);
const jobs = selectCompletedVerificationJobs({ snapshot, index, limit: Number(process.env.PHASE10B_MAX_RESULTS ?? "1") });
for (const terms of jobs) {
  const candidate = await verifyOneCommitment({ terms });
  const status = await publishValidatedResult({ candidate, storeRoot: root, publishedAt: new Date().toISOString() });
  console.log(`commitment=${terms.id} publication=${status} digest=${candidate.entry.receiptDigest}`);
}
console.log(`eligible=${jobs.length} finalizedHead=${snapshot.head}`);
