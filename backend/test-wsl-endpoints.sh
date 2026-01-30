#!/bin/bash

# Comprehensive backend endpoint testing script for WSL
# Tests all endpoints and retrieves contract statistics
# Enhanced with timing measurements

# Don't exit on error - we want to test all endpoints
set +e

# Configuration
NEAR_ACCOUNT_ID="softquiche5250.testnet"
NEAR_PRIVATE_KEY="ed25519:4YUnd6qTdKcVgB5V1ZApjVKzMm2gwXtFTfAnABjFbm6vXGhQvpbNovaLqQTsE7wGTBtArYTazaRwqn9sd4txcAgr"
NEAR_NETWORK="testnet"
BACKEND_URL="http://localhost:3001"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Timing variables
TOTAL_START_TIME=$(date +%s%3N)
COMPILE_TIME=0
DEPLOY_TIME=0
VIEW_TIME=0
CALL_TIME=0

# Function to get elapsed time in milliseconds
get_elapsed_ms() {
    local start=$1
    local end=$(date +%s%3N)
    echo $((end - start))
}

# Function to format time
format_time() {
    local ms=$1
    if [ $ms -lt 1000 ]; then
        echo "${ms}ms"
    else
        local seconds=$(echo "scale=2; $ms / 1000" | bc)
        echo "${seconds}s"
    fi
}

# Function to print test header
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Function to print timing info
print_timing() {
    local duration=$1
    local label=$2
    echo -e "${CYAN}⏱  $label: $(format_time $duration)${NC}"
}

# Function to print test result
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}: $2"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}: $2"
        ((TESTS_FAILED++))
    fi
}

# Function to make API call and check response
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=${4:-200}
    
    local response
    local http_code
    local body
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BACKEND_URL$endpoint" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BACKEND_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq "$expected_status" ]; then
        echo "$body"
        return 0
    else
        echo "HTTP $http_code: $body" >&2
        return 1
    fi
}

# Export environment variables
export NEAR_ACCOUNT_ID
export NEAR_PRIVATE_KEY
export NEAR_NETWORK

print_header "Backend Endpoint Testing Suite"
echo "Testing backend at: $BACKEND_URL"
echo "Account: $NEAR_ACCOUNT_ID"
echo "Network: $NEAR_NETWORK"
echo ""

# Test 1: Health Check
print_header "Test 1: Health Check Endpoint"
test_start=$(date +%s%3N)
health_response=$(api_call "GET" "/api/health" "" 200)
test_duration=$(get_elapsed_ms $test_start)

if echo "$health_response" | grep -q '"status":"ok"'; then
    print_result 0 "Health check endpoint"
    echo "Response: $health_response"
else
    print_result 1 "Health check endpoint"
    echo "Response: $health_response"
fi
print_timing $test_duration "Health check time"

# Test 2: NEAR Status Check
print_header "Test 2: NEAR Status Endpoint"
test_start=$(date +%s%3N)
status_response=$(api_call "GET" "/api/near/status" "" 200)
test_duration=$(get_elapsed_ms $test_start)

echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
if echo "$status_response" | grep -q '"configured":true'; then
    print_result 0 "NEAR status endpoint"
else
    print_result 1 "NEAR status endpoint"
fi
print_timing $test_duration "Status check time"

# Test 3: Compile Contract
print_header "Test 3: Compile Contract Endpoint"
compile_data='{
    "code": "use near_sdk::near;\nuse near_sdk::PanicOnDefault;\n\n#[derive(PanicOnDefault)]\n#[near(contract_state)]\npub struct Contract {\n    counter: u32,\n}\n\n#[near]\nimpl Contract {\n    #[init]\n    pub fn new() -> Self {\n        Self { counter: 0 }\n    }\n    \n    pub fn hello_world(&self) -> String {\n        \"Hello, NEAR!\".to_string()\n    }\n    \n    pub fn get_counter(&self) -> u32 {\n        self.counter\n    }\n    \n    pub fn increment(&mut self) {\n        self.counter += 1;\n    }\n}",
    "language": "Rust"
}'

echo "Starting compilation..."
compile_start=$(date +%s%3N)
compile_response=$(api_call "POST" "/api/compile" "$compile_data" 200)
COMPILE_TIME=$(get_elapsed_ms $compile_start)

echo "$compile_response" | jq '.' 2>/dev/null || echo "$compile_response"

if echo "$compile_response" | grep -q '"success":true'; then
    print_result 0 "Compile contract endpoint"
    WASM_BASE64=$(echo "$compile_response" | jq -r '.wasm' 2>/dev/null || echo "")
    WASM_SIZE=$(echo "$compile_response" | jq -r '.size' 2>/dev/null || echo "")
    echo "WASM Size: $WASM_SIZE bytes"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    print_timing $COMPILE_TIME "COMPILATION TIME"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
    print_result 1 "Compile contract endpoint"
    print_timing $COMPILE_TIME "Compilation time (failed)"
    echo "Compilation failed. Cannot proceed with deployment tests."
    exit 1
fi

# Test 4: Deploy to Subaccount
print_header "Test 4: Deploy Contract to Subaccount"
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

echo "Starting deployment..."
deploy_start=$(date +%s%3N)
deploy_response=$(api_call "POST" "/api/deploy" "$deploy_data" 200)
DEPLOY_TIME=$(get_elapsed_ms $deploy_start)

echo "$deploy_response" | jq '.' 2>/dev/null || echo "$deploy_response"

if echo "$deploy_response" | grep -q '"success":true'; then
    print_result 0 "Deploy contract endpoint"
    CONTRACT_ID=$(echo "$deploy_response" | jq -r '.contractId' 2>/dev/null || echo "")
    echo "Contract deployed to: $CONTRACT_ID"
    
    # Extract transaction URLs
    echo "$deploy_response" | jq -r '.transactions.createAccount.url // empty' 2>/dev/null | while read url; do
        [ -n "$url" ] && echo "Create Account TX: $url"
    done
    echo "$deploy_response" | jq -r '.transactions.deploy.url // empty' 2>/dev/null | while read url; do
        [ -n "$url" ] && echo "Deploy TX: $url"
    done
    echo "$deploy_response" | jq -r '.accountUrl // empty' 2>/dev/null | while read url; do
        [ -n "$url" ] && echo "Account Explorer: $url"
    done
    print_timing $DEPLOY_TIME "Deployment time"
else
    print_result 1 "Deploy contract endpoint"
    print_timing $DEPLOY_TIME "Deployment time (failed)"
    echo "Deployment failed. Cannot proceed with contract interaction tests."
    exit 1
fi

# Wait a bit for deployment to finalize
echo ""
echo "Waiting 3 seconds for deployment to finalize..."
sleep 3

# Test 5: View Contract Method
print_header "Test 5: View Contract Method (Read-only)"
view_data=$(cat <<EOF
{
    "contractAccountId": "$CONTRACT_ID",
    "methodName": "hello_world",
    "args": {}
}
EOF
)

view_start=$(date +%s%3N)
view_response=$(api_call "POST" "/api/contract/view" "$view_data" 200)
VIEW_TIME=$(get_elapsed_ms $view_start)

echo "$view_response" | jq '.' 2>/dev/null || echo "$view_response"

if echo "$view_response" | grep -q '"success":true'; then
    print_result 0 "View contract method endpoint"
    RESULT=$(echo "$view_response" | jq -r '.result' 2>/dev/null || echo "")
    echo "Method result: $RESULT"
    print_timing $VIEW_TIME "View method time"
else
    print_result 1 "View contract method endpoint"
    print_timing $VIEW_TIME "View method time (failed)"
fi

# Test 6: Get Contract Statistics
print_header "Test 6: Contract Statistics"
stats_start=$(date +%s%3N)
echo "Fetching contract statistics using NEAR CLI..."

# Get account state
echo ""
echo -e "${YELLOW}Account Information:${NC}"
account_info=$(npx near state "$CONTRACT_ID" --networkId "$NEAR_NETWORK" 2>&1 || echo "Failed to get account info")
echo "$account_info"

# Get account balance
echo ""
echo -e "${YELLOW}Account Balance:${NC}"
balance=$(npx near view-state "$CONTRACT_ID" --networkId "$NEAR_NETWORK" --finality final 2>&1 | head -20 || echo "Failed to get balance")
echo "$balance"

# Try to get contract code hash
echo ""
echo -e "${YELLOW}Contract Code Hash:${NC}"
code_hash=$(npx near view-state "$CONTRACT_ID" --networkId "$NEAR_NETWORK" --finality final 2>&1 | grep -i "code_hash" || echo "Code hash not found in view-state")
echo "$code_hash"

# Get account details using RPC
echo ""
echo -e "${YELLOW}Account Details (RPC):${NC}"
rpc_url="https://rpc.testnet.fastnear.com"
account_details=$(curl -s -X POST "$rpc_url" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"dontcare\",\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"account_id\":\"$CONTRACT_ID\",\"finality\":\"final\"}}")

echo "$account_details" | jq '.' 2>/dev/null || echo "$account_details"

# Extract key stats
if command -v jq &> /dev/null; then
    echo ""
    echo -e "${YELLOW}Contract Statistics Summary:${NC}"
    BALANCE=$(echo "$account_details" | jq -r '.result.amount' 2>/dev/null || echo "N/A")
    STORAGE_USAGE=$(echo "$account_details" | jq -r '.result.storage_usage' 2>/dev/null || echo "N/A")
    CODE_HASH=$(echo "$account_details" | jq -r '.result.code_hash' 2>/dev/null || echo "N/A")
    
    echo "Contract ID: $CONTRACT_ID"
    echo "Balance: $BALANCE yoctoNEAR"
    if [ "$BALANCE" != "N/A" ] && [ "$BALANCE" != "null" ]; then
        # Convert yoctoNEAR to NEAR (1 NEAR = 10^24 yoctoNEAR)
        balance_near=$(echo "scale=4; $BALANCE / 1000000000000000000000000" | bc 2>/dev/null || echo "N/A")
        echo "Balance: ~$balance_near NEAR"
    fi
    echo "Storage Usage: $STORAGE_USAGE bytes"
    echo "Code Hash: $CODE_HASH"
    
    if [ "$CODE_HASH" != "null" ] && [ "$CODE_HASH" != "N/A" ]; then
        echo -e "${GREEN}✓ Contract code is deployed${NC}"
    else
        echo -e "${RED}✗ Contract code not found${NC}"
    fi
fi

stats_duration=$(get_elapsed_ms $stats_start)
print_timing $stats_duration "Statistics retrieval time"

# Test 7: Call Contract Method (Change Method)
print_header "Test 7: Call Contract Method (Change Method)"
call_data=$(cat <<EOF
{
    "contractAccountId": "$CONTRACT_ID",
    "methodName": "increment",
    "args": {}
}
EOF
)

call_start=$(date +%s%3N)
call_response=$(api_call "POST" "/api/contract/call" "$call_data" 200)
CALL_TIME=$(get_elapsed_ms $call_start)

echo "$call_response" | jq '.' 2>/dev/null || echo "$call_response"

if echo "$call_response" | grep -q '"success":true'; then
    print_result 0 "Call contract method endpoint"
    CALL_TX=$(echo "$call_response" | jq -r '.transactionHash' 2>/dev/null || echo "")
    echo "Transaction Hash: $CALL_TX"
    print_timing $CALL_TIME "Contract call time"
    
    # Wait a bit for the call to finalize
    echo "Waiting 3 seconds for transaction to finalize..."
    sleep 3
    
    # Verify the counter was incremented
    echo ""
    echo "Verifying counter was incremented..."
    counter_data=$(cat <<EOF
{
    "contractAccountId": "$CONTRACT_ID",
    "methodName": "get_counter",
    "args": {}
}
EOF
)
    
    verify_start=$(date +%s%3N)
    counter_response=$(api_call "POST" "/api/contract/view" "$counter_data" 200)
    verify_duration=$(get_elapsed_ms $verify_start)
    
    COUNTER_VALUE=$(echo "$counter_response" | jq -r '.result' 2>/dev/null || echo "")
    echo "Counter value: $COUNTER_VALUE"
    print_timing $verify_duration "Counter verification time"
    
    if [ "$COUNTER_VALUE" = "1" ]; then
        echo -e "${GREEN}✓ Counter incremented successfully!${NC}"
    else
        echo -e "${YELLOW}⚠ Counter value: $COUNTER_VALUE (expected 1)${NC}"
    fi
else
    print_result 1 "Call contract method endpoint"
    print_timing $CALL_TIME "Contract call time (failed)"
fi

# Calculate total time
TOTAL_END_TIME=$(date +%s%3N)
TOTAL_TIME=$((TOTAL_END_TIME - TOTAL_START_TIME))

# Summary
print_header "Test Summary"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

# Detailed timing breakdown
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}        TIMING BREAKDOWN${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
print_timing $COMPILE_TIME "Compilation"
print_timing $DEPLOY_TIME "Deployment"
print_timing $VIEW_TIME "View Method Call"
print_timing $CALL_TIME "Change Method Call"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
print_timing $TOTAL_TIME "TOTAL TEST SUITE TIME"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Calculate percentages
if [ $TOTAL_TIME -gt 0 ]; then
    compile_pct=$(echo "scale=1; ($COMPILE_TIME * 100) / $TOTAL_TIME" | bc)
    deploy_pct=$(echo "scale=1; ($DEPLOY_TIME * 100) / $TOTAL_TIME" | bc)
    
    echo -e "${YELLOW}Time Distribution:${NC}"
    echo "  Compilation: ${compile_pct}%"
    echo "  Deployment: ${deploy_pct}%"
    echo ""
fi

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please review the output above.${NC}"
    exit 1
fi