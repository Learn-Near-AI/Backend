# NEAR Contract Compiler Frontend

A simple HTML frontend for compiling Rust NEAR smart contracts.

## Usage

1. **Start the backend server** (in the rustbackend/nearplay/near-backend directory):
   ```bash
   cd rustbackend/nearplay/near-backend
   cargo run
   ```
   The backend will start on `http://localhost:8080`

2. **Open the frontend**:
   - Simply open `index.html` in your web browser
   - Or use a local server:
     ```bash
     # Python 3
     python -m http.server 8000
     
     # Node.js (if you have http-server installed)
     npx http-server -p 8000
     ```
   - Then navigate to `http://localhost:8000`

3. **Select Rust** as the contract language (JavaScript contracts are not supported by the backend)

4. **Write your contract** in the textarea or use one of the example contracts

5. **Click "Compile Contract"** or press `Ctrl+Enter`

6. **View the results** - success shows WASM size, errors show detailed messages

7. **Deploy the contract** - after successful compilation, click "Deploy Contract" to deploy to NEAR testnet

## Features

- ✅ Write Rust NEAR contracts
- ✅ Compile via backend `/compile` endpoint
- ✅ Deploy contracts to NEAR testnet via `/deploy` endpoint
- ✅ Example contracts included (Counter, Greeting, Storage, HelloWorld)
- ✅ Real-time compilation feedback
- ✅ Keyboard shortcut: `Ctrl+Enter` to compile

## Backend Endpoint

The frontend connects to: `http://localhost:8080`

**Endpoints:**
- `POST /compile` - Compile a Rust contract
- `POST /deploy` - Deploy a compiled contract
- `GET /health` - Health check

Make sure your backend server is running before compiling contracts.

## Note

The backend only supports Rust contracts. JavaScript contracts will fail to compile.
