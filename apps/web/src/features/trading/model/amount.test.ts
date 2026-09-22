import { describe, expect, it } from 'vitest';
import { formatWeiAsEth, parseEth } from './amount.js';
describe('parseEth', () => {
  it('parses decimals without floating point', () =>
    expect(parseEth('1.000000000000000001')).toBe(1000000000000000001n));
  it.each(['0', '-1', '1.0000000000000000001', '1e3', ' 1'])('rejects %s', (value) =>
    expect(() => parseEth(value)).toThrow(),
  );
});

describe('formatWeiAsEth', () => {
  it.each([
    [1n, '0.000000000000000001 ETH'],
    [500000000000000n, '0.0005 ETH'],
    [1000000000000001n, '0.001000000000000001 ETH'],
    [1000000000000000000n, '1 ETH'],
    [123456789012345678901234567890n, '123456789012.34567890123456789 ETH'],
  ])('formats %s wei exactly', (wei, expected) => {
    expect(formatWeiAsEth(wei)).toBe(expected);
    expect(parseEth(expected.replace(' ETH', ''))).toBe(wei);
  });

  it('rejects negative wei', () => {
    expect(() => formatWeiAsEth(-1n)).toThrow('must not be negative');
  });
});
