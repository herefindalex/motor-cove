import { afterEach, describe, expect, it } from 'vitest';
import type { ReadModelReader } from '@motorcove/database/reader';
import type { PublicConfig } from '@motorcove/api-contracts';
import { createApp } from './create-app.js';

const config: PublicConfig = {
  deploymentId: `0x${'1'.repeat(64)}`,
  chainId: '31337',
  protocolVersion: '0.2.0',
  nftAddress: `0x${'2'.repeat(40)}`,
  escrowAddress: `0x${'3'.repeat(40)}`,
  fundingPeriodSeconds: '300',
};
const reader = { close: async () => undefined } as unknown as ReadModelReader;
const originalOrigin = process.env.MOTORCOVE_WEB_ORIGIN;

afterEach(() => {
  if (originalOrigin === undefined) delete process.env.MOTORCOVE_WEB_ORIGIN;
  else process.env.MOTORCOVE_WEB_ORIGIN = originalOrigin;
});

describe('R24 canonical frontend origin', () => {
  it('allows the canonical 127.0.0.1 origin', async () => {
    delete process.env.MOTORCOVE_WEB_ORIGIN;
    const app = await createApp(reader, config);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/config',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    await app.close();
  });

  it('does not expose the API to a second localhost alias by default', async () => {
    delete process.env.MOTORCOVE_WEB_ORIGIN;
    const app = await createApp(reader, config);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/config',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('uses one explicit configured origin instead of adding aliases', async () => {
    process.env.MOTORCOVE_WEB_ORIGIN = 'http://localhost:15173';
    const app = await createApp(reader, config);
    const configured = await app.inject({
      method: 'GET',
      url: '/v1/config',
      headers: { origin: 'http://localhost:15173' },
    });
    expect(configured.headers['access-control-allow-origin']).toBe('http://localhost:15173');

    const defaultAlias = await app.inject({
      method: 'GET',
      url: '/v1/config',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    expect(defaultAlias.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});
