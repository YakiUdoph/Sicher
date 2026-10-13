const elements = {
  connect: document.querySelector("#connect"),
  deploy: document.querySelector("#deploy"),
  requiredWallet: document.querySelector("#required-wallet"),
  connectedWallet: document.querySelector("#connected-wallet"),
  supply: document.querySelector("#supply"),
  constructor: document.querySelector("#constructor"),
  fingerprint: document.querySelector("#fingerprint"),
  gas: document.querySelector("#gas"),
  status: document.querySelector("#status"),
};
const config = await fetch("./token-deployment-config.json", { cache: "no-store" }).then(
  (response) => {
    if (!response.ok) throw new Error("Token deployment configuration could not be loaded.");
    return response.json();
  },
);

elements.requiredWallet.textContent = config.requiredDeployer;
elements.supply.textContent = `${config.initialSupplyTokens} ${config.tokenSymbol} (${config.decimals} decimals)`;
elements.constructor.textContent = config.constructorBehavior;
elements.fingerprint.textContent = config.creationBytecodeSha256;

function status(message, kind = "") {
  elements.status.textContent = message;
  elements.status.className = kind;
}

async function correctContext() {
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
  const gasLimit = (estimate * 120n + 99n) / 100n;
  elements.gas.textContent = `${estimate} estimated; ${gasLimit} with 20% headroom`;
  return gasLimit;
}

elements.connect.addEventListener("click", async () => {
  elements.deploy.disabled = true;
  try {
    if (!window.ethereum) throw new Error("MetaMask was not detected.");
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const account = await correctContext();
    elements.connectedWallet.textContent = account;
    await estimate(account);
    elements.deploy.disabled = false;
    status("Network, wallet, and token deployment estimate verified. No transaction sent.", "ok");
  } catch (error) {
    status(error instanceof Error ? error.message : String(error), "error");
  }
});

elements.deploy.addEventListener("click", async () => {
  elements.deploy.disabled = true;
  try {
    const account = await correctContext();
    const gas = await estimate(account);
    status("Opening MetaMask confirmation. Nothing is approved automatically.", "warning");
    const hash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: account, data: config.creationBytecode, gas: `0x${gas.toString(16)}` }],
    });
    status(`MetaMask returned deployment transaction hash: ${hash}`, "ok");
  } catch (error) {
    status(error instanceof Error ? error.message : String(error), "error");
  } finally {
    elements.deploy.disabled = false;
  }
});

window.ethereum?.on?.("accountsChanged", () => {
  elements.connectedWallet.textContent = "Wallet changed — reconnect required";
  elements.deploy.disabled = true;
});
window.ethereum?.on?.("chainChanged", () => {
  elements.gas.textContent = "Network changed — reconnect required";
  elements.deploy.disabled = true;
});
