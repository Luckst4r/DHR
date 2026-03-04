import fetch from 'node-fetch';

interface QuoteInput {
  ph: number;
  hours: number;
  pool: string;
  worker: string;
}

interface QuoteResult {
  usdPerPhDay: number;
  totalUsd: number;
  source: string;
}

const marginBps = Number(process.env.PRICE_MARGIN_BPS ?? '0');
const floorUsdPerPhDay = Number(process.env.FLOOR_USD_PER_PH_DAY ?? '0');

export async function quoteHashrate(input: QuoteInput): Promise<QuoteResult> {
  const marketQuotes = await Promise.allSettled([
    quoteNicehash(input),
    quoteBraiinshash(input),
    quoteInternal(input),
  ]);

  const valid = marketQuotes
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<QuoteResult>).value)
    .filter((q) => !isNaN(q.usdPerPhDay));

  if (valid.length === 0) {
    throw new Error('No quotes available');
  }

  // pick cheapest
  let best = valid.reduce((a, b) => (a.usdPerPhDay <= b.usdPerPhDay ? a : b));

  // apply margin and floor
  const marginMult = 1 + marginBps / 10_000;
  const adjusted = Math.max(best.usdPerPhDay * marginMult, floorUsdPerPhDay);
  const totalUsd = adjusted * (input.ph * (input.hours / 24));

  best = {
    ...best,
    usdPerPhDay: adjusted,
    totalUsd,
  };

  return best;
}

async function quoteNicehash(_input: QuoteInput): Promise<QuoteResult> {
  // Stub: implement NiceHash API call with key/secret/org
  // Return NaN if unavailable
  return { usdPerPhDay: Number.POSITIVE_INFINITY, totalUsd: Number.POSITIVE_INFINITY, source: 'nicehash' };
}

async function quoteBraiinshash(_input: QuoteInput): Promise<QuoteResult> {
  // Stub: implement Braiins Hashrate market quote
  return { usdPerPhDay: Number.POSITIVE_INFINITY, totalUsd: Number.POSITIVE_INFINITY, source: 'braiins' };
}

async function quoteInternal(input: QuoteInput): Promise<QuoteResult> {
  // Stub: call your internal capacity API if available
  const url = process.env.INTERNAL_CAPACITY_API;
  const token = process.env.INTERNAL_CAPACITY_TOKEN;
  if (!url || !token) {
    return { usdPerPhDay: Number.POSITIVE_INFINITY, totalUsd: Number.POSITIVE_INFINITY, source: 'internal' };
  }
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('capacity api error');
    const data = await res.json();
    if (typeof data.usdPerPhDay !== 'number') throw new Error('bad capacity quote');
    return { usdPerPhDay: data.usdPerPhDay, totalUsd: data.usdPerPhDay * (input.ph * (input.hours / 24)), source: 'internal' };
  } catch (err) {
    console.error('internal quote error', err);
    return { usdPerPhDay: Number.POSITIVE_INFINITY, totalUsd: Number.POSITIVE_INFINITY, source: 'internal' };
  }
}
