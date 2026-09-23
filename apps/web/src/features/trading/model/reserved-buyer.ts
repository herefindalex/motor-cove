export function parseReservedBuyer(value: string, seller: string): `0x${string}` {
  const address = value.trim();
  if (
    !/^0x[0-9a-fA-F]{40}$/.test(address) ||
    /^0x0{40}$/.test(address) ||
    address.toLowerCase() === seller.toLowerCase()
  )
    throw new Error('INVALID_RESERVED_BUYER');
  return address.toLowerCase() as `0x${string}`;
}
