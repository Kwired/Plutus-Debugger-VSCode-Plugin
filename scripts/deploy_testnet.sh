#!/usr/bin/env bash
# Automated Testnet Deployment Pipeline (Milestone 2)
# This script benchmarks the full transaction workflow.
# Requirements: cardano-cli, jq, testnet fully synced.

set -e

# Configuration
MAGIC=${MAGIC:-2} # 1 = Preprod, 2 = Preview
WALLET_DIR="../keys"
WALLET_NAME=${1:-"test-wallet"}
SKEY_FILE="${WALLET_DIR}/${WALLET_NAME}.skey"
ADDRESS_FILE="${WALLET_DIR}/${WALLET_NAME}.addr"
RECEIVER="addr_test1qqy0t3308tdksvyl87u8gttzct7kks96ztdy93n64cvf5802y0edl5dxyvxt636fmd3qyshtg6p5ms665h7v789t9cysn8unau"
AMOUNT="2000000" # 2 ADA minimum

if [ -z "$CARDANO_NODE_SOCKET_PATH" ]; then
  echo "Error: CARDANO_NODE_SOCKET_PATH is not set."
  exit 1
fi

if [ ! -f "$SKEY_FILE" ] || [ ! -f "$ADDRESS_FILE" ]; then
  echo "Wallet $WALLET_NAME not found in $WALLET_DIR"
  exit 1
fi

ADDRESS=$(cat "$ADDRESS_FILE")

echo "================================================="
echo "Pipeline Start: Deploying from $ADDRESS"
echo "================================================="

START_TIME=$(date +%s)

# 1. Query UTXO
echo "[1/4] Querying UTxOs..."
cardano-cli conway query utxo --address "$ADDRESS" --testnet-magic "$MAGIC" --out-file utxos.json

# Extract largest UTxO using jq
TXIN=$(jq -r 'to_entries | max_by(.value.value.lovelace) | .key' utxos.json)

if [ "$TXIN" == "null" ] || [ -z "$TXIN" ]; then
  echo "Error: No UTxOs found for $ADDRESS"
  exit 1
fi

echo "Selected TXIN: $TXIN"

# 2. Build Transaction
echo "[2/4] Building Transaction..."
cardano-cli conway transaction build \
  --tx-in "$TXIN" \
  --tx-out "${RECEIVER}+${AMOUNT}" \
  --change-address "$ADDRESS" \
  --testnet-magic "$MAGIC" \
  --out-file tx.raw

# 3. Sign Transaction
echo "[3/4] Signing Transaction..."
cardano-cli conway transaction sign \
  --tx-body-file tx.raw \
  --signing-key-file "$SKEY_FILE" \
  --testnet-magic "$MAGIC" \
  --out-file tx.signed

# 4. Submit Transaction
echo "[4/4] Submitting Transaction..."
cardano-cli conway transaction submit \
  --tx-file tx.signed \
  --testnet-magic "$MAGIC"

# Get TXID
TXHASH=$(cardano-cli conway transaction txid --tx-file tx.signed)
NETWORK_PREFIX=""
if [ "$MAGIC" == "1" ]; then
    NETWORK_PREFIX="preprod."
elif [ "$MAGIC" == "2" ]; then
    NETWORK_PREFIX="preview."
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "================================================="
echo "Pipeline Completed Successfully!"
echo "TX Hash: $TXHASH"
if [ -n "$NETWORK_PREFIX" ]; then
    echo "Explorer Link: https://${NETWORK_PREFIX}cardanoscan.io/transaction/$TXHASH"
fi
echo "Total Execution Time: $DURATION seconds"
if [ "$DURATION" -lt 180 ]; then
  echo "Benchmark Status: PASSED (Under 3 minutes)"
else
  echo "Benchmark Status: FAILED (Over 3 minutes)"
fi
echo "================================================="
