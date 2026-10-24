# Sicher Architecture

## Scope

This document describes the system currently deployed on Elysium Testnet. It separates the on-chain commitment record, automatic off-browser evaluation/publication, and the browser presentation layer.

## High-level flow

1. A user records a measurable commitment on Elysium Testnet before the outcome.
2. The commitment period happens.
3. Off-browser code evaluates historical activity across the full period.
4. A validated result and content-addressed receipt are published through protected automation.
5. The frontend discovers the registry commitment and, when available, its validated result.

The registry fixes what was promised. The off-chain verifier checks what happened. The browser presents those two sources without inventing a verdict.

## System view

```mermaid
flowchart LR
  subgraph Browser[Browser]
    UI[Explore / Start / Proof / Receipt UI]
    Wallet[Injected wallet]
  end

  subgraph Chain[ON-CHAIN: Elysium Testnet]
    Registry[SicherCommitmentProof registry]
    Token[STEST ERC-20 Transfer history]
  end

  subgraph Code[OFF-BROWSER AUTOMATED CODE]
    Acquire[Evidence acquisition]
    Verify[Deterministic verifier]
    Receipt[Receipt V3 construction and validation]
    Gate[Protected publication gates]
    Publish[Runtime result store]
  end

  UI -->|explicit connect and reviewed transaction| Wallet
  Wallet -->|createCommitment| Registry
  Registry -->|read-only discovery and immutable terms| UI
  Registry -->|terms and CommitmentCreated| Acquire
  Token -->|balanceOf and Transfer evidence| Acquire
  Registry -->|eligible completed commitments| Acquire
  Acquire --> Verify
  Verify --> Receipt
  Receipt --> Gate
  Gate --> Publish
  Publish -->|index and content-addressed receipt| UI
```

## Component boundaries

### On-chain

`SicherCommitmentProof` stores:

- commitment ID;
- creator;
- subject;
- token;
- minimum balance;
- start block; and
- end block.

It emits `CommitmentCreated`. It does not read historical balances, compute a verdict, generate a receipt, enforce a future start, or prevent duplicate terms.

STEST provides the conventional ERC-20 `Transfer` history used by the frozen evidence process. This architecture does not generalize that accounting assumption to arbitrary tokens.

### Off-chain automated code

- Browser-side validation and transaction construction.
- Read-only registry discovery using a single `nextCommitmentId` snapshot and bounded commitment reads.
- Provider RPC acquisition and deterministic range coverage.
- Evidence normalization, deduplication, and ordering.
- Balance reconstruction in integer base units.
- Assurance and finality gates.
- Receipt V3 construction, canonical digesting, and validation.
- Frozen frontend-data preparation and validation.

The scheduled workflow and activation controls are enabled. Current end-to-end operational health is degraded and failing closed: recent scheduled runs have repeatedly stopped because the configured providers disagreed on the finalized head.

### Automatic lifecycle and protected publication

The current off-browser lifecycle scans eligible commitments, evaluates at most the bounded supported work per run, validates Receipt V3 and publication transitions, and updates the runtime result store through a protected branch/PR process. Scheduler state can advance without inventing a result. Existing results are append-only under the transition rules.

Automation does not weaken the evidence boundary. Unsupported, incomplete, inconsistent, wrong-chain, or unfinalized inputs do not become terminal results. Repository owners retain operational control of the publication authorization gate and protected-branch policy.

## A. Creating a commitment

1. The browser reads the public Elysium head and passively reads wallet account/chain state.
2. The user explicitly connects the wallet if needed.
3. The user supplies subject, minimum, start block, and end block. V1 fixes the token to STEST.
4. The browser requires a nonzero subject, positive minimum, start strictly after the fresh head, and end after start.
5. The browser constructs a zero-value call to `createCommitment` on the canonical registry.
6. It performs `eth_call`, gas estimation, native gas-balance checking, and fee discovery.
7. Immediately before send, it rechecks account and chain.
8. Only the explicit submit action can invoke `eth_sendTransaction`.
9. A successful receipt must include the matching `CommitmentCreated` event, followed by registry readback.

The deployed contract independently rejects zero subject, zero token, zero minimum, and `endBlock <= startBlock`. Future-start enforcement exists only in the frontend.

## B. Verifying a completed commitment

1. Read commitment terms from registry storage through each configured provider.
2. Require provider agreement on chain and terms.
3. Read the subject's starting balance at `startBlock - 1`.
4. Acquire incoming and outgoing STEST `Transfer` logs for every deterministic inclusive range.
5. Normalize and compare the relevant evidence across configured providers.
6. Validate each discovered relevant event against its transaction receipt.
7. Check finality and consequential block hashes.
8. Apply ordered transfers to reconstruct the balance path.
9. Compare every reconstructed balance with the committed minimum.
10. Return the result and assurance separately.

For fixed accepted inputs, the reconstruction is deterministic. Completeness still depends on the configured evidence model and shared chain infrastructure.

## Event ordering

Events are sorted lexicographically by:

1. `blockNumber`
2. `transactionIndex`
3. `logIndex`

The ordering is required because multiple balance-changing transfers can occur within one block or transaction. Duplicate event keys are deduplicated; conflicting duplicates are rejected. Outgoing transfers subtract, incoming transfers add, and a self-transfer has zero net effect.

Local EVM tests have a narrower ordering surface: sequential `EVM.runCall` results do not provide meaningful block numbers, transaction indexes, or log indexes. Those tests preserve actual call-execution and returned log-array order instead of fabricating chain-ordering fields. Live reconstruction always uses the canonical tuple above.

## C. Publishing a receipt

1. The verifier constructs a Receipt V3 envelope containing terms, result, balances, evidence references, assurance, limitations, and fingerprints.
2. Canonical serialization omits the receipt-digest field while computing its SHA-256 digest.
3. The exported validator checks schema and digest integrity.
4. Frontend-data preparation additionally binds the record to frozen evidence, implementation fingerprints, and approved path provenance.
5. Protected automation publishes the validated index entry and content-addressed receipt only after transition checks pass.
6. The browser loads and validates the runtime index and receipt; it does not recompute or upgrade the verdict.

Receipt files are editable local/public files. Their digest is tamper-evident when compared with an expected value, but the receipt is not signed or anchored on-chain.

## Dynamic Explore lifecycle

Explore obtains existence and immutable terms from the canonical registry. During one load it verifies the chain, reads the head, snapshots `nextCommitmentId` once, and reads the resulting finite ID range with bounded concurrency. A malformed or partial registry read fails the complete live view rather than appearing as zero commitments.

The runtime public result store is a separate enrichment source. A terminal result is used only when its ID, creator, subject, token, minimum, and block range agree with the registry record and its receipt passes integrity checks. Without a matching published receipt, the head and publication state determine only nonterminal lifecycle labels; they never determine `PROVEN`, `NOT_PROVEN`, or `CORROBORATED`.

The frontend loads its packaged validated baseline and then discovers runtime results from the configured public result index. This allows a later valid result to appear without a source edit or frontend rebuild. Runtime failure retains only already validated fallback data and marks unresolved ended commitments safely rather than guessing.

## Fail-closed behavior

A terminal result is withheld when required evidence is missing, malformed, wrong-chain, incomplete, inconsistent, not finalized, or disagrees across required sources. Depending on the condition, the result remains `PENDING` or becomes `INDETERMINATE`. Missing data never implies `PROVEN`.

The frontend follows the same boundary: malformed or unavailable prepared records do not fall back to a positive commitment.

## Deployment identifiers

| Item | Value |
| --- | --- |
| Chain | Elysium Testnet |
| Chain ID | `99801` |
| Registry | `0x4e4887e28a8370678a9a37c08a85c65450b510c0` |
| STEST | `0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7` |

## Further technical records

- [`COMPETITION_VERIFIER_FREEZE.md`](COMPETITION_VERIFIER_FREEZE.md)
- [`COMPETITION_ASSURANCE_POLICY.md`](COMPETITION_ASSURANCE_POLICY.md)
- [`TRUST_BOUNDARY.md`](TRUST_BOUNDARY.md)
- [`FRONTEND_INTEGRATION_CONTRACT.md`](FRONTEND_INTEGRATION_CONTRACT.md)
