# Sicher Security

## Scope

This document covers the current Elysium Testnet release. It describes reviewed properties and limitations; it is not a certification or a claim of universal security.

In plain language, Sicher is designed to preserve the original commitment, detect a supported temporary balance breach, and refuse to invent success when required evidence is unsafe. It does not protect or custody the wallet, prevent funds from moving, or remove every dependency on software and infrastructure.

## Threat model

The implementation considers:

- commitment terms being substituted after creation;
- incomplete, malformed, duplicated, reordered, or conflicting historical evidence;
- one configured provider omitting data or disagreeing with another;
- a temporary balance breach being hidden by later restoration;
- an active or unfinalized window being mislabeled as successful;
- receipt fields, assurance labels, or digests being altered;
- the browser submitting twice after rapid input, reload, timeout, or ambiguous wallet behavior;
- account or chain changes immediately before send; and
- unsupported token mechanics being evaluated as if they were conventional transfers.

The accepted boundary does not eliminate a correlated omission shared by all configured operators and upstream Elysium infrastructure, malicious shared chain history, compromised user devices or wallet extensions, or bugs outside the reviewed implementation.

## Security properties

- Commitment terms are recorded in the deployed registry and have no update/delete path.
- Reconstruction uses exact integer base units and deterministic event ordering.
- Required evidence failures do not produce a favorable terminal verdict.
- Public results remain separate from assurance level.
- Receipt V3 schema, digest, evidence-manifest digest, and frozen implementation fingerprints are validated.
- The browser does not recompute proof verdicts from displayed balances.
- Public records #1 and #2 are bound to validated frozen artifacts.
- Registry-only Explore records cannot acquire a terminal result or assurance label without matching validated public receipt data.

These properties are scoped to the documented network, contracts, software, configuration, and token model.

## Wallet boundary and custody

The frontend never receives the user's private key. It uses the injected wallet's EIP-1193 request interface. No private key, seed phrase, mnemonic, or signature is stored by Sicher.

Sicher does not custody user assets. The registry transaction has zero native value and records commitment terms. The frontend has no token-approval flow and does not request `personal_sign`, `eth_sign`, or typed-data signatures.

The wallet remains the authority that displays and authorizes any transaction. This boundary does not justify bypassing a wallet security warning.

## Wallet access behavior

On load, an available wallet is queried passively with `eth_accounts` and `eth_chainId`. This does not request account authorization. `eth_requestAccounts` occurs only after an explicit Connect action.

Network switching is user-triggered through `wallet_switchEthereumChain`, with `wallet_addEthereumChain` used only when the wallet reports that Elysium is missing.

The `/start` page reads `eth_blockNumber` from the public configured RPC without wallet authorization. It refreshes while the form is open.

Explore uses the same approved public RPC configuration for read-only `eth_chainId`, `eth_blockNumber`, and registry `eth_call` requests. It does not request wallet accounts, connect a wallet, sign, or send a transaction. `nextCommitmentId` is snapshotted once per discovery operation and commitment reads use bounded concurrency. Any malformed or partial discovery fails visibly rather than being presented as an empty registry.

## Transaction construction

V1 constructs one transaction type: a zero-value `createCommitment` call to the canonical registry. The transaction identifies the subject, STEST address, minimum balance, start block, and end block. Exact terms are shown before the action.

The public-record disclosure precedes the transaction control. A successful creation means only that an active commitment exists; it does not mean `PROVEN` and does not create a terminal Receipt V3.

## Pre-send validation

Before opening the wallet request, the browser:

1. requires an authorized account on chain ID `99801`;
2. reads a fresh public chain head;
3. validates a nonzero subject, positive minimum, future start, and later end;
4. simulates with `eth_call`;
5. estimates gas;
6. checks that the wallet has a nonzero native gas balance;
7. discovers current EIP-1559 fee inputs; and
8. re-reads account and chain immediately before send.

A failure before send does not become a confirmed commitment.

Future-start enforcement is a frontend safeguard, not a deployed-contract rule. Direct contract callers can create already-past ranges. Immutable testnet records #3 (blocks 3,000–3,200), #4 (3,000–5,000), and #5 (5,000–7,000) are historical examples of that limitation: they remain in the registry, have no validated terminal evidence, and are not promoted into the public result set or shown in Explore.

## Fee preparation and failure categories

Simulation, gas limit, and transaction pricing are separate checks: `eth_call` checks contract execution, `eth_estimateGas` estimates the execution gas limit, and fresh fee reads determine pricing. Immediately before wallet authorization, Sicher reads the latest base fee and gas price, treats the priority-fee recommendation and fee history as advisory, and calculates:

`maxFeePerGas = max(gasPrice, 2 × max(latestBaseFee, predictedNextBaseFee) + priorityFee)`

`eth_feeHistory.baseFeePerGas` contains one entry per requested block plus the predicted next-block entry; Sicher uses the final item. If priority-fee discovery fails, it falls back to `max(gasPrice - baseFee, 0)`, which safely permits the zero priority fee observed on Elysium. Missing or malformed fee history falls back to the freshly read base fee. Required fee data that is unavailable or malformed stops the flow before send.

The UI distinguishes current-block, stale-start, simulation, gas-estimation, required-fee-discovery, and later underpriced wallet/RPC failures while retaining raw causes for diagnostics. A historical Commitment #6 attempt failed before a hash was returned because its wallet-populated maximum fee was below the current base fee; no receipt or commitment was created.

## Double-submit protection

A synchronous submission guard collapses rapid duplicate actions. After a returned transaction hash, the browser stores a public-only pending record in `localStorage`, disables blind resubmission, and requires receipt/event/registry reconciliation.

The pending-record allowlist is limited to schema version, chain ID, registry, transaction hash, sender, subject, token, minimum balance, start block, end block, and creation time. It contains no key, seed phrase, signature, or other wallet secret.

The registry itself allows identical commitments. Browser safeguards therefore reduce accidental duplicate submission but do not provide protocol-level uniqueness across devices, cleared storage, alternate clients, direct calls, or intentionally repeated wallet authorizations.

## Ambiguous hashless-send handling

Only wallet error code `4001` is treated as a definite user cancellation. Once `eth_sendTransaction` has been invoked, a timeout, disconnect, internal error, or malformed response without a usable hash remains an unknown outcome.

The browser persists an allowlisted public attempt record and blocks immediate retry. Read-only recovery searches bounded `CommitmentCreated` evidence for the exact sender and terms. Zero matches remain unresolved; multiple matches remain ambiguous. A manual reset warns about duplicate risk.

Immediately before the wallet request, the browser rechecks the selected account and chain. A mismatch stops the send and requires renewed review. These safeguards remain browser-local: another device or client, cleared storage, or a direct contract call can bypass them.

## Receipt and registry validation

A returned transaction hash is not immediate confirmation. Sicher requires:

- a successful transaction receipt;
- a matching registry address and `CommitmentCreated` event;
- event fields matching the attempted terms; and
- registry storage readback matching the receipt and attempted terms.

A reverted receipt never becomes a created proof.

## Evidence-provider model

The frozen `CORROBORATED` process compares normalized historical evidence across Hypedexer and direct Conduit configuration, checks required finalized context and critical hashes, and validates discovered relevant events against targeted receipts.

These operators still share Elysium sequencer, data-availability, settlement, and Nitro-lineage dependencies. Correlated omission across every configured source and shared upstream infrastructure cannot be mathematically excluded. Targeted receipts authenticate discovered events; they do not prove an undiscovered event was not omitted.

## Fail-closed verification

Wrong-chain responses, registry disagreement, malformed logs, range failures, conflicting duplicates, balance disagreement, finality disagreement, block-hash mismatch, receipt mismatch, unsupported token code, or invalid receipt integrity prevent a favorable terminal result. An active window remains `PENDING`; unusable required evidence becomes `INDETERMINATE` under the applicable verifier condition.

## Production-domain classification

At documentation time, the production Vercel domain `https://sicherd.vercel.app/` has been observed receiving a MetaMask malicious-site warning. A review request has been filed with MetaMask's `eth-phishing-detect` project.

A source and deployed-bundle audit found no signing requests, token approval flow, automatic transaction submission, secret collection, suspicious redirects, or externally injected runtime scripts. Production HTML loads same-origin application bundles; the stylesheet imports Google Fonts, and the application uses the documented Elysium RPC and official MetaMask download link.

Those observations do not establish that the classification is a false positive. The root cause remains **UNKNOWN** until MetaMask or the relevant security provider completes review. Users must not be instructed to suppress, disable, or bypass an active wallet security warning.

## Known limitations

- Testnet-only deployment and test asset.
- `MIN_BALANCE` only.
- Conventional ERC-20 `Transfer` accounting only.
- Future-start validation is in the frontend, not the deployed contract.
- Duplicate protection is client-side, not a registry uniqueness rule.
- Hashless send failures can remain ambiguous.
- Verification and publication run through automatic off-browser infrastructure whose repository authorization gate and protected-branch policy remain operational trust dependencies.
- Configured evidence sources have shared upstream dependencies.
- Receipt digests are not signatures or on-chain anchors.
- User-device, browser-extension, DNS, hosting-account, dependency, and provider compromise are not eliminated by these controls.
- The external MetaMask classification remains unresolved.

## Testnet status

Sicher currently runs on Elysium Testnet; it is not a production-ready financial system. STEST is a demonstration test token with no stated economic value.

## Related records

- [`THREAT_MODEL.md`](THREAT_MODEL.md)
- [`TRUST_BOUNDARY.md`](TRUST_BOUNDARY.md)
- [`PHASE6_CLAIMS_BOUNDARY.md`](PHASE6_CLAIMS_BOUNDARY.md)
