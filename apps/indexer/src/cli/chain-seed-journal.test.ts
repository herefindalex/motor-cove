import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAddress, toHex, type Hex } from 'viem';
import { ChainSeedJournal, type ChainSeedReceipt } from './chain-seed-journal.js';

const hash = (byte: number) => toHex(new Uint8Array(32).fill(byte));
const account = getAddress(`0x${'11'.repeat(20)}`);
const otherAccount = getAddress(`0x${'22'.repeat(20)}`);
const deploymentId = hash(0x33);
const transactionHash = hash(0x44);
const blockHash = hash(0x55);
const contractAddress = getAddress(`0x${'66'.repeat(20)}`);

const receipt: ChainSeedReceipt = {
  transactionHash,
  blockNumber: '7',
  blockHash,
  contractAddress,
  outcome: 'SUCCESS',
};

interface JournalFile {
  deploymentId: Hex;
  steps: Record<
    string,
    {
      intent: string;
      status: string;
      transactionHash?: Hex;
      receipt?: ChainSeedReceipt;
      error?: string;
    }
  >;
}

describe('ChainSeedJournal', () => {
  const directories: string[] = [];

  const createJournal = () => {
    const directory = mkdtempSync(join(tmpdir(), 'motorcove-seed-journal-'));
    directories.push(directory);
    const path = join(directory, 'seed-journal.json');
    const journal = ChainSeedJournal.open(path, {
      environmentId: 'test',
      chainId: 31337,
      account,
      newDeploymentId: deploymentId,
    });
    return { journal, path };
  };

  const readJournal = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as JournalFile;

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('persists PREPARED, SUBMITTED, and VERIFIED around a successful transaction', async () => {
    const { journal, path } = createJournal();
    const submit = vi.fn(async () => transactionHash);
    const waitForReceipt = vi.fn(async () => receipt);

    await expect(
      journal.transaction('deploy-nft', 'deploy:abc', submit, waitForReceipt),
    ).resolves.toEqual(receipt);

    expect(submit).toHaveBeenCalledOnce();
    expect(waitForReceipt).toHaveBeenCalledWith(transactionHash);
    expect(readJournal(path).steps['deploy-nft']).toMatchObject({
      intent: 'deploy:abc',
      status: 'VERIFIED',
      transactionHash,
      receipt,
    });
  });

  it('revalidates a VERIFIED receipt without submitting again', async () => {
    const { journal, path } = createJournal();
    await journal.transaction(
      'deploy-nft',
      'deploy:abc',
      async () => transactionHash,
      async () => receipt,
    );

    const reopened = ChainSeedJournal.open(path, {
      environmentId: 'test',
      chainId: 31337,
      account,
      newDeploymentId: hash(0x77),
    });
    const submit = vi.fn(async () => hash(0x88));
    const waitForReceipt = vi.fn(async () => receipt);

    await expect(
      reopened.transaction('deploy-nft', 'deploy:abc', submit, waitForReceipt),
    ).resolves.toEqual(receipt);

    expect(reopened.deploymentId).toBe(deploymentId);
    expect(submit).not.toHaveBeenCalled();
    expect(waitForReceipt).toHaveBeenCalledWith(transactionHash);
  });

  it('keeps SUBMITTED after a receipt lookup failure and resumes the same hash', async () => {
    const { journal, path } = createJournal();

    await expect(
      journal.transaction(
        'deploy-nft',
        'deploy:abc',
        async () => transactionHash,
        async () => {
          throw new Error('RPC temporarily unavailable');
        },
      ),
    ).rejects.toThrow('RPC temporarily unavailable');

    expect(readJournal(path).steps['deploy-nft']).toMatchObject({
      status: 'SUBMITTED',
      transactionHash,
    });

    const reopened = ChainSeedJournal.open(path, {
      environmentId: 'test',
      chainId: 31337,
      account,
      newDeploymentId: deploymentId,
    });
    const submit = vi.fn(async () => hash(0x88));
    await reopened.transaction('deploy-nft', 'deploy:abc', submit, async (hash) => {
      expect(hash).toBe(transactionHash);
      return receipt;
    });

    expect(submit).not.toHaveBeenCalled();
    expect(readJournal(path).steps['deploy-nft']?.status).toBe('VERIFIED');
  });

  it('marks a submit error UNKNOWN and refuses an automatic retry', async () => {
    const { journal, path } = createJournal();

    await expect(
      journal.transaction(
        'mint-1',
        'mint:1',
        async () => {
          throw new Error('broadcast result unknown');
        },
        async () => receipt,
      ),
    ).rejects.toThrow('CHAIN_SEED_AMBIGUOUS: mint-1');

    expect(readJournal(path).steps['mint-1']).toMatchObject({
      status: 'UNKNOWN',
      error: 'broadcast result unknown',
    });

    const submit = vi.fn(async () => transactionHash);
    await expect(
      journal.transaction('mint-1', 'mint:1', submit, async () => receipt),
    ).rejects.toThrow('CHAIN_SEED_AMBIGUOUS: mint-1');
    expect(submit).not.toHaveBeenCalled();
  });

  it('treats a persisted PREPARED step as ambiguous', async () => {
    const { path } = createJournal();
    const contents = readJournal(path);
    contents.steps['mint-1'] = {
      intent: 'mint:1',
      status: 'PREPARED',
    };
    writeFileSync(path, `${JSON.stringify(contents, null, 2)}\n`);

    const reopened = ChainSeedJournal.open(path, {
      environmentId: 'test',
      chainId: 31337,
      account,
      newDeploymentId: deploymentId,
    });
    const submit = vi.fn(async () => transactionHash);

    await expect(
      reopened.transaction('mint-1', 'mint:1', submit, async () => receipt),
    ).rejects.toThrow('CHAIN_SEED_AMBIGUOUS: mint-1');
    expect(submit).not.toHaveBeenCalled();
    expect(readJournal(path).steps['mint-1']?.status).toBe('UNKNOWN');
  });

  it('rejects identity and intent changes', async () => {
    const { journal, path } = createJournal();
    await journal.transaction(
      'deploy-nft',
      'deploy:abc',
      async () => transactionHash,
      async () => receipt,
    );

    expect(() =>
      ChainSeedJournal.open(path, {
        environmentId: 'test',
        chainId: 31337,
        account: otherAccount,
        newDeploymentId: deploymentId,
      }),
    ).toThrow('CHAIN_SEED_JOURNAL_IDENTITY_MISMATCH');

    await expect(
      journal.transaction(
        'deploy-nft',
        'deploy:different',
        async () => transactionHash,
        async () => receipt,
      ),
    ).rejects.toThrow('CHAIN_SEED_INTENT_MISMATCH: deploy-nft');
  });

  it('marks the step UNKNOWN when a verified receipt changes', async () => {
    const { journal, path } = createJournal();
    await journal.transaction(
      'deploy-nft',
      'deploy:abc',
      async () => transactionHash,
      async () => receipt,
    );

    await expect(
      journal.transaction(
        'deploy-nft',
        'deploy:abc',
        async () => transactionHash,
        async () => ({
          ...receipt,
          blockHash: hash(0x99),
        }),
      ),
    ).rejects.toThrow('CHAIN_SEED_RECEIPT_CHANGED: deploy-nft');

    expect(readJournal(path).steps['deploy-nft']).toMatchObject({
      status: 'UNKNOWN',
      error: 'Previously verified receipt changed',
    });
  });
});
