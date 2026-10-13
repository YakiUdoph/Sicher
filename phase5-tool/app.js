const config = await fetch("./config.json", { cache: "no-store" }).then((response) => {
  if (!response.ok) throw new Error("Phase 5 configuration could not be loaded.");
  return response.json();
});
const predeployment = await fetch("./predeployment.json", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : null)
  .catch(() => null);
const commitmentPreparation = await fetch("./commitment-preparation.json", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : null)
  .catch(() => null);
const commitmentTwoPreparation = await fetch("./commitment2-preparation.json", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : null)
  .catch(() => null);
const verifiedFreshHelper = await fetch("./verified-fresh-helper.json", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : null)
  .catch(() => null);
const verifiedCommitment = await fetch("./verified-commitment2.json", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : null)
  .catch(() => null);
const experimentState = await fetch("./experiment2-state.json", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : null)
  .catch(() => null);
const commitmentOneFinal = await fetch("./commitment1-final.json", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : null)
  .catch(() => null);
const mode = document.body.dataset.mode;
const details = document.querySelector("#details");
const connectButton = document.querySelector("#connect");
const actionButton = document.querySelector("#action");
const confirmBox = document.querySelector("#confirm");
const statusElement = document.querySelector("#status");
const stepButtons = [...document.querySelectorAll(".step")];
let account;
let proposedStart;
let proposedEnd;
let setupSnapshot;
let commitmentSnapshot;
let finalCommitmentProposal = false;
let experimentSnapshot;
let experimentReadyStep;
let resetSnapshot;
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const archiveRpcUrl = "https://elysium-testnet-rpc.hypedexer.com";

const padWord = (value) => BigInt(value).toString(16).padStart(64, "0");
const padAddress = (address) => address.toLowerCase().slice(2).padStart(64, "0");
const transferData = (to, value) => `${config.selectors.transfer}${padAddress(to)}${padWord(value)}`;
const balanceData = (address) => `${config.selectors.balanceOf}${padAddress(address)}`;
const commitmentData = (start, end) => `${config.selectors.createCommitment}${padAddress(config.subject)}${padAddress(config.token)}${padWord(config.minimumBalance)}${padWord(start)}${padWord(end)}`;
const formatToken = (value) => {
  const number = BigInt(value);
  const whole = number / 10n ** 18n;
  const fraction = (number % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""} STEST`;
};
const formatHype = (value) => `${BigInt(value) / 10n ** 18n}.${(BigInt(value) % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "") || "0"} HYPE`;
function setStatus(message, kind = "") { statusElement.textContent = message; statusElement.className = kind; }
function sanitizedError(error) {
  const values = [];
  const add = (label, value) => {
    if (value !== undefined && value !== null && value !== "") values.push(`${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  };
  if (error && typeof error === "object") {
    add("name", error.name);
    add("message", error.message);
    add("code", error.code);
    add("shortMessage", error.shortMessage);
    add("details", error.details);
    if (error.data && typeof error.data === "object") {
      add("data.code", error.data.code);
      add("data.message", error.data.message);
    }
    if (error.cause && typeof error.cause === "object") {
      add("cause.code", error.cause.code);
      add("cause.message", error.cause.message);
    }
  } else add("message", error);
  return values.join(" | ") || "Unknown error (no safe provider fields were available).";
}
function row(label, value) {
  const dt = document.createElement("dt"); dt.textContent = label;
  const dd = document.createElement("dd"); const code = document.createElement("code"); code.textContent = value; dd.append(code);
  details.append(dt, dd);
}
function renderBase() {
  details.replaceChildren();
  row("Network", "Elysium Testnet");
  row("Chain ID", String(config.expectedChainId));
  row("Required wallet / subject", config.subject);
  row("Token contract", config.token);
  row("Connected wallet", account ?? "not connected");
}
function renderMode(balance, gasEntries = []) {
  renderBase();
  if (mode === "setup") {
    row("From", config.subject); row("To — TEST RECIPIENT / SINK", config.setupSink);
    row("Exact value", formatToken(config.setupAmount));
    row("Current subject balance", balance === undefined ? "unavailable until connected" : formatToken(balance));
    row("Expected post-transfer balance", formatToken(config.startingBalance));
    row("Current block", setupSnapshot?.block ?? "unavailable until connected");
    row("Pending nonce", setupSnapshot?.nonce ?? "unavailable until connected");
    row("Helper", config.helperAddress);
    row("Helper balance", setupSnapshot ? formatToken(setupSnapshot.helperBalance) : "unavailable until connected");
    row("Helper restored", setupSnapshot ? String(setupSnapshot.restored) : "unavailable until connected");
    row("nextCommitmentId", setupSnapshot?.nextCommitmentId ?? "unavailable until connected");
    row("Commitment #1", setupSnapshot ? (setupSnapshot.commitmentExists ? "EXISTS — STOP" : "does not exist") : "unavailable until connected");
    row("Live gas estimate", setupSnapshot?.gasEstimate ?? "unavailable until connected");
    row("Conservative gas limit", setupSnapshot?.gasLimit ?? "unavailable until connected");
    row("Conservative fee rate", setupSnapshot ? `${setupSnapshot.feeRate} wei/gas` : "unavailable until connected");
    row("Conservative maximum fee", setupSnapshot ? `${formatHype(setupSnapshot.maximumFee)} (${setupSnapshot.feePercentage}% of current balance)` : "unavailable until connected");
  } else if (mode === "helper") {
    row("Purpose", "FRESH TEST RETURN HELPER — Infrastructure for Commitment #2");
    row("Token", `${config.token} — verified STEST`); row("Subject", `${config.subject} — verified subject`);
    row("Fixed return amount", formatToken(config.restoreAmount)); row("Compiler", config.helperCompilerVersion);
    row("Constructor arguments", `token=${config.helperConstructorArguments.token}, subject=${config.helperConstructorArguments.subject}`);
    row("Reviewed source SHA-256", config.helperSourceSha256);
    row("Reviewed creation bytecode SHA-256", config.helperCreationBytecodeSha256);
    row("Reviewed runtime bytecode SHA-256", config.helperRuntimeBytecodeSha256);
    row("Old helper", `${config.helperAddress} — RETIRED / restored=true`);
    row("Old helper balance", predeployment?.oldHelperBalance === "0" ? "0 STEST" : "unavailable or nonzero — STOP");
    row("New helper address", "NOT VERIFIED UNTIL MINED");
    row("Predicted address", predeployment?.predictedAddress ? `${predeployment.predictedAddress} — PREDICTED ONLY` : "run live predeployment check");
    row("Prediction status", predeployment?.predictionStatus ?? "PREDICTED ONLY / NOT YET DEPLOYED");
    row("Prediction nonce", predeployment?.pendingNonce === null || predeployment?.pendingNonce === undefined ? "unavailable" : String(predeployment.pendingNonce));
    row("Predeployment estimated gas", predeployment?.estimatedGas ?? "unavailable");
    row("HYPE balance", predeployment?.walletBalanceWei ? `${predeployment.walletBalanceWei} wei` : "unavailable");
    row("Conservative gas limit", predeployment?.conservativeGasLimit ?? "unavailable");
    row("Conservative maximum fee", predeployment?.conservativeMaxFeeWei ? `${predeployment.conservativeMaxFeeWei} wei (${predeployment.percentageOfWalletBalance})` : "unavailable");
  } else if (mode === "commitment") {
    row("Network", "Elysium Testnet"); row("Chain ID", String(config.expectedChainId));
    row("Creator", config.subject); row("Subject", config.subject); row("Token", config.token); row("Sicher contract", config.sicherContract);
    row("Commitment", "#2 — FAILURE EXPERIMENT");
    row("Starting balance", "100,000 STEST"); row("Minimum promised", formatToken(config.minimumBalance));
    row("Planned test path", "100,000 -> 92,000 -> 15,000 -> 100,000 STEST");
    row("Verdict rule", "The commitment does not predetermine the verdict; actual historical chain evidence does");
    row("Verified fresh helper", verifiedFreshHelper?.address ?? "verified helper evidence unavailable — STOP");
    row("Latest block", commitmentSnapshot?.latestBlock ?? "unavailable until connected");
    row("Measured cadence sample", commitmentTwoPreparation ? `live blocks ${commitmentTwoPreparation.cadence.observationStartBlock}-${commitmentTwoPreparation.cadence.observationEndBlock}; historical ${commitmentTwoPreparation.cadence.historicalIntervals} intervals` : "run Phase 5L preparation");
    row("Measured cadence", commitmentTwoPreparation ? `live ${commitmentTwoPreparation.cadence.liveSecondsPerBlock}s/block; historical average ${commitmentTwoPreparation.cadence.historicalAverageSecondsPerBlock}s/block` : "unavailable");
    row("Start offset", commitmentTwoPreparation ? `${commitmentTwoPreparation.policy.startDelayBlocks} blocks` : "unavailable");
    row("Window length", commitmentTwoPreparation ? `${commitmentTwoPreparation.policy.proofWindowBlocks} blocks` : "unavailable");
    row("Proposed startBlock", proposedStart === undefined ? "calculated just in time after connection" : String(proposedStart));
    row("Proposed endBlock", proposedEnd === undefined ? "calculated just in time after connection" : String(proposedEnd));
    row("Approximate start delay", commitmentSnapshot?.approximateStartDelay ?? "unavailable until connected");
    row("Approximate proof-window duration", commitmentSnapshot?.approximateWindow ?? "unavailable until connected");
    row("Inclusive interval semantics", proposedStart === undefined ? "startBlock <= observed block <= endBlock" : `${proposedStart} <= observed block <= ${proposedEnd}`);
    row("Current subject balance", balance === undefined ? "unavailable until connected" : formatToken(balance));
    row("Helper balance", commitmentSnapshot ? formatToken(commitmentSnapshot.helperBalance) : "unavailable until connected");
    row("Helper restored", commitmentSnapshot ? String(commitmentSnapshot.restored) : "unavailable until connected");
    row("nextCommitmentId", commitmentSnapshot?.nextCommitmentId ?? "unavailable until connected");
    row("Expected commitment ID", "2");
    row("Commitment #2", commitmentSnapshot ? (commitmentSnapshot.commitmentExists ? "EXISTS — STOP" : "does not exist") : "unavailable until connected");
    row("Live gas estimate", commitmentSnapshot?.gasEstimate ?? "unavailable until connected");
    row("Conservative gas limit", commitmentSnapshot?.gasLimit ?? "unavailable until connected");
    row("Conservative maximum fee", commitmentSnapshot ? `${formatHype(commitmentSnapshot.maximumFee)} (${commitmentSnapshot.feePercentage}% of current HYPE balance)` : "unavailable until connected");
  } else if (mode === "reset") {
    row("Action", "Reset transaction 2 — existingReturnHelper.restore()");
    row("Classification", "TEST INFRASTRUCTURE RESET — FINAL RESTORE; NOT PART OF COMMITMENT #1");
    row("Caller / subject", config.subject); row("Helper", config.helperAddress); row("Token", config.token);
    row("Helper -> Subject", formatToken(config.restoreAmount));
    row("Subject", "15,000 -> 100,000 STEST"); row("Helper balance", "85,000 -> 0 STEST");
    row("restored", "false -> true");
    row("Commitment #1", commitmentOneFinal?.verdict === "PASS" ? `ended at block ${commitmentOneFinal.endBlock}; final verdict PASS` : "final PASS evidence unavailable — STOP");
    row("Effect on Commitment #1 verdict", "NONE");
    row("Current block", resetSnapshot?.currentBlock ?? "unavailable until connected");
    row("Current subject balance", balance === undefined ? "unavailable until connected" : formatToken(balance));
    row("Current helper balance", resetSnapshot ? formatToken(resetSnapshot.helperBalance) : "unavailable until connected");
    row("Helper restored", resetSnapshot ? String(resetSnapshot.restored) : "unavailable until connected");
    row("Fixed subject", resetSnapshot?.fixedSubject ?? "unavailable until connected");
    row("Fixed token", resetSnapshot?.fixedToken ?? "unavailable until connected");
    row("Fixed restoration amount", resetSnapshot ? formatToken(resetSnapshot.fixedAmount) : "unavailable until connected");
    row("Unexpected transfers after Reset Transaction 1", resetSnapshot ? String(resetSnapshot.unexpectedTransfers) : "unavailable until connected");
    row("Simulation", resetSnapshot?.simulation ?? "unavailable until connected");
    row("Live gas estimate", resetSnapshot?.gasEstimate ?? "unavailable until connected");
  } else {
    const helper = verifiedFreshHelper?.address ?? "VERIFIED FRESH HELPER UNAVAILABLE";
    row("Experiment", "COMMITMENT #2 — RESTORE AFTER VERIFIED BREACH");
    row("Proof status", "ACTIVE / UNDETERMINED — never PASS before endBlock");
    row("Verified commitment", verifiedCommitment?.verified ? `#${verifiedCommitment.id} — ${verifiedCommitment.transaction}` : "not verified");
    row("Inclusive window", verifiedCommitment?.verified ? `${verifiedCommitment.startBlock} <= current block <= ${verifiedCommitment.endBlock}` : "unavailable");
    row("Current block", experimentSnapshot?.currentBlock ?? "unavailable until connected");
    row("Window status", experimentSnapshot?.windowStatus ?? "unavailable until connected");
    row("Blocks remaining", experimentSnapshot?.blocksRemaining ?? "unavailable until connected");
    row("Safety margin", experimentSnapshot?.safetyMargin ?? "20,000 blocks required for restore submission and independent verification");
    row("Window", "8220689 <= transaction block <= 8520689");
    row("From", config.subject); row("To", helper);
    row("Current subject", balance === undefined ? "15,000 STEST (must be rechecked live)" : formatToken(balance));
    row("Current helper", experimentSnapshot ? formatToken(experimentSnapshot.helperBalance) : "85,000 STEST (must be rechecked live)");
    row("Restore amount", "85,000 STEST");
    row("Expected subject after", "100,000 STEST");
    row("Expected helper after", "0 STEST");
    row("Expected restored after", "true");
    row("Historical minimum", "15,000 STEST");
    row("Committed minimum", "80,000 STEST");
    row("Historical breach", "ALREADY ESTABLISHED");
    row("Expected reconstructed path after restoration", "100,000 -> 92,000 -> 15,000 -> 100,000 STEST");
    row("Important", "Returning to 100,000 does not erase the earlier breach");
    row("Helper restored", experimentSnapshot ? String(experimentSnapshot.restored) : "unavailable until connected");
    row("Unexpected in-window transfers", experimentSnapshot?.unexpectedTransfers ?? "must be checked live");
    row("Simulation", experimentSnapshot?.simulation ?? "must be run live");
    row("HYPE balance", experimentSnapshot?.hypeBalance ?? "must be checked live");
    row("Step 1 verification", experimentState?.step1?.verified ? "PASS" : "UNVERIFIED — Step 2 locked");
    row("Step 2 verification", experimentState?.step2?.verified ? "PASS — breach established" : "UNVERIFIED — restore locked");
    row("Restore verification", "PENDING — a transaction hash alone is not completion");
    row("Enabled transition", experimentReadyStep ?? "none");
  }
  for (const [label, value] of gasEntries) row(label, `${value} gas (live estimate)`);
}
renderMode();

async function requireContext(requestAccounts = false) {
  if (!window.ethereum) throw new Error("MetaMask was not detected.");
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId.toLowerCase() !== config.expectedChainIdHex) throw new Error(`Wrong network. Required chain ID ${config.expectedChainId}.`);
  const accounts = await window.ethereum.request({ method: requestAccounts ? "eth_requestAccounts" : "eth_accounts" });
  const selected = accounts[0];
  if (!selected || selected.toLowerCase() !== config.subject.toLowerCase()) throw new Error(`Required wallet: ${config.subject}`);
  return selected;
}
async function balanceOfSubject() {
  const value = await window.ethereum.request({ method: "eth_call", params: [{ to: config.token, data: balanceData(config.subject) }, "latest"] });
  return BigInt(value);
}
async function estimate(to, data) {
  const value = await window.ethereum.request({ method: "eth_estimateGas", params: [{ from: account, to, data }] });
  return BigInt(value);
}
async function readCommitmentGate() {
  const helper = verifiedFreshHelper?.address;
  if (!helper) throw new Error("STOP: verified fresh helper evidence is unavailable.");
  const [latestHex, helperBalanceHex, restoredHex, helperTokenHex, helperSubjectHex, helperAmountHex, nextIdHex, commitmentHex, hypeBalanceHex] = await Promise.all([
    window.ethereum.request({ method: "eth_blockNumber" }),
    window.ethereum.request({ method: "eth_call", params: [{ to: config.token, data: balanceData(helper) }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: helper, data: config.selectors.restored }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: helper, data: config.selectors.helperToken }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: helper, data: config.selectors.helperSubject }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: helper, data: config.selectors.returnAmount }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: config.sicherContract, data: config.selectors.nextCommitmentId }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: config.sicherContract, data: `${config.selectors.commitments}${padWord(2)}` }, "latest"] }),
    window.ethereum.request({ method: "eth_getBalance", params: [config.subject, "latest"] }),
  ]);
  const words = commitmentHex.slice(2).match(/.{64}/g) ?? [];
  const wordBigInt = (index) => BigInt(`0x${words[index] ?? "0"}`);
  const wordAddress = (index) => `0x${(words[index] ?? "").slice(24)}`.toLowerCase();
  const commitment = { id: wordBigInt(0), creator: wordAddress(1), subject: wordAddress(2), token: wordAddress(3), minimum: wordBigInt(4), start: wordBigInt(5), end: wordBigInt(6) };
  return { latest: BigInt(latestHex), helperBalance: BigInt(helperBalanceHex), restored: BigInt(restoredHex) !== 0n,
    helperToken: `0x${helperTokenHex.slice(-40)}`.toLowerCase(), helperSubject: `0x${helperSubjectHex.slice(-40)}`.toLowerCase(), helperAmount: BigInt(helperAmountHex),
    nextId: BigInt(nextIdHex), commitmentExists: commitment.id !== 0n, commitment, hypeBalance: BigInt(hypeBalanceHex) };
}
async function readCommitmentTwoGate() {
  if (!verifiedFreshHelper?.verified || verifiedFreshHelper.verdict !== "PASS") throw new Error("STOP: verified fresh helper evidence is unavailable.");
  const helper = verifiedFreshHelper.address;
  const [latestHex, helperBalanceHex, restoredHex, helperTokenHex, helperSubjectHex, helperAmountHex, nextIdHex, commitmentHex, sicherCode] = await Promise.all([
    window.ethereum.request({ method: "eth_blockNumber" }),
    window.ethereum.request({ method: "eth_call", params: [{ to: config.token, data: balanceData(helper) }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: helper, data: config.selectors.restored }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: helper, data: config.selectors.helperToken }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: helper, data: config.selectors.helperSubject }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: helper, data: config.selectors.returnAmount }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: config.sicherContract, data: config.selectors.nextCommitmentId }, "latest"] }),
    window.ethereum.request({ method: "eth_call", params: [{ to: config.sicherContract, data: `${config.selectors.commitments}${padWord(2)}` }, "latest"] }),
    window.ethereum.request({ method: "eth_getCode", params: [config.sicherContract, "latest"] }),
  ]);
  const words = commitmentHex.slice(2).match(/.{64}/g) ?? [];
  return {
    latest: BigInt(latestHex), helperBalance: BigInt(helperBalanceHex), restored: BigInt(restoredHex) !== 0n,
    helperToken: `0x${helperTokenHex.slice(-40)}`.toLowerCase(), helperSubject: `0x${helperSubjectHex.slice(-40)}`.toLowerCase(), helperAmount: BigInt(helperAmountHex),
    nextId: BigInt(nextIdHex), commitmentExists: BigInt(`0x${words[0] ?? "0"}`) !== 0n, sicherCode,
  };
}
async function relevantTransferLogs(fromBlock, toBlock) {
  const relevant = new Set([config.subject.toLowerCase(), verifiedFreshHelper.address.toLowerCase()]);
  const response = await fetch(archiveRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ address: config.token, fromBlock: `0x${fromBlock.toString(16)}`, toBlock: `0x${toBlock.toString(16)}`, topics: [transferTopic] }] }),
  });
  if (!response.ok) throw new Error(`Historical transfer query HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error) throw new Error(`Historical transfer query failed — ${sanitizedError(payload.error)}`);
  if (!Array.isArray(payload.result)) throw new Error("Historical transfer query returned an invalid result.");
  return payload.result.filter((log) => {
    const from = `0x${log.topics[1].slice(-40)}`.toLowerCase();
    const to = `0x${log.topics[2].slice(-40)}`.toLowerCase();
    return relevant.has(from) || relevant.has(to);
  });
}
async function countRelevantTransfers(fromBlock, toBlock) {
  return (await relevantTransferLogs(fromBlock, toBlock)).length;
}
function requireCommitmentGate(state, subjectBalance) {
  if (BigInt(config.setupBlock) >= state.latest) throw new Error("STOP: verified setup block does not precede the latest block.");
  if (subjectBalance !== BigInt(config.startingBalance)) throw new Error("STOP: subject balance is not exactly 100,000 STEST.");
  if (state.helperBalance !== 0n) throw new Error("STOP: helper balance is not zero.");
  if (state.restored) throw new Error("STOP: helper restored() is not false.");
  if (state.nextId !== 1n) throw new Error("STOP: nextCommitmentId is not 1.");
  if (state.commitmentExists) throw new Error("STOP: commitment #1 exists.");
}
function requireCommitmentTwoGate(state, subjectBalance) {
  if (!commitmentTwoPreparation?.ready) throw new Error("STOP: Commitment #2 independent preflight has not passed.");
  if (!commitmentOneFinal?.verified || commitmentOneFinal.verdict !== "PASS") throw new Error("STOP: Commitment #1 PASS evidence is unavailable.");
  if (!verifiedFreshHelper?.verified || verifiedFreshHelper.verdict !== "PASS") throw new Error("STOP: fresh helper is not independently verified.");
  if (subjectBalance !== 100_000n * 10n ** 18n) throw new Error("STOP: subject balance is not exactly 100,000 STEST.");
  if (state.sicherCode === "0x") throw new Error("STOP: Sicher contract runtime is absent.");
  if (state.helperBalance !== 0n || state.restored) throw new Error("STOP: fresh helper is not at balance 0 / restored false.");
  if (state.helperToken !== config.token.toLowerCase() || state.helperSubject !== config.subject.toLowerCase() || state.helperAmount !== 85_000n * 10n ** 18n) throw new Error("STOP: fresh helper configuration differs from verified values.");
  if (state.nextId !== 2n) throw new Error("STOP: nextCommitmentId is not 2.");
  if (state.commitmentExists) throw new Error("STOP: Commitment #2 already exists.");
}
function requireExactVerifiedCommitment(state) {
  if (!verifiedCommitment?.verified || verifiedCommitment.id !== "2" || verifiedCommitment.proofStatus !== "ACTIVE_UNDETERMINED") throw new Error("Experiment locked: Commitment #2 creation verification is unavailable.");
  const commitment = state.commitment;
  if (commitment.id !== 2n || commitment.creator !== config.subject.toLowerCase() || commitment.subject !== config.subject.toLowerCase() || commitment.token !== config.token.toLowerCase() || commitment.minimum !== BigInt(config.minimumBalance) || commitment.start !== BigInt(verifiedCommitment.startBlock) || commitment.end !== BigInt(verifiedCommitment.endBlock) || state.nextId !== 3n) throw new Error("STOP: Commitment #2 storage differs from the verified terms.");
  if (state.helperToken !== config.token.toLowerCase() || state.helperSubject !== config.subject.toLowerCase() || state.helperAmount !== BigInt(config.restoreAmount)) throw new Error("STOP: fresh helper configuration differs from verified values.");
}
async function prepare() {
  if (actionButton) actionButton.disabled = true;
  for (const button of stepButtons) button.disabled = true;
  account = await requireContext(true);
  const balance = await balanceOfSubject();
  const gasEntries = [];
  if (mode === "setup") {
    const [block, nonce, helperBalanceHex, restoredHex, nextIdHex, commitmentHex, gasEstimate, gasPriceHex, hypeBalanceHex] = await Promise.all([
      window.ethereum.request({ method: "eth_blockNumber" }),
      window.ethereum.request({ method: "eth_getTransactionCount", params: [config.subject, "pending"] }),
      window.ethereum.request({ method: "eth_call", params: [{ to: config.token, data: balanceData(config.helperAddress) }, "latest"] }),
      window.ethereum.request({ method: "eth_call", params: [{ to: config.helperAddress, data: config.selectors.restored }, "latest"] }),
      window.ethereum.request({ method: "eth_call", params: [{ to: config.sicherContract, data: config.selectors.nextCommitmentId }, "latest"] }),
      window.ethereum.request({ method: "eth_call", params: [{ to: config.sicherContract, data: `${config.selectors.commitments}${padWord(1)}` }, "latest"] }),
      estimate(config.token, transferData(config.setupSink, config.setupAmount)),
      window.ethereum.request({ method: "eth_gasPrice" }),
      window.ethereum.request({ method: "eth_getBalance", params: [config.subject, "latest"] }),
    ]);
    const helperBalance = BigInt(helperBalanceHex);
    const restored = BigInt(restoredHex) !== 0n;
    const nextCommitmentId = BigInt(nextIdHex);
    const commitmentExists = BigInt(`0x${commitmentHex.slice(2, 66)}`) !== 0n;
    const gasLimit = (gasEstimate * 120n + 99n) / 100n;
    const feeRate = (BigInt(gasPriceHex) * 120n + 99n) / 100n;
    const maximumFee = gasLimit * feeRate;
    const hypeBalance = BigInt(hypeBalanceHex);
    const feePercentage = hypeBalance === 0n ? "unavailable" : String(Number(maximumFee * 1_000_000n / hypeBalance) / 10_000);
    setupSnapshot = { block: BigInt(block).toString(), nonce: BigInt(nonce).toString(), helperBalance, restored, nextCommitmentId: nextCommitmentId.toString(), commitmentExists, gasEstimate: gasEstimate.toString(), gasLimit: gasLimit.toString(), feeRate, maximumFee, feePercentage };
    renderMode(balance);
    if (balance !== 1_000_000n * 10n ** 18n) throw new Error("STOP: subject does not own exactly 1,000,000 STEST.");
    if (helperBalance !== 0n) throw new Error("STOP: helper balance is not zero.");
    if (restored) throw new Error("STOP: helper restored() is not false.");
    if (nextCommitmentId !== 1n) throw new Error("STOP: nextCommitmentId is not 1.");
    if (commitmentExists) throw new Error("STOP: commitment #1 exists.");
    if (hypeBalance === 0n || maximumFee * 100n > hypeBalance) throw new Error("STOP: conservative fee is not below or equal to 1% of the HYPE balance.");
  }
  if (mode === "helper") {
    if (!predeployment?.ready) throw new Error("STOP: fresh-helper independent preflight has not passed.");
    if (!commitmentOneFinal?.verified || commitmentOneFinal.verdict !== "PASS") throw new Error("STOP: Commitment #1 PASS evidence is unavailable.");
    if (predeployment.sourceSha256 !== config.helperSourceSha256 || predeployment.creationBytecodeSha256 !== config.helperCreationBytecodeSha256 || predeployment.runtimeBytecodeSha256 !== config.helperRuntimeBytecodeSha256) throw new Error("STOP: helper fingerprints differ from the reviewed build.");
    const [oldHelperBalanceHex, oldRestoredHex, pendingNonceHex, predictedCode] = await Promise.all([
      window.ethereum.request({ method: "eth_call", params: [{ to: config.token, data: balanceData(config.helperAddress) }, "latest"] }),
      window.ethereum.request({ method: "eth_call", params: [{ to: config.helperAddress, data: config.selectors.restored }, "latest"] }),
      window.ethereum.request({ method: "eth_getTransactionCount", params: [config.subject, "pending"] }),
      window.ethereum.request({ method: "eth_getCode", params: [predeployment.predictedAddress, "latest"] }),
    ]);
    if (balance !== 100_000n * 10n ** 18n) throw new Error("STOP: subject balance is not exactly 100,000 STEST.");
    if (BigInt(oldHelperBalanceHex) !== 0n) throw new Error("STOP: retired helper balance is not zero.");
    if (BigInt(oldRestoredHex) !== 1n) throw new Error("STOP: retired helper restored() is not true.");
    if (Number(BigInt(pendingNonceHex)) !== predeployment.pendingNonce) throw new Error("STOP: pending nonce changed; rerun the fresh-helper preflight for a new prediction.");
    if (predictedCode !== "0x") throw new Error("STOP: code already exists at the predicted address.");
    gasEntries.push(["Fresh helper deployment gas", await estimate(undefined, config.helperCreationData)]);
  }
  if (mode === "commitment") {
    if (!commitmentTwoPreparation?.ready) throw new Error("Phase 5L Commitment #2 preparation is unavailable or failed.");
    const gate = await readCommitmentTwoGate();
    requireCommitmentTwoGate(gate, balance);
    const startDelayBlocks = BigInt(commitmentTwoPreparation.policy.startDelayBlocks);
    const proofWindowBlocks = BigInt(commitmentTwoPreparation.policy.proofWindowBlocks);
    proposedStart = gate.latest + startDelayBlocks;
    proposedEnd = proposedStart + proofWindowBlocks;
    const finalData = commitmentData(proposedStart, proposedEnd);
    await window.ethereum.request({ method: "eth_call", params: [{ from: config.subject, to: config.sicherContract, data: finalData }, "latest"] });
    const gasEstimate = await estimate(config.sicherContract, finalData);
    const [gasPriceHex, hypeBalanceHex] = await Promise.all([
      window.ethereum.request({ method: "eth_gasPrice" }),
      window.ethereum.request({ method: "eth_getBalance", params: [config.subject, "latest"] }),
    ]);
    const gasLimit = (gasEstimate * 120n + 99n) / 100n;
    const feeRate = (BigInt(gasPriceHex) * 120n + 99n) / 100n;
    const maximumFee = gasLimit * feeRate;
    const hypeBalance = BigInt(hypeBalanceHex);
    const totalExperimentCost = BigInt(commitmentTwoPreparation.costs.estimatedTotalWei);
    if (hypeBalance <= totalExperimentCost * 10n) throw new Error("STOP: HYPE balance no longer provides the required 10x experiment-cost coverage.");
    const designCadence = Number(commitmentTwoPreparation.cadence.designSecondsPerBlock);
    commitmentSnapshot = { latestBlock: gate.latest.toString(), helperBalance: gate.helperBalance, restored: gate.restored, nextCommitmentId: gate.nextId.toString(), commitmentExists: gate.commitmentExists, gasEstimate: gasEstimate.toString(), gasLimit: gasLimit.toString(), maximumFee, feePercentage: String(Number(maximumFee * 1_000_000n / hypeBalance) / 10_000), approximateStartDelay: `${Math.round(Number(startDelayBlocks) * designCadence / 60 * 10) / 10} minutes`, approximateWindow: `${Math.round(Number(proofWindowBlocks) * designCadence / 60 * 10) / 10} minutes` };
  }
  if (mode === "reset") {
    if (!commitmentOneFinal?.verified || commitmentOneFinal.verdict !== "PASS") throw new Error("STOP: Commitment #1 final PASS evidence is unavailable.");
    const [latestHex, helperBalanceHex, restoredHex, fixedSubjectHex, fixedTokenHex, fixedAmountHex] = await Promise.all([
      window.ethereum.request({ method: "eth_blockNumber" }),
      window.ethereum.request({ method: "eth_call", params: [{ to: config.token, data: balanceData(config.helperAddress) }, "latest"] }),
      window.ethereum.request({ method: "eth_call", params: [{ to: config.helperAddress, data: config.selectors.restored }, "latest"] }),
      window.ethereum.request({ method: "eth_call", params: [{ to: config.helperAddress, data: config.selectors.helperSubject }, "latest"] }),
      window.ethereum.request({ method: "eth_call", params: [{ to: config.helperAddress, data: config.selectors.helperToken }, "latest"] }),
      window.ethereum.request({ method: "eth_call", params: [{ to: config.helperAddress, data: config.selectors.returnAmount }, "latest"] }),
    ]);
    const latest = BigInt(latestHex);
    const helperBalance = BigInt(helperBalanceHex);
    const restored = BigInt(restoredHex) !== 0n;
    const fixedSubject = `0x${fixedSubjectHex.slice(-40)}`;
    const fixedToken = `0x${fixedTokenHex.slice(-40)}`;
    const fixedAmount = BigInt(fixedAmountHex);
    const unexpectedTransfers = await countRelevantTransfers(BigInt(config.resetTransaction1Block) + 1n, latest);
    const simulation = await window.ethereum.request({ method: "eth_call", params: [{ from: config.subject, to: config.helperAddress, data: config.selectors.restore }, "latest"] });
    const gasEstimate = await estimate(config.helperAddress, config.selectors.restore);
    resetSnapshot = { currentBlock: latest.toString(), helperBalance, restored, fixedSubject, fixedToken, fixedAmount, unexpectedTransfers, simulation: simulation === "0x" ? "PASS — restore() completed without revert" : "PASS — restore() completed without revert", gasEstimate: gasEstimate.toString() };
    renderMode(balance);
    if (latest <= BigInt(commitmentOneFinal.endBlock)) throw new Error("STOP: Commitment #1 has not ended.");
    if (balance !== 15_000n * 10n ** 18n) throw new Error("STOP: subject balance is not exactly 15,000 STEST.");
    if (helperBalance !== 85_000n * 10n ** 18n) throw new Error("STOP: helper balance is not exactly 85,000 STEST.");
    if (restored) throw new Error("STOP: helper restored() is not false.");
    if (fixedSubject.toLowerCase() !== config.subject.toLowerCase()) throw new Error("STOP: helper fixed subject differs from the configured subject.");
    if (fixedToken.toLowerCase() !== config.token.toLowerCase()) throw new Error("STOP: helper fixed token differs from the verified STEST token.");
    if (fixedAmount !== BigInt(config.restoreAmount)) throw new Error("STOP: helper fixed restoration amount is not exactly 85,000 STEST.");
    if (unexpectedTransfers !== 0) throw new Error("STOP: unexpected subject/helper STEST transfers exist after Reset Transaction 1.");
  }
  if (mode === "experiment") {
    if (!experimentState) throw new Error("Experiment locked: independent step-verification state is unavailable.");
    const gate = await readCommitmentGate();
    requireExactVerifiedCommitment(gate);
    const start = BigInt(verifiedCommitment.startBlock);
    const end = BigInt(verifiedCommitment.endBlock);
    const windowStatus = gate.latest < start ? "WAITING" : gate.latest <= end ? "ACTIVE" : "EXPIRED";
    const blocksRemaining = gate.latest <= end ? end - gate.latest : 0n;
    const minimumSafetyRemaining = 20_000n;
    experimentReadyStep = undefined;
    let expectedSubject;
    let expectedHelper;
    let expectedRestored = false;
    if (!experimentState.step1.verified && !experimentState.step2.verified && !experimentState.step3.verified) { experimentReadyStep = "first"; expectedSubject = 100_000n * 10n ** 18n; expectedHelper = 0n; }
    else if (experimentState.step1.verified && !experimentState.step2.verified && !experimentState.step3.verified) { experimentReadyStep = "second"; expectedSubject = 92_000n * 10n ** 18n; expectedHelper = 8_000n * 10n ** 18n; }
    else if (experimentState.step1.verified && experimentState.step2.verified && !experimentState.step3.verified) { experimentReadyStep = "restore"; expectedSubject = 15_000n * 10n ** 18n; expectedHelper = 85_000n * 10n ** 18n; }
    else if (experimentState.step1.verified && experimentState.step2.verified && experimentState.step3.verified) { expectedSubject = 100_000n * 10n ** 18n; expectedHelper = 0n; expectedRestored = true; }
    else throw new Error("STOP: experiment verification state is not sequentially consistent.");
    if (experimentReadyStep !== "restore" || experimentState.step3?.ready !== true) throw new Error("STOP: restoration is not independently unlocked.");
    if (windowStatus !== "ACTIVE" || blocksRemaining < minimumSafetyRemaining) experimentReadyStep = undefined;
    if (windowStatus !== "ACTIVE") throw new Error(windowStatus === "EXPIRED" ? "EXPIRED: verified commitment window ended unused or incomplete. All actions are disabled." : "WAITING: verified commitment window has not started. All actions are disabled.");
    if (blocksRemaining < minimumSafetyRemaining) throw new Error("STOP: fewer than 20,000 blocks remain; insufficient safety margin for restore submission and independent verification.");
    if (balance !== expectedSubject || gate.helperBalance !== expectedHelper || gate.restored !== expectedRestored) { experimentReadyStep = undefined; throw new Error("STOP: live balances/restored state do not match the independently verified sequence state."); }
    const helper = verifiedFreshHelper.address;
    const relevantTransfers = await relevantTransferLogs(start, gate.latest);
    const [step1, step2] = relevantTransfers;
    const commonTransferExact = (log) => `0x${log.topics[1].slice(-40)}`.toLowerCase() === config.subject.toLowerCase() && `0x${log.topics[2].slice(-40)}`.toLowerCase() === helper.toLowerCase();
    const historyExact = relevantTransfers.length === 2
      && step1.transactionHash.toLowerCase() === experimentState.step1.transaction.toLowerCase()
      && BigInt(step1.blockNumber) === BigInt(experimentState.step1.block)
      && commonTransferExact(step1) && BigInt(step1.data) === BigInt(config.firstTransferAmount)
      && step2.transactionHash.toLowerCase() === experimentState.step2.transaction.toLowerCase()
      && BigInt(step2.blockNumber) === BigInt(experimentState.step2.block)
      && commonTransferExact(step2) && BigInt(step2.data) === BigInt(config.secondTransferAmount);
    if (!historyExact) { experimentReadyStep = undefined; throw new Error("STOP: in-window history is not exactly the independently verified Step 1 and Step 2 transfers."); }
    const unexpectedTransfers = relevantTransfers.length - 2;
    const stepData = config.selectors.restore;
    const simulation = await window.ethereum.request({ method: "eth_call", params: [{ from: config.subject, to: helper, data: stepData }, "latest"] });
    if (simulation !== "0x") throw new Error("STOP: exact restore() simulation returned unexpected data.");
    const gasEstimate = await estimate(helper, stepData);
    const gasPrice = BigInt(await window.ethereum.request({ method: "eth_gasPrice" }));
    const simulatedFeeRate = gasPrice * 2n;
    const call = (to, data) => ({ from: config.subject, to, data, gas: "0x989680", maxFeePerGas: `0x${simulatedFeeRate.toString(16)}`, maxPriorityFeePerGas: "0x0" });
    const postStateResponse = await fetch(archiveRpcUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_simulateV1", params: [{ blockStateCalls: [{ calls: [call(helper, stepData), call(config.token, balanceData(config.subject)), call(config.token, balanceData(helper)), call(helper, config.selectors.restored)] }], validation: true, traceTransfers: true }, `0x${gate.latest.toString(16)}`] }) });
    const postStatePayload = await postStateResponse.json();
    if (!postStateResponse.ok || postStatePayload.error) throw new Error(`Post-restore simulation failed — ${sanitizedError(postStatePayload.error ?? { message: `HTTP ${postStateResponse.status}` })}`);
    const calls = postStatePayload.result?.[0]?.calls;
    const transferLog = calls?.[0]?.logs?.[0];
    const postStateExact = Array.isArray(calls) && calls.length === 4 && calls.every((item) => item.status === "0x1")
      && transferLog?.address?.toLowerCase() === config.token.toLowerCase()
      && `0x${transferLog.topics[1].slice(-40)}`.toLowerCase() === helper.toLowerCase()
      && `0x${transferLog.topics[2].slice(-40)}`.toLowerCase() === config.subject.toLowerCase()
      && BigInt(transferLog.data) === BigInt(config.restoreAmount)
      && BigInt(calls[1].returnData) === 100_000n * 10n ** 18n
      && BigInt(calls[2].returnData) === 0n
      && BigInt(calls[3].returnData) === 1n;
    if (!postStateExact) throw new Error("STOP: simulated post-restore balances, Transfer event, or restored flag differ from required values.");
    const conservativeRestoreCost = gasEstimate * 150n / 100n * (gasPrice * 150n / 100n);
    if (gate.hypeBalance < conservativeRestoreCost * 10n) throw new Error("STOP: HYPE balance does not provide 10x conservative restore-fee coverage.");
    experimentSnapshot = { currentBlock: gate.latest.toString(), windowStatus, blocksRemaining: blocksRemaining.toString(), safetyMargin: `${blocksRemaining} remaining; 20,000 required — PASS`, helperBalance: gate.helperBalance, restored: gate.restored, unexpectedTransfers: `${unexpectedTransfers} (two verified transfers only)`, simulation: "PASS — subject 100,000; helper 0; restored true; historical evidence unchanged", hypeBalance: `${formatHype(gate.hypeBalance)} — sufficient` };
    gasEntries.push(["Restore gas", gasEstimate]);
  }
  renderMode(balance, gasEntries);
  if (mode === "commitment") actionButton.textContent = finalCommitmentProposal ? "Request MetaMask commitment approval" : "Recalculate final proposal";
  if (actionButton) actionButton.disabled = false;
  for (const button of stepButtons) button.disabled = mode === "experiment" ? button.dataset.step !== experimentReadyStep : false;
  setStatus("Network, wallet, current balance, and live gas estimate verified. No transaction sent.", "ok");
}
connectButton.addEventListener("click", async () => {
  try { await prepare(); } catch (error) { setStatus(sanitizedError(error), "error"); }
});

async function authorize(to, data, label) {
  if (!confirmBox.checked) throw new Error("Explicit review confirmation is required.");
  account = await requireContext(false);
  const gasEstimate = await estimate(to, data);
  const gas = (gasEstimate * 120n + 99n) / 100n;
  setStatus(`Opening MetaMask for ${label}. Nothing is approved automatically.`, "warning");
  const transaction = { from: account, data, gas: `0x${gas.toString(16)}` };
  if (to) transaction.to = to;
  const hash = await window.ethereum.request({ method: "eth_sendTransaction", params: [transaction] });
  confirmBox.checked = false;
  setStatus(`MetaMask returned transaction hash: ${hash}. Independently verify it before continuing.`, "ok");
}

actionButton?.addEventListener("click", async () => {
  try {
    if (mode === "setup") { await prepare(); await authorize(config.token, transferData(config.setupSink, config.setupAmount), "the 900,000 STEST setup transfer"); }
    if (mode === "helper") { await prepare(); await authorize(undefined, config.helperCreationData, "FRESH TEST RETURN HELPER — Infrastructure for Commitment #2"); }
    if (mode === "commitment") {
      if (!confirmBox.checked) throw new Error("Explicit review confirmation is required.");
      if (!finalCommitmentProposal) {
        await prepare();
        finalCommitmentProposal = true;
        confirmBox.checked = false;
        actionButton.textContent = "Request MetaMask commitment approval";
        setStatus("Final proposal recalculated from the latest block. Review the exact terms, check the box again, then authorize.", "warning");
        return;
      }
      const gate = await readCommitmentTwoGate();
      const balance = await balanceOfSubject();
      requireCommitmentTwoGate(gate, balance);
      const minimumRemaining = BigInt(commitmentTwoPreparation.policy.minimumRemainingDelayBlocks);
      if (proposedStart === undefined || proposedEnd === undefined || proposedStart - gate.latest < minimumRemaining) {
        finalCommitmentProposal = false;
        await prepare();
        confirmBox.checked = false;
        actionButton.textContent = "Recalculate final proposal";
        throw new Error("Final proposal became stale. A fresh provisional interval was calculated; review and finalize it again.");
      }
      const finalData = commitmentData(proposedStart, proposedEnd);
      const [finalGasEstimate, gasPriceHex, hypeBalanceHex] = await Promise.all([
        estimate(config.sicherContract, finalData),
        window.ethereum.request({ method: "eth_gasPrice" }),
        window.ethereum.request({ method: "eth_getBalance", params: [config.subject, "latest"] }),
      ]);
      const finalGasLimit = (finalGasEstimate * 120n + 99n) / 100n;
      const finalFeeRate = (BigInt(gasPriceHex) * 120n + 99n) / 100n;
      const finalMaximumFee = finalGasLimit * finalFeeRate;
      const finalHypeBalance = BigInt(hypeBalanceHex);
      const totalExperimentCost = BigInt(commitmentTwoPreparation.costs.estimatedTotalWei);
      if (finalHypeBalance <= totalExperimentCost * 10n || finalMaximumFee >= finalHypeBalance) throw new Error("STOP: final HYPE safety reserve is insufficient.");
      await window.ethereum.request({ method: "eth_call", params: [{ from: config.subject, to: config.sicherContract, data: finalData }, "latest"] });
      await authorize(config.sicherContract, finalData, "Commitment #2 — failure experiment creation");
    }
    if (mode === "reset") { await prepare(); await authorize(config.helperAddress, config.selectors.restore, "TEST INFRASTRUCTURE RESET — FINAL RESTORE; NOT PART OF COMMITMENT #1"); }
  } catch (error) { setStatus(sanitizedError(error), "error"); }
});

for (const button of stepButtons) button.addEventListener("click", async () => {
  try {
    if (!verifiedFreshHelper?.address) throw new Error("Verified fresh helper is not configured.");
    const step = button.dataset.step;
    await prepare();
    if (step !== experimentReadyStep) throw new Error("This transition is locked until the preceding transaction independently passes verification.");
    if (step === "restore") await authorize(verifiedFreshHelper.address, config.selectors.restore, "Commitment #2 restore() after verified historical breach");
  } catch (error) { setStatus(sanitizedError(error), "error"); }
});

window.ethereum?.on?.("accountsChanged", () => { account = undefined; finalCommitmentProposal = false; if (actionButton) actionButton.disabled = true; for (const button of stepButtons) button.disabled = true; setStatus("Wallet changed — reconnect required.", "warning"); });
window.ethereum?.on?.("chainChanged", () => { account = undefined; finalCommitmentProposal = false; if (actionButton) actionButton.disabled = true; for (const button of stepButtons) button.disabled = true; setStatus("Network changed — reconnect required.", "warning"); });
