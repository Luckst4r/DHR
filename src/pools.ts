const allowedPoolsEnv = process.env.ALLOWED_POOLS ?? '';
const allowedPools = allowedPoolsEnv
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const POOL_REGEX = /^stratum\+(tcp|ssl):\/\/[a-z0-9.-]+:\d{2,5}$/i;

export function validatePool(pool: string): { valid: boolean; reason?: string } {
  try {
    const normalized = pool.trim();
    if (!POOL_REGEX.test(normalized)) return { valid: false, reason: 'Must be stratum+tcp://host:port (or stratum+ssl://)' };
    if (allowedPools.length > 0 && !allowedPools.includes(normalized.toLowerCase())) {
      return { valid: false, reason: 'Pool not in allowlist' };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: 'Validation error' };
  }
}
