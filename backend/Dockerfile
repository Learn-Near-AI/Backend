# Node.js backend for NEAR JS/TS contract compilation
FROM node:20-slim

# Install curl for health checks
RUN apt-get update && \
    apt-get install -y curl ca-certificates procps && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies (including dev dependencies for esbuild)
RUN npm ci

# Install NEAR CLI globally
RUN npm install -g near-cli

# Copy backend source code
COPY . .

# Create necessary directories for builds and NEAR credentials
RUN mkdir -p temp-builds persistent-builds /root/.near-credentials

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
