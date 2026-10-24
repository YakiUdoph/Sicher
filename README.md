# Sicher

**Proof, not promises.**

A wallet can look healthy today and still have broken its promise yesterday.

Sicher records a measurable wallet commitment before it begins, then checks whether that commitment held throughout the whole period. It is for two sides:

- **Promise makers:** projects or organizations making measurable treasury, reserve, grant-related, or community fund commitments.
- **Promise checkers:** communities, partners, funders, and other stakeholders who need to inspect those commitments.

These are intended use cases, not claims of current customers or adoption.

## Why today's wallet balance is not enough

Imagine a project promises:

> We will keep at least 80,000 tokens in this wallet during this period.

The balance then moves:

```text
100,000 -> 92,000 -> 15,000 -> 100,000
```

The wallet looks healthy at the beginning and end. During the period, however, it fell to 15,000 and broke the promise.

**The money came back. The broken promise didn't disappear.**

A current wallet view answers, “What is in this wallet now?” It does not necessarily answer, “Did this wallet stay above the promised amount throughout the entire period?” Sicher exists for that second question.

## What you can do

- **Making the promise?** Use **Make a commitment** to record measurable terms before the outcome.
- **Checking somebody's promise?** Use **Explore commitments** to inspect public commitments and any validated results.
- **Want the clearest example?** Open Commitment #2 and follow the full balance path rather than only its final balance.

Live testnet application: <https://sicherd.vercel.app/>

## The real #2 example

Commitment #2 promised at least **80,000 STEST**. Its validated historical path was:

```text
100,000 -> 92,000 -> 15,000 -> 100,000 STEST
```

The result is **NOT_PROVEN / CORROBORATED** because the commitment was broken during the period. `CORROBORATED` means the evidence was checked across multiple configured sources; it does not mean absolute mathematical certainty.

Commitment #1 is the positive example. It promised at least 80,000 STEST, never fell below 92,000 STEST in the validated path, and is **PROVEN / CORROBORATED**.

## Why Elysium matters

The commitment is recorded on Elysium Testnet before the outcome. That creates an independently inspectable record of:

- the wallet being measured;
- the token;
- the minimum balance; and
- the applicable block period.

Sicher later evaluates the historical on-chain activity for that fixed period. The original promise should not become whatever somebody says it was after the outcome is known.

This does not remove every trust assumption. Results are produced off-chain and remain bounded by the documented verifier, evidence sources, infrastructure, and token-accounting model.

## What works today

Current V1 includes:

- `MIN_BALANCE` commitments only;
- Elysium Testnet, chain ID `99801`;
- conventional ERC-20 `Transfer` accounting for the reviewed test-token model;
- immutable commitment terms in the Sicher registry;
- user-authorized wallet transactions;
- dynamic discovery of on-chain commitments;
- historical evaluation across the commitment interval;
- validated published results and Receipt V3 records;
- `PROVEN` and `NOT_PROVEN` when sufficient evidence exists;
- nonterminal checking or delayed states when a safe result is unavailable; and
- activated scheduled off-browser processing and protected publication infrastructure.

The publication path is enabled, but its current end-to-end health is **degraded / failing closed**. Recent scheduled runs have repeatedly stopped safely; the latest observed failure was `Finalized head disagreement`. Activation therefore does not imply that automatic publication is currently healthy.

Explore can show a real registry commitment without showing a terminal result. Existence proves that its terms were recorded; it does not prove the promise was kept.

## Status and identifiers

Sicher currently runs on Elysium Testnet. It is not production-ready.

| Item | Value |
| --- | --- |
| Chain ID | `99801` |
| Sicher registry | `0x4e4887e28a8370678a9a37c08a85c65450b510c0` |
| Sicher Test Token (STEST) | `0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7` |

STEST means **Sicher Test Token**. It is not `$SICHER`, and Sicher assigns it no economic value or promised utility.

At the time of this release, review of a MetaMask malicious-site classification for the production Vercel domain is pending. If a wallet provider presents an active warning, do not bypass it and do not connect. Existing public results remain available for wallet-free review.

## How the system works

```text
1. A user records a measurable commitment on Elysium Testnet.
2. The commitment period happens.
3. Off-browser code evaluates the historical activity for the full period.
4. A validated result and content-addressed receipt are published.
5. The frontend displays the registry commitment and, when available, its result.
```

The browser prepares a user-authorized `createCommitment` transaction. The registry stores the terms and emits `CommitmentCreated`. Historical acquisition, reconstruction, verdict computation, receipt generation, and publication happen off-chain. The browser does not invent or recompute terminal verdicts.

See [Architecture](docs/ARCHITECTURE.md) for the detailed system boundary.

## Public result state

| Public result | Minimum | Minimum observed | Final balance | Result | Assurance |
| --- | ---: | ---: | ---: | --- | --- |
| #1 | 80,000 STEST | 92,000 STEST | 92,000 STEST | `PROVEN` | `CORROBORATED` |
| #2 | 80,000 STEST | 15,000 STEST | 100,000 STEST | `NOT_PROVEN` | `CORROBORATED` |

Other discovered commitments do not receive invented terminal verdicts. A result appears only when a matching validated receipt agrees with the immutable registry terms.

## Running locally

Requirements: Node.js and npm.

```powershell
npm.cmd ci
npm.cmd --prefix frontend ci
npm.cmd run typecheck
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run dev
```

The frontend development server listens on port 3000. Local wallet interaction still targets Elysium Testnet. Never place private keys, seed phrases, or wallet secrets in repository files.

Run the complete test set:

```powershell
node --test test/*.test.ts
```

Review frozen evidence without sending a transaction:

```powershell
npm.cmd run phase6:test-integrity
npm.cmd run phase6:test-red-team
npm.cmd run phase6:test-scalable-assurance
npm.cmd run phase6:crosscheck-phase5
npm.cmd run phase7:test-frontend-data
```

Key artifacts:

- [`evidence/phase6b2-commitment1-receipt-v3.json`](evidence/phase6b2-commitment1-receipt-v3.json)
- [`evidence/phase6b2-commitment2-receipt-v3.json`](evidence/phase6b2-commitment2-receipt-v3.json)
- [`evidence/phase6-competition-freeze.json`](evidence/phase6-competition-freeze.json)
- [`evidence/phase8a-competition-build-freeze.json`](evidence/phase8a-competition-build-freeze.json)
- [`docs/REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md)

Live reconstruction requires suitable archive-capable Elysium RPC endpoints and remains read-only, but it depends on external infrastructure.

## Security and limitations

Sicher fails closed when required evidence is missing, malformed, inconsistent, wrong-chain, or not finalized. That does not make it universally secure.

Current limitations include:

- Elysium Testnet only;
- `MIN_BALANCE` only;
- conventional ERC-20 `Transfer` accounting only;
- no custody, escrow, wallet protection, or token-approval flow;
- frontend-only future-start enforcement in the deployed contract version;
- client-side, not protocol-level, duplicate protection;
- possible ambiguity if a wallet broadcasts but returns no transaction hash;
- correlated provider or shared-infrastructure omission cannot be mathematically excluded;
- Receipt V3 files are digest-checked off-chain records, not signatures or on-chain verdicts; and
- STEST is a demonstration token, not a production asset.

Read [Security](docs/SECURITY.md), [Threat model](docs/THREAT_MODEL.md), and the [Assurance policy](docs/COMPETITION_ASSURANCE_POLICY.md) before treating a result as evidence.

## Long-term direction

The larger direction is simple:

> Make important financial promises independently checkable before people are asked to trust them.

### Now

Minimum-balance commitments on Elysium Testnet.

### Next — possible future work

- broader measurable treasury or reserve commitment rules;
- easier ways to share public commitment results;
- project or organization profiles;
- notifications; and
- improved recurring-commitment workflows.

### Later — exploratory

- production assets or networks after separate review;
- integrations and APIs;
- organizational tooling; and
- recurring financial commitment programs.

A possible future business model is that organizations making recurring commitments pay for advanced organizational, verification, reporting, or integration tooling while public results remain useful to communities, partners, and funders. Sicher does not currently claim pricing, customers, or revenue.

## Documentation

Current specifications and operational records are grouped below. Documents explicitly labeled historical preserve earlier evidence or competition context; they are not current product specifications.

### Product & usage

- [Product requirements](docs/PRD.md)
- [User guide](docs/USER_GUIDE.md)
- [Roadmap](docs/ROADMAP.md)
- [Design](docs/DESIGN.md)

### Architecture & security

- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Trust boundary](docs/TRUST_BOUNDARY.md)
- [Frontend integration contract](docs/FRONTEND_INTEGRATION_CONTRACT.md)

### Assurance & reproducibility

- [Competition assurance policy](docs/COMPETITION_ASSURANCE_POLICY.md)
- [Competition verifier freeze](docs/COMPETITION_VERIFIER_FREEZE.md)
- [Reproducibility](docs/REPRODUCIBILITY.md)

### Competition

- [Historical competition submission record](docs/COMPETITION_SUBMISSION.md)

### Maintainer status

- [Current handoff](docs/PROGRESS.md)
- [Phase 10B result publication](docs/PHASE10B_RESULT_PUBLICATION.md)

### Historical assurance evidence

These retained records describe earlier Phase 5/6 procedures, boundaries, and remediation evidence. They are historical evidence, not current product specifications.

- [Phase 5A experiment procedure](docs/phase5a-experiment-procedure.md)
- [Phase 6 claims boundary](docs/PHASE6_CLAIMS_BOUNDARY.md)
- [Phase 6 external assurance](docs/PHASE6_EXTERNAL_ASSURANCE.md)
- [Phase 6B.1 remediation](docs/PHASE6B1_REMEDIATION.md)
- [Phase 6B.2 scalable evidence](docs/PHASE6B2_SCALABLE_EVIDENCE.md)
