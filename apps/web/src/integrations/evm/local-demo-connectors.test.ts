import { describe, expect, it } from 'vitest';
import { createLocalDemoConnectors, isLoopbackRpcUrl } from './local-demo-connectors.js';

describe('local demo wallet boundary', () => {
  it.each(['http://127.0.0.1:8545', 'http://localhost:8545', 'http://[::1]:8545'])(
    'accepts loopback RPC %s',
    (rpcUrl) => {
      expect(isLoopbackRpcUrl(rpcUrl)).toBe(true);
    },
  );

  it('rejects public or malformed RPC targets', () => {
    expect(isLoopbackRpcUrl('https://rpc.example.test')).toBe(false);
    expect(isLoopbackRpcUrl('not-a-url')).toBe(false);
    expect(() => createLocalDemoConnectors('https://rpc.example.test')).toThrow(
      'LOCAL_DEMO_WALLET_REQUIRES_LOOPBACK_RPC',
    );
  });

  it('creates separate seller and buyer connectors without embedding private keys', () => {
    const connectors = createLocalDemoConnectors('http://127.0.0.1:8545');
    const config = {
      chains: [],
      emitter: { emit() {} },
      storage: null,
      transports: {},
    } as never;
    expect(connectors.map((connector) => connector(config).id)).toEqual([
      'local-demo-seller',
      'local-demo-buyer',
    ]);
  });
});
