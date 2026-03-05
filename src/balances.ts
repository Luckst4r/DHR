// balances.ts — balance checks for Braiins and NiceHash (gates /rent). Uses NH wrapper; Braiins via address balance. Supports override envs.
import fetch from 'node-fetch';
import { btcUsd } from './pricing.js';
import NHApi from 'nicehash-api-wrapper-v2';

function getNhClient() {
  const apiKey = process.env.NICEHASH_API_KEY;
  const apiSecret = process.env.NICEHASH_API_SECRET;
  const org = process.env.NICEHASH_ORG_ID;
  if (!apiKey || !apiSecret || !org) throw new Error('Missing NiceHash credentials');
  return new NHApi({ apiKey, apiSecret, orgId: org });
}

export interface WalletStatus {
  usd: number;
  raw: any;
}

// Braiins: use on-chain BTC address from env, convert to USD.
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

// NiceHash: use wrapper Accounting.getBalance; supports override for gating.
export async function nicehashBalanceUsd(): Promise<WalletStatus> {
  const overrideBtc = process.env.NICEHASH_BAL_OVERRIDE_BTC ? Number(process.env.NICEHASH_BAL_OVERRIDE_BTC) : undefined;
  if (overrideBtc && isFinite(overrideBtc)) {
    const usd = overrideBtc * (await btcUsd());
    return { usd, raw: { override: true, btc: overrideBtc } };
  }
  try {
    const nh = getNhClient();
    const data: any = await nh.Accounting.getBalance();
    const list = data?.balances ?? data?.data ?? data?.wallets ?? [];
    const btcEntry = Array.isArray(list) ? list.find((w: any) => (w?.currency || w?.asset)?.toUpperCase() === 'BTC') : undefined;
    const btcAvail = Number(btcEntry?.available || btcEntry?.availableAmount || btcEntry?.available?.total || btcEntry?.available?.quantity || 0);
    const btc = isFinite(btcAvail) ? btcAvail : 0;
    const usd = btc * (await btcUsd());
    return { usd, raw: data };
  } catch (err) {
    console.error('nicehash balance error', err);
    return { usd: Number.POSITIVE_INFINITY, raw: { error: (err as Error).message } };
  }
}
