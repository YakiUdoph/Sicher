# Sicher Phase 5 MIN_BALANCE experiment procedure

This is test infrastructure, not a production protocol or product frontend. STEST has no monetary value.

## Restoration design

The existing user-controlled wallet is the subject and remains the only signing account. The setup transfer sends 900,000 STEST to the fixed test sink `0x000000000000000000000000000000000000dEaD`; those tokens are intentionally unrecoverable and the setup transfer is outside the proof window.

The two in-window outgoing transfers go to `SicherTestReturnHelper`. Its constructor permanently fixes the verified STEST token and subject. Only that same subject can call `restore()`, and restoration sends exactly 85,000 STEST back through the token's ordinary `transfer`, producing genuine ERC-20 evidence. No second signing key, mint, token modification, or trusted off-chain actor is introduced.

## Required execution gates

1. Manually deploy and independently verify the reviewed helper. Record its address and transaction in the evidence manifest. Do not continue if its runtime or constructor inputs differ.
2. Manually authorize the 900,000 STEST setup transfer to the test sink.
3. Independently verify the setup receipt and `balanceOf(subject) == 100,000 STEST`. The eventual proof window must start after this setup evidence.
4. Immediately before commitment creation, fetch the latest block. Propose `startBlock = latest + 120` and `endBlock = startBlock + 600`. These values are deliberately calculated just in time and are not stored as Phase 5A facts.
5. Review the inclusive interval `startBlock <= observed block <= endBlock`, live gas estimate, fixed subject/token/minimum, then explicitly approve the commitment in MetaMask.
6. Independently verify the commitment receipt and read its terms from `SicherCommitmentProof`. Abort if the commitment is not confirmed with ample blocks remaining before `startBlock`.
7. Wait until the chain reaches `startBlock`. Do not submit an experiment transfer before it.
8. Approve and verify each transition separately: 8,000 STEST to helper, 77,000 STEST to helper, then `restore()` on the helper. Check each receipt and subject balance before proceeding.
9. Complete all transitions before `endBlock`. Do not finalize while the latest block is less than `endBlock`.
10. After the window ends, run the read-only verifier using commitment terms read directly on-chain and preserve its output and evidence manifest.

The 120/600 defaults are operating parameters, not guarantees. If observed block time or wallet confirmation latency makes them unsafe, increase them before signing; never reuse a stale proposal.

## Verifier evidence model

The verifier reads `balanceOf(subject)` at `startBlock - 1`, retrieves both incoming and outgoing `Transfer` logs in inclusive non-overlapping chunks, deduplicates by transaction hash plus log index, and sorts by block number, transaction index, then log index. It applies outgoing subtraction and incoming addition independently, so a self-transfer has zero net effect.

`PASS` is terminal only after the window ends and complete evidence maintains the threshold. A retrieved historical breach is `FAIL`. Missing required evidence is `INDETERMINATE`. An uncompleted non-breached window is `ACTIVE`, never `PASS`.

## Immutable-aware helper runtime verification

`SicherTestReturnHelper` declares `token` and `subject` as Solidity immutables. Consequently, the compiler artifact's generic `deployedBytecode` contains zero-filled immutable slots, while constructor execution inserts the deployment-specific values into every range listed in `evm.deployedBytecode.immutableReferences`. The generic runtime SHA-256 is therefore a build-template fingerprint, not the expected literal `eth_getCode` hash.

For every helper deployment, verification must:

1. Recompile the unchanged source with the pinned compiler and settings and verify the source, creation-bytecode, and generic-runtime fingerprints.
2. Verify the transaction input is the exact reviewed creation bytecode followed by the exact token and subject constructor encoding.
3. Construct the expected deployed runtime by patching only the compiler-declared immutable ranges with those verified constructor values.
4. Require every generic-versus-chain difference to lie within an immutable range, require zero differences elsewhere, and require the constructor-specialized expected runtime to equal `eth_getCode` byte-for-byte.
5. Record both hashes: the generic template hash for build integrity and the constructor-specialized/on-chain hash for deployment identity.

Never whitelist an observed on-chain hash by itself. Any unexplained byte, unknown immutable identifier, wrong inserted value, or mismatch after reconstruction is a fail-closed result.
