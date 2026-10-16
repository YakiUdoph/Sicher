# Sicher Roadmap

This roadmap separates completed capability from possible future work. It contains no delivery dates, Mainnet promise, partnership claim, or token-economics commitment.

## Built now

Sicher currently provides minimum-balance commitments on Elysium Testnet:

- `SicherCommitmentProof` registry with immutable-on-record terms and `CommitmentCreated` events;
- `MIN_BALANCE` commitment creation for Sicher Test Token (STEST);
- user-authorized wallet transactions with exact review, simulation, gas/fee checks, and pre-send revalidation;
- client-side duplicate and ambiguous-send safeguards;
- dynamic discovery of on-chain commitments without hardcoded IDs;
- exact historical STEST balance reconstruction across the commitment interval;
- conventional ERC-20 `Transfer` accounting;
- corroborated evidence comparison with disclosed shared-infrastructure limitations;
- Receipt V3 construction and digest/fingerprint validation;
- protected automatic off-browser processing and publication infrastructure;
- runtime result discovery without a frontend rebuild;
- public Explore, Commitment, Result, Receipt, How It Works, and Make a Commitment routes;
- validated public results for commitments #1 and #2; and
- safe nonterminal states when no validated result is available.

Sicher is testnet-only and not production-ready. `MAX_OUTFLOW` is not implemented.

## Next — proposed, not built

Potential next work can include:

- broader measurable treasury or reserve commitment rules, designed and tested one at a time;
- easier ways for projects to share public commitment results;
- project or organization profiles;
- notifications for commitment lifecycle changes;
- improved recurring-commitment workflows;
- stronger evidence independence and clearer operational observability;
- reviewed contract-level future-start enforcement; and
- protocol-level duplicate semantics if product requirements justify them.

None of these items should be described as current functionality.

## Later / exploratory

Possible longer-term directions include:

- production assets or networks after separate contract, chain, finality, provider, and security review;
- integrations and APIs;
- organizational reporting and management tooling;
- recurring financial commitment programs; and
- higher-assurance evidence modes with practical cost controls.

The larger vision is to make important financial promises independently checkable before people are asked to trust them.

## Possible sustainability direction

Organizations making recurring commitments could eventually pay for advanced organizational, commitment, verification, reporting, or integration tooling. Public commitment results could remain useful to communities, partners, funders, and other stakeholders.

This is a possible future business model only. Sicher does not currently claim pricing, customers, revenue, or validated willingness to pay.

## Explicitly unresolved

- No Mainnet or production launch is promised.
- No additional rule is presented as implemented.
- No partnership or adoption is claimed.
- STEST is not `$SICHER` and has no stated economic value.
- Any `$SICHER` token utility, launch plan, or economic model remains undefined.
