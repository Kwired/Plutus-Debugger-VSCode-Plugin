# Plutus Debugger for VSCode

![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen)

A VSCode extension for debugging Haskell/Plutus smart contracts on Cardano. It wraps GHCi as a DAP-compatible debugger and ships a simulator panel that lets you build, sign, and submit transactions against a local or testnet node without leaving the editor.

## Features

- **Haskell debugger** — breakpoints, stepping, variable inspection via GHCi under the DAP protocol
- **Plutus simulator** — pick UTxOs, derive policy IDs, estimate execution costs before deploying
- **Live diagnostics** — runs `ghcid` in the background to surface errors/warnings in real time
- **Wallet management** — generate keys, query UTxOs, build/sign/submit transactions from the sidebar
- **Gas profiler** — visualize memory and CPU step usage with a heatmap of expensive operations

## Prerequisites

- **Node.js** (for building the extension)
- **GHC + Cabal** (Haskell toolchain)
- **ghcid** (optional, for live error highlighting)
- **cardano-cli** (required for simulation and transaction features)
- A synced **Cardano node** if you want to submit transactions to testnet/mainnet

## Build from source

```bash
git clone https://github.com/Kwired/Plutus-Debugger-VSCode-Plugin.git
cd Plutus-Debugger-VSCode-Plugin
npm install
npm run compile
```

Press `F5` in VSCode to launch an Extension Development Host with the extension loaded.

## Usage

### Debugging

Open a Cabal-based Haskell project, go to **Run and Debug**, and select **"Debug Cabal Project"**. GHCi will spin up in the background — once it's ready, breakpoints should work.

### Simulator

Click the Plutus icon in the Activity Bar to open the simulator panel. From there you can:

1. Select your `.plutus` script, `protocol.json`, and `node.socket`
2. Configure the network (Preprod / Preview / Mainnet / custom)
3. Fill in Redeemer, Datum, and asset name
4. Hit **Simulate** to get execution cost estimates and a gas profiler breakdown

### Wallet & Transactions

Switch to the **Wallet** tab in the simulator panel to generate keys, pick UTxOs, and run the build → sign → submit flow.

## Tests

```bash
npm test                 # run the full suite
npm test -- --coverage   # with coverage report
```

## Contributing

PRs welcome. Fork, branch, and open a pull request.

## License

MIT
