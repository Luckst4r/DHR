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

export async function getNhBuyInfo(algo: string = 'SHA256ASICBOOST'): Promise<NhBuyInfo> {
  const res = await fetch('https://api2.nicehash.com/main/api/v2/public/buy/info');
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`buy/info http ${res.status} body=${txt}`);
  }
  const data: any = await res.json();
  const algos: any[] = data?.algorithms ?? data?.miningAlgorithms ?? [];
  const entry = algos.find((a) => (a.algorithm || a.algo || '').toUpperCase() === algo.toUpperCase());
  if (!entry) throw new Error(`algo ${algo} not found in buy/info`);
  const markets: NhMarketInfo[] = (entry?.markets || entry?.market || []).map((m: any) => ({
    market: (m.market || m.name || '').toUpperCase(),
    marketFactor: Number(m.marketFactor || m.factor || m.market_factor || 0),
    displayMarketFactor: m.displayMarketFactor || m.marketDisplayFactor || '',
    priceFactor: Number(m.priceFactor || m.price_factor || 0),
    displayPriceFactor: m.displayPriceFactor || m.priceDisplayFactor || '',
    minAmount: Number(m.minAmount || m.minimumAmount || 0),
    minPrice: Number(m.minPrice || m.minimumPrice || 0),
    fixedPrice: Number(m.fixedPrice || m.fixed_price || 0) || undefined,
    algorithm: entry.algorithm || entry.algo,
  }));
  return { algo: entry.algorithm || entry.algo, markets, raw: data };
}
