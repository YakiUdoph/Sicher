# Sicher Competition Submission Draft

This is a working draft. Submission-form field limits, required attachments, eligibility wording, and judging criteria are **NEEDS ORGANIZER VERIFICATION** because they are not present in the repository.

## Project + links

- **Project:** Sicher
- **Tagline:** Proof, not promises.
- **Secondary line:** The record remembers.
- **Website:** <https://sicherd.vercel.app/>
- **Repository:** <https://github.com/YakiUdoph/Sicher>
- **Network:** Elysium Testnet, chain ID `99801`
- **Status:** Working testnet competition build

Current release notice: a MetaMask malicious-site classification affecting the production Vercel domain is under external review. Users must not bypass an active wallet warning. The completed public proof records can be demonstrated without connecting a wallet.

## Project overview

Sicher turns a measurable balance promise into an inspectable historical record. A project can end an interval with enough funds while hiding a temporary shortfall that occurred earlier. Sicher records the minimum-balance terms before the outcome, reconstructs the full completed interval, and publishes a repeatable verdict with a readable evidence receipt.

The current V1 supports `MIN_BALANCE` for the reviewed STEST accounting model on Elysium Testnet. Commitment #2 is the core demonstration: it promised 80,000 STEST, moved `100,000 -> 92,000 -> 15,000 -> 100,000`, and is `NOT_PROVEN` because recovery does not rewrite history. Commitment #1 is the positive control and is `PROVEN` with a 92,000 STEST minimum observed balance.

Verdicts and receipts are computed by an off-chain verifier run by a Sicher operator. Commitment terms are recorded on-chain. `CORROBORATED` describes the evidence method and retains an explicit correlated-omission limitation.

## Product demo

1. Open the homepage and frame the snapshot-versus-history problem.
2. Open Commitment #2 from Explore.
3. Show its 80,000 STEST promise and the complete `100,000 -> 92,000 -> 15,000 -> 100,000` path.
4. Show `NOT_PROVEN / CORROBORATED` and explain that the 15,000 STEST breach survives recovery.
5. Open Receipt V3 and briefly expose the human summary and technical provenance.
6. Show Commitment #1 as the `PROVEN` positive control.

Until the external wallet classification is cleared, the demo uses completed wallet-free records and does not connect a wallet. See [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).

## Current status + launch plan

### Current status

- Live application and contracts on Elysium Testnet.
- Deployed registry and STEST test asset.
- Completed verified public records #1 and #2.
- Historical verifier, evidence corroboration, Receipt V3, and fail-closed validation.
- Public responsive frontend and wallet transaction preparation.
- Post-window verification and publication performed by a Sicher operator.
- Production domain/wallet security review pending.

### Launch plan

1. Resolve the current wallet/domain classification through official security-provider review.
2. Improve RPC resilience and production observability.
3. Automate completed-window verification and validated receipt publication without weakening fail-closed gates.
4. Add stronger evidence independence and operational review tooling.
5. Pilot the single well-defined `MIN_BALANCE` workflow before expanding rules or networks.

No mainnet or production-readiness claim is made. Timing and competition-specific milestones are **NEEDS ORGANIZER VERIFICATION**.

## After launch

The product hypothesis is that grant programs, ecosystem programs, DAOs, treasuries, and counterparties may need measurable historical commitment workflows. Potential paid offerings include verification operations, monitoring, reporting, integrations, and higher-assurance evidence. This hypothesis has not yet been validated through customers or revenue.

Future work may include program dashboards, APIs, additional networks, and additional commitment rules after design and testing. No `$SICHER` token utility or launch plan is established.

## Team

- Team members: **[TBD BY SUBMITTER]**
- Roles: **[TBD BY SUBMITTER]**
- Relevant biography: **[TBD BY SUBMITTER]**
- Contact details: **[TBD BY SUBMITTER]**

## Support needed from Ascend

- Review of the problem framing and strongest initial user segment.
- Introductions to Elysium ecosystem programs willing to evaluate a testnet pilot.
- Guidance on operationalizing verification and evidence publication.
- Security and infrastructure feedback on provider independence, RPC reliability, and domain reputation.
- Product and commercialization feedback for a credible service model.
- Confirmation of submission requirements and any launch expectations: **NEEDS ORGANIZER VERIFICATION**.
