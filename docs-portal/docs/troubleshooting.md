# Troubleshooting

If you encounter issues while using the Plutus Debugger, please refer to these common solutions.

## Debugger Fails to Attach
**Symptom**: The debugging session starts but immediately closes.
**Solution**:
1. Check that you have compiled your Plutus script with debug flags enabled.
2. Ensure no other service is binding to the debugger port (default 4711).
3. Check the output logs via `View -> Output -> Plutus Debugger`.

## Inaccurate Gas Estimates
**Symptom**: The profiler reports 0 ExUnits or significantly lower than expected.
**Solution**: This usually happens if you are evaluating an empty script or a mock transaction without context. Ensure your mock data (`sample_cost.json` etc.) contains realistic datum and redeemer values.

## Plutus V3 Unsupported Errors
**Symptom**: You see an error about `PlutusV3` unsupported features.
**Solution**: Upgrade the extension to the latest version. Plutus V3 support was stabilized in `0.2.x`.
