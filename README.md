# Sicher

**Proof, not promises.**

A promise can look perfectly kept today even if it was broken yesterday.

Sicher lets someone set a measurable commitment in advance, keeps the original terms on Elysium, and checks what happened across the entire period—not just what the wallet looks like at the end.

If the commitment was broken temporarily and the funds later returned, the record still shows it.

## The problem

A project can promise to keep at least a stated balance for an interval, temporarily move funds out, restore them before anyone checks, and appear compliant if the reviewer looks only at the final balance. A current snapshot cannot establish what happened throughout a past interval.

## What Sicher does

1. The user records the subject, token, minimum balance, and block interval before the outcome.
2. After the interval, the verifier reconstructs the balance across the full inclusive block range.
3. A temporary drop below the minimum remains a breach even if the balance later recovers.
4. Fixed terms and the same accepted evidence produce the same verdict.
5. Sicher prepares a human-readable Receipt V3 and a public product record.

V1 supports one rule: `MIN_BALANCE` for the reviewed conventional ERC-20 accounting model.

## Real example

Commitment #2 promised at least **80,000 STEST**. Its verified historical path was:

```text
100,000 -> 92,000 -> 15,000 -> 100,000 STEST
```

The final balance recovered to 100,000 STEST, but the interval included a 15,000 STEST balance. The result is therefore **NOT_PROVEN / CORROBORATED**. Recovery does not erase the earlier breach.

Commitment #1 is the positive control: it promised at least 80,000 STEST, its minimum observed balance was 92,000 STEST, and its result is **PROVEN / CORROBORATED**.

The frozen receipt evidence is in [`evidence/`](evidence/). Explore discovers every genuine commitment from the canonical registry; the validated public receipt dataset currently supplies terminal results only for commitments #1 and #2.

## Live product

- Website: <https://sicherd.vercel.app/>
- Network: Elysium Testnet
- Release status: live on Elysium Testnet; not production-ready

At the time of this release, review of a MetaMask malicious-site classification for the production Vercel domain is pending. If a wallet provider presents an active security warning, do not bypass it and do not connect the wallet. The completed public proofs remain available for wallet-free review.

## Architecture

```text
User -> browser -> injected wallet -> Sicher registry on Elysium Testnet
                                      |
                                      v
                         historical Transfer evidence
                                      |
                                      v
                   off-chain verifier -> Receipt V3 -> public UI
```

The browser prepares and submits a user-authorized registry transaction. The registry records commitment terms and emits `CommitmentCreated`. Historical acquisition, reconstruction, verdict computation, receipt generation, and publication are off-chain. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## What's on-chain

- The registry address and its append-only commitment records.
- Creator, subject, token, minimum balance, start block, and end block.
- The `CommitmentCreated` event.
- STEST `Transfer` activity used as historical evidence.

Verdicts and Receipt V3 files are not stored on-chain.

## What's off-chain

- Historical log acquisition and provider comparison.
- Exact balance reconstruction and repeatable verdict computation.
- Targeted transaction-receipt checks.
- Receipt V3 generation and validation.
- Preparation and publication of validated terminal records, currently #1 and #2.
- Read-only browser discovery of immutable registry commitments and their current lifecycle timing.

After the interval ends, a Sicher operator currently runs verification and publishes the validated result.

## Contracts and addresses

| Item | Value |
| --- | --- |
| Network | Elysium Testnet |
| Chain ID | `99801` |
| Sicher registry | `0x4e4887e28a8370678a9a37c08a85c65450b510c0` |
| Sicher Test Token (STEST) | `0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7` |

STEST means **Sicher Test Token**. It is not `$SICHER`, and Sicher assigns it no economic value or promised utility.

## Verified commitments

| Public record | Minimum | Minimum observed | Final balance | Result | Assurance |
| --- | ---: | ---: | ---: | --- | --- |
| #1 | 80,000 STEST | 92,000 STEST | 92,000 STEST | `PROVEN` | `CORROBORATED` |
| #2 | 80,000 STEST | 15,000 STEST | 100,000 STEST | `NOT_PROVEN` | `CORROBORATED` |

Explore also shows registry-only commitments without inventing results. Commitments #3-#10 currently have no validated result in the published frontend dataset, so they appear as **Awaiting result**. The local #6/#7 receipts remain technical lifecycle evidence and do not cross the public publication boundary in this release.

Registry existence and verification are different. Appearing in Explore confirms that a commitment and its immutable terms exist on-chain. `PROVEN`, `NOT_PROVEN`, and `CORROBORATED` appear only when the published validated receipt agrees with those registry terms.

## Assurance

`CORROBORATED` is an assurance level, not a verdict. For the frozen receipts, implemented checks compare evidence across the configured sources and verify discovered events against targeted transaction receipts. This protects against several incomplete or inconsistent evidence failures, but it is not mathematically exhaustive: correlated omission across providers and shared upstream Elysium infrastructure remains possible.

See [`docs/COMPETITION_ASSURANCE_POLICY.md`](docs/COMPETITION_ASSURANCE_POLICY.md) and [`docs/COMPETITION_VERIFIER_FREEZE.md`](docs/COMPETITION_VERIFIER_FREEZE.md).

## Running locally

Requirements: Node.js and npm.

```powershell
npm.cmd ci
npm.cmd --prefix frontend ci
npm.cmd run typecheck
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run dev
```

The frontend development server listens on port 3000. Local wallet interaction still targets Elysium Testnet; do not use private keys in repository files.

Run the complete test set:

```powershell
node --test test/*.test.ts
```

## Verification and reproduction

The frozen evidence can be reviewed without sending a transaction:

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
- [`docs/REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md), which records the earlier Phase 5 reproduction workflow

Live reconstruction requires suitable archive-capable Elysium RPC endpoints and the environment described by the existing scripts. It is read-only but depends on external infrastructure.

## Security

The verifier and frontend fail closed on missing or inconsistent required evidence. The frontend does not receive private keys, requests no token approvals or signatures, and submits only an explicitly reviewed `createCommitment` transaction. These properties are scoped and do not make the system universally secure. See [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Limitations

- Elysium Testnet only.
- V1 supports `MIN_BALANCE` only.
- Verification assumes the reviewed conventional ERC-20 `Transfer` accounting model; rebasing, fee-on-transfer, and hidden balance mutations are unsupported.
- Future-start enforcement is implemented in the frontend. The deployed contract accepts a direct call with an already-started or past range if `endBlock > startBlock`.
- A Sicher operator currently runs verification, generates Receipt V3, and publishes the public record.
- `CORROBORATED` does not mathematically eliminate correlated provider omission.
- Browser duplicate protection is not protocol-level uniqueness; identical commitments remain possible.
- A provider or wallet failure after broadcast but before returning a transaction hash can remain ambiguous.
- Receipt files are digest-checked local artifacts, not signed or on-chain records.
- STEST is a test token, not a production asset.
- The production wallet-domain classification remains under external review.

## Status

Sicher currently runs on Elysium Testnet. Explore reads genuine commitments from the canonical registry, while the complete validated proof stories for commitments #1 and #2 remain separately receipt-backed. It is not production-ready.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [User guide](docs/USER_GUIDE.md)
- [Roadmap](docs/ROADMAP.md)
- [Competition submission draft](docs/COMPETITION_SUBMISSION.md)
- [Demo script](docs/DEMO_SCRIPT.md)
- [Judge Q&A](docs/JUDGE_QA.md)
