# Sicher Judge Q&A

Each answer starts with the plain-English product answer. Technical boundaries follow where they matter.

## What is Sicher?

Sicher records a measurable wallet promise before its outcome and checks whether it held throughout the whole period.

Current V1 supports minimum-balance commitments on Elysium Testnet. Commitment terms are on-chain; historical evaluation and Receipt V3 are off-chain.

## Explain it in one sentence.

A wallet can look healthy today and still have broken its promise yesterday, so Sicher records the promise first and checks the whole period.

## Who would actually use it?

Two sides: projects or organizations making measurable financial commitments, and communities, partners, funders, or other stakeholders checking them.

These are target use cases, not claims of current customers or adoption.

## Give me a real use case.

A project publicly promises to keep at least 80,000 tokens in a treasury wallet during a defined period. A funder or community later checks whether that condition held throughout the period—not only at the end.

Commitment #2 is the working testnet example: `100,000 -> 92,000 -> 15,000 -> 100,000`, producing `NOT_PROVEN`.

## Why would a project voluntarily use this?

To make a financial commitment more credible before asking others to trust it. Recording exact terms in advance gives partners or communities something concrete to check later.

It does not protect the wallet or prevent a breach. It makes the promise and outcome inspectable.

## Why can't I just use a block explorer?

A typical explorer balance shows what is in a wallet now. Sicher answers a different question: did the wallet stay above a pre-recorded minimum throughout a past period?

A technical reviewer could reconstruct the same history manually from suitable chain data. Sicher turns that work into a focused commitment, result, and receipt flow.

## Why can't I just monitor the wallet?

You can build monitoring, but you still need agreed terms before the outcome, complete interval history, safe failure behavior, and a result people can inspect. Sicher packages those requirements around a measurable commitment.

## Why does this need Elysium?

The original promise is recorded on Elysium Testnet before the outcome. That provides an independently inspectable record of the wallet, token, minimum, and block period.

Sicher then evaluates historical Elysium activity. It does not claim that blockchain removes every trust problem.

## What stops someone changing the promise afterward?

The deployed registry has no update or delete path for a stored commitment. A person can create a new commitment, but the earlier record remains.

## What happens if funds leave and later return?

The temporary breach remains part of the result. Returning the funds changes the later balance; it does not erase what happened earlier.

Commitment #2 ended back at 100,000 STEST but remains Not proven because it fell to 15,000 against an 80,000 minimum.

## What exactly is Proven?

The measurable commitment held throughout the evaluated period.

Technically, `PROVEN` appears only when the supported historical evidence, finality, registry terms, reconstruction, receipt, and publication checks all pass.

## What exactly is Not proven?

The commitment was broken during the evaluated period. For `MIN_BALANCE`, at least one validated balance point fell below the promised minimum.

## What does Corroborated mean?

Checked across multiple configured sources. It is an assurance level, not the verdict and not a claim of mathematical certainty.

The current sources still share Elysium infrastructure, so correlated omission cannot be excluded.

## What happens if Sicher cannot safely verify something?

It does not guess. The commitment stays in a nonterminal checking, delayed, pending, or indeterminate state without a Proven or Not proven result.

Missing, malformed, unsupported, wrong-chain, inconsistent, or unfinalized evidence fails closed.

## What works today?

- `MIN_BALANCE` commitments on Elysium Testnet.
- User-authorized registry transactions.
- Dynamic commitment discovery.
- Historical evaluation for the reviewed conventional STEST model.
- Receipt V3 validation and public results.
- `PROVEN` / `NOT_PROVEN` when required evidence passes.
- Safe nonterminal states otherwise.
- Automatic off-browser processing, protected publication, and runtime frontend discovery.

## What doesn't work today?

No Mainnet, production assets, arbitrary ERC-20 support, custody, escrow, wallet protection, `MAX_OUTFLOW`, or finalized `$SICHER` utility. Future-start enforcement is not in the deployed contract, and receipt/evidence guarantees remain bounded by shared infrastructure.

## Is this production ready?

No. Sicher is a working Elysium Testnet V1 with one rule and a reviewed demonstration token model. It retains documented contract, provider, receipt, browser, and wallet limitations.

## Why is this original?

Sicher is not just showing today's balance. It evaluates whether a **pre-recorded measurable commitment** held across its **defined period**.

The distinctive product moment is #2: the ending balance recovered, but the broken promise did not disappear. Sicher does not claim to have invented blockchain monitoring or reserve verification.

## What is the long-term vision?

Make important financial promises independently checkable before people are asked to trust them.

Possible next work includes broader measurable treasury rules, easier result sharing, profiles, notifications, and recurring workflows. Production networks, APIs, and organizational tooling are later exploratory directions, not current capabilities.

## How could this become sustainable?

A possible future model is paid advanced tooling for organizations making recurring commitments: organization management, verification operations, reporting, or integrations. Public results could remain useful to communities, partners, and funders.

Sicher does not currently claim pricing, customers, or revenue.

## What happens after the competition?

Continue validating the user problem, improve the single supported workflow, strengthen evidence independence and operations, and test whether organizations actually want recurring commitment tooling.

There is no invented launch date, Mainnet promise, partnership, or token-economics commitment.

## What are the biggest current limitations?

- Testnet-only scope and STEST demonstration asset.
- `MIN_BALANCE` only.
- Conventional ERC-20 `Transfer` accounting only.
- Shared upstream evidence dependencies.
- Off-chain receipts and verdict computation.
- Frontend-only future-start enforcement in the deployed contract version.
- Client-side duplicate safety and possible hashless-send ambiguity.
- Not production-ready.

## Why should Ascend care about this project?

Sicher turns a concrete Elysium problem into a product a non-technical reviewer can understand: a final balance can hide a temporary breach, while a pre-recorded commitment plus interval history makes that breach visible.

The project demonstrates working execution, a specific user value, a distinctive interval-versus-snapshot product idea, and a restrained path beyond the test token. It does not claim guaranteed competition success.

## Does Sicher custody or move funds?

No. The current flow records commitment terms with a zero-value registry transaction. Sicher does not hold keys, request token approvals, or provide escrow.

## What is STEST?

Sicher Test Token, used for the Elysium Testnet demonstration. It is not `$SICHER` and has no stated economic value or finalized utility.

## Is the result or receipt on-chain?

No. Commitment terms are stored in the Elysium registry. The verifier computes results off-chain, and Receipt V3 is an off-chain, digest-checked artifact.

## Why should judges trust the demo?

The demo uses public registry terms, retained evidence, digest-checked receipts, frozen implementation fingerprints, public source, and completed wallet-free records #1 and #2. It also discloses its provider and operator assumptions instead of calling the system trustless.

If a wallet security warning is active, the demo must not connect a wallet or bypass the warning.
