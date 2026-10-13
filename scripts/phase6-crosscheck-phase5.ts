import { readFileSync, writeFileSync } from "node:fs";
import { getAddress } from "viem";
import { comparePhase5AndPhase6, type Phase5Comparable } from "./phase6-assurance-core.ts";

const phase5Path = process.env.PHASE5_RECEIPT_PATH || "evidence/phase5-commitment2-final-receipt.json";
const phase6Path = process.env.PHASE6_RECEIPT_PATH || "evidence/phase6b2-commitment2-receipt-v3.json";
const phase5 = JSON.parse(readFileSync(phase5Path, "utf8")) as Record<string, any>;
const phase6 = JSON.parse(readFileSync(phase6Path, "utf8")) as { receipt: Record<string, any>; evidenceManifest: Record<string, any> };
const receipt = phase6.receipt;
const events = phase6.evidenceManifest.orderedRelevantEvidence as Array<Record<string, string>>;
let balance = BigInt(receipt.startingBalanceBaseUnits);
const path = [balance.toString()];
for (const event of events) {
  if (getAddress(event.from) === getAddress(receipt.subject)) balance -= BigInt(event.valueBaseUnits);
  if (getAddress(event.to) === getAddress(receipt.subject)) balance += BigInt(event.valueBaseUnits);
  path.push(balance.toString());
}
const left: Phase5Comparable = {
  commitmentId: phase5.commitmentId,
  subject: getAddress(phase5.subject),
  token: getAddress(phase5.token),
  minimumRequiredBaseUnits: phase5.minimumRequired,
  startBlock: phase5.startBlock,
  endBlock: phase5.endBlock,
  startingBalanceBaseUnits: phase5.startingBalance,
  pathBaseUnits: [phase5.startingBalance, ...phase5.relevantOrderedEvidence.reduce((state: string[], event: Record<string, string>) => {
    let current = BigInt(state.at(-1) ?? phase5.startingBalance);
    if (getAddress(event.from) === getAddress(phase5.subject)) current -= BigInt(event.amount);
    if (getAddress(event.to) === getAddress(phase5.subject)) current += BigInt(event.amount);
    state.push(current.toString()); return state;
  }, [])],
  minimumObservedBaseUnits: phase5.minimumObserved,
  minimumCausingBlock: phase5.minimumCausingBlock,
  minimumCausingTransactionHash: phase5.minimumCausingTransactionHash.toLowerCase(),
  finalBalanceBaseUnits: phase5.finalReconstructedBalance,
  proofResult: phase5.finalVerdict,
};
const right: Phase5Comparable = {
  commitmentId: receipt.commitmentId,
  subject: getAddress(receipt.subject),
  token: getAddress(receipt.token),
  minimumRequiredBaseUnits: receipt.minimumRequiredBaseUnits,
  startBlock: receipt.startBlock,
  endBlock: receipt.endBlock,
  startingBalanceBaseUnits: receipt.startingBalanceBaseUnits,
  pathBaseUnits: path,
  minimumObservedBaseUnits: receipt.minimumObservedBaseUnits,
  minimumCausingBlock: receipt.minimumCausingEvidence.blockNumber,
  minimumCausingTransactionHash: receipt.minimumCausingEvidence.transactionHash.toLowerCase(),
  finalBalanceBaseUnits: receipt.finalBalanceBaseUnits,
  proofResult: receipt.proofResult,
};
const comparison = comparePhase5AndPhase6(left, right);
if (phase5.minimumCausingTransactionIndex !== receipt.minimumCausingEvidence.transactionIndex) comparison.mismatches.push("minimumCausingTransactionIndex");
if (phase5.minimumCausingLogIndex !== receipt.minimumCausingEvidence.logIndex) comparison.mismatches.push("minimumCausingLogIndex");
comparison.agreement = comparison.mismatches.length === 0;
const report = { schemaVersion: "sicher.phase5-phase6-crosscheck/1.0", phase5Path, phase6Path, agreement: comparison.agreement, mismatches: comparison.mismatches, phase5: left, phase6: right };
const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.env.PHASE6_CROSSCHECK_OUTPUT) writeFileSync(process.env.PHASE6_CROSSCHECK_OUTPUT, output, "utf8");
console.log(output.trim());
if (!comparison.agreement) process.exitCode = 1;
