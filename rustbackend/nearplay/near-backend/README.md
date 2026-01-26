# NEAR Playground Backend

A Rust-based backend API server for the NEAR Playground application. This service provides compilation, deployment, and contract interaction capabilities for NEAR smart contracts.

## Overview

The NEAR Playground Backend is built with Actix-web and provides RESTful APIs for:
- Compiling NEAR smart contracts written in Rust
- Deploying contracts to NEAR testnet/mainnet
- Calling contract methods (view and change methods)
- Health monitoring

## Prerequisites

Before running the backend, ensure you have the following installed:

### Required
- **Rust** (1.70.0 or later) - [Install Rust](https://rustup.rs/)
- **cargo-near** - NEAR CLI build tool
  ```bash
  cargo install cargo-near
  ```
- **NEAR CLI** (optional, for testing) - [Install NEAR CLI](https://docs.near.org/tools/near-cli)

### System Requirements
- **OS**: Linux, macOS, or Windows with WSL
- **Memory**: At least 4GB RAM
- **Disk Space**: At least 5GB free space (for compilation cache)

## Installation

1. **Clone the repository** (if not already done):
   ```bash
   cd rustbackend/nearplay/near-backend
   ```

2. **Install Rust dependencies**:
   ```bash
   cargo build
   ```
   This will download and compile all required dependencies listed in `Cargo.toml`.

3. **Configure environment variables**:
   Create a `.env` file in the `near-backend` directory with your NEAR credentials:
   ```bash
   # Server Configuration
   HOST=127.0.0.1
   PORT=8080
   
   # NEAR Account Configuration
   # This account will be used to create subaccounts and deploy contracts
   NEAR_ACCOUNT_ID=your-account.testnet
   NEAR_PRIVATE_KEY=ed25519:your_private_key_here
   
   # Logging Level (optional)
   RUST_LOG=info
   ```
   
   **Important:** Replace `your-account.testnet` and `your_private_key_here` with your actual NEAR testnet account credentials. The private key should be in the format `ed25519:...`

## Running the Server

### Development Mode

Run the server in development mode with hot-reloading:

```bash
cargo run
```

The server will start on `http://127.0.0.1:8080` by default.

### Production Mode

Build and run an optimized release build:

```bash
# Build the release binary
cargo build --release

# Run the optimized binary
./target/release/near-playground-backend
```

### Custom Host/Port

Override the default host and port using environment variables:

```bash
HOST=0.0.0.0 PORT=3000 cargo run
```

Or add them to your `.env` file:
```env
HOST=0.0.0.0
PORT=3000
```

## API Endpoints

### Health Check
```http
GET /health
```

Returns the server status and version information.

**Response:**
```json
{
  "success": true,
  "message": "NEAR Playground Backend is running",
  "data": {
    "status": "ok",
    "timestamp": "2026-01-26T10:30:00Z",
    "version": "0.1.0"
  }
}
```

### Compile Contract
```http
POST /compile
Content-Type: application/json
```

**Request Body:**
```json
{
  "user_id": "user123",
  "project_id": "project456",
  "code": "// Your Rust smart contract code here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Compilation completed successfully",
  "data": {
    "success": true,
    "exit_code": 0,
    "stdout": "Compilation output...",
    "stderr": "",
    "details": {
      "duration_ms": 1234,
      "wasm_size": 56789
    },
    "abi": { ... }
  }
}
```

### Deploy Contract
```http
POST /deploy
Content-Type: application/json
```

**Request Body:**
```json
{
  "user_id": "user123",
  "project_id": "project456",
  "account_id": "mycontract.testnet"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Contract deployed successfully",
  "data": {
    "contract_address": "mycontract.testnet",
    "transaction_hash": "ABC123...",
    "explorer_url": "https://explorer.testnet.near.org/transactions/ABC123..."
  }
}
```

### Call Contract Method
```http
POST /method-call
Content-Type: application/json
```

**Request Body:**
```json
{
  "contract_address": "mycontract.testnet",
  "method_name": "get_greeting",
  "args": {},
  "method_type": "view"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Method call completed successfully",
  "data": {
    "result": "Hello, World!",
    "logs": [],
    "gas_used": "2.4 Tgas"
  }
}
```

## Project Structure

```
near-backend/
├── src/
│   ├── main.rs              # Application entry point and server setup
│   ├── handlers.rs          # HTTP request handlers
│   ├── models.rs            # Data models and DTOs
│   ├── utils.rs             # Utility functions
│   └── services/
│       ├── mod.rs           # Services module
│       ├── compilation.rs   # Contract compilation logic
│       ├── deployment.rs    # Contract deployment logic
│       └── method_call.rs   # Contract method invocation logic
├── Cargo.toml               # Rust dependencies and package info
├── .env                    # Environment variables (create from .env.example)
├── .env.example            # Example environment configuration
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## How Deployment Works

The backend uses a **subaccount deployment model**:

1. **Parent Account**: Your configured `NEAR_ACCOUNT_ID` acts as the parent account
2. **Subaccount Creation**: For each deployment, the backend automatically creates a unique subaccount with the format: `{user_id[:6]}-{project_id[:6]}-{timestamp}.{parent_account}`
3. **Contract Deployment**: The compiled WASM contract is deployed to the newly created subaccount
4. **Proof Transfer**: After successful deployment, the subaccount sends 0.03 NEAR back to the parent account as proof of deployment

**Example:**
- Parent account: `softquiche5250.testnet`
- Generated subaccount: `user12-proj34-1737890000.softquiche5250.testnet`

**Requirements:**
- The parent account must have sufficient NEAR balance (at least 2+ NEAR per deployment)
- The private key must have full access permissions

## Key Features

### 1. **Automated Subaccount Management**
The backend automatically creates unique subaccounts for each deployment, avoiding naming conflicts and providing isolated contract environments.

### 2. **Base Project Caching**
On first startup, the server creates a base NEAR project and caches its dependencies. This significantly speeds up subsequent compilations.

### 3. **CORS Support**
The server includes CORS middleware allowing cross-origin requests from any origin.

### 4. **Request Logging**
All requests are logged using the `env_logger` crate for debugging and monitoring.

### 5. **Error Handling**
Comprehensive error handling with detailed error messages and proper HTTP status codes.

## Development

### Running Tests

```bash
cargo test
```

### Checking Code Quality

```bash
# Check for compilation errors
cargo check

# Run clippy for linting
cargo clippy

# Format code
cargo fmt
```

### Enable Debug Logging

Set the `RUST_LOG` environment variable:

```bash
RUST_LOG=debug cargo run
```

Or add to your `.env` file:
```env
RUST_LOG=debug
```

## Getting Your NEAR Credentials

If you need to create a NEAR testnet account or find your private key:

### Creating a New Account

1. **Using NEAR CLI:**
   ```bash
   near login
   ```
   Follow the prompts to create/access your account.

2. **Finding Your Private Key:**
   ```bash
   # Linux/macOS
   cat ~/.near-credentials/testnet/your-account.testnet.json
   
   # Windows
   type %USERPROFILE%\.near-credentials\testnet\your-account.testnet.json
   ```
   
   Look for the `private_key` field in the JSON file.

3. **Fund Your Account:**
   Visit the [NEAR Testnet Faucet](https://near-faucet.io/) to get free testnet NEAR tokens.

**Important:** Each deployment requires ~2 NEAR from your parent account, so make sure you have sufficient balance.

## Troubleshooting

### Issue: "NEAR_ACCOUNT_ID not found in environment"

**Solution:** Ensure your `.env` file exists and contains the required NEAR credentials:
```bash
NEAR_ACCOUNT_ID=your-account.testnet
NEAR_PRIVATE_KEY=ed25519:your_private_key_here
```

### Issue: "Failed to parse private key"

**Solution:** Ensure your private key is in the correct format starting with `ed25519:`. The full key should look like:
```
ed25519:4YUnd6qTdKcVgB5V1ZApjVKzMm2gwXtFTfAnABjFbm6vXGhQvpbNovaLqQTsE7wGTBtArYTazaRwqn9sd4txcAgr
```

### Issue: Deployment fails with "insufficient balance"

**Solution:** Your parent account needs at least 2+ NEAR for each deployment. Check your balance:
```bash
near state your-account.testnet --networkId testnet
```
Fund your account at https://near-faucet.io/

### Issue: "cargo-near not found"

**Solution:** Install cargo-near:
```bash
cargo install cargo-near
```

### Issue: Base project creation fails

**Solution:** Ensure you have sufficient disk space and proper permissions. Try manually creating the base project:
```bash
cargo near new base_project
```

### Issue: Port already in use

**Solution:** Change the port in your `.env` file or kill the process using the port:
```bash
# Linux/macOS
lsof -ti:8080 | xargs kill -9

# Windows (PowerShell)
Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process
```

### Issue: Compilation timeout

**Solution:** Increase system resources or reduce the complexity of the contract being compiled.

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `HOST` | Server host address | `127.0.0.1` | No |
| `PORT` | Server port | `8080` | No |
| `NEAR_ACCOUNT_ID` | NEAR testnet account for deployments | - | **Yes** |
| `NEAR_PRIVATE_KEY` | Private key for the NEAR account (format: `ed25519:...`) | - | **Yes** |
| `RUST_LOG` | Logging level (trace, debug, info, warn, error) | `info` | No |

**Note:** The `NEAR_ACCOUNT_ID` and `NEAR_PRIVATE_KEY` are required for contract deployment functionality. The deployment service creates subaccounts under the parent account and deploys contracts to them.

## Dependencies

Major dependencies include:
- **actix-web** (4.4) - Web framework
- **actix-cors** (0.6) - CORS middleware
- **tokio** (1.0) - Async runtime
- **serde** (1.0) - Serialization/deserialization
- **near-jsonrpc-client** (0.6) - NEAR RPC client
- **near-primitives** (0.17) - NEAR protocol primitives
- **near-crypto** (0.17) - Cryptographic operations

See `Cargo.toml` for a complete list.

## Performance Considerations

- **First compilation** may take longer due to dependency caching
- **Subsequent compilations** use cached dependencies for faster builds
- The server creates temporary directories for each compilation that are cleaned up automatically

## Security Notes

⚠️ **CRITICAL Security Considerations:**

1. **Private Key Protection**: 
   - **NEVER commit your `.env` file to version control** (it's in `.gitignore` by default)
   - The `.env` file contains your NEAR private key which has full access to your account
   - If compromised, an attacker can drain your account and all subaccounts
   - Use environment variables or secret management services in production

2. **Arbitrary Code Compilation**: 
   - This server compiles and executes arbitrary code
   - Deploy only in isolated, sandboxed environments
   - Do not expose this service directly to the internet without proper security controls

3. **CORS Configuration**: 
   - Currently configured to allow all origins (`allow_any_origin()`)
   - Restrict this to specific trusted domains in production

4. **Authentication**: 
   - No authentication is currently implemented
   - Add authentication middleware before deploying to production
   - Consider rate limiting to prevent abuse

5. **Account Balance**: 
   - Monitor your parent account balance regularly
   - Each deployment costs ~2 NEAR (most is transferred to the subaccount)
   - Set up alerts for low balance conditions

**Best Practices:**
- Use a dedicated testnet account for development
- Never use mainnet credentials for testing
- Regularly rotate your private keys
- Implement proper access controls and monitoring

## Contributing

When contributing to this backend:

1. Follow Rust naming conventions
2. Add tests for new functionality
3. Update this README for any API changes
4. Run `cargo fmt` and `cargo clippy` before committing

## License

[Specify your license here]

## Support

For issues or questions:
- Check the [NEAR Documentation](https://docs.near.org)
- Open an issue in the repository
- Join the [NEAR Discord](https://discord.gg/near)
