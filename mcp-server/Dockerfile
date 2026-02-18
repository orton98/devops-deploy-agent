FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm install --include=dev && \
    node_modules/.bin/tsc && \
    npm prune --production

# Run the MCP server
CMD ["node", "dist/index.js"]
