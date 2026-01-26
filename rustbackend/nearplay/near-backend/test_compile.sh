#!/bin/bash

# Simple NEAR smart contract for testing
CONTRACT_CODE='use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{env, near_bindgen};

#[near_bindgen]
#[derive(Default, BorshDeserialize, BorshSerialize)]
pub struct Counter {
    value: i32,
}

#[near_bindgen]
impl Counter {
    pub fn increment(&mut self) {
        self.value += 1;
        env::log_str(&format!("Counter incremented to: {}", self.value));
    }

    pub fn decrement(&mut self) {
        self.value -= 1;
        env::log_str(&format!("Counter decremented to: {}", self.value));
    }

    pub fn get_count(&self) -> i32 {
        self.value
    }

    pub fn reset(&mut self) {
        self.value = 0;
        env::log_str("Counter reset to 0");
    }
}'

# Wait for backend to be ready
echo "Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        echo "Backend is ready!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 1
done

# Test compilation
echo ""
echo "Testing contract compilation..."
echo ""

# Escape the contract code for JSON
CONTRACT_JSON=$(echo "$CONTRACT_CODE" | jq -Rs .)

# Send compilation request
curl -X POST http://localhost:8080/compile \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"testuser\",
    \"project_id\": \"counter_contract\",
    \"code\": $CONTRACT_JSON
  }" | jq .

echo ""
echo "Compilation test complete!"
