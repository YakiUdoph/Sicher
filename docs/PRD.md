# Sicher Product Requirements Document

## Product definition

Sicher records a measurable wallet commitment before its outcome and checks whether it held throughout the defined period. Current V1 runs on Elysium Testnet and supports one rule: maintain at least a stated STEST balance.

The product principle is:

> A wallet can look healthy today and still have broken its promise yesterday.

## Problem

A current balance answers “What is in this wallet now?” It does not establish that the wallet stayed above a promised amount throughout an earlier period.

Commitment #2 demonstrates the gap:

```text
Promise: keep at least 80,000 STEST
Path:    100,000 -> 92,000 -> 15,000 -> 100,000
Result:  NOT_PROVEN / CORROBORATED
```

The ending balance recovered, but the commitment was broken. Endpoint-only checks can miss that temporary breach.

## Target users

### Promise makers

Projects or organizations that want to make a measurable public wallet-balance commitment, including possible treasury, reserve, grant-related, or community fund use cases.

### Promise checkers

Communities, partners, funders, grant providers, and other stakeholders performing due diligence on those commitments.

These are target users and use cases, not claims of current adoption, customers, or partnerships.

## Jobs to be done

- **Make a commitment:** fix a wallet, token, minimum balance, and period before the outcome.
- **Check a commitment:** inspect the original terms, current lifecycle, and any validated result.
- **Understand a breach:** see the historical balance path rather than only the ending balance.
- **Share a result:** use a readable public receipt while retaining technical provenance and limitations.
- **Fail safely:** show checking, delayed, pending, or indeterminate states instead of guessing a terminal result.

## Why Elysium is used

The commitment is recorded on Elysium Testnet before the outcome. The registry provides an independently inspectable record of the wallet, token, minimum balance, and block period. That prevents the product from silently redefining the original promise after the result is known.

Historical evaluation and receipts remain off-chain. Elysium does not eliminate every trust assumption; the verifier and evidence boundaries remain explicit.

## V1 scope — built now

- Elysium Testnet, chain ID `99801`.
- Canonical registry `0x4e4887e28a8370678a9a37c08a85c65450b510c0`.
- Sicher Test Token at `0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7`.
- `MIN_BALANCE` commitments only.
- Conventional ERC-20 `Transfer` accounting for the reviewed STEST model.
- User-authorized commitment transactions.
- Dynamic discovery of immutable registry commitments.
- Historical evaluation across inclusive commitment intervals.
- Validated Receipt V3 result publication.
- `PROVEN` and `NOT_PROVEN` terminal results when required evidence passes.
- Scheduled, running, checking, delayed, pending, or indeterminate behavior when no safe terminal result exists.
- Automatic off-browser processing and protected publication infrastructure.

STEST is a test token. It is not `$SICHER`, and no economic value or token utility is claimed.

## Core user journey

### Promise maker

1. Open **Make a commitment**.
2. Understand that the wallet must stay at or above the chosen balance for the whole period.
3. Choose the wallet, review STEST, set the minimum, and choose future start/end blocks.
4. Review the exact public terms.
5. Authorize or reject the registry transaction in the wallet.
6. After confirmation, inspect the public commitment while the period progresses.

### Promise checker

1. Open **Explore commitments** without connecting a wallet.
2. Find the commitment by ID or status.
3. Distinguish recorded existence from a validated result.
4. For a terminal result, inspect the promise, historical path, verdict, assurance, and receipt.
5. Treat checking or delayed states as nonterminal; never infer success from missing evidence.

## Functional requirements

### Commitment creation

- Show the human purpose before technical fields.
- Capture the subject wallet, positive STEST minimum, future start block, and later end block.
- Show exact terms and public-record disclosure before the wallet action.
- Preserve wallet, chain, simulation, gas, fee, duplicate, and ambiguity safeguards.
- Treat creation as a recorded promise, never proof of success.

### Discovery and presentation

- Discover canonical registry commitments dynamically; do not hardcode IDs.
- Show lifecycle state independently from terminal results.
- Use a result only when a validated published receipt agrees with registry terms.
- Explain `PROVEN`, `NOT_PROVEN`, and `CORROBORATED` in plain language first.
- Keep technical details available without making them the primary explanation.

### Verification and publication

- Read authoritative registry terms and required historical evidence.
- Reconstruct balances in exact integer base units across the entire inclusive interval.
- Compare required evidence sources, finality context, and receipt-derived evidence.
- Reject malformed, missing, inconsistent, wrong-chain, unsupported, or unfinalized inputs.
- Publish at most validated results; infrastructure failure must never become success.

## Non-goals

- Mainnet or production-readiness claims.
- Custody, escrow, wallet protection, or movement of user funds.
- Rules other than `MIN_BALANCE`, including `MAX_OUTFLOW`.
- Universal support for arbitrary ERC-20 behavior.
- On-chain verdict computation or on-chain receipts.
- Claims of customers, revenue, partnerships, traction, or finalized `$SICHER` utility.
- Presenting `CORROBORATED` as exhaustive or mathematically certain.

## Success criteria

### Product comprehension

A first-time visitor should understand within roughly 10–15 seconds:

- what problem Sicher solves;
- who makes and checks commitments;
- why today's balance is insufficient;
- what action to take; and
- why the promise is recorded on Elysium before the outcome.

### Product operation

- Valid supported commitments are discoverable without hardcoded IDs.
- A temporary breach remains visible after recovery.
- Terminal status and assurance remain separate.
- Missing or unsafe evidence produces no invented terminal result.
- A future validated runtime result can appear without rebuilding the frontend.

### Early operational measures

- time from finalized interval to validated published result;
- rate of safe terminal completion versus infrastructure-driven delay;
- provider disagreement and acquisition failure rates;
- receipt validation and reproduction success;
- user comprehension of verdict versus assurance; and
- accidental duplicate or unresolved-send rates.

No target values or market validation are claimed yet.

## Current limitations

- Testnet-only deployment and test asset.
- One commitment rule.
- Conventional ERC-20 `Transfer` accounting only.
- Future-start enforcement exists in the frontend, not the deployed contract.
- Registry-level duplicate prevention is not implemented.
- Wallet broadcast ambiguity can remain unresolved.
- Evidence sources share upstream infrastructure, so correlated omission cannot be mathematically excluded.
- Receipts are off-chain digest-checked artifacts, not signatures or on-chain anchors.
- The product is not production-ready.

## Future direction

The long-term product direction is:

> Make important financial promises independently checkable before people are asked to trust them.

### Next — proposed, not built

- broader measurable treasury or reserve commitment rules;
- easier public sharing of commitment results;
- organization or project profiles;
- notifications; and
- improved recurring-commitment workflows.

### Later — exploratory

- production assets and networks after separate review;
- integrations and APIs;
- organization-level tooling; and
- recurring financial commitment programs.

A possible future business direction is paid advanced tooling for organizations making recurring commitments: organizational management, verification operations, reporting, and integrations. Public results could remain useful to communities, partners, and funders. Sicher does not currently charge, and no pricing, customers, or revenue are claimed.
