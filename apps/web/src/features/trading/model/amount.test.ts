import { describe, expect, it } from 'vitest';
import { parseEth } from './amount.js';
describe('parseEth', () => {
  it('parses decimals without floating point', () =>
    expect(parseEth('1.000000000000000001')).toBe(1000000000000000001n));
  it.each(['0', '-1', '1.0000000000000000001', '1e3', ' 1'])('rejects %s', (value) =>
    expect(() => parseEth(value)).toThrow(),
  );
});
