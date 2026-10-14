# Sicher Judge Q&A

## Product and problem

### What exactly is Sicher?

Sicher records a minimum-balance commitment before its outcome, reconstructs the completed interval, and publishes a repeatable verdict with a readable off-chain receipt. It currently runs on Elysium Testnet.

### Why does this need blockchain?

The registry supplies publicly readable, ordered commitment terms and creation evidence that the user cannot later edit through the contract. Token transfers and block ordering provide the historical evidence being evaluated. The verifier and receipt remain off-chain.

### Why isn't a wallet explorer enough?

A typical balance view answers “what is the balance now?” It does not by itself establish whether a threshold held throughout a past interval.

### Why isn't a snapshot enough?

A snapshot can be taken after funds return. Commitment #2 ended at 100,000 STEST but temporarily fell to 15,000 against an 80,000 minimum.

### What stops someone changing the terms later?

The deployed registry has no update or delete function for a stored commitment. A new commitment can be created, but the earlier record remains.

### What if funds leave temporarily and return?

The ordered interval reconstruction retains the low point. Recovery changes the later balance, not the earlier breach.

## Verification and receipts

### Where is the verdict computed?

In the off-chain verifier, using registry terms and accepted historical evidence. The same accepted inputs produce the same result.

### Is the verdict on-chain?

No.

### Is the receipt on-chain?

No. Receipt V3 is an off-chain JSON artifact with canonical digest and frozen provenance checks.

### Is Sicher trustless?

No. It depends on reviewed local software, configuration, configured RPC operators, and shared Elysium infrastructure.

### What does Corroborated actually mean?

The frozen process compared required evidence across its configured sources and checked discovered relevant events against transaction receipts. It is an assurance level, not a verdict or a claim of mathematically complete history.

### Can providers omit events?

Yes. Disagreement or a one-sided omission is designed to fail closed, but correlated omission across all configured sources and shared infrastructure cannot be mathematically excluded.

### What token types are supported?

The frozen evidence supports the reviewed conventional STEST ERC-20 accounting model. Rebasing, fee-on-transfer, and hidden balance mutations are unsupported.

### What happens if evidence is unavailable?

Missing, malformed, incomplete, wrong-chain, unfinalized, or disagreeing required evidence does not produce `PROVEN`. The applicable state remains `PENDING` or becomes `INDETERMINATE`.

## Contract and wallet behavior

### Who creates the commitment?

The wallet/user creates their own public registry commitment through an authorized transaction. The registry is also directly callable.

### Can someone create a commitment for a past range directly through the contract?

Yes. The deployed contract requires `endBlock > startBlock` but does not require a future start.

### Why is that allowed currently?

The frozen minimal contract records terms only. Future-start enforcement was added later in the frontend without changing the deployed contract or historical evidence. Contract-level enforcement is roadmap work.

### What prevents duplicate commitments?

The browser prevents common accidental duplicate sends through synchronous locking and persisted ambiguity states. The contract does not enforce uniqueness, so direct or cross-device duplicates remain possible.

### What happens if the wallet broadcasts but fails to return a hash?

The browser records public attempt metadata, blocks immediate retry, and offers bounded read-only event reconciliation. Zero matches remain unresolved and multiple matches remain ambiguous.

### Does Sicher custody funds?

No. The browser asks the wallet to authorize a zero-value registry call; Sicher does not hold the user's keys or STEST.

### Can Sicher move users' tokens?

The current frontend and registry transaction do not contain a token-transfer function. The user's own wallet remains able to move its tokens independently.

### Does Sicher request approvals?

No token approval flow or approval method is present in the audited source or deployed bundle.

### Does Sicher request signatures?

No message-signing or typed-data-signing method is present. The only write request is the explicit registry transaction.

## Token and business

### What is STEST?

Sicher Test Token, the reviewed demonstration token on Elysium Testnet.

### Is STEST `$SICHER`?

No. The repository assigns no `$SICHER` identity, economic value, or finalized utility to STEST.

### What is the business model?

A hypothesis: organizations may pay for historical commitment checks, monitoring, reporting, integrations, operational support, or higher-assurance evidence. It is not validated revenue.

### Who would pay?

Potential buyers include grant programs, ecosystem programs, DAOs, treasuries, and counterparties that need measurable historical commitments. No current customers are claimed.

### Who are the competitors or alternatives?

Alternatives include manual wallet/explorer review, bespoke monitoring, treasury dashboards, RPC-indexed analytics, and audit/reporting services. A current competitive-market comparison is **UNKNOWN** and would require separate research.

## Operations and roadmap

### What remains manual?

The operator currently initiates post-window verification, reviews retained evidence, generates and validates receipts, prepares public records, and publishes them.

### What would you build next?

Resolve domain security clearance, improve RPC resilience, automate completed-window verification/publication, strengthen evidence independence, and add contract-level future-start enforcement.

### Why Elysium?

The implementation, deployed contracts, and frozen evidence are on Elysium Testnet. Claims about unique Elysium capabilities or organizer requirements are **NEEDS ORGANIZER VERIFICATION**.

### What role could Ascend play?

Potentially product feedback, ecosystem pilot introductions, security/infrastructure guidance, and commercialization support. Exact program support and expectations are **NEEDS ORGANIZER VERIFICATION**.

### Is this production ready?

No. Sicher currently runs on Elysium Testnet, with verification performed by a Sicher operator, scoped token support, shared-provider limitations, frontend-only controls, and an unresolved external wallet-domain classification.

### What security limitations remain?

Correlated evidence omission, shared Elysium dependencies, unsupported token mechanics, human-controlled publication, client-only future-start/duplicate protections, hashless-send ambiguity, unsigned off-chain receipts, and ordinary browser/wallet/hosting risks.

## Current warning and demo integrity

### What is the current MetaMask warning?

The production Vercel domain has been observed receiving a MetaMask malicious-site warning. A review request has been filed with MetaMask's `eth-phishing-detect` project. The audited source and deployed bundle showed no signing requests, token approvals, automatic transaction submission, secret collection, suspicious redirects, or externally injected runtime scripts. The classification root cause remains `UNKNOWN`; it is not described as a confirmed false positive.

### Why should judges trust the demo?

The demo uses immutable-on-record terms, retained evidence artifacts, digest-checked Receipt V3 files, frozen implementation fingerprints, public source, and completed wallet-free records #1/#2. It does not ask judges to connect a wallet or bypass a warning. Trust remains bounded by the documented provider, software, and operator assumptions.
