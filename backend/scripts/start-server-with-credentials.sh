#!/bin/bash

# Start backend server with NEAR credentials from environment variables.
# Run from backend root: ./scripts/start-server-with-credentials.sh
#
# Copy .env.example to .env and fill in your values, or export these before running:
#   export NEAR_ACCOUNT_ID="your-account.testnet"
#   export NEAR_PRIVATE_KEY="ed25519:your-key"
#   export NEAR_NETWORK="testnet"

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

export NEAR_ACCOUNT_ID="${NEAR_ACCOUNT_ID:-}"
export NEAR_PRIVATE_KEY="${NEAR_PRIVATE_KEY:-}"
export NEAR_NETWORK="${NEAR_NETWORK:-testnet}"

echo "Starting backend server..."
echo "Account: $NEAR_ACCOUNT_ID"
echo "Network: $NEAR_NETWORK"
echo ""

node src/server.js
