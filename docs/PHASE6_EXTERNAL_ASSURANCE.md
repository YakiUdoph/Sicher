# Phase 6A.2 External Assurance Investigation

Date: 2026-10-13

This is a read-only investigation. It does not modify either proof algorithm, establish a final verdict for Commitment #2, or constitute a security certification.

## Executive conclusion

The three credential-free Elysium RPC hostnames investigated do not represent three independent operators:

- Hypedexer identifies Enigma Validator as its operator and states that it runs its own Elysium Nitro node.
- `testnet-rpc.elysium.kinetiq.xyz` is a DNS CNAME to `rpc-elysium-testnet.t.conduit.xyz` and returned the same Nitro client identifier as that Conduit hostname. They must be treated as one source.
- Conduit operates the Elysium sequencer, its public RPC endpoint, and the testnet AnyTrust DAS according to the published Elysium node configuration and Chainstack's network profile.

Hypedexer and Conduit are therefore different RPC operators and appear to maintain different node instances, but their historical evidence has correlated upstream dependencies: the Conduit sequencer feed, HyperEVM settlement batches, Conduit's AnyTrust DAS, and Nitro software. Operational independence is **partial**; independently sourced history is **not demonstrated**.

The standard `safe` and `finalized` block tags are supported by all three tested hostnames. A numerical Elysium confirmation depth is not justified. A defensible future policy can instead require the commitment end block to be at or below matching `finalized` heads from distinct operators, with matching block hashes and complete evidence. This is stronger than `latest`, but it does not remove sequencer, AnyTrust, validator, client, or parent-chain trust assumptions.

## Sources and method

The investigation used:

- [Hypedexer's Elysium disclosure](https://hypedexer.com/elysium), including its operator statement and public node repository.
- [Enigma Validator's Elysium node repository](https://github.com/Enigma-Validator/elysium-rpc-node), including the published chain configuration and node startup configuration.
- [Conduit's external-node repository](https://github.com/conduitxyz/conduit-arbitrum-external-node).
- [Chainstack's Elysium profile](https://chainstack.com/protocols/elysium/) for its service offering and stated chain architecture.
- [Alchemy's Elysium endpoint page](https://www.alchemy.com/rpc/elysium-testnet) and [quickstart](https://www.alchemy.com/docs/reference/elysium-api-quickstart).
- Arbitrum's primary documentation for [Nitro transaction finality](https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro), [`safe` and `finalized` RPC semantics](https://docs.arbitrum.io/build-decentralized-apps/troubleshooting-building), and [BoLD/challenge-period configuration](https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/validation/bold).
- Read-only DNS, JSON-RPC, registry, log, historical balance, token bytecode, and HyperEVM rollup-contract queries.

No credential, API key, transaction, signature, or on-chain write was used.

## A. RPC operators and evidence independence

| Endpoint/service | Identified operator | Credential-free | Historical test | Independence finding |
|---|---|---:|---|---|
| `elysium-testnet-rpc.hypedexer.com` | Enigma Validator, based on Hypedexer's operator disclosure | Yes | Passed Commitments #1 and #2 | Different hostname, operator, DNS target, and Nitro build from Conduit. Public materials say it runs its own archive node. Common sequencer, DAS, parent settlement, and Nitro lineage remain. |
| `testnet-rpc.elysium.kinetiq.xyz` | Conduit infrastructure behind a Kinetiq hostname | Yes | Passed Commitments #1 and #2 | DNS CNAME is the Conduit public RPC. It is not an independent provider. |
| `rpc-elysium-testnet.t.conduit.xyz` | Conduit | Yes | Passed Commitments #1 and #2 | Separate from Hypedexer's RPC operation, but also the sequencer/DAS infrastructure operator. |
| Chainstack Elysium | Chainstack | No public project endpoint found | Not tested | Chainstack advertises managed Elysium nodes and archive data, but access requires provisioning/account credentials. Node provenance and upstream dependencies were not established. |
| Alchemy Elysium | Alchemy | API key required | Not tested | Alchemy advertises private Elysium RPC/archive access. Its public `docs-demo` app returned `ELYSIUM_TESTNET is not enabled`; no user credential was requested or used. |

### Live infrastructure observations

- Hypedexer returned `nitro/v3.11.5-7d41882/linux-amd64/go1.25.14`.
- Kinetiq and Conduit both returned `nitro/vlocal+unknown-unknown/linux-amd64/go1.25.12`.
- DNS resolved the Kinetiq RPC hostname as a CNAME to the Conduit RPC hostname, which in turn used Cloudflare.
- A different client version supports—but does not cryptographically prove—the conclusion that Hypedexer runs a separate node instance.
- The published Enigma configuration consumes the Conduit sequencer feed and Conduit DAS while rebuilding batches from HyperEVM. Thus its node database and RPC serving path are separately operated, but its raw history is not independently originated.

### Historical comparison results

The Phase 6 registry-bound verifier was run without writing a receipt:

| Commitment | Provider pair | Range coverage | Evidence consensus | Reconstructed result |
|---|---|---|---|---|
| #1 | Hypedexer + Kinetiq/Conduit | Complete | Exact agreement | `100,000 -> 92,000` STEST; minimum `92,000` |
| #1 | Hypedexer + direct Conduit | Complete | Exact agreement | `100,000 -> 92,000` STEST; minimum `92,000` |
| #2 | Hypedexer + Kinetiq/Conduit | Complete through snapshot | Exact agreement | `100,000 -> 92,000 -> 15,000 -> 100,000`; breach observed; active/pending |
| #2 | Hypedexer + direct Conduit | Complete through snapshot | Exact agreement | `100,000 -> 92,000 -> 15,000 -> 100,000`; breach observed; active/pending |

Agreement covered normalized emitter, topics, data, block number, transaction hash, transaction index, log index, decoded parties, and value. It is strong corroboration of the specific observed histories. It is not a mathematical completeness proof.

## B. Finality investigation

### Distinct stages

1. **Sequencer inclusion / soft confirmation.** `latest` represents recent blocks delivered by the Conduit sequencer/feed. Arbitrum documents this as soft finality: it depends on the sequencer keeping its promise to post that ordering to the parent chain.
2. **Parent-chain batch inclusion.** Elysium batches are posted to HyperEVM testnet. Once the batch transaction is stable on the parent, the transaction ordering is materially stronger than the live feed alone.
3. **`safe` block.** Nitro documents this tag as an L2 block whose containing batch has reached the parent chain's `safe` state. A major parent reorganization can still affect it.
4. **`finalized` block.** Nitro documents this tag as an L2 block whose containing batch has reached the parent chain's `finalized` state. This is the strongest standard RPC tag exposed in the tests.
5. **Assertion correctness / challenge confirmation.** This is separate from batch ordering. Elysium's published rollup contract on HyperEVM reports a challenge/confirmation configuration; confirmed assertions concern state correctness and withdrawals.
6. **AnyTrust data availability.** The testnet uses a Conduit AnyTrust DAS. Chainstack reports a single committee member on testnet, and the published node configuration names one Conduit DAS URL. This is a material correlated availability/trust boundary.

### Read-only RPC tests

`eth_getBlockByNumber("safe", false)` and `eth_getBlockByNumber("finalized", false)` succeeded on Hypedexer, Kinetiq, and direct Conduit. At the test snapshot all three returned the same block and hash for both tags:

- Block: `8458595` (`0x811163`)
- Hash: `0x0984ecbcb8e0ab8693e8f2cc078434fef6cc6e4947fac432fa8184154bbdeb3d`

The tag equality at one snapshot is an observation, not a guarantee that `safe` and `finalized` always advance together. Queries were separate network calls and therefore not an atomic snapshot.

`arb_getL1BlockNumber` returned method-not-available on all three endpoints, so that non-standard method is not usable through these public RPCs.

### Published and on-chain rollup parameters

The public chain configuration identifies:

- Parent chain: HyperEVM testnet, chain ID `998`
- Rollup contract: `0xEbf08e34941fd93a0Fc1cD89dbBF7447267039Df`
- Sequencer inbox: `0xb5B1a0AebfFeF819Ec3F8c39a17b5C4E70A001E3`
- Deployment parent block: `63983746`
- Data availability committee mode: enabled

Read-only calls to that rollup contract returned:

- `chainId() = 99801`
- `confirmPeriodBlocks() = 10`
- `challengeGracePeriodBlocks() = 10`
- `minimumAssertionPeriod() = 1`
- `validatorWhitelistDisabled() = false`
- `anyTrustFastConfirmer() = 0x0000000000000000000000000000000000000000`
- `rollupDeploymentBlock() = 63983746`

The 10-block values are parent-chain assertion parameters. They must **not** be converted into an invented Elysium L2 confirmation depth or wall-clock guarantee. The validator whitelist remains enabled, and no fast confirmer is configured.

### Supportable finality policy

No justified numerical L2 confirmation count was found. The strongest supportable policy for a future verifier is tag-based:

1. Keep the proof window inclusive and require the chain head to have passed `endBlock`.
2. Query `finalized` from at least two distinct RPC operators.
3. Require every provider's finalized block number to be at least `endBlock`.
4. Require provider agreement on the finalized-tag block hash and the explicit `endBlock` hash.
5. Pin registry reads, starting balance reads, and log scans to explicit block numbers/hashes rather than floating `latest` state.
6. Retain complete deterministic chunk coverage and byte-level evidence consensus.
7. Record the finalized heads/hashes, endpoint identities, collection time, chain ID, and all manifest digests.
8. If any provider lacks the tag, disagrees, falls behind, or errors, return `INDETERMINATE`.

This policy is defensible for parent-finalized transaction ordering under Nitro's documented semantics. It should not be described as proof that all fraud-challenge, validator, AnyTrust, or governance risks are eliminated.

## C. Security boundary and assurance level

Two-provider agreement is useful but not sufficient for absolute completeness. It detects one-sided database corruption, pruning, truncation, RPC filtering, and many operational faults when the other provider returns the correct history. It does not detect identical omissions or incorrect data caused by a shared dependency.

Remaining correlated risks include:

- A common Conduit sequencer and feed.
- A single-member Conduit AnyTrust committee/DAS on testnet.
- Common HyperEVM parent-chain history and finality.
- Related Nitro implementations and shared protocol bugs.
- Coordinated or coincident provider filtering.
- Chain governance, upgrade, permissioned-validator, and rollup-contract risks.
- A malicious or compromised verifier build, dependency, or local execution environment.
- Both providers rebuilding the same incomplete upstream data.

The strongest accurate assurance statement is:

> Sicher obtained complete deterministic-range evidence that agreed byte-for-byte between two separately operated RPC node services for the tested intervals, and can gate completion on matching Nitro `finalized` tags. This materially reduces single-RPC failure risk but does not mathematically guarantee historical completeness or eliminate shared sequencer, DAS, parent-chain, client, validator, and governance dependencies.

Until a third provider with demonstrated independent node operation and provenance is added—or a locally operated validating/archive node is independently reconstructed—the assurance level is **cross-operator corroborated, common-upstream bounded**.

## D. Receipt and digest trust anchoring

Canonical serialization and SHA256 make accidental or un-recomputed edits detectable, but a party that can replace a receipt can also recompute an unanchored digest. A trustworthy external reference is still required.

Options, requiring no action in this investigation:

1. **Version-control anchor.** Commit the verifier source, lockfile, canonicalization specification, evidence manifest, and receipt digest together. Publish the immutable commit identifier through multiple independently controlled channels.
2. **Release artifact and reproducible build.** Publish source archives and verifier fingerprints in a release, then have independent developers rebuild and publish matching hashes.
3. **Transparency log.** Submit the source/manifest/receipt digest tuple to a public append-only transparency system. Keyless CI provenance such as Sigstore/Rekor or SLSA-style attestations can avoid long-lived private signing keys while still binding the artifact to a repository workflow identity.
4. **Independent mirrors.** Publish the same digest tuple to separate repositories, archival services, or content-addressed storage. Independence of account control matters more than URL count.
5. **Third-party witness attestations.** Independent verifiers can reproduce the chain query and publish their own signed or transparency-logged statement containing the same canonical receipt digest and evidence-manifest digest.
6. **Later on-chain anchoring.** A future phase could anchor a digest on-chain, but no such transaction is authorized or performed here.

Any external anchor should bind at minimum:

- verifier source fingerprint and version;
- dependency lockfile fingerprint;
- canonical serialization specification/version;
- registry, chain ID, and commitment ID;
- evidence-manifest digest;
- ordered-evidence digest;
- finalized block numbers and hashes used by each provider;
- receipt payload digest;
- reproduction command and environment/toolchain versions.

These measures provide provenance and tamper evidence. They do not themselves prove that the RPC evidence was complete or correct.

## Blockers and decisions

- **Provider independence:** PARTIAL. Enigma/Hypedexer and Conduit are distinct RPC operators; Kinetiq is a Conduit alias. Common upstream sequencing and DAS prevent a claim of fully independent historical sourcing.
- **Additional provider:** Direct Conduit was credential-free and tested. Chainstack and Alchemy were found but require provisioned credentials; neither was tested with user credentials.
- **Finality depth:** NONE justified. Do not use a fixed L2 block count.
- **Finality mechanism:** Standard `finalized` tag support is empirically verified on the three public hostnames, and generic Nitro semantics are documented. A matching multi-operator finalized-tag gate is supportable.
- **Settlement assurance:** PARTIAL. Parent-finalized ordering can be evidenced, but complete challenge/validator/DA correctness is not independently proven by an L2 RPC tag.
- **Competition-grade claim:** WITHHELD pending explicit adoption/test of the finalized-tag gate and stronger independent historical provenance.
