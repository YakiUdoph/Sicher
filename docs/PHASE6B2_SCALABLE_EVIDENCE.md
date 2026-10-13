# Phase 6B.2 Scalable Evidence Result

Date: 2026-10-13

Phase 6B.2 introduces separate `proofResult` and `assuranceLevel` fields. CORROBORATED is the competition default; EXHAUSTIVE remains available as a stronger full-window policy. No Phase 5 file or on-chain state was modified.

## Live CORROBORATED benchmarks

| Commitment | Chunks | RPC attempts | Retries | Relevant events | Receipt checks | Elapsed | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| #1 | 8 | 40 | 0 | 1 | 2 | 11,887 ms | `PROVEN / CORROBORATED` |
| #2 | 32 | 92 | 0 | 3 | 6 | 24,172 ms | `NOT_PROVEN / CORROBORATED` |

Both runs used Hypedexer and the direct Conduit RPC. All deterministic log ranges completed, normalized relevant evidence agreed, discovered events matched both providers' transaction receipts, starting and ending balances agreed, the reconstructed final balance matched the pinned end balance, critical hashes agreed, and the end block was finalized.

Commitment #2 reconstructed:

`100,000 -> 92,000 -> 15,000 -> 100,000 STEST`

Its minimum-causing event remains block `8425736`, transaction `0x2ad4aa32c27551c0dbe1795e94dd1b49bb1caf01b9e67e978a8c16912a2ef148`, transaction index `1`, log index `0`.

The automated cross-check reports no mismatch between Phase 5 and Phase 6 for commitment ID, subject, token, threshold, start/end blocks, starting balance, path, minimum, minimum-causing block/transaction/order, final balance, or verdict.

## Operational architecture

- Deterministic provider-specific log chunk size.
- Bounded parallel topic queries per range.
- Three-attempt bounded retry with incremental backoff.
- Strict deterministic normalization and provider comparison.
- Targeted receipt validation for every discovered event.
- Exact finalized-context cache entries with content digests; stale entries cannot become authoritative.
- EXHAUSTIVE digest-chain checkpoints, bounded concurrency, persistence callbacks, and validated restart.

The previous full-window estimate remains unchanged: EXHAUSTIVE verification is technically supported but operationally costly for these windows. It was not run for Commitment #2.
