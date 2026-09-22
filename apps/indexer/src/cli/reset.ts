import {
  acquireBootstrapOwnership,
  acquireMaintenanceLocks,
  resetEnvironment,
  verifyManagedNodeOwnership,
  verifyOwnedEnvironment,
} from '@motorcove/database/maintenance';
import { paths } from '../runtime/config.js';

if (!process.argv.includes('--yes')) {
  console.error('Reset is destructive. Pass --yes.');
  process.exit(2);
}

const config = paths();
verifyOwnedEnvironment(config.environment);
const rpc = new URL(config.rpcUrl);
if (rpc.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(rpc.hostname))
  throw new Error(`RESET_RPC_REFUSED: expected loopback HTTP RPC, got ${rpc.origin}`);

async function rpcRequest(method: string): Promise<unknown> {
  const response = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
  });
  if (!response.ok) throw new Error(`RESET_RPC_UNAVAILABLE: HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: unknown; error?: unknown };
  if (payload.error || payload.result === undefined)
    throw new Error(`RESET_RPC_INVALID_RESPONSE: ${method}`);
  return payload.result;
}

const [chainId, clientVersion] = await Promise.all([
  rpcRequest('eth_chainId'),
  rpcRequest('web3_clientVersion'),
]);
if (chainId !== '0x7a69')
  throw new Error(`RESET_CHAIN_REFUSED: expected Anvil chain 31337, got ${String(chainId)}`);
if (typeof clientVersion !== 'string' || !clientVersion.toLowerCase().includes('anvil'))
  throw new Error(`RESET_CLIENT_REFUSED: expected Anvil, got ${String(clientVersion)}`);

await verifyManagedNodeOwnership(config.environment, config.rpcUrl);

const ownership = await acquireBootstrapOwnership(config.environment);
try {
  const locks = await acquireMaintenanceLocks(config.environment);
  try {
    await rpcRequest('anvil_reset');
    const result = await resetEnvironment(config.environment, true, { locksAlreadyHeld: true });
    console.log(
      JSON.stringify({
        service: 'reset',
        status: 'complete',
        environmentId: config.environment.environmentId,
        chainId: 31337,
        ...result,
      }),
    );
  } finally {
    await locks.release();
  }
} finally {
  await ownership.release();
}
