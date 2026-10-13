# Sicher Competition Assurance Policy

## Plain-English policy

By default, Sicher asks Hypedexer and Conduit for the complete historical event record, checks that their answers agree, verifies the finalized block context, reconstructs the balance in a fixed order, checks the start and end balances, and confirms every discovered event against its transaction receipt.

This default is called **CORROBORATED**. It is practical for large proof windows, but it cannot rule out both operators and their shared upstream infrastructure omitting the same event.

Users who need stronger assurance may request **EXHAUSTIVE** verification. Sicher then rebuilds the event history from every block's transaction receipts and compares it with the log-query history. This is substantially more expensive.

The proof result and assurance level are separate. `PROVEN` or `NOT_PROVEN` describes the reconstructed commitment outcome. `CORROBORATED` or `EXHAUSTIVE` describes how the historical evidence was checked.

## CORROBORATED requirements

- Competition chain ID and canonical registry are pinned.
- Commitment terms are read from finalized registry state and agree across providers.
- The inclusive end block is finalized and critical block hashes agree.
- Starting and ending `balanceOf` calls use exact block-hash context and agree across providers.
- Every deterministic `eth_getLogs` range succeeds exactly once on both Hypedexer and Conduit.
- Relevant normalized logs agree exactly between providers.
- Every discovered relevant event is present with identical metadata in each provider's transaction receipt.
- The deterministic reconstructed final balance equals the pinned ending balance.
- The reviewed conventional token model is satisfied.

Incomplete evidence or disagreement produces `INDETERMINATE`. A completed window waiting for finality produces `PENDING`.

## EXHAUSTIVE requirements

EXHAUSTIVE includes all CORROBORATED requirements. It additionally enumerates every block, validates block transaction enumeration against block receipts, independently reconstructs relevant token events, and requires exact cross-channel agreement.

Progress is checkpointed as a contiguous digest chain. The runner supports bounded concurrency and restart from validated progress. A missing or corrupt checkpoint is rejected. EXHAUSTIVE is never recorded unless `blocksVerified == totalBlocks` and all receipt evidence agrees.

## Scalable acquisition and caching

Log ranges are deterministic and configurable per deployment. Each range performs bounded parallel outgoing/incoming topic queries. Requests use bounded retry with incremental backoff. Very large automatic adaptive ranges are not used because deterministic coverage and provider-specific limits are easier to audit with explicit chunk configuration.

The evidence-cache prototype uses exact chain, token, range, boundary-hash, finalized-context, and provider keys plus content digests. Cache hits are hints until their context and digest validate; they cannot override current provider disagreement or registry state.

## Required receipt language

Every CORROBORATED Receipt V3 includes:

> Historical event evidence was corroborated across configured operators. Correlated omission across shared upstream infrastructure cannot be mathematically excluded.

Targeted transaction-receipt checks prove discovered events are genuine. They do not prove that no undiscovered event was omitted. Start/end balances and sparse checkpoints likewise do not prove absence of a restored temporary breach.
