# Sicher historical competition record

This document preserves the repository's historical competition/submission material. Some content was prepared for submission or judging and may not reproduce the exact final submitted form. The repository does not establish the final form fields, attachments, team entries, eligibility wording, judging criteria, or organizer verification, so those values remain historically uncertain rather than being reconstructed.

## Project

- **Name:** Sicher
- **Tagline:** Proof, not promises.
- **Closing line:** The record remembers.
- **Website:** <https://sicherd.vercel.app/>
- **Repository:** <https://github.com/YakiUdoph/Sicher>
- **Network:** Elysium Testnet, chain ID `99801`
- **Status:** Working testnet V1; not production-ready

## Problem

A wallet can look healthy today and still have broken its promise yesterday.

A current wallet balance answers what is there now. It does not necessarily show whether the wallet stayed above a promised amount throughout an earlier period. Funds can leave temporarily, return before someone checks, and make the ending snapshot look healthy.

## Who needs it

Sicher is designed around two sides:

- projects or organizations making measurable treasury, reserve, grant-related, or community fund commitments; and
- communities, partners, funders, or other stakeholders checking those commitments.

These are target use cases. Sicher does not claim current customers, partnerships, revenue, or adoption.

## The real #2 example

Commitment #2 promised to keep at least 80,000 STEST throughout its period:

```text
100,000 -> 92,000 -> 15,000 -> 100,000 STEST
```

The final balance recovered to 100,000. During the period, however, it fell to 15,000. The result is **NOT_PROVEN / CORROBORATED**.

**The money came back. The broken promise didn't disappear.**

Commitment #1 is the positive comparison: its validated minimum stayed at 92,000 against an 80,000 promise, producing **PROVEN / CORROBORATED**.

## What Sicher does

1. A promise maker records a wallet, token, minimum balance, and period before the outcome.
2. The commitment period happens.
3. Sicher evaluates the historical activity across the full period.
4. A validated result and receipt are published only when the evidence passes the required gates.
5. Promise checkers inspect the public terms, result, historical path, assurance, and limitations.

When verification cannot safely complete, Sicher shows a nonterminal or delayed state instead of guessing.

## Why Elysium matters

The commitment is recorded on Elysium Testnet before the outcome. The registry creates an independently inspectable record of the wallet, token, minimum, and block period. The original promise cannot simply be rewritten in the product after the outcome is known.

Historical evaluation and receipts are off-chain. Sicher does not claim that blockchain removes every trust assumption.

## What works today

- `MIN_BALANCE` commitments on Elysium Testnet.
- User-authorized commitment transactions.
- Dynamic discovery of real registry commitments.
- Historical interval evaluation for the reviewed conventional STEST model.
- Validated Receipt V3 records.
- `PROVEN` / `NOT_PROVEN` when sufficient evidence exists.
- Safe checking and delayed states when no validated result is available.
- The automatic off-browser processing and protected publication infrastructure described in the competition preparation material.
- Runtime result discovery without a frontend rebuild.
- Public, wallet-free review of commitments and results.

STEST is Sicher Test Token. It is not `$SICHER` and has no claimed economic value.

## Originality

Sicher is not merely another current-balance display. Its distinctive product idea is the combination of:

- a **pre-recorded** measurable commitment;
- evaluation across the **defined period**, not only at the end; and
- a public result that preserves a temporary breach after the balance recovers.

Sicher does not claim to have invented blockchain monitoring or reserve verification. The contribution is turning that interval-versus-snapshot gap into a focused, inspectable commitment product.

## Current limitations

- Elysium Testnet only; no Mainnet claim.
- `MIN_BALANCE` only; `MAX_OUTFLOW` is not implemented.
- Conventional ERC-20 `Transfer` accounting only.
- Shared evidence infrastructure means correlated omission cannot be mathematically excluded.
- Receipts and verdict computation are off-chain.
- Frontend-only future-start enforcement in the deployed contract version.
- No production-readiness, custody, escrow, customer, or traction claim.

## Long-term vision

> Make important financial promises independently checkable before people are asked to trust them.

### Now

Minimum-balance commitments on Elysium Testnet.

### Next — potential future work

- broader measurable treasury or reserve rules;
- easier public sharing of results;
- organization or project profiles;
- notifications; and
- improved recurring-commitment workflows.

### Later — exploratory

- production assets or networks after separate review;
- integrations and APIs;
- organizational tooling; and
- recurring financial commitment programs.

## Possible sustainability direction

Organizations making recurring commitments could eventually pay for advanced organizational, commitment, verification, reporting, or integration tooling. Public results could remain useful to communities, partners, funders, and other stakeholders.

This is a possible future business model. Sicher does not currently charge money and claims no pricing, customers, or revenue.

## Demonstration

The prepared demo order followed the product story rather than the architecture:

1. Explain why a final wallet snapshot can hide a temporary breach.
2. Open Commitment #2 and show the 80,000 STEST promise.
3. Trace `100,000 -> 92,000 -> 15,000 -> 100,000`.
4. Show `NOT_PROVEN` and the readable receipt.
5. Open Explore and explain terminal versus checking states.
6. Open Make a commitment and explain pre-recording without submitting a transaction.

The prepared presentation was approximately 105–110 seconds and ended by returning to Commitment #2 or the Sicher mark. It used completed public records: presenters were instructed not to connect a wallet, submit a transaction, or bypass an active wallet-provider warning. `PROVEN` and `NOT_PROVEN` were presented as results, `CORROBORATED` as a separate non-exhaustive assurance level, and the on-chain commitment was kept distinct from off-chain verification and receipts.

## Historical judge-facing explanation

A project might voluntarily use Sicher to make exact terms inspectable before asking others to trust a financial commitment. This does not protect the wallet or prevent a breach; it makes the promise and supported outcome checkable.

A block explorer or current-balance monitor answers a related but different question. A reviewer could manually reconstruct suitable historical chain data, while Sicher combines pre-agreed terms, full-interval evaluation, fail-closed handling, and a readable result and receipt. The registry supplies the pre-outcome record; the browser and verifier do not turn that record alone into proof that the promise was kept.

Sicher does not custody or move funds. The current action is a user-authorized, zero-value registry transaction with no token approval, escrow, key custody, or message-signing flow. Results and Receipt V3 remain off-chain.

The prepared demo trust explanation relied on public registry terms, retained evidence, digest-checked receipts, frozen implementation fingerprints, public source, and completed wallet-free records #1 and #2. It explicitly retained provider and operator limitations instead of describing the system as trustless.

## Current safety notice

A MetaMask malicious-site classification affecting the production Vercel domain remains under external review. Users and judges must not bypass an active wallet warning. The demo can use completed wallet-free records and must not submit a transaction.

## Historically unresolved submission administration

The repository does not establish the exact submitted team members, roles, biographies, contact details, Ascend form requirements, or organizer-confirmed values. No replacement values are inferred here.
