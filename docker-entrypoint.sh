#!/bin/sh

# Run migrations (creates tables if not exist)
npm run db:migrate

# Seed route data from topo-data.json (best-effort — server starts even if seed fails)
npm run db:seed || echo "WARNING: Seed failed, continuing with existing data"

# Start the server
exec npm run server:start
