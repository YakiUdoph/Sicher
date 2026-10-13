# Phase 6B.1 Red-Team Remediation

> Historical record: this document describes the Phase 6B.1 policy before Phase 6B.2 introduced the accepted CORROBORATED and EXHAUSTIVE assurance modes. The current competition policy is defined in `COMPETITION_ASSURANCE_POLICY.md`; the B.1 `INDETERMINATE` results below are not the final Phase 6 results.

Date: 2026-10-13

## Decision

The Phase 6 competition verifier is **not frozen**. The implementation defects reproduced in Phase 6B are remediated, but exhaustive receipt reconstruction is not currently practical for the existing 15,001-block and 300,001-block commitment windows. The verifier therefore fails closed with `INDETERMINATE` when the required receipt-derived channel is incomplete.

Sicher cannot guarantee that correlated omission across every evidence source is impossible. Log queries, block receipts, full-block transaction enumeration, historical state, and both configured RPC operators can still share upstream Elysium/Nitro infrastructure or correlated software faults. This is a residual infrastructure trust assumption, not a solved implementation property.

Within the implemented evidence policy, a terminal verdict cannot be issued when a required evidence channel disagrees or is incomplete.

## Required evidence policy

A terminal `PROVEN` or `NOT_PROVEN` requires all of the following:

- complete deterministic `eth_getLogs` coverage from both configured operators;
- identical normalized log-query evidence from both operators;
- exhaustive receipt-derived evidence for every block in the inclusive window from both operators;
- for each receipt-scanned block, one receipt for every transaction returned by full-block transaction enumeration;
- exact cross-channel agreement on block number, block hash, transaction hash, transaction index, log index, emitter, topics, and data;
- mutually agreed block-pinned starting balance and block-pinned ending balance;
- reconstructed final balance equal to the ending `balanceOf` result;
- critical block-hash and finalized-head agreement; and
- the pinned competition chain, registry, commitment, and reviewed token model.

Receipt scanning inspects every transaction receipt in every block. It does not filter by the transaction's top-level `to`, so token logs emitted through internal contract calls are included.

If the receipt scan exceeds `PHASE6_RECEIPT_SCAN_MAX_BLOCKS`, any RPC call fails, receipt counts do not match enumerated block transactions, operators disagree, channels disagree, or the reconstructed final balance differs from the pinned end balance, the result is `INDETERMINATE`.

Start/end balance equality is defense-in-depth only. It does not prove the absence of a temporary breach that was restored between those blocks. Sparse checkpoints have the same limitation and are not accepted as evidence completeness.

## Bounded capability benchmark

The read-only benchmark scanned blocks 8,128,175 through 8,128,184 on both public operators. For every block it called `eth_getBlockReceipts` and `eth_getBlockByNumber`, then compared receipt count with the enumerated transaction count.

| Provider | Blocks | Requests | Receipts | Elapsed | Rate limits | Archive sample | Result |
|---|---:|---:|---:|---:|---:|---|---|
| hypedexer | 10 | 20 | 26 | 4,193 ms | 0 | available | supported |
| kinetiq | 10 | 20 | 26 | 6,476 ms | 0 | available | supported |

`eth_getBlockReceipts` batches all transaction receipts for one block. No multi-block receipt method was established. The implementation makes four read requests per block across two operators: one block-receipt request and one block-enumeration request per operator.

The bounded run establishes technical support and archive availability at the sampled historical height, not capacity for the full windows. A simple linear extrapolation from the 10-block sample is approximately 60,004 requests and 4.4 hours for Commitment #1, and 1,200,004 requests and 89 hours for Commitment #2. Real behavior can be worse due to rate limiting, retries, load, and latency. The verifier intentionally did not issue those uncontrolled scans.

## Live read-only controls

At the live run, both operators agreed on finalized block 8,603,435 and its hash.

- Commitment #1: complete window; no observed breach; path `100000 -> 92000`; pinned end balance `92000`; log-query providers agree; receipt channel not run because 15,001 blocks exceeds the 1,000-block bound; final result `INDETERMINATE`.
- Commitment #2: complete window; breach observed; path `100000 -> 92000 -> 15000 -> 100000`; pinned end balance `100000`; log-query providers agree; receipt channel not run because 300,001 blocks exceeds the bound; final result `INDETERMINATE`.

Commitment #2 was not modified or finalized. No transaction was sent.

## Receipt V2 and configuration

Receipt V2 has mandatory fields, a fixed schema version, strict primitive/address/hash/integer/enum checks, ordering validation, state-machine consistency checks, and canonical digest recomputation through exported `verifyReceiptV2`. Competition verification defaults to chain ID `99801` and registry `0x4e4887E28a8370678A9a37C08A85c65450b510c0`. A different registry is accepted only when the caller explicitly selects development mode and supplies its expected binding.

The receipt digest is tamper-evident only when compared with a separately trusted digest. It is not a signature or an immutable anchor.

## Test result

The Phase 6 suite contains 50 baseline tests, 35 retained red-team regression cases, and 25 new Phase 6B.1 cases. All 110 pass. TypeScript type checking also passes.
