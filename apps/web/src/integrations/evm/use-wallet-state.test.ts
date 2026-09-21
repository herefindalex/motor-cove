import { describe, expect, it } from 'vitest';
import { usableWalletConnectors } from './use-wallet-state.js';

const injected = { id: 'injected', name: 'Injected', type: 'injected', marker: 'browser' };
const localBuyer = {
  id: 'local-demo-buyer',
  name: 'Local demo buyer',
  type: 'mock',
  marker: 'local',
};
const discoveredProvider = {
  id: 'io.example.wallet',
  name: 'Discovered wallet',
  type: 'injected',
  marker: 'eip-6963',
};

describe('usableWalletConnectors', () => {
  it('removes the configured injected connector when the browser has no provider', () => {
    expect(usableWalletConnectors([injected], false)).toEqual([]);
  });

  it('preserves explicitly configured local connectors without an injected provider', () => {
    expect(usableWalletConnectors([injected, localBuyer], false)).toEqual([localBuyer]);
  });

  it('keeps an injected connector when the browser exposes a provider', () => {
    expect(usableWalletConnectors([injected], true)).toEqual([injected]);
  });

  it('keeps an EIP-6963 discovered provider without relying on window.ethereum', () => {
    expect(usableWalletConnectors([injected, discoveredProvider], false)).toEqual([
      discoveredProvider,
    ]);
  });
});
