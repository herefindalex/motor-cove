import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createReadOnlyReader: vi.fn(),
  closeReader: vi.fn(async () => undefined),
  runSourceAudit: vi.fn(),
  loadConfig: vi.fn(),
  chainProfileForId: vi.fn(() => ({ key: 'anvil' })),
  createPublicClient: vi.fn(() => ({})),
  http: vi.fn(() => ({})),
}));

vi.mock('@motorcove/database/reader', () => ({ createReadOnlyReader: mocks.createReadOnlyReader }));
vi.mock('@motorcove/chain-artifacts/profiles', () => ({
  chainProfileForId: mocks.chainProfileForId,
}));
vi.mock('viem', () => ({ createPublicClient: mocks.createPublicClient, http: mocks.http }));
vi.mock('../adapters/evm/run-source-audit.js', () => ({ runSourceAudit: mocks.runSourceAudit }));
vi.mock('../runtime/config.js', () => ({ loadConfig: mocks.loadConfig }));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  process.argv = [
    'node',
    'audit-source.ts',
    '--from',
    '1',
    '--to',
    '2',
    '--secondary-rpc-url',
    'http://127.0.0.1:8546',
  ];
  process.exitCode = undefined;
  mocks.closeReader.mockClear();
  mocks.loadConfig.mockReturnValue({
    environment: {},
    manifest: { deploymentId: `0x${'1'.repeat(64)}`, chainId: '31337' },
    rpcUrl: 'http://127.0.0.1:8545',
  });
  mocks.createReadOnlyReader.mockResolvedValue({ close: mocks.closeReader });
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('source audit CLI report contract', () => {
  it.each([
    ['MATCH', undefined],
    ['MISMATCH', 1],
    ['UNVERIFIABLE', 1],
  ] as const)('emits %s with exit code %s', async (result, expectedExitCode) => {
    mocks.runSourceAudit.mockResolvedValue({ result });
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await import('./audit-source.js');

    expect(mocks.runSourceAudit).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 1n, toBlock: 2n }),
    );
    expect(output).toHaveBeenCalledWith(JSON.stringify({ result }));
    expect(process.exitCode).toBe(expectedExitCode);
    expect(mocks.closeReader).toHaveBeenCalledOnce();
  });
});
