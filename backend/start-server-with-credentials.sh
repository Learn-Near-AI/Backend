#!/bin/bash

# Start backend server with NEAR credentials
# Usage: ./start-server-with-credentials.sh

export NEAR_ACCOUNT_ID="softquiche5250.testnet"
export NEAR_PRIVATE_KEY="ed25519:4YUnd6qTdKcVgB5V1ZApjVKzMm2gwXtFTfAnABjFbm6vXGhQvpbNovaLqQTsE7wGTBtArYTazaRwqn9sd4txcAgr"
export NEAR_NETWORK="testnet"

echo "Starting backend server with NEAR credentials..."
echo "Account: $NEAR_ACCOUNT_ID"
echo "Network: $NEAR_NETWORK"
echo ""

node server.js
