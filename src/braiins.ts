import fetch from 'node-fetch';

export interface BraiinsSettings {
  hrUnit: string;
  hrUnitToPhDay: number;
  raw: any;
}

export interface BraiinsOrderbook {
  asks: { price_sat: number }[];
  raw: any;
}

export interface BraiinsOrderParams {
  priceSatPerUnit: number; // sats per hr_unit
  limitUnit: number; // hr_unit/s equivalent of requested PH
  amountBtc: number; // estimated cost for window at price cap
}

function parseHrUnit(unit: string): number {
  const u = unit.toLowerCase();
  if (u.includes('ph/day')) return 1;
  if (u.includes('eh/day')) return 1000;
  if (u.includes('th/day')) return 0.001;
  return NaN;
}

export async function getBraiinsSettings(token: string): Promise<BraiinsSettings> {
  const res = await fetch('https://hashpower.braiins.com/api/v1/spot/settings', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`braiins settings http ${res.status}`);
  const data: any = await res.json();
  const hrUnit: string = data?.hr_unit ?? '';
  const hrUnitToPhDay = parseHrUnit(hrUnit);
  if (!isFinite(hrUnitToPhDay) || hrUnitToPhDay <= 0) throw new Error('braiins hr_unit unknown');
  return { hrUnit, hrUnitToPhDay, raw: data };
}

export async function getBraiinsOrderbook(token: string): Promise<BraiinsOrderbook> {
  const res = await fetch('https://hashpower.braiins.com/api/v1/spot/orderbook', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`braiins orderbook http ${res.status}`);
  const data: any = await res.json();
  const asks = Array.isArray(data?.asks) ? data.asks.map((a: any) => ({ price_sat: Number(a.price_sat) })) : [];
  return { asks, raw: data };
}

// Convert quoted USD/PH-day to Braiins pricing units and limits
export function buildBraiinsOrderParams(opts: {
  ph: number;
  hours: number;
  usdPerPhDay: number;
  settings: BraiinsSettings;
  orderbook: BraiinsOrderbook;
  btcUsd: number;
}): BraiinsOrderParams {
  const { ph, hours, usdPerPhDay, settings, orderbook, btcUsd } = opts;
  if (!isFinite(ph) || ph <= 0) throw new Error('bad ph');
  if (!isFinite(hours) || hours <= 0) throw new Error('bad hours');
  if (!isFinite(usdPerPhDay) || usdPerPhDay <= 0) throw new Error('bad usdPerPhDay');
  if (!isFinite(btcUsd) || btcUsd <= 0) throw new Error('bad btcUsd');

  const bestAsk = orderbook.asks
    .map((a) => a.price_sat)
    .filter((n) => isFinite(n) && n > 0)
    .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
  if (!isFinite(bestAsk)) throw new Error('braiins no asks');

  // price cap in sats per hr_unit
  const targetSatPerUnit = (usdPerPhDay / btcUsd) * 1e8 / settings.hrUnitToPhDay; // (USD/PH-day -> BTC/PH-day -> sats/PH-day -> sats/hr_unit)
  const priceSatPerUnit = Math.min(bestAsk, targetSatPerUnit);

  // convert requested PH to hr_unit/s (hr_unit is per day), so limitUnit = (requested PH) / hrUnitToPhDay
  const limitUnit = ph / settings.hrUnitToPhDay;

  // estimate amount in BTC for the window at capped price
  const amountBtc = (priceSatPerUnit / 1e8) * limitUnit * (hours / 24) * settings.hrUnitToPhDay; // factor back to PH-day equivalent

  return { priceSatPerUnit, limitUnit, amountBtc };
}
