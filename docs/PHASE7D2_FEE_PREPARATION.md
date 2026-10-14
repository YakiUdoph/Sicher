# Phase 7D.2 fee preparation

The `/start` transaction previously omitted every fee field and delegated fee population to the injected wallet. During the attempted Commitment #6 creation, that path produced `maxFeePerGas = 100010000` while the current block required `baseFeePerGas = 100030000`. Sicher did not contain either value, did not cache fee data, and did not calculate the stale maximum. The exact internal wallet calculation is not observable from the application.

The attempted transaction was rejected for invalid pricing. No hash was returned to Sicher, no receipt exists, `nextCommitmentId()` remains 6, and Commitment #6 remains absent.

## Current strategy

Immediately before wallet authorization, after contract simulation and gas-limit estimation, Sicher now reads the latest block base fee, gas price, priority fee, and—when supported—the predicted next base fee from `eth_feeHistory`. It supplies explicit EIP-1559 fee fields calculated from fresh network values:

`maxFeePerGas = max(gasPrice, 2 × max(latestBaseFee, predictedNextBaseFee) + priorityFee)`

`maxPriorityFeePerGas = current network priority-fee recommendation`

The multiplier is proportional headroom, not a fixed fee rate. If the required current fee data is unavailable or malformed, preparation fails closed before `eth_sendTransaction`. Fee-history failure alone falls back safely to the freshly observed block base fee. Wallet/RPC fee rejections are translated into concise user-facing copy while the underlying error remains available to developer tooling.

Simulation, gas limit, and fees remain separate concerns: `eth_call` checks contract execution, `eth_estimateGas` estimates the execution gas limit, and the final fee reads determine transaction pricing.
