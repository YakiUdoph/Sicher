import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateVerifiedCommitmentsDocument } from "../frontend/src/verifiedCommitments.ts";
import { publishValidatedResult, validateVerifierResult } from "./phase10b-publication.ts";

const root = process.env.PHASE10B_RESULTS_ROOT?.trim();
const timestamp = process.env.PHASE10B_BOOTSTRAP_TIMESTAMP?.trim();
if (!root || !timestamp || Number.isNaN(Date.parse(timestamp))) throw new Error("PHASE10B_RESULTS_ROOT and a valid PHASE10B_BOOTSTRAP_TIMESTAMP are required.");
const prepared = validateVerifiedCommitmentsDocument(JSON.parse(await readFile(resolve("frontend/public/data/commitments.json"), "utf8")));
for (const id of ["1", "2"] as const) {
  const view = prepared.commitments[id];
  const envelope = JSON.parse(await readFile(resolve(`evidence/phase6b2-commitment${id}-receipt-v3.json`), "utf8"));
  const candidate = validateVerifierResult({ envelope, pathBaseUnits: view.pathBaseUnits, terms: { id, creator: view.creator, subject: view.subject, token: view.token, minimumBalanceBaseUnits: view.minimumRequiredBaseUnits, startBlock: view.startBlock, endBlock: view.endBlock } });
  await publishValidatedResult({ candidate, storeRoot: root, publishedAt: timestamp, initialOperational: false });
}
console.log("Bootstrapped exact #1/#2 results with automation.operational=false.");
