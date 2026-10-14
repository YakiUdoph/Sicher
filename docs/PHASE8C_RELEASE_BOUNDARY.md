# Phase 8C release boundary

The browser treats only a structured wallet rejection (`4001`) as a definite cancellation. Once `eth_sendTransaction` has been invoked, a timeout, disconnect, internal error, or malformed response without a transaction hash is an unknown send outcome. The form persists non-secret attempt metadata and blocks another submission.

“Check transaction status” performs a bounded, read-only `CommitmentCreated` search using the sender and exact commitment terms. One match is passed through the existing receipt, event, and registry-readback checks. Zero matches remain unresolved; multiple matches remain explicitly ambiguous. Neither result silently enables another transaction.

The manual reset is deliberately secondary and warns that another submission may create a duplicate commitment. This escape exists because a browser client cannot perfectly determine broadcast status when a wallet or provider fails before returning a transaction hash.

Immediately before opening the wallet request, the frontend re-reads the selected account and chain ID. A mismatch stops before send and requires the user to review again.

Historical verification and publication remain operator-run in this competition build. No verifier automation, contract change, deployment, or chain mutation is part of Phase 8C.
