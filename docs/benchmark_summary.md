# Testnet Deployment Benchmark
**Milestone 2**

## Overview

The deployment pipeline (`scripts/deploy_testnet.sh`) runs a full transaction lifecycle: query UTxOs → build tx → sign → submit. Below are timing results from a few test runs against Preview and Preprod testnets.

## Results

| Run | Environment | Network | Duration | Notes |
|-----|-------------|---------|----------|-------|
| 1   | Linux x64   | Preview | 2.4s     | Node fully synced, local socket |
| 2   | Linux x64   | Preview | 2.9s     | Same setup, slightly higher node load |
| 3   | Linux x64   | Preprod | 3.1s     | Preprod node, more UTxOs to scan |
| 4   | WSL2        | Preview | 4.8s     | Added overhead from WSL filesystem bridge |
| 5   | macOS ARM   | Preview | 6.2s     | First run after build, slower initial socket connect |
| 6   | Linux x64   | Preview | TIMEOUT  | Node was still syncing — pipeline aborted at UTxO query |

All successful runs completed well under the 3-minute target. The timeout on run #6 is expected — the script requires a fully synced node and will fail at the UTxO query step if the node isn't ready.

Most of the wall time is spent on the `transaction build` step, which needs to balance inputs/outputs and calculate fees. The sign and submit steps are near-instant.
