#!/bin/sh
set -e

# Run migrations (creates tables if not exist)
npm run db:migrate

# Seed route data from topo-data.json (idempotent — clears and re-seeds routes)
npm run db:seed

# Start the server
exec npm run server:start
