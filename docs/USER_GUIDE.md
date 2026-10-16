# Sicher User Guide

Sicher has two main paths:

- **I am making a promise:** choose **Make a commitment**.
- **I am checking somebody's promise:** choose **Explore commitments**.

You do not need a wallet to explore commitments or read published results.

## Before using a wallet

The production Vercel domain is under review after a MetaMask malicious-site warning was observed. If any wallet provider shows an active warning, do not bypass it and do not connect. Existing public commitments and results can still be reviewed without a wallet.

## If you are checking a promise

1. Open <https://sicherd.vercel.app/explore>.
2. Find a commitment by ID, token, or status.
3. Read **The promise** and **Current state**.
4. If a validated result exists, open the commitment to see what happened throughout the period.
5. Open the receipt for the plain-English summary and optional technical details.

These are commitments recorded on Elysium Testnet. Some have validated published results. Others may be scheduled, running, awaiting a result, checking, or delayed.

**A commitment appearing in Explore does not mean the promise was kept.** It means those terms exist in the canonical registry.

## If you are making a promise

You are recording a measurable promise before its outcome. Current V1 supports one rule:

> The chosen wallet must stay at or above the chosen STEST balance throughout the commitment period.

When wallet use is safe:

1. Open **Make a commitment**.
2. Connect an injected wallet deliberately.
3. Switch to Elysium Testnet if requested.
4. Enter the **wallet being measured**.
5. Review the token. V1 uses Sicher Test Token (STEST).
6. Enter the **promised minimum balance**.
7. Choose when the commitment **starts** and **ends** using future block numbers.
8. Review the exact public terms and disclosure.
9. Ask your wallet to review the registry transaction.
10. Authorize or reject the transaction in the wallet.

Creating a commitment does not transfer STEST and does not mean the promise is Proven. It records the terms so they can be checked after the period.

Sicher never asks for a private key, seed phrase, or token approval. Do not continue if the wallet displays a security warning.

## What the fields mean

- **Wallet being measured:** the public address whose STEST balance must satisfy the promise.
- **Token:** the asset being measured. Current V1 fixes this to STEST.
- **Promised minimum:** the lowest balance allowed during the period.
- **Start:** the future Elysium block where checking begins.
- **End:** the later Elysium block where the commitment period finishes.

The connected creator wallet and commitment terms become public on Elysium Testnet. Sicher cannot edit or delete those blockchain records.

## Why the whole period matters

Commitment #2 promised at least 80,000 STEST:

```text
100,000 -> 92,000 -> 15,000 -> 100,000 STEST
```

The final balance looks healthy, but the wallet fell to 15,000 during the period. The result is Not proven.

**The money came back. The broken promise didn't disappear.**

## Understanding statuses

### Proven

The measurable commitment held throughout the evaluated period. Commitment #1 required 80,000 STEST and its validated minimum observed balance was 92,000 STEST.

### Not proven

The commitment was broken during the period. Commitment #2 fell below 80,000 STEST even though the final balance later recovered.

### Checking result

The period has ended, but no validated result has been published yet. This is not a success or failure verdict.

### Result check delayed

The runtime result service is unavailable or validation could not safely complete. Sicher shows no terminal result.

### Corroborated

Checked across multiple configured sources. This is an assurance level, not a verdict or a claim of mathematical certainty. Shared upstream infrastructure can still create correlated omissions.

## What happens after the period

Sicher's automatic off-browser infrastructure detects eligible completed commitments, evaluates supported historical activity, validates Receipt V3, and uses a protected publication process. A result becomes public only if all required validation and publication gates pass.

If the evidence is missing, inconsistent, unsupported, or unsafe, the product does not guess. The commitment remains nonterminal or delayed.

## Viewing a receipt

From a result page, choose **Open receipt**. A validated receipt shows:

- what was promised;
- the lowest observed balance;
- the result;
- the assurance label; and
- the historical balance path.

Technical details expose chain, addresses, blocks, evidence references, providers, digests, fingerprints, and limitations. Receipt V3 is an off-chain record, not an on-chain verdict or signature.

If no validated receipt exists, the receipt route says so. It does not invent a path, result, or assurance label.

## What STEST means

STEST means **Sicher Test Token**. It is used only for this Elysium Testnet demonstration. It is not `$SICHER`, and Sicher assigns it no economic value or promised utility.

## Current limits

- Elysium Testnet only.
- `MIN_BALANCE` only.
- Conventional ERC-20 `Transfer` accounting only.
- Not production-ready.
- No custody, escrow, wallet protection, or token approvals.
- Corroborated evidence is not mathematically exhaustive.

For technical detail, see [Architecture](ARCHITECTURE.md), [Security](SECURITY.md), and the [Assurance policy](COMPETITION_ASSURANCE_POLICY.md).
