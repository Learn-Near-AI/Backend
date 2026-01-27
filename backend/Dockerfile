# Use Node.js LTS version
FROM node:20-slim

# Install Rust and Cargo (needed to compile user-submitted Rust contracts on-demand)
# The backend is Node.js, but it compiles Rust code via cargo build
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libudev-dev \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Add Rust to PATH
ENV PATH="/root/.cargo/bin:${PATH}"

# Install wasm32-unknown-unknown target for NEAR contract compilation
RUN rustup target add wasm32-unknown-unknown

# Install cargo-near (NEAR-specific Cargo plugin for contract compilation and ABI generation)
RUN cargo install cargo-near --locked

# Install binaryen (provides wasm-opt for WASM optimization)
RUN npm install -g binaryen

# Install NEAR CLI (new near-cli-rs) globally (for manual/testing purposes)
# Note: For automated backend operations, we use near-api-js programmatically
RUN npm install -g near-cli-rs@latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port (fly.io will set PORT env var)
EXPOSE 3001

# Start the server
CMD ["node", "server.js"]
