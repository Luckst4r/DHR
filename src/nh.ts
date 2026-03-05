import fetch from 'node-fetch';

export interface NhMarketInfo {
  market: string;
  marketFactor: number;
  displayMarketFactor: string;
  priceFactor: number;
  displayPriceFactor: string;
  minAmount?: number;
  minPrice?: number;
  fixedPrice?: number;
  algorithm?: string;
}

export interface NhBuyInfo {
  algo: string;
  markets: NhMarketInfo[];
  raw: any;
}

export function buildNhOrderParams({
  ph,
  hours,
  usdPerPhDay,
  market,
  algo = 'SHA256ASICBOOST',
  btcPrice,
  buyInfo,
}: {
  ph: number;
  hours: number;
  usdPerPhDay: number;
  market: string;
  algo?: string;
  btcPrice: number;
  buyInfo: NhBuyInfo;
}) {
  if (!isFinite(ph) || ph <= 0) throw new Error('bad ph');
  if (!isFinite(hours) || hours <= 0) throw new Error('bad hours');
  if (!isFinite(usdPerPhDay) || usdPerPhDay <= 0) throw new Error('bad usdPerPhDay');
  if (!isFinite(btcPrice) || btcPrice <= 0) throw new Error('bad btcPrice');

  const marketUpper = market.toUpperCase();
  const m = buyInfo.markets.find((x) => x.market === marketUpper);
  if (!m) throw new Error(`market ${marketUpper} not in buyInfo`);

  // price in BTC per EH/day for SHA256ASICBOOST
  const priceBtcPerEhDay = (usdPerPhDay / btcPrice) * 1000;
  const limitEh = ph / 1000; // PH -> EH/s
  const amountBtc = priceBtcPerEhDay * limitEh * (hours / 24);

  const price = priceBtcPerEhDay; // NH expects BTC per factor/day; factor is EH for SHA256
  const limit = limitEh; // EH/s
  const amount = amountBtc;

  return { price, limit, amount, market: marketUpper, algo };
}

function algoCode(a: any): string {
  if (!a) return '';
  if (typeof a === 'string') return a;
  if (typeof a.algorithm === 'string') return a.algorithm;
  if (typeof a.algo === 'string') return a.algo;
  if (typeof a.code === 'string') return a.code;
  if (typeof a.name === 'string') return a.name;
  if (typeof a.enumCode === 'string') return a.enumCode;
  return '';
}

export async function getNhBuyInfo(algo: string = 'SHA256ASICBOOST'): Promise<NhBuyInfo> {
  const res = await fetch('https://api2.nicehash.com/main/api/v2/public/buy/info');
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`buy/info http ${res.status} body=${txt}`);
  }
  const data: any = await res.json();
  const algos: any[] = data?.algorithms ?? data?.miningAlgorithms ?? [];
  const entry = algos.find((a) => algoCode(a).toUpperCase() === algo.toUpperCase());
  if (!entry) throw new Error(`algo ${algo} not found in buy/info`);
  const entryAlgo = algoCode(entry);
  const markets: NhMarketInfo[] = (entry?.markets || entry?.market || []).map((m: any) => ({
    market: (m.market || m.name || '').toUpperCase(),
    marketFactor: Number(m.marketFactor || m.factor || m.market_factor || 0),
    displayMarketFactor: m.displayMarketFactor || m.marketDisplayFactor || '',
    priceFactor: Number(m.priceFactor || m.price_factor || 0),
    displayPriceFactor: m.displayPriceFactor || m.priceDisplayFactor || '',
    minAmount: Number(m.minAmount || m.minimumAmount || 0),
    minPrice: Number(m.minPrice || m.minimumPrice || 0),
    fixedPrice: Number(m.fixedPrice || m.fixed_price || 0) || undefined,
    algorithm: entryAlgo,
  }));
  return { algo: entryAlgo, markets, raw: data };
}

export async function fetchOrderbook(algo: string, market: string): Promise<number> {
  const url = `https://api2.nicehash.com/main/api/v2/hashpower/orderBook?algorithm=${encodeURIComponent(algo)}&market=${market}&page=0&pageSize=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`orderBook ${market} http ${res.status}`);
  const data: any = await res.json();
  const orders = data?.stats?.orders ?? data?.orderList ?? [];
  const prices = Array.isArray(orders)
    ? orders
        .map((o: any) => Number(o.price))
        .filter((n: number) => !isNaN(n))
    : [];
  if (!prices.length) throw new Error(`orderBook ${market} no prices`);
  return Math.min(...prices); // BTC per EH/day
}

export async function getNhBestMarketPrice(algo: string = 'SHA256ASICBOOST'): Promise<{ market: string; btcPerEhDay: number }> {
  const markets = ['USA', 'EU'];
  const results = await Promise.allSettled(markets.map((m) => fetchOrderbook(algo, m)));
  const priced: { market: string; btcPerEhDay: number }[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && isFinite(r.value)) priced.push({ market: markets[i], btcPerEhDay: r.value });
  });
  if (!priced.length) throw new Error('No market prices available');
  priced.sort((a, b) => a.btcPerEhDay - b.btcPerEhDay);
  return priced[0];
}
