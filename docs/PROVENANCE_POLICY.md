# Phase 6 Verifier Provenance Policy

Phase 6 competition receipts are reproducible, tamper-evident local artifacts. They are not immutable records and their fingerprints do not prove that RPC history is infallible.

## Release candidate

Each competition release candidate should bind the following in one Git commit:

- `scripts/phase6-registry-verifier.ts` and its SHA256 fingerprint;
- `scripts/phase6-evidence-core.ts` and its SHA256 fingerprint;
- `test/Phase6EvidenceVerifier.test.ts`, the exact test command, and its pass/fail result;
- `package-lock.json`, `tsconfig.json`, Node version, and dependency/toolchain versions;
- receipt schema `sicher.competition-receipt/2.0` and canonical-serialization rules;
- the evidence manifest, its SHA256 digest, and any terminal receipt produced from it;
- the configured provider identities, sanitized endpoints, finalized head, critical block hashes, and reproduction command.

After review, create a signed or otherwise access-controlled Git tag such as `phase6-competition-rc1` pointing to that commit. Publish the commit SHA, tag, verifier/core hashes, test result, schema version, evidence-manifest digest, and receipt digest through the project release page. Independent reviewers should check out the exact commit, install the locked dependencies, rerun the tests and verifier, and compare every digest.

No signing key or on-chain anchor is required for the hackathon candidate. A later release may add Sigstore/Rekor, an independently administered mirror, or third-party witness attestations. Those mechanisms can strengthen publication provenance but do not repair incomplete or incorrect RPC evidence.

## Canonical receipt rules

Receipt V2 sorts object keys lexicographically, encodes integer quantities as base-10 strings, normalizes provider ordering, deterministically orders evidence by block number, transaction index, and log index, encodes UTF-8, and omits `receiptDigest` while calculating SHA256. Any verdict-relevant field, ordered evidence item, or minimum value is covered by the digest.

## Trust boundary

Git commits, tags, hashes, tests, and deterministic builds establish which software and evidence generated a receipt and make later edits detectable against a trusted published copy. They do not guarantee historical completeness, provider honesty, publication time without an external anchor, or infrastructure independence. Hypedexer and Conduit are separately operated RPC services, but they share Elysium sequencer, AnyTrust data-availability, HyperEVM settlement, and Nitro lineage dependencies.
