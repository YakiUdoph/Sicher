# Phase 7D.2B live fee-preparation failure

The Phase 7D.2 browser failure occurred before fee arithmetic and before wallet authorization. Reproduction of the same preparation pipeline produced this sequence:

1. head read, chain check, future-start validation: success
2. `eth_call`: success
3. `eth_estimateGas`: success (`0x2e218`)
4. `eth_getBalance`: success
5. `eth_getBlockByNumber("latest", false)`: success, with `baseFeePerGas`
6. `eth_gasPrice`: success
7. `eth_maxPriorityFeePerGas`: transport timeout after 10.4 seconds

The broad Phase 7D.2 catch converted that advisory RPC failure into “Network fees changed before the transaction could start.” No EIP-1559 calculation or transaction serialization had occurred.

Zero priority fee is normal in the live Elysium responses inspected here. Recent `eth_feeHistory` responses also contained zero-valued rewards. The implementation now performs required reads serially, treats the priority-fee RPC as advisory, and falls back to `max(gasPrice - baseFee, 0)`. This produces zero when gas price does not exceed base fee and introduces no fixed fee-rate constant.

`eth_feeHistory.baseFeePerGas` follows the standard array shape: one entry per requested block plus a final entry for the predicted next block. Sicher correctly uses the last array item as the prediction. A missing or malformed advisory fee-history response falls back to the freshly read block base fee.

Error categories are now distinct:

- chain-head failure: current-block message
- expired start: stale-start message
- simulation failure: safe contract-simulation message
- gas-estimation failure: safe gas-estimation message
- required fee discovery or parsing failure: current-network-fees message
- a later underpriced wallet/RPC rejection: network-fees-changed message

Raw causes remain attached through `Error.cause` for development diagnostics, while the primary UI stays concise.
