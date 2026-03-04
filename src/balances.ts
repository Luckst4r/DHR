import fetch from 'node-fetch';
import crypto from 'node:crypto';
import { btcUsd } from './pricing.js';

export interface WalletStatus {
  usd: number;
  raw: any;
}

const BRAIINS_BTC_ADDRESS = process.env.BRAIINS_BTC_ADDRESS || 'bc1qd7ghrtr0wc9xz3phn93gue8s0p9hxdgyt8htuj';

export async function braiinsBalanceUsd(): Promise<WalletStatus> {
  try {
    const res = await fetch(`https://mempool.space/api/address/${BRAIINS_BTC_ADDRESS}`);
    if (!res.ok) throw new Error('mempool address fetch failed');
    const data: any = await res.json();
    const sats = Number(data?.chain_stats?.funded_txo_sum || 0) - Number(data?.chain_stats?.spent_txo_sum || 0);
    const unconfirmed = Number(data?.mempool_stats?.funded_txo_sum || 0) - Number(data?.mempool_stats?.spent_txo_sum || 0);
    const totalSats = sats + unconfirmed;
    const btc = totalSats / 1e8;
    const usd = btc * (await btcUsd());
    return { usd, raw: data };
  } catch (err) {
    console.error('braiins balance error', err);
    return { usd: Number.POSITIVE_INFINITY, raw: null };
  }
}

function nhSign({ method, path, query = '', body = '', time, nonce, org, key, secret }: any) {
  const qs = query ? `?${query}` : '';
  const requestId = crypto.randomUUID();
  const msg = `${time}${nonce}${org}${requestId}${method.toUpperCase()}${path}${qs}${body}`;
  const hmac = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  return { signature: `${key}:${hmac}`, requestId, qs };
}

export async function nicehashBalanceUsd(): Promise<WalletStatus> {
  const key = process.env.NICEHASH_API_KEY;
  const secret = process.env.NICEHASH_API_SECRET;
  const org = process.env.NICEHASH_ORG_ID;
  const overrideBtc = process.env.NICEHASH_BAL_OVERRIDE_BTC ? Number(process.env.NICEHASH_BAL_OVERRIDE_BTC) : undefined;
  if (!key || !secret || !org) return { usd: Number.POSITIVE_INFINITY, raw: null };
  const time = Date.now().toString();
  const nonce = crypto.randomUUID();
  const path = '/main/api/v2/accounting/accounts2';
  const { signature, requestId, qs } = nhSign({ method: 'GET', path, query: '', body: '', time, nonce, org, key, secret });
  try {
    const res = await fetch(`https://api2.nicehash.com${path}${qs}`, {
      method: 'GET',
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
      throw new Error(`nicehash balance http ${res.status} body=${txt}`);
    }
    const data: any = await res.json();
    const list = data?.data ?? data?.wallets ?? [];
    const btcEntry = Array.isArray(list) ? list.find((w: any) => (w?.currency || w?.asset)?.toUpperCase() === 'BTC') : undefined;
    const btcAvail = Number(btcEntry?.available?.total || btcEntry?.available?.quantity || btcEntry?.available || 0);
    const btc = isFinite(btcAvail) ? btcAvail : 0;
    const usd = btc * (await btcUsd());
    return { usd, raw: data };
  } catch (err) {
    console.error('nicehash balance error', err);
    if (overrideBtc && isFinite(overrideBtc)) {
      const usd = overrideBtc * (await btcUsd());
      return { usd, raw: { override: true, btc: overrideBtc } };
    }
    return { usd: Number.POSITIVE_INFINITY, raw: null };
  }
}
