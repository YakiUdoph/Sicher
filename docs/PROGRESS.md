# Sicher current handoff

This is a current handoff, not an evidence manifest or a replacement for the historical freeze records. Verify externally controlled deployment and activation state before representing it as current fact.

## Current product scope

- Working Elysium Testnet V1 on chain ID `99801`; not production- or mainnet-ready.
- One supported rule: `MIN_BALANCE` for Sicher Test Token (STEST) under the reviewed conventional ERC-20 `Transfer` accounting model.
- The two principal user jobs are **Make a commitment** and **Explore/Check commitments**.
- The registry records immutable commitment terms. Off-chain code evaluates supported historical evidence and produces validated Receipt V3 results. The browser presents registry terms and matching published results without computing terminal verdicts.
- `PROVEN` and `NOT_PROVEN` are results. `CORROBORATED` and `EXHAUSTIVE` are assurance concepts and remain separate.

Canonical product scope and non-goals are in [`PRD.md`](PRD.md); architecture is in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Current architecture and frontend

- The canonical Elysium registry is the source for commitment existence and terms; dynamic discovery snapshots the registry range and uses bounded reads.
- Historical acquisition, reconstruction, finality/assurance gates, Receipt V3 validation, and publication are off-browser concerns.
- The frontend loads validated packaged records and supports runtime discovery of matching content-addressed results. A registry record without a matching validated receipt remains nonterminal.
- The implemented publication worker and protected-PR/scheduler design are documented in [`PHASE10B_RESULT_PUBLICATION.md`](PHASE10B_RESULT_PUBLICATION.md).
- The publication path is activated: activation controls, result-publication infrastructure, and scheduled execution are enabled. Its current end-to-end health is **DEGRADED / FAILING CLOSED** because independently verified recent scheduled runs repeatedly failed closed; the latest observed failure was `Finalized head disagreement`.
- The frontend implements Home, Explore, commitment detail, proof, receipt, How It Works, and Make a Commitment flows. Its existing visual and interaction conventions are recorded in [`DESIGN.md`](DESIGN.md).

## Security boundary

- Sicher is non-custodial. The current commitment action is a user-authorized, zero-value registry transaction; there is no token approval or message-signing flow.
- Successful commitment creation requires a successful receipt, matching `CommitmentCreated` event, and registry readback. A transaction hash alone is insufficient.
- Account/chain rechecks, simulation, gas/fee checks, duplicate guards, and hashless-send ambiguity handling are part of the current browser safety boundary.
- Verification fails closed. Missing, malformed, inconsistent, unsupported, wrong-chain, or unfinalized evidence never becomes `PROVEN`.
- Receipt digests are tamper-evident integrity checks, not signatures or on-chain anchors. Configured evidence operators retain shared upstream dependencies.

See [`SECURITY.md`](SECURITY.md), [`THREAT_MODEL.md`](THREAT_MODEL.md), and [`TRUST_BOUNDARY.md`](TRUST_BOUNDARY.md) before changing wallet, evidence, result, or publication behavior.

## Canonical public examples

The repository documents two primary examples:

- Commitment #1: minimum 80,000 STEST; lowest/final observed balance 92,000 STEST; `PROVEN / CORROBORATED`.
- Commitment #2: path `100,000 → 92,000 → 15,000 → 100,000 STEST`; minimum 80,000 STEST; `NOT_PROVEN / CORROBORATED`.

These are Elysium Testnet examples, not claims of customers, adoption, economic value, or production assurance. Their frozen evidence and exact receipt identities remain in [`COMPETITION_VERIFIER_FREEZE.md`](COMPETITION_VERIFIER_FREEZE.md) and the evidence directory.

## Current limitations

- Elysium Testnet and STEST only; STEST is not `$SICHER` and has no stated economic value or utility.
- `MIN_BALANCE` only; no `MAX_OUTFLOW` support.
- Conventional `Transfer` accounting only; rebasing, fee-on-transfer, hidden balance mutation, and other non-conventional mechanics are unsupported.
- Future-start enforcement is frontend-only in the deployed contract version.
- Duplicate protection is client-side, and a hashless wallet send can remain ambiguous.
- Evidence providers share upstream dependencies; correlated omission cannot be mathematically excluded.
- Results and receipts are off-chain, and the system is not production-ready.
- The production-domain MetaMask classification is documented as unresolved; users must not be told to bypass an active warning.
- Activation does not imply healthy publication. Current scheduled operation is degraded and failing closed on finalized-head disagreement.

## Do not casually reopen

- The historical competition verifier/reconstruction/assurance freeze or its fingerprints.
- Result/assurance separation, deterministic event ordering, fail-closed gates, or the conventional-token boundary.
- Receipt-to-registry binding and the rule that the browser cannot invent or upgrade a verdict.
- Wallet user initiation, receipt/event/registry reconciliation, duplicate safeguards, or ambiguous-send handling.
- Deployed contract semantics, evidence artifacts, official receipts, and protected publication transition rules.
- Product claims about mainnet, production readiness, token utility, adoption, partnerships, pricing, or revenue.

## Historical validation records

[`COMPETITION_VERIFIER_FREEZE.md`](COMPETITION_VERIFIER_FREEZE.md) records a historical verifier checkpoint of 207 passed, 0 failed, 0 skipped, with TypeScript typecheck passing. Those figures belong only to that freeze. Later release evidence contains separately attributed suites and must not be merged into a universal current test count. No current test run is asserted by this handoff.

## Safe continuation process

1. Start with root [`../AGENTS.md`](../AGENTS.md), then read the canonical document governing the requested behavior.
2. Locate the implementation, evidence, and existing tests; determine whether frozen or security-critical scope is affected.
3. Resolve documentary inconsistency conservatively and verify externally controlled state rather than inferring it from code.
4. Make the smallest justified change. Do not rewrite historical artifacts to fit it.
5. Run and report the relevant current tests, typecheck, and frontend production build as applicable. Claim repository-wide success only after the complete applicable suite actually runs.
6. Update this handoff only when current behavior or independently verified status changes. Do not use it as a new evidence manifest.
