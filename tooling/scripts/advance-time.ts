const index = process.argv.indexOf('--seconds');
const seconds = Number(index >= 0 ? process.argv[index + 1] : undefined);
if (!Number.isSafeInteger(seconds) || seconds <= 0)
  throw new Error('Pass a positive integer with --seconds');
const url = process.env.MOTORCOVE_RPC_URL ?? 'http://127.0.0.1:8545';
async function rpc(method: string, params: unknown[]) {
  const response: unknown = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then((value) => value.json());
  if (typeof response !== 'object' || response === null || 'error' in response)
    throw new Error(`RPC ${method} failed`);
}
await rpc('evm_increaseTime', [seconds]);
await rpc('evm_mine', []);
console.log(JSON.stringify({ service: 'advance-time', seconds }));
