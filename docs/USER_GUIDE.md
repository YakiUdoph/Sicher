# Sicher User Guide

## Temporary wallet safety notice

The production Vercel domain is currently under review after a MetaMask malicious-site warning was observed. If your wallet provider shows an active security warning, do not bypass it and do not connect. You can review the existing completed proof records without a wallet.

## What Sicher shows

Sicher shows whether a recorded minimum-balance promise held throughout a completed block interval. Looking only at today's balance can miss money that left temporarily and later returned.

The current product runs on Elysium Testnet and supports one proof type: keeping at least a minimum STEST balance.

## Explore existing proofs

1. Open <https://sicherd.vercel.app/explore>.
2. Choose Commitment #1 or Commitment #2.
3. Review the promised minimum, lowest observed balance, result, and assurance label.
4. Open the proof for the historical path and explanation.
5. Open the receipt for the human summary and optional technical details.

The public product currently contains only commitments #1 and #2.

## Understanding the result

### Proven

`PROVEN` means the accepted evidence shows that the balance stayed at or above the promised minimum for the full interval. Commitment #1 required 80,000 STEST and its lowest observed balance was 92,000 STEST.

### Not proven

`NOT_PROVEN` means the commitment was broken during the interval. Commitment #2 fell to 15,000 STEST against an 80,000 STEST minimum. Its later return to 100,000 STEST does not erase the breach.

### Corroborated

`CORROBORATED` describes how the evidence was checked; it is not the verdict. The implemented process compared evidence across configured sources and checked discovered events against transaction receipts. Shared infrastructure could still cause the same omitted history to appear across sources, so Corroborated does not mean exhaustive or trustless.

## Viewing a receipt

From a proof page, choose **Open receipt**. The receipt shows:

- what was promised;
- the lowest observed balance;
- the result;
- the assurance label; and
- the historical balance path.

Technical details expose the chain, addresses, block range, evidence transaction, hashes, providers, receipt digest, and implementation fingerprints. The receipt is an off-chain record, not an on-chain object.

## What STEST means

STEST means **Sicher Test Token**. It is used for this Elysium Testnet demonstration. It is not `$SICHER`, and Sicher assigns it no economic value or promised utility.

## How starting a proof normally works

When wallet use is safe and no active warning is displayed, the normal flow is:

1. Open **Start a proof**.
2. Connect an injected wallet deliberately.
3. Switch to Elysium Testnet if requested.
4. Enter the subject wallet, minimum STEST balance, future start block, and later end block.
5. Review the exact terms and public-record disclosure.
6. Ask the wallet to review the registry transaction.
7. Authorize or reject the transaction in the wallet.

Sicher never asks for a seed phrase or private key. Creating the commitment does not transfer STEST and does not make the commitment Proven. It records the terms for later evaluation.

Do not perform these steps while your wallet reports the production domain as unsafe.

## What becomes public

The registry record is public on Elysium Testnet. It includes:

- creator wallet address;
- subject wallet address;
- token address;
- minimum balance;
- start block; and
- end block.

Blockchain records cannot be edited or deleted by Sicher. Never put private information into a public address or commitment field. Wallet secrets are not submitted.

## Why the entire interval matters

Commitment #2 ended at 100,000 STEST. A final snapshot alone could suggest success. The full path was:

```text
100,000 -> 92,000 -> 15,000 -> 100,000 STEST
```

The 15,000 STEST point is below the 80,000 STEST promise. That is why the result remains Not proven after recovery.

## What happens after the interval ends

After the interval ends, a Sicher operator currently completes these steps:

1. The operator waits for the completed interval and required finality.
2. The verifier reads registry terms and historical evidence.
3. It reconstructs the path and computes the result.
4. It generates and validates Receipt V3.
5. The operator prepares and publishes the public record.

This is not yet an automatically scheduled publication service. If required evidence is unavailable or inconsistent, Sicher does not assume success.

## Need technical detail?

See [`ARCHITECTURE.md`](ARCHITECTURE.md), [`SECURITY.md`](SECURITY.md), and [`COMPETITION_ASSURANCE_POLICY.md`](COMPETITION_ASSURANCE_POLICY.md).
