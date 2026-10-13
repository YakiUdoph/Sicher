# Phase 6 Claims Boundary

This document limits claims to what the frozen Phase 5 implementation and the final Phase 6 CORROBORATED policy establish. It is not a security certification.

## Verified

- Sicher stores immutable commitment terms in the canonical registry on Elysium testnet, chain ID `99801`.
- Sicher reconstructs balance history for the reviewed conventional STEST token by applying subject-related `Transfer` events over an inclusive block interval using exact integer base units.
- Temporary breaches remain visible after later restoration when they are present in the corroborated evidence. Commitment #2 reconstructed `100,000 -> 92,000 -> 15,000 -> 100,000` STEST.
- The reconstruction core is deterministic for fixed input evidence and orders events by block number, transaction index, then log index.
- Phase 6C independently reproduced both completed commitments from Hypedexer and Conduit chain evidence.
- Commitment #1 is `PROVEN / CORROBORATED`; Commitment #2 is `NOT_PROVEN / CORROBORATED`.

## Supported but limited

- Required CORROBORATED evidence that is incomplete or disagreeing fails closed. One-provider omissions, range gaps, targeted-receipt mismatches, finality disagreements, and balance inconsistencies cannot produce a terminal result.
- Every discovered event is checked against its transaction receipt on each configured operator. This authenticates discovered events but does not prove no undiscovered event was omitted.
- Receipt V3 is deterministic for a fixed evidence/finality context and tamper-evident through canonical digest verification. Receipt files remain editable local files and are not signed or independently immutable.
- The reviewed evidence supports the named registry, token, commitments, network, and token-accounting model. It does not establish correctness for arbitrary assets or networks.
- EXHAUSTIVE assurance exists as an optional stronger mode but was not performed over the two full competition windows.

## Not established

- Impossibility of correlated omission across log queries, transaction receipts, all configured operators, and shared upstream infrastructure.
- Correctness of malicious or corrupted shared sequencer or data-availability history.
- Signed, anchored, content-addressed, or immutable receipts.
- General production readiness under broad outages, adversarial operators, or arbitrary high-volume histories.
- Correctness for tokens whose balances change without conventional `Transfer` accounting.

## Must not claim

- **“Sicher proves all token balances.”** It supports only the declared conventional event/accounting model.
- **“Sicher supports rebasing or arbitrary fee-on-transfer tokens.”** Those mechanics are outside the verified token boundary.
- **“Sicher is production ready.”** Competition freeze establishes the reviewed verifier and policy, not general production readiness.
- **“Sicher is trustless.”** Verification depends on local software, configuration, configured operators, and shared Elysium infrastructure.
- **“Sicher cannot be manipulated.”** No universal security property is established.
- **“Sicher guarantees complete RPC history.”** Correlated omission across all sources remains possible.
- **“Sicher provides immutable receipts.”** Receipts are tamper-evident local files, not immutable anchors.
- **“Commitment #2 was EXHAUSTIVELY verified.”** Its final Phase 6 result uses CORROBORATED assurance.
