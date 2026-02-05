# NEAR Contract Compiler Backend

Express server for compiling and deploying NEAR smart contracts (JavaScript/TypeScript).

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your NEAR credentials (for deploy/call/view)
```

**Windows:** Use `npm install --ignore-scripts` to avoid near-sdk-js post-install failures. JS/TS compilation requires Linux/Mac or Fly.io deployment.

## Running

```bash
npm run dev    # Development
npm start      # Production
```

Server runs on `http://localhost:3001` (or `PORT` env var).

## Development

```bash
npm test           # Run tests
npm run lint       # Lint
npm run lint:fix   # Fix lint issues
npm run format     # Format with Prettier
npm run format:check
```

## Project Structure

```
backend/
├── src/
│   ├── config/         # Configuration
│   ├── middleware/     # Validation, error handling, rate limiting, logging
│   ├── routes/        # API route handlers
│   ├── services/      # Business logic (compile, deploy)
│   ├── utils/         # Logger
│   └── app.js         # Express app
├── build-contract-optimized.js   # JS/TS compilation
├── deploy-contract.js            # NEAR CLI deployment
├── server.js                     # Entry point
├── tests/
├── docs/
│   └── openapi.yaml   # API specification
└── package.json
```

## API Reference

All endpoints under `/api/`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (status, version, environment) |
| GET | `/api/health/live` | Liveness probe |
| GET | `/api/health/ready` | Readiness probe |
| POST | `/api/compile` | Compile contract (rate limited: 20/min) |
| POST | `/api/deploy` | Deploy contract (rate limited: 10/min) |
| POST | `/api/contract/call` | Call contract method |
| POST | `/api/contract/view` | View contract method |
| GET | `/api/near/status` | NEAR credentials status |

### Compile

**POST /api/compile**

```json
{ "code": "string", "language": "JavaScript" | "TypeScript", "projectId": "optional" }
```

Returns: `{ success, wasm, size }`

### Deploy

**POST /api/deploy**

```json
{ "wasmBase64": "string", "contractAccountId": "optional", "initMethod": "optional", "initArgs": {} }
```

### Contract Call/View

**POST /api/contract/call** – `{ contractAccountId, methodName, args?, accountId?, deposit?, gas? }`

**POST /api/contract/view** – `{ contractAccountId, methodName, args? }`

### Error Response Format

```json
{ "error": "message", "code": "ERROR_CODE", "details": [] }
```

Codes: `VALIDATION_ERROR`, `COMPILATION_FAILED`, `RATE_LIMIT_EXCEEDED`, `SERVICE_UNAVAILABLE`, `NOT_FOUND`, `INTERNAL_ERROR`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Server port |
| NODE_ENV | development | Environment |
| CORS_ORIGIN | * | Allowed origins (comma-separated) |
| NEAR_ACCOUNT_ID | - | NEAR account (required for deploy) |
| NEAR_PRIVATE_KEY | - | Private key (ed25519:...) |
| NEAR_NETWORK | testnet | testnet or mainnet |
| RATE_LIMIT_MAX | 100 | General requests per window |
| RATE_LIMIT_COMPILE_MAX | 20 | Compile requests per window |
| RATE_LIMIT_DEPLOY_MAX | 10 | Deploy requests per window |
| LOG_LEVEL | info | debug, info, warn, error |

---

## Contributing

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Make changes, add tests
4. Run `npm test` and `npm run lint`
5. Commit with clear messages
6. Push and open a Pull Request

### PR Process

- Ensure all tests pass
- Update README if adding/changing API
- Keep PRs focused and reasonably sized

### Setup for Development

```bash
git clone <repo>
cd backend
npm install --ignore-scripts  # On Windows
npm test
```

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and harassment-free experience for everyone. We expect participants to:

- Be respectful and inclusive
- Accept constructive criticism gracefully
- Focus on what is best for the community

### Unacceptable Behavior

Harassment, trolling, discriminatory language, or personal attacks are not tolerated.

### Enforcement

Violations may result in temporary or permanent ban from the project. Report issues to the maintainers.

---

## Changelog

### [1.0.0] - 2025-02-05

- Initial release
- Compile JavaScript/TypeScript NEAR contracts
- Deploy, call, view contracts via NEAR CLI
- Rate limiting, structured logging, error handling
- Health endpoints (live, ready)
- OpenAPI documentation
