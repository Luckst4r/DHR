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

async function btcUsd(): Promise<number> {
  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
  if (!res.ok) throw new Error('btc price failed');
  const data: any = await res.json();
  const price = data?.bitcoin?.usd;
  if (typeof price !== 'number') throw new Error('btc price missing');
  return price;
}

async function quoteNicehash(input: QuoteInput): Promise<QuoteResult> {
  const key = process.env.NICEHASH_API_KEY;
  const secret = process.env.NICEHASH_API_SECRET;
  const org = process.env.NICEHASH_ORG_ID;
  if (!key || !secret || !org) {
    return { usdPerPhDay: Number.POSITIVE_INFINITY, totalUsd: Number.POSITIVE_INFINITY, source: 'nicehash' };
  }
  try {
    // Use public orderBook for SHA256ASICBOOST; price is BTC/TH/day. Convert to USD/PH/day.
    const res = await fetch('https://api2.nicehash.com/main/api/v2/hashpower/orderBook?algorithm=SHA256ASICBOOST&page=0&pageSize=10');
    if (!res.ok) throw new Error('nicehash orderBook failed');
    const data: any = await res.json();
    const orders = data?.stats?.orders ?? data?.orderList ?? [];
    const prices = Array.isArray(orders)
      ? orders
          .map((o: any) => Number(o.price))
          .filter((n: number) => !isNaN(n))
      : [];
    if (prices.length === 0) throw new Error('no prices');
    const bestBtcPerThDay = Math.min(...prices);
    const btcPrice = await btcUsd();
    const usdPerPhDay = bestBtcPerThDay * 1000 * btcPrice; // TH->PH
    return { usdPerPhDay, totalUsd: usdPerPhDay * (input.ph * (input.hours / 24)), source: 'nicehash' };
  } catch (err) {
    console.error('nicehash quote error', err);
    return { usdPerPhDay: Number.POSITIVE_INFINITY, totalUsd: Number.POSITIVE_INFINITY, source: 'nicehash' };
  }
}

async function quoteBraiinshash(_input: QuoteInput): Promise<QuoteResult> {
  const owner = process.env.BRAIINS_OWNER_TOKEN;
  if (!owner) return { usdPerPhDay: Number.POSITIVE_INFINITY, totalUsd: Number.POSITIVE_INFINITY, source: 'braiins' };
  try {
    // Placeholder: Braiins hashrate market API not wired; return Infinity until implemented.
    return { usdPerPhDay: Number.POSITIVE_INFINITY, totalUsd: Number.POSITIVE_INFINITY, source: 'braiins' };
  } catch (err) {
    console.error('braiins quote error', err);
    return { usdPerPhDay: Number.POSITIVE_INFINITY, totalUsd: Number.POSITIVE_INFINITY, source: 'braiins' };
  }
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
    const data: any = await res.json();
    if (typeof data.usdPerPhDay !== 'number') throw new Error('bad capacity quote');
    return { usdPerPhDay: data.usdPerPhDay, totalUsd: data.usdPerPhDay * (input.ph * (input.hours / 24)), source: 'internal' };
  } catch (err) {
    console.error('internal quote error', err);
    return { usdPerPhDay: Number.POSITIVE_INFINITY, totalUsd: Number.POSITIVE_INFINITY, source: 'internal' };
  }
}
