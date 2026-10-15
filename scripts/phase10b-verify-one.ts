import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { validateVerifierResult, type RegistryTerms, type ValidatedVerifierResult } from "./phase10b-publication.ts";

export type FrozenVerifierRunner = (input: { commitmentId: string; outputPath: string }) => Promise<{ code: number; stdout: string; stderr: string }>;

const defaultRunner: FrozenVerifierRunner = ({ commitmentId, outputPath }) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/phase6-registry-verifier.ts"], {
    cwd: process.cwd(), shell: false,
    env: { ...process.env, PHASE6_COMMITMENT_ID: commitmentId, PHASE6_OUTPUT_PATH: outputPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("error", reject); child.once("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
});

export async function verifyOneCommitment(input: { terms: RegistryTerms; runner?: FrozenVerifierRunner }): Promise<ValidatedVerifierResult> {
  const directory = await mkdtemp(join(tmpdir(), "sicher-phase10b-"));
  const outputPath = join(directory, "verifier-output.json");
  try {
    const run = await (input.runner ?? defaultRunner)({ commitmentId: input.terms.id, outputPath });
    if (run.code !== 0) throw new Error(`Frozen verifier failed closed with exit ${run.code}: ${run.stderr.trim() || "no diagnostic"}`);
    const match = run.stdout.match(/^PATH: (.+)$/m);
    if (!match || match[1] === "unavailable") throw new Error("Frozen verifier did not emit a publishable path.");
    const envelope = JSON.parse(await readFile(outputPath, "utf8")) as unknown;
    return validateVerifierResult({ envelope, pathBaseUnits: match[1].split(" -> "), terms: input.terms, transcript: run.stdout });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
