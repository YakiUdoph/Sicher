# Frontend Integration Contract

This contract defines the read-only boundary between the frozen competition verifier and any later presentation layer. It does not authorize or implement frontend work.

## Authority boundary

The verifier is the sole authority for proof semantics. A frontend may render only a Receipt V3 envelope that has passed the exported `verifyReceiptV3` validation, whose evidence-manifest digest and implementation fingerprints have also been checked against the frozen package.

The frontend **must never calculate, alter, upgrade, or infer a verdict** from balances, events, labels, timing, or UI state. In particular, it must not turn a displayed balance path into `PROVEN` or `NOT_PROVEN`. It renders the verifier-provided `proofResult` exactly.

If validation fails, a required field is absent, or the receipt does not match the frozen fingerprints, the frontend must show a verification error or `INDETERMINATE`; it must not guess a terminal result.

## Read-only representation

A presentation adapter may expose this view after successful verifier validation:

```ts
type VerifiedCommitmentView = Readonly<{
  schemaVersion: "sicher.competition-receipt/3.0";
  commitment: Readonly<{
    chainId: string;
    registryAddress: `0x${string}`;
    commitmentId: string;
    creator: `0x${string}`;
    subject: `0x${string}`;
    token: `0x${string}`;
    proofType: string;
    minimumRequiredBaseUnits: string;
    tokenDecimals: number;
    startBlock: string;
    endBlock: string;
  }>;
  result: Readonly<{
    proofResult: "PROVEN" | "NOT_PROVEN" | "PENDING" | "INDETERMINATE";
    assuranceLevel: "CORROBORATED" | "EXHAUSTIVE";
    windowStatus: string;
    breachStatus: string;
    evidenceStatus: string;
    finalityStatus: string;
    reason?: string;
  }>;
  balances: Readonly<{
    startingBalanceBaseUnits: string;
    minimumObservedBaseUnits: string;
    finalBalanceBaseUnits: string;
    pathBaseUnits?: readonly string[];
  }>;
  breachEvidence: Readonly<{
    blockNumber: string;
    blockHash: `0x${string}`;
    transactionHash: `0x${string}` | null;
    transactionIndex: number | null;
    logIndex: number | null;
  }>;
  provenance: Readonly<{
    providers: readonly string[];
    finalizedBlock: string;
    finalizedBlockHash: `0x${string}`;
    verifierFingerprint: string;
    coreFingerprint: string;
    evidenceManifestDigest: string;
    receiptDigest: string;
    limitations: readonly string[];
  }>;
}>;
```

`pathBaseUnits`, when presented, must come from the successfully evaluated verifier output or a trusted read-only adapter over that output. It is explanatory evidence, not an alternate verdict source.

## Rendering rules

- Preserve all identifiers, hashes, decimal base-unit values, results, assurance labels, and limitations exactly as supplied.
- Treat block numbers and token quantities as decimal strings. Do not convert them to JavaScript `number`; use string formatting or `bigint` only for display formatting.
- Display human-readable token amounts only as a derived presentation beside the exact base-unit string, using the receipt's `tokenDecimals`.
- Keep `proofResult` and `assuranceLevel` visually and semantically separate. Assurance describes the evidence method; it does not change the result.
- Show `minimumCausingEvidence` for a breach and keep nullable transaction/log fields nullable.
- Display the receipt digest and material limitations with the result so provenance is inspectable.
- Do not suppress `PENDING`, `INDETERMINATE`, validation errors, or limitations to create a more favorable status.
- Do not fetch chain data in the browser to recompute or override the verifier result.

## Compatibility and change control

Consumers must reject unknown schema versions unless a reviewed adapter explicitly supports them. Any change to verdict semantics, Receipt V3 validation, assurance rules, or frozen fingerprints requires a new review; a UI-only change must still preserve this authority boundary.
