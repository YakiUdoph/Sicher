# Phase 7D.1 client-side block validation

Sicher's `/start` flow now reads the current Elysium Testnet block from the existing credential-free RPC. A new commitment is considered ready only when its subject is nonzero, its minimum is positive, its start block is strictly greater than the observed head, and its end block is greater than its start block. If the head cannot be read, creation fails closed.

The displayed head refreshes while the form is open. Immediately before transaction construction and simulation, the client reads it again. A start block that has become current or past stops the flow before `eth_call`, gas estimation, or `eth_sendTransaction`. The helpers choose a start 2,000 blocks beyond the freshly read head and an end 3,000 blocks beyond that start.

## Contract limitation

This is frontend protection, not a new on-chain rule. The frozen deployed registry contract checks that `endBlock > startBlock`, but it does not require `startBlock` to be later than `block.number`. Direct contract callers can therefore still create commitments with already-past ranges. The contract, deployment, and historical evidence were not changed in Phase 7D.1.

The immutable testnet records discovered in Phase 7D.0 remain harmless artifacts:

- #3: blocks 3,000–3,200
- #4: blocks 3,000–5,000
- #5: blocks 5,000–7,000

All three ranges were already long past when they were created. They remain on-chain because the registry has no deletion or update path. They are not terminal evidence, are not promoted into `commitments.json`, and are not shown in Explore, Home, or receipt routes.

A successful creation only establishes an active commitment and its registry ID. It does not produce a terminal receipt and does not make the commitment Proven.
