# Gas Profiler & Heatmap
**Plutus Debugger v0.2.1**

## What it does

After running a simulation, the profiler shows how much of the Cardano execution budget your validator consumes. The data comes from `cardano-cli conway transaction calculate-plutus-script-cost` evaluated against a live node.

### Gauges

Two progress bars show aggregate usage as a percentage of the protocol limits:
- **Memory**: out of the 14M unit budget
- **CPU Steps**: out of the 10B step budget

### Operation Heatmap

Below the gauges, the top 3 most expensive operations are listed with estimated cost breakdowns. These costs are derived from the Plutus cost model weights for common validator primitives (signature checks, datum lookups, serialization, etc.).

Color coding:
- 🔴 **Red** (>30% combined budget) — typically `verifyEd25519Signature` or heavy datum traversals
- 🟠 **Orange** (20–30%) — `findDatum`, `serialisePlutusData`, or repeated map lookups
- 🟢 **Green** (<20%) — equality checks, simple arithmetic, UTF-8 decoding

## Limitations

The operation-level breakdown is an estimate based on the cost model weights, not a trace-level profile. Cardano doesn't expose per-operation profiling in `cardano-cli`, so the numbers represent what the cost model *predicts* given the execution unit totals. The aggregate memory/CPU numbers are accurate.

## Optimization tips

- If signature verification dominates, consider whether you can batch checks or use a cheaper scheme
- High `findDatum` cost usually means too many inline datums or unoptimized UTxO selection
- High `serialisePlutusData` often means your datum/redeemer structures are larger than necessary
