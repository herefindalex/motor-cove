export function canonicalHex(value: string, bytes: number, label: string): `0x${string}` {
  const pattern = new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`);
  if (!pattern.test(value)) throw new Error(`INVALID_HEX: ${label}`);
  return value.toLowerCase() as `0x${string}`;
}

export const canonicalAddress = (value: string, label = 'address') =>
  canonicalHex(value, 20, label);
export const canonicalHash = (value: string, label = 'hash') => canonicalHex(value, 32, label);

export function safeInteger(value: bigint | number, label: string): number {
  const parsed = typeof value === 'bigint' ? value : BigInt(value);
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(`UNSAFE_INTEGER: ${label}`);
  return Number(parsed);
}
