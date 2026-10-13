# Sicher Phase 5 Reproducibility

## Plain-English summary

Sicher records a commitment on-chain that names a subject, token, minimum balance, and inclusive block window. Its historical verifier starts with the token balance immediately before the window, obtains conventional ERC20 `Transfer` events involving the subject, orders them deterministically, and reconstructs each balance in integer base units. A balance below the committed minimum establishes a historical breach even if funds later return.

This process does **not** prove arbitrary token state. It assumes the token's balance changes are faithfully represented by conventional `Transfer` events. It does not currently detect an RPC provider that successfully returns a silently incomplete history, does not use provider quorum, and does not establish finality beyond the reported chain head. Local receipts are not immutable.

## Verified deployment and experiments

- Network: Elysium testnet, chain ID `99801`
- Registry: `0x4e4887E28a8370678A9a37C08A85c65450b510c0`
- STEST: `0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7`
- Subject: `0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086`

Commitment #1 is the completed control. Its inclusive window is blocks `8126584` through `8141584`, its required minimum is `80000000000000000000000` base units, and fresh reconstruction found a minimum/final balance of `92000000000000000000000` base units (`92,000` STEST), producing `PASS`.

Commitment #2 is the breach-and-restoration experiment. Its inclusive window is blocks `8220689` through `8520689`, and its required minimum is `80000000000000000000000` base units. Fresh reconstruction found:

`100,000 -> 92,000 -> 15,000 -> 100,000 STEST`

The historical minimum is `15,000` STEST and the breach is established. At the Phase 6A snapshot, the window was still active, so no final receipt was generated.

## Source of truth

The verifier obtains chain ID and contract storage through RPC. The configured registry address selects the contract whose on-chain storage is read. Commitment creator, subject, token, minimum, start block, and end block are read from `commitments(id)` by the Commitment #2 finalizer and are compared with its frozen expected terms.

Historical evidence consists of the `balanceOf(subject)` result at `startBlock - 1` and ERC20 `Transfer` logs with block number, transaction hash, transaction index, and log index. The reconstruction core orders evidence by `(blockNumber, transactionIndex, logIndex)`, applies outgoing values as subtraction and incoming values as addition, and treats a self-transfer as zero net change.

Local software supplies the algorithm, verifier version, expected network/addresses for the frozen candidate, RPC endpoint selection, ABI artifacts, and receipt formatting. The following local inputs are used by the verification/finalization path:

- `scripts/historical-min-balance-verifier.ts`
- `scripts/min-balance-core.ts`
- `scripts/finalize-commitment2.ts`
- `scripts/rpc-retry.ts`
- `artifacts/SicherCommitmentProof.json`
- `artifacts/SicherTestToken.json`
- `evidence/phase5-commitment2-finalization-candidate.json`
- environment variables selecting the RPC and generic-verifier inputs

Files under `phase5-tool/` and the older `evidence/phase5-min-balance.manifest.json` are workflow records/convenience state. They were not trusted by the Phase 6A clean reconstruction and are not read by the frozen Commitment #2 finalizer. The finalizer's candidate manifest supplies expected hashes but is itself an editable local file, not an external trust anchor.

## Reproduce the verification

Use Node.js/npm on a clean checkout. Do not add private keys or wallet credentials; all commands below are read-only. Install the locked dependencies:

```powershell
npm.cmd ci
```

Verify the frozen file hashes:

```powershell
Get-FileHash -Algorithm SHA256 scripts/historical-min-balance-verifier.ts,scripts/finalize-commitment2.ts,scripts/min-balance-core.ts
```

Expected SHA256 values, in that order, are:

- `d3d82e32f3b9fe56fa7627b597e4efb48ec31a7f5b22bc61964e0227f13737ba`
- `b6ec36bc2df543271263f51aa974900648d4c23ef4f6da8330567fdd0e647764`
- `22a4e7725a93cc75beac24373eaa81584f19ddeedc96a23b91a4867d8068f32a`

Run the adversarial reconstruction tests:

```powershell
npm.cmd run test:min-balance
```

Set an archive-capable Elysium RPC URL, then read each commitment directly:

```powershell
$env:ELYSIUM_RPC_URL = '<archive-rpc-url>'
$env:COMMITMENT_ID = '1'
node scripts/read-commitment.ts
$env:COMMITMENT_ID = '2'
node scripts/read-commitment.ts
```

Reconstruct Commitment #1 without local verdict/cache data:

```powershell
$env:TOKEN_ADDRESS = '0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7'
$env:SUBJECT_ADDRESS = '0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086'
$env:START_BLOCK = '8126584'
$env:END_BLOCK = '8141584'
$env:MINIMUM_BALANCE = '80000000000000000000000'
$env:LOG_CHUNK_SIZE = '5000'
node scripts/historical-min-balance-verifier.ts
```

For Commitment #2, change only `START_BLOCK` to `8220689` and `END_BLOCK` to `8520689`, then run the same verifier. While the window is active, an already observed sub-threshold minimum yields the monotonic historical result `FAIL`; this is distinct from receipt finalization. The finalization gate is:

```powershell
$env:PHASE5_ARCHIVE_RPC_URL = '<archive-rpc-url>'
npm.cmd run phase5:finalize-commitment2
```

Before completion it must report `WINDOW STATUS: ACTIVE`, `FINALIZATION READY: NO`, and `FINAL RECEIPT GENERATED: NO`.

## Completeness and known limitations

A valid reconstruction requires the historical starting balance and every relevant log across the full evaluated interval. Explicit timeouts, HTTP errors, rate limits, missing chunks, malformed relevant logs, and wrong-chain responses stop safely or produce `INDETERMINATE`. Duplicate logs are deduplicated, and conflicting duplicates are rejected.

The current implementation does not prove that a successful RPC response is complete. It has no expected-log count, block-receipt reconciliation, provider quorum, or cryptographic receipt proof. The generic verifier also accepts token/window inputs from environment variables and does not bind them to registry storage; callers must independently verify those terms or use the frozen Commitment #2 finalizer, which does read and compare registry storage. Finalization at `currentBlock == endBlock` includes the end block but has no confirmation-depth/reorganization margin.

