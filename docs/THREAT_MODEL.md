# Sicher Competition Verifier Threat Model

## Security boundary

Sicher verifies a conventional ERC-20 minimum-balance commitment from finalized, block-pinned chain data. The verifier treats its configured operators, the chain's shared infrastructure, local software, and local configuration as explicit trust boundaries. A stronger assurance label describes more evidence; it never changes the underlying proof result.

## CORROBORATED mode protects against

- one configured RPC omitting a relevant event when the other returns it;
- one RPC returning different relevant event data;
- missing, failed, duplicate, overlapping, or unexpected requested log ranges;
- local cached-state substitution, because registry terms are re-read and optional cache entries require exact finalized-context keys and digests;
- registry substitution in competition mode;
- the wrong chain ID;
- a wrong or unsupported token under the supported-token policy;
- disagreement in block-pinned historical starting or ending balances;
- a reconstructed final balance that differs from `balanceOf` at the pinned end block;
- a non-finalized end block;
- Receipt V3 tampering, malformed fields, unsupported schemas, and forged assurance labels; and
- negative, malformed, or unsafe transaction/log ordering metadata.

Every event discovered through `eth_getLogs` is also checked in its transaction receipt on every configured operator. This confirms that a discovered event and its block, transaction, emitter, topics, data, and ordering metadata are genuine and consistent.

## CORROBORATED mode does not guarantee

- absence of a correlated omission across all configured sources;
- correctness of malicious or corrupted shared sequencer history;
- absence of shared AnyTrust or data-availability failure;
- safety after compromise of every evidence operator;
- correct accounting for rebasing, fee mechanics, or another unsupported token model; or
- absolute mathematical completeness of RPC history.

The required receipt disclosure is:

> Historical event evidence was corroborated across configured operators. Correlated omission across shared upstream infrastructure cannot be mathematically excluded.

CORROBORATED is not described as trustless and is not equivalent to EXHAUSTIVE.

## EXHAUSTIVE mode

EXHAUSTIVE includes every CORROBORATED check and independently enumerates every block and transaction receipt in the proof interval. Receipt-derived token events must exactly match log-query evidence across operators.

The exhaustive runner uses bounded concurrency, digest-chained checkpoints, persisted progress callbacks, and validated resume state. Corrupt or non-contiguous progress is rejected. EXHAUSTIVE may be expensive and is never claimed unless all blocks are verified. An explicitly requested fallback may separately produce CORROBORATED assurance; otherwise incomplete exhaustive work is `INDETERMINATE`.

## Balances, checkpoints, and caches

Starting and ending balances are consistency checks. Sparse intermediate balance checkpoints are also only corroboration. A breach and restoration between checkpoints can be missed, so none of these checks establishes event-history completeness.

Evidence-cache keys include chain ID, token, inclusive range, boundary hashes, finalized block/hash, and provider. Entries include evidence and cache digests. A cache entry is usable only under an exact expected finalized context; stale or differently pinned entries are rejected and never authoritative on their own.
