#!/bin/bash

# Backend endpoint testing script - Compile tests only (no deployment)
# Run from backend root: ./scripts/test-endpoints.sh
#
# Usage:
#   ./scripts/test-endpoints.sh
#   BACKEND_URL=http://localhost:3001 ./scripts/test-endpoints.sh

cd "$(dirname "$0")/.."

set +e

if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
NEAR_ACCOUNT_ID="${NEAR_ACCOUNT_ID:-}"
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
JS_COMPILE_TIME=0

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

print_header "Backend Endpoint Testing Suite (Compile Only)"
echo "Testing backend at: $BACKEND_URL"
echo "Account: $NEAR_ACCOUNT_ID"
echo "Network: $NEAR_NETWORK"
echo ""

# ── Test 1: Health Check ──────────────────────────────────────────────────────
print_header "Test 1: Health Check Endpoint"
test_start=$(date +%s%3N)
health_response=$(api_call "GET" "/api/health" "" 200)
if echo "$health_response" | grep -qE '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    print_result 0 "Health check endpoint"
else
    print_result 1 "Health check endpoint"
    echo "$health_response"
fi
print_timing $(get_elapsed_ms $test_start) "Health check time"

# ── Test 2: NEAR Status ───────────────────────────────────────────────────────
print_header "Test 2: NEAR Status Endpoint"
status_response=$(api_call "GET" "/api/near/status" "" 200)
echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
if echo "$status_response" | grep -qE '"configured"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "NEAR status endpoint (credentials configured)"
elif echo "$status_response" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "NEAR status endpoint (endpoint OK)"
    echo -e "${YELLOW}⚠ NEAR credentials not configured${NC}"
else
    print_result 1 "NEAR status endpoint"
fi

# ── Test 3: Rust Compile ──────────────────────────────────────────────────────
print_header "Test 3: Rust Compile Endpoint"
compile_data='{"code":"use near_sdk::near;\nuse near_sdk::PanicOnDefault;\n\n#[derive(PanicOnDefault)]\n#[near(contract_state)]\npub struct Contract { counter: u32 }\n\n#[near]\nimpl Contract {\n    #[init]\n    pub fn new() -> Self { Self { counter: 0 } }\n    pub fn hello_world(&self) -> String { \"Hello, NEAR!\".to_string() }\n    pub fn get_counter(&self) -> u32 { self.counter }\n    pub fn increment(&mut self) { self.counter += 1 }\n}","language":"Rust"}'
compile_start=$(date +%s%3N)
compile_response=$(api_call "POST" "/api/compile" "$compile_data" 200)
COMPILE_TIME=$(get_elapsed_ms $compile_start)

if echo "$compile_response" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "Rust compile endpoint"
    WASM_SIZE=$(echo "$compile_response" | jq -r '.size' 2>/dev/null)
    echo "WASM Size: $WASM_SIZE bytes"
else
    print_result 1 "Rust compile endpoint"
    echo "$compile_response" | jq '.' 2>/dev/null || echo "$compile_response"
fi
print_timing $COMPILE_TIME "Rust compilation time"

# ── Test 4: JS NEAR Status ────────────────────────────────────────────────────
print_header "Test 4: JS NEAR Status Endpoint"
js_status_response=$(api_call "GET" "/api/js/near/status" "" 200)
echo "$js_status_response" | jq '.' 2>/dev/null || echo "$js_status_response"
if echo "$js_status_response" | grep -qE '"configured"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "JS NEAR status endpoint (credentials configured)"
elif echo "$js_status_response" | grep -qE '"network"'; then
    print_result 0 "JS NEAR status endpoint (endpoint OK)"
else
    print_result 1 "JS NEAR status endpoint"
fi

# ── Test 5: JS Compile ────────────────────────────────────────────────────────
print_header "Test 5: JS Compile Endpoint"
js_compile_data='{"code":"import { NearBindgen, near, call, view } from '\''near-sdk-js'\'';\n\n@NearBindgen({})\nclass Contract {\n  @view({})\n  hello_world() { \n    return \"Hello, NEAR!\";\n  }\n}","language":"JavaScript"}'
js_compile_start=$(date +%s%3N)
js_compile_response=$(api_call "POST" "/api/js/compile" "$js_compile_data" 200)
JS_COMPILE_TIME=$(get_elapsed_ms $js_compile_start)

if echo "$js_compile_response" | grep -qE '"success"[[:space:]]*:[[:space:]]*true'; then
    print_result 0 "JS compile endpoint"
    JS_WASM_SIZE=$(echo "$js_compile_response" | jq -r '.size' 2>/dev/null)
    echo "JS WASM Size: $JS_WASM_SIZE bytes"
else
    print_result 1 "JS compile endpoint"
    echo "$js_compile_response" | jq '.' 2>/dev/null || echo "$js_compile_response"
fi
print_timing $JS_COMPILE_TIME "JS compilation time"

# ── Summary ───────────────────────────────────────────────────────────────────
TOTAL_TIME=$(($(date +%s%3N) - TOTAL_START_TIME))
print_header "Test Summary"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""
print_timing $COMPILE_TIME    "Rust Compilation"
print_timing $JS_COMPILE_TIME "JS Compilation"
print_timing $TOTAL_TIME      "TOTAL TIME"
echo ""
[ $TESTS_FAILED -eq 0 ] && { echo -e "${GREEN}All tests passed! ✓${NC}"; exit 0; } || { echo -e "${RED}Some tests failed.${NC}"; exit 1; }