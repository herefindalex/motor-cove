export function parseEth(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value))
    throw new Error('Enter a positive ETH amount with at most 18 decimals');
  const [whole = '0', fraction = ''] = value.split('.');
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  if (wei <= 0n) throw new Error('Price must be greater than zero');
  return wei;
}
