# Sicher 90-Second Demo Script

## Presenter safety

Use the existing completed public records. Do not connect a wallet and do not bypass an active MetaMask or wallet-provider warning. Open the public pages directly in a wallet-free browser session.

## Script

| Time | Screen action | Voiceover | Expected visual |
| --- | --- | --- | --- |
| 0:00-0:10 | Open the Sicher homepage. | “A final wallet balance can hide what happened earlier. Sicher checks the interval, not just the snapshot.” | Homepage hero and “Proof, not promises.” |
| 0:10-0:20 | Open **Explore proofs**. | “The terms are recorded before the outcome. These are real Elysium Testnet records, and the public product currently shows commitments one and two.” | Explore cards for #1 and #2. |
| 0:20-0:35 | Open Commitment #2. Point to the promise. | “This project promised to keep at least eighty thousand STEST for the whole block interval.” | Commitment #2 with 80,000 STEST minimum. |
| 0:35-0:55 | Trace the path from left to right. | “It started at one hundred thousand, moved to ninety-two thousand, dropped to fifteen thousand, then recovered to one hundred thousand.” | `100,000 -> 92,000 -> 15,000 -> 100,000 STEST`. |
| 0:55-1:07 | Point to the result and assurance. | “Someone checking only the final balance might think the promise was kept. Sicher found the temporary breach. The verdict is Not proven. Recovery does not rewrite history.” | `NOT_PROVEN` and `CORROBORATED`, visually separate. |
| 1:07-1:18 | Open Commitment #2's receipt. | “The receipt keeps the human explanation beside exact blocks, evidence, fingerprints, and the disclosed assurance limits.” | Receipt human summary; optionally expand technical details if already loaded. |
| 1:18-1:26 | Navigate to Commitment #1. | “Commitment one is the positive control: an eighty-thousand minimum, a ninety-two-thousand observed minimum, and a Proven result.” | Commitment #1 showing `PROVEN / CORROBORATED`. |
| 1:26-1:30 | Return focus to the result or logo. | “Proof, not promises. The record remembers.” | Sicher branding or proof summary. |

## RPC or network fallback

The completed proof pages use the prepared public records and do not require a live wallet or transaction. Before presenting, open these routes in separate tabs:

- <https://sicherd.vercel.app/explore>
- <https://sicherd.vercel.app/proof/2>
- <https://sicherd.vercel.app/proof/2/receipt>
- <https://sicherd.vercel.app/proof/1>

If a route is slow, move to the already loaded tab. Do not switch to `/start`, connect a wallet, or improvise a transaction. If production is unavailable, use a clean local build of the same release commit and clearly state that the fallback is local.

## Claims boundary

- Say “Sicher currently runs on Elysium Testnet,” not “production-ready.”
- Say Commitment #2 is `NOT_PROVEN / CORROBORATED`, not exhaustively or trustlessly proven.
- Do not say verdicts or receipts are on-chain.
- Do not describe STEST as `$SICHER` or as an economic asset.
