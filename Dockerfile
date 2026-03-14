FROM node:20-slim

WORKDIR /app

# Install build deps for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files and install
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server/ server/
COPY data/topo-data.json data/topo-data.json

# Create data directory for SQLite
RUN mkdir -p server/data

# Copy entrypoint (runs migrations + seed on start, so volume-mounted DB gets them)
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

ENTRYPOINT ["/docker-entrypoint.sh"]
