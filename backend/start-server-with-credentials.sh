#!/bin/bash

# Start backend server with NEAR credentials
# Usage: ./start-server-with-credentials.sh

export NEAR_ACCOUNT_ID="learn-near-by-example.testnet"
export NEAR_PRIVATE_KEY="ed25519:2PLUhj5EReBqwx3RSLm7kqnBejTgeoKTsGaH1UqA63pPzjd4dnarmicm8tQkzwu56cJguKZBUBvvprEB9G4Eo6Py"
export NEAR_NETWORK="testnet"

echo "Starting backend server with NEAR credentials..."
echo "Account: $NEAR_ACCOUNT_ID"
echo "Network: $NEAR_NETWORK"
echo ""

node server.js
