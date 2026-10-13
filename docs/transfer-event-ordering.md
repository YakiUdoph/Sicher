# Sicher transfer-event ordering

Live Elysium reconstruction must order ERC-20 `Transfer` events by this tuple,
in ascending order:

1. `blockNumber`
2. `transactionIndex`
3. `logIndex`

This provides deterministic chain order across blocks, transactions within a
block, and logs within a transaction.

The local Phase 4A EVM tests execute calls sequentially and return logs for each
call, but raw `EVM.runCall` results do not provide meaningful block numbers,
transaction indexes, or log indexes. The local reconstruction test therefore
uses the real call-execution order and log-array order available from the VM. It
does not fabricate chain-ordering fields.
