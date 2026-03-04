# DHR — Discord Hashrate Rental Bot (scaffold)

Skeleton for a Discord bot that lets users quote and rent hashrate. Pricing stubs for NiceHash/Braiins/internal capacity; pool allowlist; basic slash commands.

## Stack
- Node.js + TypeScript
- discord.js
- Pricing stubs (NiceHash, Braiins, internal) — TODO: implement API calls

## Commands
- `/quote ph:<number> hours:<int> pool:<stratum url> worker:<name>` — get a quote
- `/rent ph:<number> hours:<int> pool:<stratum url> worker:<name>` — place an order (stub)
- `/status id:<order-id>` — check status (in-memory)
- `/cancel id:<order-id>` — cancel if not active

## Setup
1. Install deps: `npm install`
2. Copy env: `cp .env.example .env` and fill values:
   - `DISCORD_TOKEN`, `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`
   - Marketplace creds (NiceHash/Braiins) if used
   - `ALLOWED_POOLS` comma-separated allowlist
   - `PRICE_MARGIN_BPS` (e.g., 500 = +5%) and `FLOOR_USD_PER_PH_DAY`
3. Register commands and run bot:
   - Dev: `npm run dev`
   - Prod: `npm run build && npm start`

## TODO
- Implement Braiins market quote calls
- Payment flow (Lightning/on-chain) and fulfillment via proxy (deferred for now)
- Add SLA tracking and under-delivery credits
- Harden pool validation (host:port regex, allowed list/blocklist)
