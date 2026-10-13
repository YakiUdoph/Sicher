# Competition Verifier Freeze

Freeze status: **FROZEN**  
Freeze version: `sicher.competition-verifier-freeze/1.0`  
Timestamp: `2026-10-13T18:16:31-01:00`

## Frozen scope

- Network: Elysium testnet, chain ID `99801`.
- Canonical registry: `0x4e4887E28a8370678A9a37C08A85c65450b510c0`.
- Reviewed token: STEST at `0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7`.
- Token-model boundary: the reviewed conventional ERC-20 changes account balances exactly through standard `Transfer` accounting. Rebasing, arbitrary fee-on-transfer behavior, hidden balance mutation, and other non-conventional accounting are outside the verified boundary.
- Receipt schema: `sicher.competition-receipt/3.0`.
- Default assurance policy: `CORROBORATED`.
- Optional stronger policy: `EXHAUSTIVE`.

The proof result and assurance level are independent fields. `PROVEN` or `NOT_PROVEN` describes the evaluated commitment; `CORROBORATED` or `EXHAUSTIVE` describes how the evidence requirements were satisfied. Assurance does not rewrite the result.

## Frozen implementation identity

- Registry verifier SHA-256: `681a77d7253a969c99d69f23b33bdbf87a2d026e3849e72fc6625e29e9a58379`.
- Combined reconstruction/assurance/cache core SHA-256: `2c7ed9c6624db964a247d28c327afc9a4633a6699e2d9d05ad35cf21859649a6`.
- Critical file fingerprints are enumerated in `evidence/phase6-competition-freeze.json`.

Any subsequent change to a competition-critical file invalidates this freeze until the affected fingerprints, full test suite, typecheck, receipt validation, reproductions, and Phase 5 cross-check are rerun and a new freeze manifest is issued.

## Final verification results

- Full automated suite: `207` passed, `0` failed, `0` skipped.
- TypeScript typecheck: `PASS`.
- Exported Receipt V3 validator: both official receipts `PASS`.
- Manifest digest and current implementation fingerprint checks: `PASS` for both official receipts.
- Temporary in-memory receipt tamper: rejected; no official artifact was altered.
- Phase 5 frozen-file fingerprint check: `PASS`; no Phase 5 file changed.
- Phase 5/Phase 6 commitment #2 cross-check: `PASS`, zero mismatches.
- Known critical implementation defects at freeze: `0`.
- Known high implementation defects at freeze: `0`.

## Frozen commitment receipts

### Commitment #1

- Result: `PROVEN`.
- Assurance: `CORROBORATED`.
- Reconstructed path: `100,000 -> 92,000` STEST.
- Minimum required: `80,000` STEST.
- Receipt digest: `2b1fa85d2dbd00729218bbe09d327cfc2349f20df02921185d8a2ec3c43fbece`.
- Artifact: `evidence/phase6b2-commitment1-receipt-v3.json`.

### Commitment #2

- Result: `NOT_PROVEN`.
- Assurance: `CORROBORATED`.
- Reconstructed path: `100,000 -> 92,000 -> 15,000 -> 100,000` STEST.
- Minimum required: `80,000` STEST.
- Receipt digest: `bd8e5cfa63ff862d4e0b1efc93c6ae2ac0800b01b6806a5ea5146880ce1b67f7`.
- Artifact: `evidence/phase6b2-commitment2-receipt-v3.json`.

Phase 6C reproduced both commitments read-only from Hypedexer and direct Conduit evidence without sending a transaction. Commitment #1 reproduced byte-for-byte at the receipt-digest level. Commitment #2 reproduced the same terms, event path, minimum, result, assurance, and proof evidence. Its fresh envelope had a different finalized-head context because the chain advanced after the official receipt; only the finalized head, manifest digest, and consequently receipt digest changed. This is not a proof-semantic mismatch.

## Finality policy

A terminal result requires configured operators to agree on the `finalized` head number and hash, and the commitment `endBlock` must be at or below that head. The verifier also pins and compares exact hashes for consequential historical blocks, including the end block and minimum-causing block. Missing, malformed, stale-for-the-window, or disagreeing finality evidence fails closed as `PENDING` or `INDETERMINATE` under the applicable condition.

## Provider model and accepted limitations

Hypedexer and direct Conduit are separately operated RPC endpoints. They nevertheless share Elysium sequencer, AnyTrust data-availability, HyperEVM settlement, Nitro lineage, and potentially other upstream dependencies. The freeze accepts these residual architectural limitations:

- Correlated omission across every configured operator and shared upstream infrastructure cannot be mathematically excluded.
- Targeted transaction-receipt checks authenticate discovered events but cannot prove that no undiscovered event was omitted.
- Start/end balances and sparse checkpoints cannot prove the absence of an omitted temporary breach.
- EXHAUSTIVE mode exists, but neither competition receipt claims a full-window EXHAUSTIVE scan.
- Receipt digests are tamper-evident local integrity checks, not signatures or immutable anchors.
- The freeze is scoped to the named registry, network, commitments, verifier version, and conventional STEST accounting model; it is not a claim of general production readiness, universal token support, or trustlessness.

These limitations are disclosed and accepted for the competition freeze; they are not classified as unresolved critical or high implementation defects.
