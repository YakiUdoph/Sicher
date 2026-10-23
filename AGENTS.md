# Sicher agent operating contract

This file routes coding agents to the repository's authoritative records and defines the minimum operating constraints. It does not replace those records.

## Sources of authority

- [`docs/PRD.md`](docs/PRD.md): product definition, current scope, non-goals, limitations, and future direction.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): architecture and system boundaries.
- [`docs/SECURITY.md`](docs/SECURITY.md): security, wallet, transaction, evidence, and known-limitation boundaries.
- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md): verifier threat model.
- [`docs/TRUST_BOUNDARY.md`](docs/TRUST_BOUNDARY.md): input authority and trust assumptions.
- [`docs/COMPETITION_VERIFIER_FREEZE.md`](docs/COMPETITION_VERIFIER_FREEZE.md): historical competition verifier freeze.
- [`docs/COMPETITION_ASSURANCE_POLICY.md`](docs/COMPETITION_ASSURANCE_POLICY.md): assurance semantics and evidence requirements.
- [`docs/FRONTEND_INTEGRATION_CONTRACT.md`](docs/FRONTEND_INTEGRATION_CONTRACT.md): frontend/result binding and rendering authority.
- [`docs/REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md): Phase 5 reproduction procedure and its explicitly scoped limitations.
- [`docs/DESIGN.md`](docs/DESIGN.md): existing frontend visual and interaction conventions.
- [`docs/PROGRESS.md`](docs/PROGRESS.md): current handoff and unresolved status only.

When records appear inconsistent, do not silently choose the convenient interpretation. Inspect the implementation and evidence, report the inconsistency, and preserve the safer behavior until it is resolved. Historical documents and evidence remain historical; do not rewrite them to match newer behavior.

## Non-negotiable product boundaries

- Sicher currently runs on Elysium Testnet, chain ID `99801`, and is not production- or mainnet-ready.
- V1 supports `MIN_BALANCE` only. Do not implement or imply `MAX_OUTFLOW` support.
- Creating or discovering a commitment proves only that its terms were recorded. It does not mean the commitment was kept.
- Missing, unsafe, incomplete, inconsistent, unsupported, wrong-chain, or unfinalized evidence must never become `PROVEN`.
- A temporary breach remains a breach after the balance recovers.
- Keep result and assurance separate: `PROVEN` / `NOT_PROVEN` are results; `CORROBORATED` / `EXHAUSTIVE` are assurance concepts.
- The reviewed token model is conventional ERC-20 `Transfer` accounting. Do not silently generalize verification to rebasing, fee-on-transfer, hidden balance mutation, or other unsupported mechanics.
- STEST means Sicher Test Token. It is not `$SICHER`; do not invent value, utility, launch plans, or token economics.
- Do not invent users, customers, adoption, traction, partnerships, revenue, pricing, audits, guarantees, deployments, or roadmap commitments.

## Security and wallet rules

- Never request, store, log, or commit private keys, seed phrases, mnemonics, or wallet secrets.
- Preserve Sicher's non-custodial model. Do not casually add approvals, signing flows, custody, or fund movement.
- Wallet authorization and transaction submission must remain explicitly user initiated. Never tell users to bypass wallet security warnings.
- A transaction hash alone is not successful commitment creation. Preserve successful receipt, matching event, and registry-readback reconciliation.
- Preserve hashless-send ambiguity: an ambiguous broadcast is not definite failure. Do not encourage blind retries.
- Do not weaken account, chain, simulation, gas, fee, duplicate, pre-send, or public-record safeguards merely to simplify the interface.

## Frozen verifier discipline

The competition verifier freeze is historical evidence. Before modifying any competition-critical verifier, reconstruction, receipt, evidence, or assurance path, inspect [`docs/COMPETITION_VERIFIER_FREEZE.md`](docs/COMPETITION_VERIFIER_FREEZE.md) and [`evidence/phase6-competition-freeze.json`](evidence/phase6-competition-freeze.json).

- Do not casually change frozen behavior, change fingerprints merely to pass tests, or rewrite historical artifacts around new implementation behavior.
- Preserve deterministic event ordering: `blockNumber`, then `transactionIndex`, then `logIndex`.
- A change that invalidates the documented freeze must be identified as such. The previous freeze must not be represented as covering the changed implementation.

## Frontend rules

- Use plain, beginner-readable language first and progressively disclose technical provenance.
- Preserve the two principal jobs: **Make a commitment** and **Check/Explore commitments**.
- Do not present registry existence as a validated terminal result.
- Do not calculate, infer, or upgrade terminal verdicts in the browser from displayed balances.
- Preserve the temporary-breach story and keep result separate from assurance.
- Avoid generic AI, blockchain, and infrastructure jargon in the primary interface.
- Follow [`docs/DESIGN.md`](docs/DESIGN.md) before inventing a visual or interaction pattern.

## Change discipline

Before editing:

1. Identify the requested behavior.
2. Identify the canonical governing document.
3. Identify the implementation and relevant evidence.
4. Determine whether frozen or security-critical scope is touched.
5. Inspect existing tests.
6. Prefer the smallest justified change.

After editing, run the relevant targeted tests, TypeScript typecheck when applicable, and the frontend production build when applicable. Run all applicable tests before claiming repository-wide success. Report exactly what ran and its current result; never reuse a historical test count as if it came from the current run. Update documentation only when behavior or verified status changed, and never claim deployment success without verifying it.
