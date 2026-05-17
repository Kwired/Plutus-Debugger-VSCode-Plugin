# Change Log

## [0.2.1]
- Added survey prompt on first install
- Explorer link on successful transaction submit (CardanoScan)
- Mainnet network option in simulator
- Gas profiler heatmap with per-operation cost estimate
- Wallet dropdown and UTxO selector in transaction panel
- Automated testnet deployment script (`scripts/deploy_testnet.sh`)
- Bug fix: tx hash extraction now handles JSON-wrapped output

## [0.2.0] - Initial Release
- Haskell debugger with GHCi-based breakpoints, stepping, and variable inspection
- Plutus simulator webview for building and evaluating transactions
- Live diagnostics via `ghcid` integration
- Wallet generation and transaction build/sign/submit workflow