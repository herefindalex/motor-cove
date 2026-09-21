const UINT256_MAX = (1n << 256n) - 1n;
const UINT256_PATTERN = /^(?:0|[1-9][0-9]{0,77})$/;

export function parseUint256(value: string, label = 'uint256'): bigint {
  if (!UINT256_PATTERN.test(value)) throw new Error(`INVALID_UINT256: ${label}`);
  const parsed = BigInt(value);
  if (parsed > UINT256_MAX) throw new Error(`UINT256_OVERFLOW: ${label}`);
  return parsed;
}

export function canonicalUint256(value: bigint | string, label = 'uint256'): string {
  const parsed = typeof value === 'bigint' ? value : parseUint256(value, label);
  if (parsed < 0n || parsed > UINT256_MAX) throw new Error(`INVALID_UINT256: ${label}`);
  return parsed.toString(10);
}

export function positiveUint256(value: bigint | string, label = 'uint256'): string {
  const canonical = canonicalUint256(value, label);
  if (canonical === '0') throw new Error(`UINT256_MUST_BE_POSITIVE: ${label}`);
  return canonical;
}

export const uint256Max = UINT256_MAX;
