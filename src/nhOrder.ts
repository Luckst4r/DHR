import fetch from 'node-fetch';
import crypto from 'node:crypto';
import { ensurePool } from './pool.js';
import { btcUsd } from './pricing.js';
import { getNhBuyInfo, getNhBestMarketPrice, buildNhOrderParams } from './nh.js';

function nhSign({ method, path, query = '', body = '', time, nonce, org, key, secret }: any) {
  const qs = query ? `?${query}` : '';
  const requestId = crypto.randomUUID();
  const msg = `${time}${nonce}${org}${requestId}${method.toUpperCase()}${path}${qs}${body}`;
  const hmac = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  return { signature: `${key}:${hmac}`, requestId, qs };
}

export interface NhOrderResult {
  id: string;
  market: string;
  price: number;
  limit: number;
  amount: number;
  poolId: string;
}

export async function createNhOrder(opts: {
  ph: number;
  hours: number;
  poolUrl: string;
  worker: string;
  usdPerPhDay: number;
}): Promise<NhOrderResult> {
  const { ph, hours, poolUrl, worker, usdPerPhDay } = opts;
  const key = process.env.NICEHASH_API_KEY;
  const secret = process.env.NICEHASH_API_SECRET;
  const org = process.env.NICEHASH_ORG_ID;
  if (!key || !secret || !org) throw new Error('Missing NiceHash credentials');

  // parse poolUrl
  const parsed = new URL(poolUrl.replace('stratum+tcp://', 'http://').replace('stratum+ssl://', 'https://'));
  const host = parsed.hostname;
  const port = Number(parsed.port);
  if (!host || !port) throw new Error('Invalid pool URL');

  const buyInfo = await getNhBuyInfo('SHA256ASICBOOST');
  const best = await getNhBestMarketPrice('SHA256ASICBOOST');
  const btcPrice = await btcUsd();
  const { price, limit, amount, market } = buildNhOrderParams({ ph, hours, usdPerPhDay, market: best.market, algo: 'SHA256ASICBOOST', btcPrice, buyInfo });
  const marketInfo = buyInfo.markets.find((m) => m.market === market);
  if (!marketInfo) throw new Error(`market ${market} missing in buyInfo`);

  // ensure pool
  const poolId = await ensurePool({ algorithm: 'SHA256ASICBOOST', host, port, username: worker, password: 'x', name: `auto-${worker}-${host}` });

  const payload = {
    market,
    algorithm: 'SHA256ASICBOOST',
    price,
    limit,
    amount,
    poolId,
    type: 'STANDARD',
    displayMarketFactor: marketInfo.displayMarketFactor,
    marketFactor: marketInfo.marketFactor,
    displayPriceFactor: marketInfo.displayPriceFactor,
    priceFactor: marketInfo.priceFactor,
  };
  const body = JSON.stringify(payload);
  const time = Date.now().toString();
  const nonce = crypto.randomUUID();
  const path = '/main/api/v2/hashpower/order';
  const { signature, requestId, qs } = nhSign({ method: 'POST', path, query: '', body, time, nonce, org, key, secret });

  const res = await fetch(`https://api2.nicehash.com${path}${qs}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Time': time,
      'X-Nonce': nonce,
      'X-Organization-Id': org,
      'X-Request-Id': requestId,
      'X-Auth': signature,
      'X-User-Agent': 'HashRentalBot',
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`order create http ${res.status} body=${txt}`);
  }
  const data: any = await res.json();
  const id = data?.id;
  if (!id) throw new Error('order create missing id');
  return { id, market, price, limit, amount, poolId };
}

export async function cancelNhOrder(orderId: string): Promise<void> {
  const key = process.env.NICEHASH_API_KEY;
  const secret = process.env.NICEHASH_API_SECRET;
  const org = process.env.NICEHASH_ORG_ID;
  if (!key || !secret || !org) throw new Error('Missing NiceHash credentials');
  const time = Date.now().toString();
  const nonce = crypto.randomUUID();
  const path = `/main/api/v2/hashpower/order/${orderId}`;
  const { signature, requestId, qs } = nhSign({ method: 'DELETE', path, query: '', body: '', time, nonce, org, key, secret });
  const res = await fetch(`https://api2.nicehash.com${path}${qs}`, {
    method: 'DELETE',
    headers: {
      'X-Time': time,
      'X-Nonce': nonce,
      'X-Organization-Id': org,
      'X-Request-Id': requestId,
      'X-Auth': signature,
      'X-User-Agent': 'HashRentalBot',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`order cancel http ${res.status} body=${txt}`);
  }
}
