# Sicher Roadmap

This roadmap separates what exists today from proposed work. It contains no delivery dates.

## Shipped

- Elysium Testnet `SicherCommitmentProof` registry.
- Immutable-on-record commitment terms and `CommitmentCreated` events.
- V1 `MIN_BALANCE` commitment creation for STEST.
- Browser wallet connection and Elysium network switching.
- Fresh-head validation and future-start protection in the frontend.
- Exact transaction review, simulation, gas checks, fee preparation, and pre-send account/chain revalidation.
- Pending and hashless-send safety states with read-only reconciliation.
- Exact historical STEST balance reconstruction.
- Ordered processing by block number, transaction index, and log index.
- `CORROBORATED` provider strategy with targeted receipt checks and disclosed limitations.
- Receipt V3 construction, digest validation, and frozen implementation fingerprints.
- Public Explore, Project, Proof, Receipt, About, and Start routes.
- Public completed records for commitments #1 and #2.
- Responsive wallet-free viewing of the completed records.
- Frozen tests and retained evidence for the current release.

After an interval ends, a Sicher operator starts verification and publication; these steps are not yet an autonomously scheduled service.

## Next

- Resolve the production wallet/domain security classification through the official review process.
- Improve public RPC resilience and observable failure handling.
- Build an auditable automated post-window verification pipeline.
- Automate Receipt V3 publication after all validation gates pass.
- Add stronger, more independent evidence sources and monitor provider disagreement.
- Move future-start enforcement into a reviewed contract version.
- Define protocol-level duplicate or uniqueness semantics if product requirements justify them.
- Add operational review queues for `PENDING`, `INDETERMINATE`, and ambiguous wallet outcomes.
- Design and test additional commitment rules before presenting any as supported.

## Later / exploratory

- Program and DAO dashboards for multiple commitments.
- Reporting exports and API integrations.
- Higher-assurance evidence modes with practical cost controls.
- Additional networks after separate chain, finality, RPC, and contract review.
- Rules beyond minimum balance, subject to explicit semantics and evidence models.
- Organization-level monitoring and service workflows.

`MAX_OUTFLOW` is not implemented. It is not part of current V1.

Potential Ascend-related token-launch plans and any `$SICHER` utility remain **to be determined**. No token utility, launch date, or economic model is frozen in this repository.
