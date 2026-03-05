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
