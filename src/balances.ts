import fetch from 'node-fetch';
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
    const unconfirmed = (Number(data?.mempool_stats?.funded_txo_sum || 0) - Number(data?.mempool_stats?.spent_txo_sum || 0));
    const totalSats = sats + unconfirmed;
    const btc = totalSats / 1e8;
    const usd = btc * (await btcUsd());
    return { usd, raw: data };
  } catch (err) {
    console.error('braiins balance error', err);
    return { usd: Number.POSITIVE_INFINITY, raw: null };
  }
}
