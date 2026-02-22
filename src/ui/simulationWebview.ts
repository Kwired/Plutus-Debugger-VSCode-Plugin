import * as vscode from "vscode";
import { simulatePlutus } from "../simulator/simulator";
import { generateWallet, buildTransaction, signTransaction, submitTransaction, listWallets, getUtxos } from "../wallet/wallet";
import { execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";

/**
 * Persistent workspace storage keys
 */
const STORAGE_KEYS = {
  plutus: "plutusSimulator.plutusFile",
  protocol: "plutusSimulator.protocolFile",
  address: "plutusSimulator.address",
  redeemer: "plutusSimulator.redeemer",
  datum: "plutusSimulator.datum",
  socket: "plutusSimulator.nodeSocket",
  wallet: "plutusSimulator.wallet",
  activeTab: "plutusSimulator.activeTab",
  walletName: "plutusSimulator.walletName",
  recipient: "plutusSimulator.recipient",
  amount: "plutusSimulator.amount",
  txIn: "plutusSimulator.txIn"
};

export class PlutusSimulatorView implements vscode.WebviewViewProvider {
  public static readonly viewType = "plutusSimulator.view";

  constructor(private readonly context: vscode.ExtensionContext) { }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    const styleUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "simulator.css")
    );

    const savedState = {
      plutusFile: this.context.workspaceState.get<string>(STORAGE_KEYS.plutus),
      protocolFile: this.context.workspaceState.get<string>(STORAGE_KEYS.protocol),
      socketFile: this.context.workspaceState.get<string>(STORAGE_KEYS.socket),
      address: this.context.workspaceState.get<string>(STORAGE_KEYS.address) ?? "",
      redeemer: this.context.workspaceState.get<string>(STORAGE_KEYS.redeemer) ?? "{}",
      datum: this.context.workspaceState.get<string>(STORAGE_KEYS.datum) ?? "{}",
      wallet: this.context.workspaceState.get<any>(STORAGE_KEYS.wallet) ?? null,
      activeTab: this.context.workspaceState.get<string>(STORAGE_KEYS.activeTab) ?? "simulator",
      walletName: this.context.workspaceState.get<string>(STORAGE_KEYS.walletName) ?? "test-wallet",
      recipient: this.context.workspaceState.get<string>(STORAGE_KEYS.recipient) ?? "",
      amount: this.context.workspaceState.get<string>(STORAGE_KEYS.amount) ?? "",
      txIn: this.context.workspaceState.get<string>(STORAGE_KEYS.txIn) ?? ""
    };

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(styleUri, savedState);

    webviewView.webview.postMessage({
      type: "restoreState",
      state: savedState
    });

    let plutusFile: string | null = savedState.plutusFile ?? null;
    let protocolFile: string | null = savedState.protocolFile ?? null;
    let socketFile: string | null = savedState.socketFile ?? null;

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        /* ---------------- File Pickers ---------------- */

        if (msg.type === "pickSocket") {
          const file = await vscode.window.showOpenDialog({ canSelectMany: false });
          if (file) {
            socketFile = file[0].fsPath;
            await this.context.workspaceState.update(STORAGE_KEYS.socket, socketFile);
            webviewView.webview.postMessage({ type: "socketSelected", path: socketFile });
          }
        }

        if (msg.type === "pickPlutus") {
          const file = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { Plutus: ["plutus"] }
          });
          if (file) {
            plutusFile = file[0].fsPath;
            await this.context.workspaceState.update(STORAGE_KEYS.plutus, plutusFile);
            webviewView.webview.postMessage({ type: "plutusSelected", path: plutusFile });
          }
        }

        if (msg.type === "pickProtocol") {
          const file = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { JSON: ["json"] }
          });
          if (file) {
            protocolFile = file[0].fsPath;
            await this.context.workspaceState.update(STORAGE_KEYS.protocol, protocolFile);
            webviewView.webview.postMessage({ type: "protocolSelected", path: protocolFile });
          }
        }

        /* ---------------- Generate protocol.json ---------------- */

        if (msg.type === "generateProtocol") {
          if (!socketFile) {
            return webviewView.webview.postMessage({
              type: "protocolError",
              value: "node.socket must be selected first"
            });
          }

          if (typeof msg.magic !== "number") {
            return webviewView.webview.postMessage({
              type: "protocolError",
              value: "Invalid testnet magic"
            });
          }

          await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);

          const protocolPath = path.join(
            this.context.globalStorageUri.fsPath,
            "protocol.json"
          );

          execFile(
            "cardano-cli",
            [
              "query",
              "protocol-parameters",
              "--testnet-magic",
              String(msg.magic),
              "--out-file",
              protocolPath
            ],
            {
              env: {
                ...process.env,
                CARDANO_NODE_SOCKET_PATH: socketFile
              }
            },
            async (err, _stdout, stderr) => {
              if (err) {
                return webviewView.webview.postMessage({
                  type: "protocolError",
                  value: stderr || err.message
                });
              }

              protocolFile = protocolPath;
              await this.context.workspaceState.update(
                STORAGE_KEYS.protocol,
                protocolFile
              );

              webviewView.webview.postMessage({
                type: "protocolSelected",
                path: protocolFile
              });
            }
          );
        }

        /* ---------------- Simulate ---------------- */

        if (msg.type === "simulate") {
          if (!plutusFile || !protocolFile || !socketFile) {
            return webviewView.webview.postMessage({
              type: "simulateError",
              value: "Missing plutus, protocol, or socket file"
            });
          }

          // Save Inputs
          await this.context.workspaceState.update(STORAGE_KEYS.redeemer, msg.redeemer);
          await this.context.workspaceState.update(STORAGE_KEYS.datum, msg.datum);

          try {
            JSON.parse(msg.redeemer);
            JSON.parse(msg.datum);
          } catch {
            return webviewView.webview.postMessage({
              type: "simulateError",
              value: "Redeemer or Datum must be valid JSON"
            });
          }

          const result = await simulatePlutus({
            plutusFile,
            protocolFile,
            socketPath: socketFile,
            senderAddress: msg.address,
            redeemerJson: msg.redeemer,
            datumJson: msg.datum,
            testnetMagic: msg.magic ?? 1,
            assetName: msg.assetName
          });

          webviewView.webview.postMessage({ type: "result", value: result });
        }

        /* ---------------- Wallet ---------------- */

        if (msg.type === "generateWallet") {
          if (typeof msg.magic !== "number") {
            return webviewView.webview.postMessage({
              type: "walletError",
              value: "Invalid testnet magic"
            });
          }

          const walletName = msg.name || "test-wallet";

          if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return webviewView.webview.postMessage({
              type: "walletError",
              value: "No open folder to save keys"
            });
          }

          const projectRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
          const keysDir = path.join(projectRoot, "keys");

          if (!fs.existsSync(keysDir)) {
            fs.mkdirSync(keysDir, { recursive: true });
          }

          try {
            const keys = await generateWallet(
              walletName,
              keysDir,
              msg.magic
            );

            await this.context.workspaceState.update(STORAGE_KEYS.wallet, keys);

            // Auto-fill address
            await this.context.workspaceState.update(STORAGE_KEYS.address, keys.address);

            // Send path along with keys
            const projectRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
            webviewView.webview.postMessage({
              type: "walletGenerated",
              value: {
                ...keys,
                keysDir: path.join(projectRoot, "keys"),
                message: keys.exists ? "Key already available" : "Wallet Generated Successfully"
              }
            });
          } catch (err: any) {
            webviewView.webview.postMessage({
              type: "walletError",
              value: err.message
            });
          }
        }

        /* ---------------- Transaction Operations ---------------- */

        if (msg.type === "buildTx") {
          if (!socketFile) {
            return webviewView.webview.postMessage({ type: "txError", value: "Select node.socket first" });
          }
          try {
            // Determine keys directory
            const projectRoot = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : this.context.globalStorageUri.fsPath;
            const keysDir = path.join(projectRoot, "keys");
            if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });

            const txBodyFile = path.join(keysDir, "tx.raw");

            await buildTransaction(
              socketFile!,
              msg.magic,
              msg.txIn,
              msg.txOut,
              msg.changeAddress,
              txBodyFile
            );

            webviewView.webview.postMessage({ type: "txBuilt", value: txBodyFile });
          } catch (err: any) {
            webviewView.webview.postMessage({ type: "txError", value: "Build Failed: " + (err.message || err) });
          }
        }

        if (msg.type === "signTx") {
          try {
            const projectRoot = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : this.context.globalStorageUri.fsPath;
            const keysDir = path.join(projectRoot, "keys");
            const skeyPath = path.join(keysDir, `${msg.walletName}.skey`);
            const signedFile = path.join(keysDir, "tx.signed");

            if (!fs.existsSync(skeyPath)) throw new Error(`Signing key not found for ${msg.walletName}`);

            await signTransaction(
              msg.txFile,
              skeyPath,
              signedFile,
              msg.magic
            );

            webviewView.webview.postMessage({ type: "txSigned", value: signedFile });
          } catch (err: any) {
            webviewView.webview.postMessage({ type: "txError", value: "Sign Failed: " + (err.message || err) });
          }
        }

        if (msg.type === "submitTx") {
          if (!socketFile) {
            return webviewView.webview.postMessage({ type: "txError", value: "Select node.socket first" });
          }
          try {
            await submitTransaction(
              msg.txFile,
              socketFile!,
              msg.magic
            );
            webviewView.webview.postMessage({ type: "txSubmitted", value: "Transaction Submitted Successfully!" });
          } catch (err: any) {
            webviewView.webview.postMessage({ type: "txError", value: "Submit Failed: " + (err.message || err) }); // Show full error
          }
        }

        if (msg.type === "simulate") {
          if (!msg.assetName || typeof msg.assetName !== "string") {
            return webviewView.webview.postMessage({
              type: "simulateError",
              value: "Asset name is required"
            });
          }

          if (!plutusFile || !protocolFile || !socketFile) {
            return webviewView.webview.postMessage({
              type: "simulateError",
              value: "Plutus file, protocol.json and node.socket are required"
            });
          }

          await this.context.workspaceState.update(STORAGE_KEYS.address, msg.address);
          await this.context.workspaceState.update(STORAGE_KEYS.redeemer, msg.redeemer);
          await this.context.workspaceState.update(STORAGE_KEYS.datum, msg.datum);

          try {
            JSON.parse(msg.redeemer);
            JSON.parse(msg.datum);
          } catch {
            return webviewView.webview.postMessage({
              type: "simulateError",
              value: "Redeemer or Datum must be valid JSON"
            });
          }

          const result = await simulatePlutus({
            plutusFile,
            protocolFile,
            socketPath: socketFile,
            senderAddress: msg.address,
            redeemerJson: msg.redeemer,
            datumJson: msg.datum,
            testnetMagic: msg.magic ?? 1,
            assetName: msg.assetName
          });

          webviewView.webview.postMessage({ type: "result", value: result });
        }

        /* ---------------- Clear ---------------- */

        if (msg.type === "clearState") {
          plutusFile = null;
          protocolFile = null;
          socketFile = null;

          await this.context.workspaceState.update(STORAGE_KEYS.plutus, undefined);
          await this.context.workspaceState.update(STORAGE_KEYS.protocol, undefined);
          await this.context.workspaceState.update(STORAGE_KEYS.socket, undefined);
          await this.context.workspaceState.update(STORAGE_KEYS.address, "");
          await this.context.workspaceState.update(STORAGE_KEYS.redeemer, "{}");
          await this.context.workspaceState.update(STORAGE_KEYS.address, "");
          await this.context.workspaceState.update(STORAGE_KEYS.redeemer, "{}");
          await this.context.workspaceState.update(STORAGE_KEYS.datum, "{}");
          await this.context.workspaceState.update(STORAGE_KEYS.wallet, undefined);

          webviewView.webview.postMessage({ type: "cleared" });
        }

        /* ---------------- State Persistence ---------------- */
        if (msg.type === "saveTab") {
          await this.context.workspaceState.update(STORAGE_KEYS.activeTab, msg.value);
        }
        if (msg.type === "saveWalletName") {
          await this.context.workspaceState.update(STORAGE_KEYS.walletName, msg.value);
        }
        if (msg.type === "saveRecipient") {
          await this.context.workspaceState.update(STORAGE_KEYS.recipient, msg.value);
        }
        if (msg.type === "saveAmount") {
          await this.context.workspaceState.update(STORAGE_KEYS.amount, msg.value);
        }
        if (msg.type === "saveTxIn") {
          await this.context.workspaceState.update(STORAGE_KEYS.txIn, msg.value);
        }
        if (msg.type === "clearWalletState") {
          await this.context.workspaceState.update(STORAGE_KEYS.walletName, "test-wallet");
          await this.context.workspaceState.update(STORAGE_KEYS.recipient, "");
          await this.context.workspaceState.update(STORAGE_KEYS.amount, "");
          await this.context.workspaceState.update(STORAGE_KEYS.txIn, "");
          webviewView.webview.postMessage({ type: "walletCleared" });
        }

        /* ---------------- New Wallet Features ---------------- */
        if (msg.type === "refreshWallets") {
          const projectRoot = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : this.context.globalStorageUri.fsPath;
          const keysDir = path.join(projectRoot, "keys");
          const wallets = listWallets(keysDir);
          webviewView.webview.postMessage({ type: "walletsListed", value: wallets });
        }

        if (msg.type === "getUtxos") {
          if (!socketFile) {
            return webviewView.webview.postMessage({ type: "walletError", value: "Select node.socket first" });
          }
          try {
            const utxos = await getUtxos(msg.address, socketFile, msg.magic);
            webviewView.webview.postMessage({ type: "utxosFetched", value: utxos });
          } catch (err: any) {
            webviewView.webview.postMessage({ type: "walletError", value: "Failed to fetch UTxOs: " + err.message });
          }
        }

      } catch (err: any) {
        webviewView.webview.postMessage({
          type: "simulateError",
          value: err?.message ?? String(err)
        });
      }
    });
  }

  /* ======================= WEBVIEW HTML ======================= */

  private getHtml(styleUri: vscode.Uri, state: any): string {
    const activeTab = state.activeTab;
    const walletName = state.walletName;

    const simClass = activeTab === 'simulator' ? 'active' : '';
    const walClass = activeTab === 'wallet' ? 'active' : '';
    const simContentClass = activeTab === 'simulator' ? 'active' : '';
    const walContentClass = activeTab === 'wallet' ? 'active' : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="${styleUri}">
  <style>
    .tabs { display: flex; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 10px; }
    .tab { padding: 8px 16px; cursor: pointer; opacity: 0.7; border-bottom: 2px solid transparent; }
    .tab:hover { opacity: 1; }
    .tab.active { opacity: 1; border-bottom-color: var(--vscode-panelTitle-activeBorder); font-weight: bold; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
  </style>
</head>
<body>

<div class="tabs">
  <div class="tab ${simClass}" onclick="switchTab('simulator')">Simulator</div>
  <div class="tab ${walClass}" onclick="switchTab('wallet')">Wallet</div>
</div>

<div id="tab-simulator" class="tab-content ${simContentClass}">

<div class="section">
  <div class="section-title">Scripts</div>

  <button id="pickSocket">Select node.socket</button>
  <div id="socketPath" class="file-path"></div>

  <button id="pickPlutus">Select .plutus</button>
  <div id="plutusPath" class="file-path"></div>

  <div class="sub-section">
    <div class="section-title">Network</div>

    <div class="network-row">
      <select id="network">
        <option value="preprod">Preprod (magic 1)</option>
        <option value="preview">Preview (magic 2)</option>
        <option value="custom">Custom</option>
      </select>
      <input id="customMagic" placeholder="magic" style="display:none"/>
    </div>

    <button id="generateProtocol" class="primary">Generate protocol.json</button>
    <div id="protocolStatus" class="status" style="display:none"></div>
  </div>

  <button id="pickProtocol">Select protocol.json</button>
  <div id="protocolPath" class="file-path"></div>
</div>

<div class="section">
  <div class="section-title">Context</div>
  <label>Sender Address</label>
  <input id="address" placeholder="addr_test1..." />
</div>
<label style="margin-top:6px">Asset Name (NFT)</label>
  <input
    id="assetName"
    placeholder="MyNFT"
    title="Human-readable asset name (will be hex-encoded)"
  />
<div class="section">
  <div class="section-title">Redeemer</div>
  <textarea id="redeemer">{}</textarea>
</div>

<div class="section">
  <div class="section-title">Datum</div>
  <textarea id="datum">{}</textarea>
</div>

<div class="actions">
  <button id="simulate" disabled>Simulate</button>
  <button id="clear" class="secondary">Clear</button>
</div>

<div class="section">
  <div class="section-title">Output</div>
  <pre id="out" class="output"></pre>
</div>

<div id="gasProfiler" class="gas-profiler" style="display:none">
  <div class="section-title">Gas Profiler</div>
  
  <div class="gas-item">
      <div class="gas-label">
          <span>Memory</span>
          <span id="memVal">0 / 14M</span>
      </div>
      <div class="progress-track">
          <div id="memFill" class="progress-fill low"></div>
      </div>
  </div>

  <div class="gas-item">
      <div class="gas-label">
          <span>CPU Steps</span>
          <span id="cpuVal">0 / 10B</span>
      </div>
      <div class="progress-track">
          <div id="cpuFill" class="progress-fill low"></div>
      </div>
  </div>
</div>
</div>

<div id="tab-wallet" class="tab-content ${walContentClass}">
<div class="section">
  <div class="wallet-row" style="display:flex; gap:10px; margin-bottom:10px">
      <select id="walletSelect" style="flex:1">
          <option value="">-- Select Wallet --</option>
      </select>
      <button id="refreshWallets" class="secondary" title="Refresh">↻</button>
  </div>
  
  <div class="wallet-row" style="display:flex; gap:10px; margin-bottom:10px">
      <input id="walletName" placeholder="Wallet Name" value="${walletName}" oninput="saveWalletName(this.value)" />
      <button id="generateWallet" class="secondary">Generate/Load Wallet</button>
  </div>
  <div id="walletInfo" style="display:none; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 4px;">
      <div id="walletSuccessMsg" class="status success" style="margin-bottom:5px"></div>
      <div style="font-size:0.9em; opacity:0.8">Address:</div>
      <div id="walletAddress" style="word-break:break-all; font-family:monospace; margin-bottom:5px"></div>
      <div style="font-size:0.8em; opacity:0.6">Keys saved to: <span id="keysPath"></span></div>
  </div>
  <div id="walletError" class="status error" style="display:none"></div>
  
  <div style="margin-top: 20px; border-top: 1px solid var(--vscode-panel-border); padding-top: 10px;">
    <div class="section-title">Transaction</div>

    <label>TxIn (Select UTxO)</label>
    <div style="display:flex; gap:5px; margin-bottom:5px">
        <select id="txInSelect" style="flex:1">
            <option value="">-- Select UTxO --</option>
        </select>
        <button id="refreshUtxos" class="secondary" title="Refresh UTxOs">↻</button>
    </div>
    
    <label>Manual TxIn</label>
    <input id="txIn" placeholder="e.g. 33f...#0" />

    <label>Recipient Address</label>
    <input id="recipientAddress" placeholder="e.g. addr_test..." />

    <label style="margin-top:5px">Amount (Lovelace)</label>
    <div style="position:relative">
        <input id="amount" placeholder="e.g. 5000000" />
        <div id="adaValue" style="font-size:11px; color:var(--muted); margin-top:2px; text-align:right">0 ADA</div>
    </div>
    
    <div class="actions" style="flex-direction: column; gap: 8px;">
        <button id="buildTx">Build Transaction</button>
        <div id="buildStatus" class="status" style="display:none"></div>
        
        <button id="signTx" disabled>Sign Transaction</button>
        <div id="signStatus" class="status" style="display:none"></div>
        
        <button id="submitTx" disabled>Submit Transaction</button>
        <div id="submitStatus" class="status" style="display:none"></div>
        
        <button id="clearWallet" class="secondary" style="margin-top:10px">Clear All</button>
    </div>
  </div>
</div>
</div>

<script>
const vscode = acquireVsCodeApi();

const socketPath = document.getElementById("socketPath");
const plutusPath = document.getElementById("plutusPath");
const protocolPath = document.getElementById("protocolPath");
const addressInput = document.getElementById("address");
const redeemerInput = document.getElementById("redeemer");
const datumInput = document.getElementById("datum");
const simulateBtn = document.getElementById("simulate");
const out = document.getElementById("out");
const networkSelect = document.getElementById("network");
const customMagic = document.getElementById("customMagic");
const protocolStatus = document.getElementById("protocolStatus");
const assetNameInput = document.getElementById("assetName");
const walletNameInput = document.getElementById("walletName");
const walletInfo = document.getElementById("walletInfo");
const walletAddress = document.getElementById("walletAddress");
const keysPath = document.getElementById("keysPath");
const walletSuccessMsg = document.getElementById("walletSuccessMsg");
const walletError = document.getElementById("walletError");

const txInInput = document.getElementById("txIn");

const buildTxBtn = document.getElementById("buildTx");
const signTxBtn = document.getElementById("signTx");
const submitTxBtn = document.getElementById("submitTx");
const buildStatus = document.getElementById("buildStatus");
const signStatus = document.getElementById("signStatus");
const submitStatus = document.getElementById("submitStatus");

const gasProfiler = document.getElementById("gasProfiler");
const memVal = document.getElementById("memVal");
const memFill = document.getElementById("memFill");
const cpuVal = document.getElementById("cpuVal");
const cpuFill = document.getElementById("cpuFill");

const MEM_LIMIT = 14000000;
const CPU_LIMIT = 10000000000;

let currentTxRaw = "";
let currentTxSigned = "";

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  // Find valid tab element
  const tabs = document.querySelectorAll('.tab');
  const index = tabName === 'simulator' ? 0 : 1;
  tabs[index].classList.add('active');

  document.getElementById('tab-' + tabName).classList.add('active');
  vscode.postMessage({ type: 'saveTab', value: tabName });
}

function saveWalletName(name) {
    vscode.postMessage({ type: 'saveWalletName', value: name });
}

let hasSocket = false;
let hasPlutus = false;
let hasProtocol = false;

networkSelect.onchange = () => {
  customMagic.style.display =
    networkSelect.value === "custom" ? "block" : "none";
};

document.getElementById("generateProtocol").onclick = () => {
  let magic =
    networkSelect.value === "preprod" ? 1 :
      networkSelect.value === "preview" ? 2 :
        Number(customMagic.value);

  if (!magic || isNaN(magic)) {
    protocolStatus.style.display = "block";
    protocolStatus.className = "status error";
    protocolStatus.textContent = "Invalid testnet magic";
    return;
  }

  protocolStatus.style.display = "block";
  protocolStatus.className = "status";
  protocolStatus.textContent = "Generating protocol.json...";

  vscode.postMessage({ type: "generateProtocol", magic });
};

const walletSelect = document.getElementById("walletSelect");
const refreshWalletsBtn = document.getElementById("refreshWallets");
const txInSelect = document.getElementById("txInSelect");
const refreshUtxosBtn = document.getElementById("refreshUtxos");
const clearWalletBtn = document.getElementById("clearWallet");

refreshWalletsBtn.onclick = () => {
    vscode.postMessage({ type: "refreshWallets" });
};

walletSelect.onchange = () => {
    if (walletSelect.value) {
        walletNameInput.value = walletSelect.value;
        saveWalletName(walletSelect.value);
        // Trigger load
        document.getElementById("generateWallet").click();
    }
};

refreshUtxosBtn.onclick = () => {
    const magic = getMagic();
    if (!magic || !walletAddress.textContent) return;
    
    vscode.postMessage({
        type: "getUtxos",
        address: walletAddress.textContent,
        magic
    });
};

txInSelect.onchange = () => {
    if (txInSelect.value) {
        txInInput.value = txInSelect.value;
        vscode.postMessage({ type: 'saveTxIn', value: txInInput.value });
    }
};

const recipientAddressInput = document.getElementById("recipientAddress");
const amountInput = document.getElementById("amount");
const adaValue = document.getElementById("adaValue");

txInInput.oninput = () => {
    vscode.postMessage({ type: 'saveTxIn', value: txInInput.value });
};

recipientAddressInput.oninput = () => {
    vscode.postMessage({ type: 'saveRecipient', value: recipientAddressInput.value });
};

amountInput.oninput = () => {
    const val = amountInput.value;
    vscode.postMessage({ type: 'saveAmount', value: val });

    const lovelace = parseInt(val.replace(/[^0-9]/g, '')) || 0;
    const ada = lovelace / 1000000;
    adaValue.textContent = ada.toLocaleString(undefined, { maximumFractionDigits: 6 }) + " ADA";
};

clearWalletBtn.onclick = () => {
    vscode.postMessage({ type: "clearWalletState" });
};

document.getElementById("generateWallet").onclick = () => {
    let magic =
    networkSelect.value === "preprod" ? 1 :
      networkSelect.value === "preview" ? 2 :
        Number(customMagic.value);

    if (!magic || isNaN(magic)) {
         walletError.style.display = "block";
         walletError.textContent = "Select a network first";
         return;
    }
    
    walletError.style.display = "none";
    vscode.postMessage({ 
        type: "generateWallet", 
        name: walletNameInput.value,
        magic
    });
};

document.getElementById("buildTx").onclick = () => {
    const magic = getMagic();
    if (!magic) return;
    
    if (!txInInput.value || !recipientAddressInput.value || !amountInput.value) {
        walletError.textContent = "TxIn, Recipient Address, and Amount are required";
        walletError.style.display = "block";
        return;
    }
    walletError.style.display = "none";
    buildStatus.style.display = "block";
    buildStatus.textContent = "Building...";
    
    // Combine address and amount for cardano-cli
    const txOut = recipientAddressInput.value.trim() + "+" + amountInput.value.trim();

    vscode.postMessage({
        type: "buildTx",
        magic,
        txIn: txInInput.value,
        txOut: txOut,
        changeAddress: walletAddress.textContent, // Send change back to wallet
        walletName: walletNameInput.value
    });
};

document.getElementById("signTx").onclick = () => {
    const magic = getMagic();
    if (!magic) return;
    
    signStatus.style.display = "block";
    signStatus.textContent = "Signing...";
    
    vscode.postMessage({
        type: "signTx",
        magic,
        txFile: currentTxRaw,
        walletName: walletNameInput.value
    });
};

document.getElementById("submitTx").onclick = () => {
    const magic = getMagic();
    if (!magic) return;
    
    submitStatus.style.display = "block";
    submitStatus.textContent = "Submitting...";

    vscode.postMessage({
        type: "submitTx",
        magic,
        txFile: currentTxSigned
    });
};

function getMagic() {
    let magic =
    networkSelect.value === "preprod" ? 1 :
      networkSelect.value === "preview" ? 2 :
        Number(customMagic.value);

    if (!magic || isNaN(magic)) {
         walletError.style.display = "block";
         walletError.textContent = "Select a network first";
         return null;
    }
    return magic;
}

document.getElementById("pickSocket").onclick =
  () => vscode.postMessage({ type: "pickSocket" });
document.getElementById("pickPlutus").onclick =
  () => vscode.postMessage({ type: "pickPlutus" });
document.getElementById("pickProtocol").onclick =
  () => vscode.postMessage({ type: "pickProtocol" });

document.getElementById("simulate").onclick = () => {
  protocolStatus.style.display = "none";
  if (!assetNameInput.value.trim()) {
    out.textContent = "Asset name is required";
    out.className = "output error";
    return;
  }
  vscode.postMessage({
    type: "simulate",
    address: addressInput.value,
    redeemer: redeemerInput.value,
    datum: datumInput.value,
    assetName: assetNameInput.value
  });
};

function updateSimulateBtn() {
    simulateBtn.disabled = !(hasSocket && hasPlutus && hasProtocol);
}

document.getElementById("clear").onclick = () => {
  addressInput.value = "";
  redeemerInput.value = "{}";
  datumInput.value = "{}";
  vscode.postMessage({ type: "clearState" });
  walletInfo.style.display = "none";
  walletError.style.display = "none";
};

/* ---------------- Message Handler ---------------- */

window.addEventListener("message", e => {
  const m = e.data;

  if (m.type === "restoreState") {
    if (m.state.plutusFile) {
      plutusPath.textContent = m.state.plutusFile;
      hasPlutus = true;
    }
    if (m.state.protocolFile) {
      protocolPath.textContent = m.state.protocolFile;
      hasProtocol = true;
    }
    if (m.state.socketFile) {
      socketPath.textContent = m.state.socketFile;
      hasSocket = true;
    }
    if (m.state.address) addressInput.value = m.state.address;
    if (m.state.redeemer) redeemerInput.value = m.state.redeemer;
    if (m.state.datum) datumInput.value = m.state.datum;

    // Wallet State
    // We don't have the wallet list yet, so we request it
    vscode.postMessage({ type: "refreshWallets" });
    
    if (m.state.recipient) recipientAddressInput.value = m.state.recipient;
    if (m.state.amount) {
        amountInput.value = m.state.amount;
        // trigger ada calculation
        amountInput.dispatchEvent(new Event('input'));
    }
    if (m.state.txIn) txInInput.value = m.state.txIn;

    updateSimulateBtn();
  }
  
  if (m.type === "socketSelected") {
    socketPath.textContent = m.path;
    hasSocket = true;
    updateSimulateBtn();
  }

  if (m.type === "plutusSelected") {
    plutusPath.textContent = m.path;
    hasPlutus = true;
    updateSimulateBtn();
  }

  if (m.type === "protocolSelected") {
    protocolPath.textContent = m.path;
    hasProtocol = true;
    updateSimulateBtn();
  }

  if (m.type === "protocolError") {
    protocolStatus.style.display = "block";
    protocolStatus.className = "status error";
    protocolStatus.textContent = m.value;
  }

  if (m.type === "walletsListed") {
      walletSelect.innerHTML = '<option value="">-- Select Wallet --</option>';
      m.value.forEach(w => {
          const opt = document.createElement('option');
          opt.value = w;
          opt.textContent = w;
          walletSelect.appendChild(opt);
      });
      // Restore selection if match
      if (m.value.includes(walletNameInput.value)) {
          walletSelect.value = walletNameInput.value;
          // If we had a wallet selected/loaded, trigger generation/load to ensure UI is consistent
          // But only if we aren't clearing
          if (walletNameInput.value && walletNameInput.value !== 'test-wallet') {
               // Silently load wallet details on restore
               // We add a short timeout to ensure the DOM is ready and a magic number can be selected
               setTimeout(() => {
                   const magic = getMagic();
                   if (magic) {
                       vscode.postMessage({ 
                           type: "generateWallet", 
                           name: walletNameInput.value,
                           magic,
                           silent: true
                       });
                   }
               }, 100);
          }
      }
  }

  if (m.type === "utxosFetched") {
      txInSelect.innerHTML = '<option value="">-- Select UTxO --</option>';
      // Expecting object: { "txHash#Index": { value: ... } }
      const utxos = m.value;
      let largestUtxo = null;
      let largestAmt = 0;

      for (const [txIn, details] of Object.entries(utxos)) {
          const lovelace = details.value?.lovelace || 0;
          const ada = lovelace / 1000000;
          const opt = document.createElement('option');
          opt.value = txIn;
          opt.textContent = txIn.slice(0, 15) + '... (' + ada.toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' ADA)';
          txInSelect.appendChild(opt);

          if (lovelace > largestAmt) {
              largestAmt = lovelace;
              largestUtxo = txIn;
          }
      }

      // Auto-select largest ONLY if we don't have a saved TxIn, OR if the saved one is in the list
      // For now, if user has invalid TxIn, new fetch might overwrite it. 
      // Let's only auto-select if input is empty
      if (!txInInput.value && largestUtxo) {
          txInSelect.value = largestUtxo;
          txInInput.value = largestUtxo;
          vscode.postMessage({ type: 'saveTxIn', value: txInInput.value });
      } else if (txInInput.value) {
          txInSelect.value = txInInput.value;
      }
  }

  if (m.type === "walletGenerated") {
      walletInfo.style.display = "block";
      walletAddress.textContent = m.value.address;
      if (m.value.keysDir) {
           keysPath.textContent = m.value.keysDir;
      }
      
      // Auto-fetch UTxOs when wallet is loaded
      vscode.postMessage({
        type: "getUtxos",
        address: m.value.address,
        magic: getMagic()
      });

      if (m.value.message && !m.value.silent) {
          walletSuccessMsg.textContent = m.value.message;
          walletSuccessMsg.style.display = 'block';
      } else {
          walletSuccessMsg.style.display = 'none';
      }
      // addressInput.value = m.value.address; // Don't overwrite simulation context address automatically? User might want to send TO someone else.
      // But initially we did... let's keep it for now as it aids workflow.
      addressInput.value = m.value.address; 
      
      walletError.style.display = "none";
  }

  if (m.type === "walletError") {
      walletError.style.display = "block";
      walletError.textContent = m.value;
  }
  
  if (m.type === "walletCleared") {
       walletNameInput.value = "test-wallet";
       walletSelect.value = "";
       txInInput.value = "";
       txInSelect.innerHTML = '<option value="">-- Select UTxO --</option>';
       recipientAddressInput.value = "";
       amountInput.value = "";
       adaValue.textContent = "0 ADA";
       
       walletInfo.style.display = "none";
       walletError.style.display = "none";
       buildStatus.style.display = "none";
       signStatus.style.display = "none";
       submitStatus.style.display = "none";
  }

  if (m.type === "simulateError") {
    out.textContent = m.value;
    out.className = "output error";
  }

  if (m.type === "result") {
    out.textContent = m.value;
    out.className = "output success";

    // Try Parse Gas
    try {
        const res = JSON.parse(m.value);
        // Handle array format (multiple redeemers) or single object
        const units = Array.isArray(res.result)
            ? res.result.reduce((acc, r) => ({
                memory: acc.memory + (r.executionUnits?.memory || 0),
                steps: acc.steps + (r.executionUnits?.steps || 0)
              }), { memory: 0, steps: 0 })
            : res.result.executionUnits || { memory: 0, steps: 0 };

        const memPct = Math.min((units.memory / MEM_LIMIT) * 100, 100);
        const cpuPct = Math.min((units.steps / CPU_LIMIT) * 100, 100);

        gasProfiler.style.display = "block";

        memVal.textContent = units.memory.toLocaleString() + " / 14M";
        memFill.style.width = memPct + "%";
        memFill.className = "progress-fill " + (memPct > 90 ? 'high' : memPct > 50 ? 'medium' : 'low');

        cpuVal.textContent = units.steps.toLocaleString() + " / 10B";
        cpuFill.style.width = cpuPct + "%";
        cpuFill.className = "progress-fill " + (cpuPct > 90 ? 'high' : cpuPct > 50 ? 'medium' : 'low');

    } catch(e) {
        console.error("Failed to parse gas", e);
    }
  }

  if (m.type === "cleared") {
    hasSocket = hasPlutus = hasProtocol = false;
    socketPath.textContent = plutusPath.textContent = protocolPath.textContent = "";
    protocolStatus.style.display = "none";
    // walletInfo.style.display = "none"; // Separate clear now
    // walletError.style.display = "none";
    out.textContent = "";
    out.className = "output";
    gasProfiler.style.display = "none";
  }

  if (m.type === "txBuilt") {
    currentTxRaw = m.value;
    buildStatus.className = "status success";
    buildStatus.textContent = "Built: " + m.value;
    signTxBtn.disabled = false;
  }

  if (m.type === "txSigned") {
    currentTxSigned = m.value;
    signStatus.className = "status success";
    signStatus.textContent = "Signed: " + m.value;
    submitTxBtn.disabled = false;
  }

  if (m.type === "txSubmitted") {
    submitStatus.className = "status success";
    submitStatus.textContent = m.value;
  }

  if (m.type === "txError") {
    walletError.style.display = "block";
    walletError.textContent = m.value;

    // Reset status if they failed
    if (buildStatus.textContent === "Building...") buildStatus.style.display = "none";
    if (signStatus.textContent === "Signing...") signStatus.style.display = "none";
    if (submitStatus.textContent === "Submitting...") submitStatus.style.display = "none";
  }

  simulateBtn.disabled = !(hasSocket && hasPlutus && hasProtocol);
});
</script>

  </body>
  </html>`;
  }
}
