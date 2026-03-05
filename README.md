# DHR — Discord Hashrate Rental Bot

## What’s working
- Discord bot with slash commands: /quote, /rent, /status, /cancel, /mark_paid (admin).
- Quotes: price from NiceHash + Braiins with fee/margin/buffer breakdown; BTC price fallback; pool validation and size/duration caps; payment instructions (USDC Base, USDC Solana, BTC); buffer baked in and shown.
- Persistence: SQLite orders with NH metadata + expiry; status/cancel/mark_paid guarded.
- Balance gates: Braiins (on-chain address via mempool) and NiceHash (wrapper balance with override option); gate can skip NH if desired.
- Fulfillment: /mark_paid tries Braiins spot bid first, then falls back to NiceHash order creation; stores NH metadata; schedules cancel at expiry.
- Pool management: NiceHash pool create/reuse helper (cached by host/port/user); allowlist + regex validation for pools.
- Comments added across core files for handoff (index.ts, pricing.ts, balances.ts, orders.ts, nh.ts, nhOrder.ts, braiins.ts, pool.ts).

## Current blockers / known issues
- Braiins spot API: current tokens/host return 404 on /spot/settings/orderbook; spot/bid not yet succeeding. Needs working Braiins API base/token with spot access.
- NiceHash fallback: buy/info sometimes misses USA; fallback now forces a matched market or the first market, but needs testing; NH auth can still hiccup (override exists for gating).
- Order cancel timers are in-memory; on bot restart, scheduled cancels won’t fire (needs persistent scheduler/cron).
- Concurrent rentals: not isolated; timers/fulfillment could overlap; needs queueing or per-order tracking.
- MiningRigRentals integration: not yet integrated; consider adding as provider/fallback.

## Commands (current)
- `/quote ph:<number> hours:<int>` — price with breakdown (base/fee/margin/buffer).
- `/rent ph:<number> hours:<int> pool:<stratum url> worker:<name>` — place order, gate on balances, lock quote, return payment instructions.
- `/status id:<order-id>` — check status (DB-backed).
- `/cancel id:<order-id>` — cancel if not active.
- `/mark_paid id:<order-id>` — admin only; Braiins order first, NH fallback.

## Setup
1) Install deps: `npm install`
2) Copy env: `cp .env.example .env` and fill values:
   - Discord: `DISCORD_TOKEN`, `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`
   - NiceHash: `NICEHASH_API_KEY`, `NICEHASH_API_SECRET`, `NICEHASH_ORG_ID`; optional `NICEHASH_BAL_OVERRIDE_BTC`, `NICEHASH_GATE_ENABLED`
   - Braiins: `BRAIINS_OWNER_TOKEN` or `BRAIINS_READONLY_TOKEN` (spot), optional `BRAIINS_BASE`
   - Payments: `PAYMENT_USDC_BASE`, `PAYMENT_USDC_SOL`, `PAYMENT_BTC_ONCHAIN`
   - Pricing: `PRICE_MARGIN_BPS`, `BETA_BUFFER_BPS`, `NICEHASH_FEE_BPS`, `BRAIINS_FEE_BPS`, `FLOOR_USD_PER_PH_DAY`
   - Gates/Caps: `MIN_PH`, `MAX_PH`, `MIN_HOURS`, `MAX_HOURS`, `ADMIN_USER_IDS`, `ALLOWED_POOLS`
3) Run: `npm run dev` (dev) or `npm run build && npm start` (prod)

## Remaining TODO
- Fix Braiins spot ordering (working base/token) and Braiins quoting.
- Harden NH fallback and auth; remove overrides once stable.
- Persist/cancel timers across restarts; add SLA tracking and under-delivery handling.
- Support concurrent rentals cleanly (per-order timers/fulfillment jobs).
- (Deferred) Payment verification (LN/on-chain) and proxy fulfillment.
