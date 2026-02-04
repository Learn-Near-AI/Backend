#!/bin/bash

# Comprehensive backend endpoint testing script for WSL
# Run from backend root: ./scripts/test-wsl-endpoints.sh
#
# Usage:
#   ./scripts/test-wsl-endpoints.sh   # Test local backend (localhost:3001)
#   BACKEND_URL=http://localhost:3001 ./scripts/test-wsl-endpoints.sh  # Explicit local
#
# For full pass (deploy, call, view): backend must have NEAR_ACCOUNT_ID,
# NEAR_PRIVATE_KEY, NEAR_NETWORK set in .env (start backend first: npm start).

cd "$(dirname "$0")/.."

set +e

if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Always default to local backend for testing
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
NEAR_ACCOUNT_ID="${NEAR_ACCOUNT_ID:-}"
NEAR_PRIVATE_KEY="${NEAR_PRIVATE_KEY:-}"
NEAR_NETWORK="${NEAR_NETWORK:-testnet}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_START_TIME=$(date +%s%3N)
COMPILE_TIME=0
DEPLOY_TIME=0
VIEW_TIME=0
CALL_TIME=0

get_elapsed_ms() { local start=$1; echo $(($(date +%s%3N) - start)); }
format_time() { local ms=$1; [ $ms -lt 1000 ] && echo "${ms}ms" || echo "$(echo "scale=2; $ms / 1000" | bc)s"; }
print_header() { echo ""; echo -e "${BLUE}========================================${NC}"; echo -e "${BLUE}$1${NC}"; echo -e "${BLUE}========================================${NC}"; }
print_timing() { echo -e "${CYAN}⏱  $2: $(format_time $1)${NC}"; }
print_result() { [ $1 -eq 0 ] && { echo -e "${GREEN}✓ PASSED${NC}: $2"; ((TESTS_PASSED++)); } || { echo -e "${RED}✗ FAILED${NC}: $2"; ((TESTS_FAILED++)); }; }

api_call() {
    local method=$1 endpoint=$2 data=$3 expected=${4:-200}
    local response
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BACKEND_URL$endpoint" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BACKEND_URL$endpoint" -H "Content-Type: application/json" -d "$data" 2>&1)
    fi
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    if [ "$http_code" -eq "$expected" ]; then echo "$body"; return 0; else echo "HTTP $http_code: $body" >&2; return 1; fi
}

export NEAR_ACCOUNT_ID NEAR_PRIVATE_KEY NEAR_NETWORK

print_header "Backend Endpoint Testing Suite"
echo "Testing backend at: $BACKEND_URL"
echo "Account: $NEAR_ACCOUNT_ID"
echo "Network: $NEAR_NETWORK"
[ -z "$NEAR_PRIVATE_KEY" ] && echo -e "${YELLOW}Note: NEAR_PRIVATE_KEY not set - NEAR CLI stats (Test 6) may fail${NC}"
echo ""

print_header "Test 1: Health Check Endpoint"
test_start=$(date +%s%3N)
health_response=$(api_call "GET" "/api/health" "" 200)
if echo "$health_response" | grep -qE '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    print_result 0 "Health check endpoint"
else
    print_result 1 "Health check endpoint"
fi
print_timing $(get_elapsed_ms $test_start) "Health check time"

print_header "Test 2: NEAR Status Endpoint"
status_response=$(api_call "GET" "/api/near/status" "" 200)
echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
if echo "$status_response" | grep -qE '"configured"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "NEAR status endpoint (credentials configured)"
elif echo "$status_response" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "NEAR status endpoint (endpoint OK, credentials not configured)"
    echo -e "${YELLOW}⚠ Set NEAR_ACCOUNT_ID, NEAR_PRIVATE_KEY on backend for deploy tests${NC}"
else
    print_result 1 "NEAR status endpoint"
fi

print_header "Test 3: Compile Contract Endpoint"
compile_data='{"code":"use near_sdk::near;\nuse near_sdk::PanicOnDefault;\n\n#[derive(PanicOnDefault)]\n#[near(contract_state)]\npub struct Contract { counter: u32 }\n\n#[near]\nimpl Contract {\n    #[init]\n    pub fn new() -> Self { Self { counter: 0 } }\n    pub fn hello_world(&self) -> String { \"Hello, NEAR!\".to_string() }\n    pub fn get_counter(&self) -> u32 { self.counter }\n    pub fn increment(&mut self) { self.counter += 1 }\n}","language":"Rust"}'
compile_start=$(date +%s%3N)
compile_response=$(api_call "POST" "/api/compile" "$compile_data" 200)
COMPILE_TIME=$(get_elapsed_ms $compile_start)

if echo "$compile_response" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "Compile contract endpoint"
    WASM_BASE64=$(echo "$compile_response" | jq -r '.wasm' 2>/dev/null)
    WASM_SIZE=$(echo "$compile_response" | jq -r '.size' 2>/dev/null)
    echo "WASM Size: $WASM_SIZE bytes"
else
    print_result 1 "Compile contract endpoint"
    echo "Compilation failed. Cannot proceed with deployment tests."
    exit 1
fi
print_timing $COMPILE_TIME "Compilation time"

print_header "Test 4: Deploy Contract to Subaccount"
deploy_data="{\"wasmBase64\":\"$WASM_BASE64\",\"useSubaccount\":true,\"userId\":\"testuser\",\"projectId\":\"wsl-test\",\"initMethod\":\"new\",\"initArgs\":{}}"
deploy_start=$(date +%s%3N)
deploy_response=$(api_call "POST" "/api/deploy" "$deploy_data" 200)
DEPLOY_TIME=$(get_elapsed_ms $deploy_start)

if echo "$deploy_response" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "Deploy contract endpoint"
    CONTRACT_ID=$(echo "$deploy_response" | jq -r '.contractId' 2>/dev/null)
    echo "Contract deployed to: $CONTRACT_ID"
else
    print_result 1 "Deploy contract endpoint"
    echo "Deployment failed. Cannot proceed with contract interaction tests."
    exit 1
fi
print_timing $DEPLOY_TIME "Deployment time"

sleep 3

print_header "Test 5: View Contract Method"
view_data="{\"contractAccountId\":\"$CONTRACT_ID\",\"methodName\":\"hello_world\",\"args\":{}}"
view_start=$(date +%s%3N)
view_response=$(api_call "POST" "/api/contract/view" "$view_data" 200)
VIEW_TIME=$(get_elapsed_ms $view_start)
echo "$view_response" | jq '.' 2>/dev/null || echo "$view_response"
if echo "$view_response" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "View contract method endpoint"
else
    print_result 1 "View contract method endpoint"
fi
print_timing $VIEW_TIME "View method time"

print_header "Test 6: Contract Statistics"
[ -z "$NEAR_PRIVATE_KEY" ] && echo -e "${YELLOW}Skipping NEAR CLI stats (NEAR_PRIVATE_KEY not set)${NC}"

print_header "Test 7: Call Contract Method"
call_data="{\"contractAccountId\":\"$CONTRACT_ID\",\"methodName\":\"increment\",\"args\":{}}"
call_start=$(date +%s%3N)
call_response=$(api_call "POST" "/api/contract/call" "$call_data" 200)
CALL_TIME=$(get_elapsed_ms $call_start)
echo "$call_response" | jq '.' 2>/dev/null || echo "$call_response"
if echo "$call_response" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "Call contract method endpoint"
    sleep 3
    counter_data="{\"contractAccountId\":\"$CONTRACT_ID\",\"methodName\":\"get_counter\",\"args\":{}}"
    counter_response=$(api_call "POST" "/api/contract/view" "$counter_data" 200)
    COUNTER_VALUE=$(echo "$counter_response" | jq -r '.result' 2>/dev/null)
    echo "Counter value: $COUNTER_VALUE"
    [ "$COUNTER_VALUE" = "1" ] && echo -e "${GREEN}✓ Counter incremented successfully!${NC}" || echo -e "${YELLOW}⚠ Counter value: $COUNTER_VALUE (expected 1)${NC}"
else
    print_result 1 "Call contract method endpoint"
fi
print_timing $CALL_TIME "Contract call time"

TOTAL_TIME=$(($(date +%s%3N) - TOTAL_START_TIME))
print_header "Test Summary"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""
print_timing $COMPILE_TIME "Compilation"
print_timing $DEPLOY_TIME "Deployment"
print_timing $VIEW_TIME "View Method"
print_timing $CALL_TIME "Change Method"
print_timing $TOTAL_TIME "TOTAL TIME"
echo ""
[ $TESTS_FAILED -eq 0 ] && { echo -e "${GREEN}All tests passed! ✓${NC}"; exit 0; } || { echo -e "${RED}Some tests failed.${NC}"; exit 1; }
