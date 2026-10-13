# Phase 6 Trust Boundary

The Phase 6 candidate is a new verification path. It does not alter or replace the frozen Phase 5 files. Its purpose is to make incomplete evidence produce `INDETERMINATE`, bind proof terms to registry storage, and make local verification records tamper-evident.

## Input classification

| Input | Classification | Authority and validation |
|---|---|---|
| Chain ID returned by each RPC | AUTHORITATIVE CHAIN EVIDENCE | Every usable provider must return the configured chain ID. Configuration selects the intended chain; it does not override the returned value. |
| Registry address | CONFIGURATION | Required entry-point input. Every provider reads the same address. The candidate does not claim that an arbitrary configured registry is the canonical Sicher registry. |
| Commitment ID | CONFIGURATION | Required entry-point input and required to equal the on-chain record's returned ID. |
| Creator, subject, token, minimum, start block, end block | AUTHORITATIVE CHAIN EVIDENCE | Read from `commitments(id)` independently through each provider. Provider results must agree. |
| Historical starting balance | AUTHORITATIVE CHAIN EVIDENCE | Read using `balanceOf(subject)` at `startBlock - 1` from every provider; values must agree. |
| Transfer logs and ordering metadata | AUTHORITATIVE CHAIN HISTORY | Independently acquired in deterministic ranges and compared byte-for-byte after normalization. |
| `PHASE6_CACHED_*` values | CACHE | Optional. Any disagreement with registry storage makes registry binding fail; cache values never override chain values. |
| `phase5-tool/*.json` | CACHE / PRESENTATION | Not read by the Phase 6 verifier and cannot determine a verdict. |
| Phase 5 evidence JSON | CACHE / AUDIT RECORD | Not authoritative for Phase 6 reconstruction and not read by its verifier. |
| RPC endpoint URLs and provider names | CONFIGURATION | Select evidence sources. URLs are sanitized in output. Distinct URLs do not prove distinct operators or infrastructure. |
| Log chunk size and bounded retry count | CONFIGURATION | Affect acquisition mechanics, not commitment terms. Complete exact coverage remains mandatory. |
| Finalized head | AUTHORITATIVE CHAIN EVIDENCE WITH RPC TRUST | Read from every configured provider using the standard `finalized` tag. Providers must return the same finalized number and hash, and the inclusive end block must be at or below it before a terminal verdict. No invented confirmation count is used. |
| Token compatibility allowlist | LOCAL SOFTWARE | The candidate supports only the reviewed STEST address with its exact deployed runtime SHA256. Other code is `UNSUPPORTED` or `UNVERIFIED`. |
| Reconstruction and canonicalization algorithms | LOCAL SOFTWARE | Their combined source fingerprint is embedded in every candidate verification record. |
| Evidence manifest and verification record | PRESENTATION / TAMPER-EVIDENT RECORD | Digested using canonical serialization. They are editable local files, not immutable receipts. |

## Verdict gates

A final `PROVEN` or `NOT_PROVEN` requires all of the following:

1. Every provider reports the requested chain ID.
2. Registry reads agree and return the requested commitment ID.
3. Optional cached terms, if supplied, agree with registry storage.
4. Historical starting balances agree.
5. Every deterministic inclusive block range succeeds exactly once for every provider.
6. At least two providers return identical normalized relevant evidence.
7. The token is the reviewed conventional STEST implementation, identified by address and deployed runtime fingerprint.
8. The latest head is strictly above the inclusive end block, configured providers agree on the `finalized` head, and `endBlock <= finalizedBlock`.
9. Providers agree on the start, end, minimum-causing, and starting-balance-context block hashes wherever those boundaries are available.

Any failed evidence or binding gate returns `INDETERMINATE`. While a fully evidenced window remains active, the final verdict is `PENDING`; breach status is reported separately as `OBSERVED` or `NOT_OBSERVED`.

## Provider and finality limitations

Two distinct public endpoints were available during remediation: the existing Hypedexer endpoint and the documented Kinetiq endpoint. Matching results protect against a one-sided omission in the tested scans, but operational independence between those services was not established. `PROVIDER INDEPENDENCE VERIFIED` therefore remains false.

No justified numerical L2 confirmation depth was established. The competition candidate instead requires matching standard `finalized` heads from Hypedexer and direct Conduit and pins critical evidence to matching hashes. These are separately operated RPC services with shared upstream Elysium dependencies; the result is cross-operator corroboration, not fully independent or mathematically complete history.

## Receipt integrity

The candidate uses lexicographically sorted JSON object keys, base-10 strings for `BigInt`, UTF-8 bytes, and SHA256. The receipt digest is computed with the `receiptDigest` field omitted. The evidence-manifest digest and verifier source fingerprint are included in the record.

This detects later edits when the digest is checked against a trusted copy. It does not make the file immutable, prove publication time, identify a signer, or anchor the record on-chain.
