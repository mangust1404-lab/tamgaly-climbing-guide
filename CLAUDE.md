# Tamgaly Climbing Guide

Offline-first PWA climbing guide (React 19 + Vite + Dexie) with a Hono + SQLite API. Overview, API and structure: README.md.

## Commands

- Type check: `./node_modules/.bin/tsc --noEmit`
- Tests: `npm test` (vitest; covers geo, scoring, utils only)
- Lint: `npm run lint`
- Build: `VITE_BASE=/ npx vite build`
- Dev: `npm run dev` (5173) + `npm run server:dev` (3001)

## Rules

- `data/topo-data.json` in the repo is NOT the source of truth in prod — the admin panel saves to `/var/www/tamgaly/data/` on the VPS. Never overwrite the prod copy from the repo.
- Never run `./deploy.sh` or ssh to the VPS without explicit user confirmation — it is production.
- `deploy.sh` must only ever delete `/var/www/tamgaly/assets/`; never `data/`, `topo-images/`, `avatars/`, `posts/`.
- Secrets live only in `/opt/tamgaly-api/.env` on the VPS (template: `.env.example`). Never hardcode them in scripts or code.
- Scoring dedup goes through `ascentDedupKey()` in `src/lib/utils.ts` — use it in every place that counts scored ascents (Profile, PublicProfile, Leaderboard), don't key by route id or name directly.
- All user-facing strings go through `src/lib/i18n.tsx` with ru, en and kk variants.
- Commit messages in English; explain the why.
