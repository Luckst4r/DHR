// pool.ts — ensure NiceHash pool exists for given algo/host/port/user; creates if needed (cached in-memory).
import fetch from 'node-fetch';
import crypto from 'node:crypto';

// NH signing helper (legacy) for pool create.
function nhSign({ method, path, query = '', body = '', time, nonce, org, key, secret }: any) {
  const qs = query ? `?${query}` : '';
  const requestId = crypto.randomUUID();
  const msg = `${time}${nonce}${org}${requestId}${method.toUpperCase()}${path}${qs}${body}`;
  const hmac = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  return { signature: `${key}:${hmac}`, requestId, qs };
}

interface PoolInput {
  algorithm: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  name?: string;
}

const poolCache = new Map<string, string>(); // key: algo|host|port|user -> poolId

// Create/reuse pool; caches poolId by algo/host/port/user
export async function ensurePool(input: PoolInput): Promise<string> {
  const { algorithm, host, port, username, password = 'x', name = 'auto-pool' } = input;
  const key = `${algorithm}|${host}|${port}|${username}`.toLowerCase();
  if (poolCache.has(key)) return poolCache.get(key)!;

  const apiKey = process.env.NICEHASH_API_KEY;
  const apiSecret = process.env.NICEHASH_API_SECRET;
  const org = process.env.NICEHASH_ORG_ID;
  if (!apiKey || !apiSecret || !org) throw new Error('Missing NiceHash credentials');

  const payload = {
    name,
    algorithm,
    stratumHostname: host,
    stratumPort: port,
    username,
    password,
  };
  const body = JSON.stringify(payload);
  const time = Date.now().toString();
  const nonce = crypto.randomUUID();
  const path = '/main/api/v2/pool';
  const { signature, requestId, qs } = nhSign({ method: 'POST', path, query: '', body, time, nonce, org, key: apiKey, secret: apiSecret });

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
    throw new Error(`pool create http ${res.status} body=${txt}`);
  }
  const data: any = await res.json();
  const poolId = data?.id;
  if (!poolId) throw new Error('pool create missing id');
  poolCache.set(key, poolId);
  return poolId;
}
