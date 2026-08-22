# API Reference

The Plutus Debugger provides several VSCode commands and settings to customize your debugging experience.

## Commands

### `plutus-debugger.startDebugging`
Starts a debugging session for the currently active Plutus script.

### `plutus-debugger.stopDebugging`
Terminates the active Plutus debugging session.

### `plutus-debugger.profileGas`
Runs the current script and generates a gas profiling report showing ExUnits used.

## Configuration Options

In your `.vscode/launch.json` or `.vscode/settings.json`, you can configure the debugger:

- `plutus.debugger.endpoint`: URL to the local or remote Plutus compilation/simulation endpoint.
- `plutus.debugger.logLevel`: Logging level (`info`, `debug`, `error`).
- `plutus.debugger.network`: Cardano network to simulate (`mainnet`, `preprod`, `preview`).
