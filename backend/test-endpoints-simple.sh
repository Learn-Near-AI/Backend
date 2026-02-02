#!/bin/bash

# Simple endpoint testing script for WSL
# Tests all endpoints and provides contract statistics

BACKEND_URL="http://localhost:3001"
NEAR_ACCOUNT_ID="${NEAR_ACCOUNT_ID:-learn-near-by-example.testnet}"
NEAR_PRIVATE_KEY="${NEAR_PRIVATE_KEY:-ed25519:2PLUhj5EReBqwx3RSLm7kqnBejTgeoKTsGaH1UqA63pPzjd4dnarmicm8tQkzwu56cJguKZBUBvvprEB9G4Eo6Py}"
NEAR_NETWORK="${NEAR_NETWORK:-testnet}"

echo "=========================================="
echo "Backend Endpoint Testing"
echo "=========================================="
echo "Backend URL: $BACKEND_URL"
echo "Account: $NEAR_ACCOUNT_ID"
echo "Network: $NEAR_NETWORK"
echo ""

# Test 1: Health Check
echo "[1/7] Testing Health Check..."
health=$(curl -s "$BACKEND_URL/api/health")
if echo "$health" | grep -q '"status":"ok"'; then
    echo "✓ Health check passed"
else
    echo "✗ Health check failed: $health"
    exit 1
fi

# Test 2: NEAR Status
echo "[2/7] Testing NEAR Status..."
status=$(curl -s "$BACKEND_URL/api/near/status")
echo "$status" | jq '.' 2>/dev/null || echo "$status"
configured=$(echo "$status" | jq -r '.configured' 2>/dev/null || echo "false")
if [ "$configured" = "true" ]; then
    echo "✓ NEAR credentials configured"
else
    echo "⚠ NEAR credentials not configured in server (this is OK for compile test)"
fi

# Test 3: Compile Contract
echo ""
echo "[3/7] Compiling Contract..."
compile_data='{
    "code": "use near_sdk::near;\nuse near_sdk::PanicOnDefault;\n\n#[derive(PanicOnDefault)]\n#[near(contract_state)]\npub struct Contract {}\n\n#[near]\nimpl Contract {\n    #[init]\n    pub fn new() -> Self {\n        Self {}\n    }\n    \n    pub fn hello_world(&self) -> String {\n        \"Hello, NEAR!\".to_string()\n    }\n}",
    "language": "Rust"
}'

compile_response=$(curl -s -X POST "$BACKEND_URL/api/compile" \
    -H "Content-Type: application/json" \
    -d "$compile_data")

success=$(echo "$compile_response" | jq -r '.success' 2>/dev/null || echo "false")
if [ "$success" = "true" ]; then
    echo "✓ Compilation successful"
    WASM_BASE64=$(echo "$compile_response" | jq -r '.wasm' 2>/dev/null)
    WASM_SIZE=$(echo "$compile_response" | jq -r '.size' 2>/dev/null)
    echo "  WASM Size: $WASM_SIZE bytes"
else
    echo "✗ Compilation failed"
    echo "$compile_response" | jq '.' 2>/dev/null || echo "$compile_response"
    exit 1
fi

# Test 4: Deploy to Subaccount (requires server to have credentials)
echo ""
echo "[4/7] Deploying Contract to Subaccount..."
deploy_data=$(cat <<EOF
{
    "wasmBase64": "$WASM_BASE64",
    "useSubaccount": true,
    "userId": "testuser",
    "projectId": "wsl-test",
    "initMethod": "new",
    "initArgs": {}
}
EOF
)

deploy_response=$(curl -s -X POST "$BACKEND_URL/api/deploy" \
    -H "Content-Type: application/json" \
    -d "$deploy_data")

deploy_success=$(echo "$deploy_response" | jq -r '.success' 2>/dev/null || echo "false")
if [ "$deploy_success" = "true" ]; then
    echo "✓ Deployment successful"
    CONTRACT_ID=$(echo "$deploy_response" | jq -r '.contractId' 2>/dev/null)
    echo "  Contract ID: $CONTRACT_ID"
    
    # Show transaction URLs
    echo "$deploy_response" | jq -r '.transactions.createAccount.url // empty' 2>/dev/null | while read url; do
        [ -n "$url" ] && echo "  Create Account TX: $url"
    done
    echo "$deploy_response" | jq -r '.transactions.deploy.url // empty' 2>/dev/null | while read url; do
        [ -n "$url" ] && echo "  Deploy TX: $url"
    done
    echo "$deploy_response" | jq -r '.accountUrl // empty' 2>/dev/null | while read url; do
        [ -n "$url" ] && echo "  Account Explorer: $url"
    done
    
    # Wait for deployment to finalize
    echo ""
    echo "Waiting 3 seconds for deployment to finalize..."
    sleep 3
    
    # Test 5: View Contract Method
    echo ""
    echo "[5/7] Viewing Contract Method..."
    view_data=$(cat <<EOF
{
    "contractAccountId": "$CONTRACT_ID",
    "methodName": "hello_world",
    "args": {}
}
EOF
)
    
    view_response=$(curl -s -X POST "$BACKEND_URL/api/contract/view" \
        -H "Content-Type: application/json" \
        -d "$view_data")
    
    view_success=$(echo "$view_response" | jq -r '.success' 2>/dev/null || echo "false")
    if [ "$view_success" = "true" ]; then
        echo "✓ View method successful"
        result=$(echo "$view_response" | jq -r '.result' 2>/dev/null)
        echo "  Result: $result"
    else
        echo "✗ View method failed"
        echo "$view_response" | jq '.' 2>/dev/null || echo "$view_response"
    fi
    
    # Test 6: Get Contract Statistics
    echo ""
    echo "[6/7] Getting Contract Statistics..."
    rpc_url="https://rpc.testnet.fastnear.com"
    account_details=$(curl -s -X POST "$rpc_url" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":\"dontcare\",\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"account_id\":\"$CONTRACT_ID\",\"finality\":\"final\"}}")
    
    if command -v jq &> /dev/null; then
        BALANCE=$(echo "$account_details" | jq -r '.result.amount' 2>/dev/null || echo "N/A")
        STORAGE_USAGE=$(echo "$account_details" | jq -r '.result.storage_usage' 2>/dev/null || echo "N/A")
        CODE_HASH=$(echo "$account_details" | jq -r '.result.code_hash' 2>/dev/null || echo "N/A")
        
        echo "Contract Statistics:"
        echo "  Contract ID: $CONTRACT_ID"
        echo "  Balance: $BALANCE yoctoNEAR"
        if [ "$BALANCE" != "N/A" ] && [ "$BALANCE" != "null" ] && [ -n "$BALANCE" ]; then
            balance_near=$(echo "scale=4; $BALANCE / 1000000000000000000000000" | bc 2>/dev/null || echo "N/A")
            echo "  Balance: ~$balance_near NEAR"
        fi
        echo "  Storage Usage: $STORAGE_USAGE bytes"
        echo "  Code Hash: $CODE_HASH"
        
        if [ "$CODE_HASH" != "null" ] && [ "$CODE_HASH" != "N/A" ] && [ -n "$CODE_HASH" ]; then
            echo "✓ Contract code is deployed"
        else
            echo "⚠ Contract code hash not found"
        fi
    else
        echo "$account_details" | jq '.' 2>/dev/null || echo "$account_details"
    fi
    
else
    echo "✗ Deployment failed"
    echo "$deploy_response" | jq '.' 2>/dev/null || echo "$deploy_response"
    echo ""
    echo "Note: Deployment requires the server to be started with NEAR credentials:"
    echo "  export NEAR_ACCOUNT_ID='$NEAR_ACCOUNT_ID'"
    echo "  export NEAR_PRIVATE_KEY='$NEAR_PRIVATE_KEY'"
    echo "  export NEAR_NETWORK='$NEAR_NETWORK'"
    echo "  node server.js"
fi

# Test 7: Summary
echo ""
echo "[7/7] Test Summary"
echo "=========================================="
echo "✓ Health Check: Passed"
echo "$([ "$configured" = "true" ] && echo "✓" || echo "⚠") NEAR Status: $([ "$configured" = "true" ] && echo "Configured" || echo "Not Configured")"
echo "✓ Compile: Passed"
echo "$([ "$deploy_success" = "true" ] && echo "✓" || echo "✗") Deploy: $([ "$deploy_success" = "true" ] && echo "Passed" || echo "Failed")"
if [ "$deploy_success" = "true" ]; then
    echo "$([ "$view_success" = "true" ] && echo "✓" || echo "✗") View Method: $([ "$view_success" = "true" ] && echo "Passed" || echo "Failed")"
    echo "✓ Contract Statistics: Retrieved"
fi
echo "=========================================="
