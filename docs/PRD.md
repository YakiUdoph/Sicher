# Sicher Product Requirements Document

## 1. Product summary

Sicher records measurable token-balance commitments before their outcome, reconstructs the completed historical interval, and publishes a repeatable result with a readable evidence receipt. It currently runs on Elysium Testnet and supports `MIN_BALANCE` for the reviewed conventional STEST token model.

## 2. Problem

A current wallet balance does not show whether the same balance was maintained throughout a past interval. A project can temporarily move funds below a promised threshold and restore them before a reviewer takes a snapshot. This makes endpoint-only monitoring inadequate for interval commitments.

### Why not just inspect the wallet address?

Inspecting the address shows current state. It does not prove compliance at every point in a completed historical interval. Sicher binds terms before the outcome and evaluates the interval rather than only its endpoint.

## 3. Why checking today's balance is insufficient

Commitment #2 demonstrates the failure mode. It required 80,000 STEST and ended at 100,000 STEST, but its path was `100,000 -> 92,000 -> 15,000 -> 100,000`. A final snapshot looks healthy; interval reconstruction finds the breach and produces `NOT_PROVEN`.

## 4. Target users

Plausible target users include:

- token or project treasuries making measurable reserve commitments;
- grant and ecosystem programs attaching conditions to allocated funds;
- DAOs monitoring treasury policies;
- counterparties requiring inspectable balance-maintenance commitments; and
- auditors or community reviewers who need a reproducible historical record.

These are target hypotheses, not claims of current customers.

## 5. Primary use cases

1. Record a minimum-balance commitment with fixed subject, token, threshold, and block range.
2. Review a completed commitment without relying on its final balance alone.
3. Distinguish the verdict from the strength and limits of the evidence process.
4. Share a readable receipt and exact technical provenance.

## 6. User stories

- As a committing wallet, I want to fix measurable terms before the interval so I cannot rewrite them after seeing the outcome.
- As a reviewer, I want to see whether the threshold held throughout the interval.
- As a reviewer, I want a temporary breach to remain visible after funds return.
- As a technical reviewer, I want exact blocks, addresses, hashes, fingerprints, and limitations.
- As an operator, I want missing or inconsistent evidence to stop a favorable terminal result.

## 7. Current V1 scope

- Network: Elysium Testnet, chain ID `99801`.
- Rule: `MIN_BALANCE` only.
- Public product records: commitments #1 and #2 only.
- Reviewed token model: conventional ERC-20 `Transfer` accounting for STEST.
- Results: `PROVEN`, `NOT_PROVEN`, `PENDING`, or `INDETERMINATE` under the implemented verifier rules.
- Public assurance shown for #1/#2: `CORROBORATED`.

## 8. Functional requirements

### Commitment creation

- Capture subject, STEST minimum, future start block, and later end block.
- Show exact transaction terms and public-record disclosure before the transaction action.
- Require an injected wallet, Elysium Testnet, a fresh head, valid terms, simulation, gas estimation, and a native gas balance.
- Revalidate account and chain immediately before `eth_sendTransaction`.
- Treat creation as an active commitment, not as proof of success.

### Verification

- Read authoritative commitment terms from the configured registry.
- Acquire starting balance and relevant incoming/outgoing `Transfer` events for the inclusive interval.
- Normalize, deduplicate, and order events by block number, transaction index, then log index.
- Compare required provider evidence and critical block/finality context.
- Reconstruct balances in exact integer base units.
- Produce no favorable terminal result when required evidence is missing or inconsistent.

### Publication

- Validate Receipt V3 schema, digest, evidence-manifest digest, and frozen fingerprints.
- Prepare the public frontend dataset without recomputing verdicts in the browser.
- Keep result and assurance level separate.
- Expose material limitations with the record.

## 9. Non-functional requirements

- Determinism for fixed accepted evidence and configuration.
- Fail-closed behavior for malformed, missing, disagreeing, or wrong-chain evidence.
- Exact integer accounting; no floating-point token calculations.
- Reproducible tests and fingerprints for the frozen verifier and contract.
- No browser custody or private-key handling.
- Clear language for non-technical reviewers with inspectable technical detail.
- Responsive public browsing without requiring a wallet.

## 10. Trust model

The registry provides on-chain commitment terms. The verifier is off-chain software run by a Sicher operator. Its result depends on reviewed code, configuration, the configured evidence providers, and Elysium's shared infrastructure. Receipt digests detect edits when checked against trusted expected values, but receipts are neither signed nor anchored on-chain.

`CORROBORATED` means implemented evidence was compared across the configured sources and discovered events received targeted receipt checks. It does not prove mathematically complete history.

## 11. Failure behavior

- Active, not-finalized windows do not become `PROVEN`.
- Missing or malformed required evidence fails closed.
- Provider disagreement, range gaps, block-hash disagreement, and receipt mismatches prevent a terminal result.
- A reverted transaction is not shown as a created commitment.
- Known-hash and hashless ambiguous submissions block blind retries and require read-only reconciliation or an explicit risk-bearing reset.
- Unknown public commitment data is not replaced with a favorable fallback record.

## 12. Unsupported scenarios

- Networks other than Elysium Testnet.
- Commitment rules other than `MIN_BALANCE`.
- Arbitrary tokens, rebasing tokens, fee-on-transfer semantics, or hidden balance mutation.
- Contract-enforced future starts or protocol-level duplicate prevention.
- A claim that configured providers cannot share or repeat an omission.
- On-chain verdict computation or on-chain receipts.

## 13. Current operator workflow

### Who creates the commitment?

The wallet/user creates their own registry commitment through a user-authorized transaction. A direct contract caller can also call the public registry.

### Who checks it?

After the interval ends, a Sicher operator runs the verifier, reviews the completed evidence, generates and validates Receipt V3, prepares the public data, and publishes the result.

## 14. Future automation opportunities

- Schedule detection of completed commitment windows.
- Run verification and receipt validation through an auditable job pipeline.
- Publish validated records without manual file preparation.
- Add monitoring, retry, and review queues for indeterminate evidence.
- Add stronger and more independent evidence channels.

Automation must preserve the same fail-closed gates; it must not silently turn infrastructure failure into success.

## 15. Adoption path

1. Demonstrate the interval-versus-snapshot problem with the completed testnet records.
2. Pilot with programs willing to define one measurable balance rule.
3. Integrate proof status and receipts into program reporting workflows.
4. Add operational automation and stronger evidence before production use.
5. Consider additional rules only after their semantics and evidence boundaries are designed and tested.

No current customer adoption is claimed.

## 16. Commercialization hypothesis

Programs or organizations may pay for historical commitment checks, monitoring, reporting, integrations, operational service levels, or higher-assurance evidence. This is a hypothesis, not validated revenue. Pricing, packaging, and willingness to pay remain untested.

## 17. Success metrics

Early-stage metrics:

- percentage of completed supported commitments producing a valid terminal result rather than infrastructure-driven `INDETERMINATE`;
- time from finalized interval to published validated receipt;
- rate of provider disagreement and acquisition failure;
- receipt-validation and reproduction success;
- user comprehension of result versus assurance;
- accidental duplicate-submission and unresolved-send rates; and
- number of qualified pilot conversations after security clearance.

No target values are asserted yet.

## 18. Risks

- Correlated provider or upstream omission.
- Unsupported token accounting being mistaken for supported behavior.
- Operator mistakes in the manual publication workflow.
- RPC outages or archive limitations.
- Browser-only future-start and duplicate protections being bypassed through direct calls.
- Wallet broadcast ambiguity when no transaction hash returns.
- Misinterpretation of `CORROBORATED` as exhaustive or trustless.
- External wallet/domain security classification blocking safe adoption.
- Frozen evidence being generalized beyond its reviewed scope.

## 19. Explicit non-goals

- Custodying or moving user funds outside a user-authorized registry call.
- Requesting token approvals or signatures.
- Claiming universal token-balance correctness.
- Providing an investment product or assigning value to STEST.
- Presenting Receipt V3 as on-chain, signed, or independently immutable.
- Claiming production readiness, customers, decentralization, or finalized `$SICHER` utility.
- Presenting `MAX_OUTFLOW` or any rule other than `MIN_BALANCE` as implemented.
