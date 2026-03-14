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

# Run migrations
RUN npm run db:migrate

# Seed with route data
RUN npm run db:seed

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

CMD ["npm", "run", "server:start"]
