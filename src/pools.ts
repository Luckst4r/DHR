const allowedPoolsEnv = process.env.ALLOWED_POOLS ?? '';
const allowedPools = allowedPoolsEnv
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function validatePool(pool: string): { valid: boolean; reason?: string } {
  try {
    if (!pool.startsWith('stratum+tcp://')) return { valid: false, reason: 'Must use stratum+tcp://host:port' };
    if (allowedPools.length > 0 && !allowedPools.includes(pool)) {
      return { valid: false, reason: 'Pool not in allowlist' };
    }
    // TODO: add regex or host:port validation
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: 'Validation error' };
  }
}
