# NEAR Backend Testing Guide

## Step 1: Start the Backend

Open a **WSL terminal** and run:

```bash
cd /mnt/c/Users/User/Documents/Learn-near/rustbackend/nearplay/near-backend
source ~/.cargo/env
cargo run
```

Wait for the message: `Starting NEAR Playground Backend on 0.0.0.0:8080`

## Step 2: Test Health Endpoint

In a **new WSL terminal**, run:

```bash
curl http://localhost:8080/health | jq .
```

Expected output:
```json
{
  "success": true,
  "message": "NEAR Playground Backend is running",
  "data": {
    "status": "ok",
    "timestamp": "2026-01-26T...",
    "version": "0.1.0"
  }
}
```

## Step 3: Test Contract Compilation

Run this command to compile the test contract:

```bash
cd /mnt/c/Users/User/Documents/Learn-near/rustbackend/nearplay/near-backend

curl -X POST http://localhost:8080/compile \
  -H "Content-Type: application/json" \
  -d @test_backend.json | jq .
```

This will compile a simple Counter contract with the following features:
- `increment()` - Increases the counter
- `decrement()` - Decreases the counter  
- `get_count()` - Returns current count
- `reset()` - Resets counter to 0

Expected successful output:
```json
{
  "success": true,
  "message": "Compilation completed successfully",
  "data": {
    "success": true,
    "exit_code": 0,
    "stdout": "...compilation output...",
    "stderr": "",
    "details": {
      "duration_ms": <compilation_time>,
      "wasm_size": <file_size_bytes>
    },
    "abi": { ... }
  }
}
```

## Step 4: Test Deployment (Optional)

After successful compilation, test deployment:

```bash
curl -X POST http://localhost:8080/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "testuser123",
    "project_id": "counter_contract_demo"
  }' | jq .
```

This will:
1. Create a subaccount under `softquiche5250.testnet`
2. Deploy the compiled contract
3. Return the contract address and transaction hash

## Troubleshooting

### Backend won't start
- Check if port 8080 is in use: `lsof -i :8080`
- Verify environment variables in `.env` file

### Compilation fails
- First compilation takes longer (5-10 minutes) as it caches dependencies
- Check logs for specific errors

### Connection refused
- Ensure backend is running with `HOST=0.0.0.0` in `.env`
- Check firewall settings

## Quick Test One-Liner

Once backend is running:

```bash
curl -s http://localhost:8080/health && echo "✅ Backend is running!" || echo "❌ Backend is not responding"
```
