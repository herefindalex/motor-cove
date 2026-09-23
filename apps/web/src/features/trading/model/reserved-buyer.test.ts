import { describe, expect, it } from 'vitest';
import { parseReservedBuyer } from './reserved-buyer.js';

const seller = `0x${'a'.repeat(40)}`;
const buyer = `0x${'b'.repeat(40)}`;

describe('reserved buyer input', () => {
  it('accepts a distinct EVM address and normalizes case', () => {
    expect(parseReservedBuyer(buyer.toUpperCase().replace('0X', '0x'), seller)).toBe(buyer);
  });
  it.each(['', '0x123', `0x${'0'.repeat(40)}`, seller])(
    'rejects unsafe reservation %s',
    (input) => {
      expect(() => parseReservedBuyer(input, seller)).toThrow('INVALID_RESERVED_BUYER');
    },
  );
});
