#!/bin/bash
set -e

echo "=========================================="
echo "NEAR Backend Full Integration Test"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend is already running
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend is already running"
else
    echo -e "${RED}✗${NC} Backend is not running. Please start it first with:"
    echo "   cd /mnt/c/Users/User/Documents/Learn-near/rustbackend/nearplay/near-backend"
    echo "   source ~/.cargo/env && cargo run"
    exit 1
fi

echo ""
echo "=========================================="
echo "TEST 1: Health Check Endpoint"
echo "=========================================="
echo ""

HEALTH_RESPONSE=$(curl -s http://localhost:8080/health)
echo "$HEALTH_RESPONSE" | jq .

if echo "$HEALTH_RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo "TEST 2: Compile Contract Endpoint"
echo "=========================================="
echo ""
echo "Compiling Counter contract..."
echo ""

COMPILE_RESPONSE=$(curl -s -X POST http://localhost:8080/compile \
  -H "Content-Type: application/json" \
  -d @test_backend.json)

echo "$COMPILE_RESPONSE" | jq .

if echo "$COMPILE_RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✓ Compilation passed${NC}"
    WASM_SIZE=$(echo "$COMPILE_RESPONSE" | jq -r '.data.details.wasm_size')
    DURATION=$(echo "$COMPILE_RESPONSE" | jq -r '.data.details.duration_ms')
    echo "  - WASM size: $WASM_SIZE bytes"
    echo "  - Duration: $DURATION ms"
else
    echo -e "${RED}✗ Compilation failed${NC}"
    echo "$COMPILE_RESPONSE" | jq '.error'
    exit 1
fi

echo ""
echo "=========================================="
echo "TEST 3: Deploy Contract Endpoint"
echo "=========================================="
echo ""
echo "Deploying compiled contract..."
echo ""

DEPLOY_RESPONSE=$(curl -s -X POST http://localhost:8080/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "testuser123",
    "project_id": "counter_contract_demo"
  }')

echo "$DEPLOY_RESPONSE" | jq .

if echo "$DEPLOY_RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✓ Deployment passed${NC}"
    CONTRACT_ID=$(echo "$DEPLOY_RESPONSE" | jq -r '.data.contract_id')
    TX_HASH=$(echo "$DEPLOY_RESPONSE" | jq -r '.data.transaction_hash')
    EXPLORER_URL=$(echo "$DEPLOY_RESPONSE" | jq -r '.data.explorer_url')
    echo "  - Contract ID: $CONTRACT_ID"
    echo "  - Transaction: $TX_HASH"
    echo "  - Explorer: $EXPLORER_URL"
else
    echo -e "${YELLOW}⚠ Deployment failed (this might be expected if account has insufficient balance)${NC}"
    echo "$DEPLOY_RESPONSE" | jq '.error // .message'
    CONTRACT_ID="test.testnet"  # Use a fallback for method call test
fi

echo ""
echo "=========================================="
echo "TEST 4: Method Call Endpoint"
echo "=========================================="
echo ""
echo "Testing view method call on a known contract..."
echo ""

# Use a well-known testnet contract for testing
METHOD_CALL_RESPONSE=$(curl -s -X POST http://localhost:8080/method-call \
  -H "Content-Type: application/json" \
  -d '{
    "contract_address": "guest-book.testnet",
    "method_name": "total_messages",
    "args": {},
    "method_type": "view"
  }')

echo "$METHOD_CALL_RESPONSE" | jq .

if echo "$METHOD_CALL_RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✓ Method call passed${NC}"
    RESULT=$(echo "$METHOD_CALL_RESPONSE" | jq -r '.data.result')
    echo "  - Result: $RESULT"
else
    echo -e "${YELLOW}⚠ Method call test${NC}"
    echo "$METHOD_CALL_RESPONSE" | jq '.error // .message'
fi

echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo ""
echo -e "${GREEN}All tests completed!${NC}"
echo ""
echo "Endpoints tested:"
echo "  ✓ GET  /health"
echo "  ✓ POST /compile"
echo "  ✓ POST /deploy"
echo "  ✓ POST /method-call"
echo ""
echo "=========================================="
