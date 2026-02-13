# NEAR-by-Example Backend

Backend service for compiling Rust NEAR smart contracts and deploying them to NEAR TestNet. Provides REST API endpoints for compile, deploy, and contract interaction.

---

## Architecture

The backend follows a layered architecture for maintainability and testability:

```
backend/
├── src/
│   ├── config/          # Environment-based config
│   ├── routes/          # Route definitions
│   ├── controllers/     # Request handlers
│   ├── services/        # Business logic (compile, deploy, buildRustContract)
│   ├── middleware/      # Auth, validation, rate limit, error handling
│   ├── utils/           # Shared helpers
│   ├── errors/          # Custom error types
│   ├── index.js         # App entry
│   └── server.js        # Process entry (starts server)
├── scripts/             # Shell scripts
│   ├── start-server-with-credentials.sh
│   └── test-wsl-endpoints.sh
├── base-project/        # Rust template for contract compilation
├── package.json
├── Dockerfile
└── fly.toml
```

- **Routes** → **Controllers** → **Services** → External (NEAR, filesystem)
- **Middleware**: request logging, rate limiting, validation, error handling
- **Config**: all settings from environment variables

---

## Configuration

Configuration is loaded from environment variables.

### Setup

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set your NEAR credentials:
   ```
   NEAR_ACCOUNT_ID=your-account.testnet
   NEAR_PRIVATE_KEY=ed25519:your-private-key
   NEAR_NETWORK=testnet
   ```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3001 | Server port |
| `HOST` | No | 0.0.0.0 | Bind address |
| `NODE_ENV` | No | development | `development` or `production` |
| `NEAR_ACCOUNT_ID` | Yes* | - | NEAR account for deploy/call/view |
| `NEAR_PRIVATE_KEY` | Yes* | - | Ed25519 private key |
| `NEAR_NETWORK` | No | testnet | `testnet` or `mainnet` |
| `NEAR_NODE_URL` | No | auto | RPC URL (defaults by network) |
| `CORS_ORIGINS` | No | * | Comma-separated origins or `*` |
| `RATE_LIMIT_WINDOW_MS` | No | 60000 | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | No | 30 | General API limit per window |
| `RATE_LIMIT_COMPILE_MAX` | No | 5 | Compile limit per window |
| `RATE_LIMIT_DEPLOY_MAX` | No | 10 | Deploy limit per window |
| `MAX_CODE_LENGTH` | No | 500000 | Max Rust source length |
| `MAX_WASM_BASE64_LENGTH` | No | 6000000 | Max WASM base64 length |
| `LOG_LEVEL` | No | info | `debug`, `info`, `warn`, `error` |

\* Required for deploy, call, and view endpoints. Compile and health work without them.

---

## Security

### Implemented

- **No secrets in code** – credentials from environment only
- **Rate limiting** – per-endpoint limits to prevent abuse
- **Input validation** – schema validation on all request bodies
- **Helmet** – security headers (CSP disabled for API compatibility)
- **CORS** – configurable allowed origins
- **Request size limits** – JSON body and code/WASM size caps

### Rate Limits

| Endpoint | Default Limit |
|----------|---------------|
| General (health, status, call, view) | 30 req/min |
| Compile | 5 req/min |
| Deploy | 10 req/min |

---

## API Design

### Base URL

All endpoints are under `/api`.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/near/status` | NEAR configuration status |
| POST | `/api/compile` | Compile Rust contract to WASM |
| POST | `/api/deploy` | Deploy WASM to NEAR |
| POST | `/api/contract/call` | Call contract change method |
| POST | `/api/contract/view` | Call contract view method |

### OpenAPI Specification

An OpenAPI 3.0 spec is available at `openapi.yaml`. Use it with Swagger UI, Postman, or code generators.

### Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing or invalid field"
  },
  "requestId": "uuid"
}
```

### Compile (Rust only)

**Request:**
```json
{
  "code": "use near_sdk::near; ...",
  "language": "Rust",
  "projectId": "optional-id"
}
```

**Response:** `wasm` (base64), `size`, `abi`, `compilation_time`, etc.

### Deploy

**Request:**
```json
{
  "wasmBase64": "...",
  "contractAccountId": "optional",
  "initMethod": "new",
  "initArgs": {},
  "useSubaccount": true,
  "userId": "user",
  "projectId": "project"
}
```

---

## Logging

Structured logging with [Pino](https://getpino.io/).

- **Development**: Pretty-printed, colorized output
- **Production**: JSON logs for aggregation
- **Request ID**: Each request gets `X-Request-Id` for tracing

### Log Levels

Set via `LOG_LEVEL` env var: `debug`, `info`, `warn`, `error`.

---

## Error Handling

- **Central middleware** – all errors pass through `errorHandler`
- **Consistent format** – `{ success: false, error: { code, message } }`
- **No stack traces in production** – internal details hidden
- **Validation errors** – 400 with `VALIDATION_ERROR` code
- **Rate limit** – 429 with `RATE_LIMIT_EXCEEDED` code

---

## Running the Server

### Local (with credentials)

```bash
# Using .env file
cp .env.example .env
# Edit .env with your NEAR credentials
npm start

# Or with shell script (sources .env if present)
./scripts/start-server-with-credentials.sh
```

### Docker

```bash
docker build -t near-backend .
docker run -p 3001:3001 \
  -e NEAR_ACCOUNT_ID=your-account.testnet \
  -e NEAR_PRIVATE_KEY=ed25519:your-key \
  -e NEAR_NETWORK=testnet \
  near-backend
```

### Fly.io

Deploy with `flyctl deploy`. Set secrets:

```bash
fly secrets set NEAR_ACCOUNT_ID=your-account.testnet
fly secrets set NEAR_PRIVATE_KEY=ed25519:your-key
fly secrets set NEAR_NETWORK=testnet
```

---

## Requirements

- Node.js 20+
- Rust 1.86 (installed in Docker; for local dev, use Docker or install Rust)
- cargo-near, binaryen (installed in Docker)

---

## Compile Support

**Rust only.** The frontend defaults to Rust. Use `language: "Rust"` in compile requests.

---

## Scripts

| Script | Description |
|--------|-------------|
| `./scripts/start-server-with-credentials.sh` | Start server with NEAR credentials from .env |
| `./scripts/test-wsl-endpoints.sh` | Run endpoint tests against local backend (or `npm test`) |

**Local testing:** The test script defaults to `http://localhost:3001`. Start the backend with `npm start` in one terminal, then run `npm test` in another. **When using WSL:** run both the backend and tests from WSL so `localhost` works; if the backend runs on Windows, use `BACKEND_URL=http://$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):3001 npm test` to reach it.
