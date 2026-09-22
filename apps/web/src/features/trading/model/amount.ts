export function parseEth(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value))
    throw new Error('Enter a positive ETH amount with at most 18 decimals');
  const [whole = '0', fraction = ''] = value.split('.');
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  if (wei <= 0n) throw new Error('Price must be greater than zero');
  return wei;
}

const WEI_PER_ETH = 10n ** 18n;

export function formatWeiAsEth(value: bigint | string): string {
  const wei = typeof value === 'bigint' ? value : BigInt(value);
  if (wei < 0n) throw new Error('Wei amount must not be negative');
  const whole = wei / WEI_PER_ETH;
  const remainder = wei % WEI_PER_ETH;
  if (remainder === 0n) return `${whole} ETH`;
  const fraction = remainder.toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole}.${fraction} ETH`;
}
