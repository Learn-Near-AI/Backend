# Contributing to NEAR-by-Example Backend

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Getting Started

### Prerequisites

- **Node.js** 20+
- **Rust** 1.86 (for local contract compilation; or use Docker)
- **cargo-near** and **binaryen** (installed automatically in Docker)

### Local Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd learning-near
   ```

2. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your NEAR credentials (required for deploy/call/view tests)
   ```

4. **Run the server**
   ```bash
   npm start
   ```

5. **Run tests** (in a separate terminal)
   ```bash
   npm test
   ```

## How to Contribute

### Reporting Bugs

- Use the issue tracker to report bugs
- Include steps to reproduce, expected vs actual behavior, and your environment (OS, Node version)
- Check existing issues first to avoid duplicates

### Suggesting Features

- Open an issue with the `enhancement` label
- Describe the use case and proposed solution
- Be open to discussion and feedback

### Submitting Changes

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b fix/your-fix-name
   # or
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following the existing code style:
   - Use ES modules (`import`/`export`)
   - Add JSDoc for new functions
   - Keep controllers thin; put logic in services

3. **Ensure tests pass**:
   ```bash
   npm test
   ```

4. **Commit** with clear messages:
   ```bash
   git commit -m "fix: resolve compile timeout on large contracts"
   git commit -m "feat: add support for custom init args validation"
   ```

5. **Push** and open a Pull Request:
   ```bash
   git push origin fix/your-fix-name
   ```

6. **Describe your PR** in the description:
   - What was changed and why
   - How to test the changes
   - Any breaking changes

### Code Style

- **JavaScript**: Use async/await for promise handling; avoid callback-style
- **Error handling**: Use `AppError` subclasses where appropriate; pass errors to `next(err)` in controllers
- **Validation**: Add validation in `validate.js` for new request body fields

### Project Structure

- `src/routes/` – Route definitions
- `src/controllers/` – Request handlers (thin)
- `src/services/` – Business logic
- `src/middleware/` – Cross-cutting concerns (validation, rate limit, auth)
- `src/errors/` – Custom error types

## Questions?

Open an issue with the `question` label for general questions or clarifications.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
