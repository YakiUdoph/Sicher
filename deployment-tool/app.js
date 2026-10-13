const connectButton = document.querySelector("#connect");
const deployButton = document.querySelector("#deploy");
const requiredWalletElement = document.querySelector("#required-wallet");
const connectedWalletElement = document.querySelector("#connected-wallet");
const fingerprintElement = document.querySelector("#fingerprint");
const gasElement = document.querySelector("#gas");
const statusElement = document.querySelector("#status");

const config = await fetch("./deployment-config.json", { cache: "no-store" }).then((response) => {
  if (!response.ok) throw new Error("Deployment configuration could not be loaded.");
  return response.json();
});

requiredWalletElement.textContent = config.requiredDeployer;
fingerprintElement.textContent = config.creationBytecodeSha256;

function setStatus(message, kind = "") {
  statusElement.textContent = message;
  statusElement.className = kind;
}

async function requireCorrectContext() {
  if (!window.ethereum) throw new Error("MetaMask was not detected.");
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId.toLowerCase() !== config.expectedChainIdHex) {
    throw new Error(`Wrong network. Select Elysium Testnet (chain ID ${config.expectedChainId}).`);
  }
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  const account = accounts[0];
  if (!account) throw new Error("No MetaMask account is connected.");
  if (account.toLowerCase() !== config.requiredDeployer.toLowerCase()) {
    throw new Error(`Wrong wallet. Required ${config.requiredDeployer}.`);
  }
  return account;
}

async function estimate(account) {
  const estimateHex = await window.ethereum.request({
    method: "eth_estimateGas",
    params: [{ from: account, data: config.creationBytecode }],
  });
  const estimate = BigInt(estimateHex);
  const conservativeLimit = (estimate * 120n + 99n) / 100n;
  gasElement.textContent = `${estimate} estimated; ${conservativeLimit} with 20% headroom`;
  return conservativeLimit;
}

connectButton.addEventListener("click", async () => {
  deployButton.disabled = true;
  try {
    if (!window.ethereum) throw new Error("MetaMask was not detected.");
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const account = await requireCorrectContext();
    connectedWalletElement.textContent = account;
    await estimate(account);
    deployButton.disabled = false;
    setStatus("Network, wallet, and deployment estimate verified. No transaction sent.", "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
});

deployButton.addEventListener("click", async () => {
  deployButton.disabled = true;
  try {
    const account = await requireCorrectContext();
    const gas = await estimate(account);
    setStatus("Opening MetaMask confirmation. Nothing is approved automatically.", "warning");
    const transactionHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: account, data: config.creationBytecode, gas: `0x${gas.toString(16)}` }],
    });
    setStatus(`MetaMask returned transaction hash: ${transactionHash}`, "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    deployButton.disabled = false;
  }
});

window.ethereum?.on?.("accountsChanged", () => {
  connectedWalletElement.textContent = "Wallet changed — reconnect required";
  deployButton.disabled = true;
});
window.ethereum?.on?.("chainChanged", () => {
  gasElement.textContent = "Network changed — reconnect required";
  deployButton.disabled = true;
});
