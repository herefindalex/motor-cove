import { describe, expect, it, vi } from 'vitest';
import type { FundingObservationResponse } from '@motorcove/api-contracts';
import { isProjectionCurrentlyReflected, type JournalEntry } from './model.js';
import type { TransactionJournal } from './ports.js';
import { resumeJournalEntry, type InspectedTransaction, type RecoveryPorts } from './recovery.js';

const deploymentId = `0x${'1'.repeat(64)}` as const;
const account = `0x${'2'.repeat(40)}` as const;
const hash = `0x${'4'.repeat(64)}` as const;
const replacementHash = `0x${'6'.repeat(64)}` as const;
const blockHash = `0x${'5'.repeat(64)}` as const;

function entry(values: Partial<JournalEntry> = {}): JournalEntry {
  return {
    schemaVersion: 1,
    clientOperationId: 'operation-1',
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z',
    deploymentId,
    chainId: 31_337,
    account,
    protocolVersion: '1',
    action: 'FUND_SALE',
    saleId: '7',
    intendedContract: `0x${'3'.repeat(40)}`,
    intendedCalldata: '0x1234',
    calldataSummary: 'FUND_SALE',
    valueWei: '10',
    status: 'UNKNOWN',
    ...values,
  };
}

function observation(
  coverage: 'NOT_REACHED' | 'SCANNED' | 'UNVERIFIABLE',
  eventLookup: 'NOT_FOUND' | 'MATCHED' | 'NONCANONICAL' | 'SELECTOR_MISMATCH',
  projectionEffect: 'NOT_ASSESSED' | 'CONSISTENT' | 'INCONSISTENT',
): FundingObservationResponse {
  return {
    data: {
      sale: null,
      freshness: {} as FundingObservationResponse['data']['freshness'],
      observation: {
        requestEcho: {
          transactionHash: hash,
          blockNumber: '105',
          blockHash,
          logIndex: 3,
        },
        coverage,
        observedHeaderAtRequestedHeight: null,
        eventLookup,
        matchedEvent: null,
        projectionEffect,
      },
    },
    provenance: { projectionBuildId: 'build-1' } as FundingObservationResponse['provenance'],
  };
}

function ports(
  inspected: InspectedTransaction,
  response = observation('SCANNED', 'MATCHED', 'CONSISTENT'),
) {
  const saved: JournalEntry[] = [];
  const journal: TransactionJournal = {
    load: () => saved,
    loadIssues: () => [],
    save: (value) => {
      const index = saved.findIndex((item) => item.clientOperationId === value.clientOperationId);
      if (index === -1) saved.push(value);
      else saved[index] = value;
      return value;
    },
    subscribe: () => () => undefined,
  };
  const chain = { inspectTransaction: vi.fn(async () => inspected) };
  const readObservation = vi.fn(async () => response);
  const recoveryPorts: RecoveryPorts = {
    chain,
    observation: { observeFunding: readObservation },
    journal,
  };
  return { recoveryPorts, saved, chain, readObservation };
}

const included: InspectedTransaction = {
  kind: 'INCLUDED_SUCCESS',
  transactionHash: hash,
  blockNumber: 105n,
  blockHash,
  logIndex: 3,
  buyer: account,
  amountWei: 10n,
};

describe('read-only transaction recovery', () => {
  it('turns a lost wallet response into actionable UNKNOWN without reading or submitting', async () => {
    const fixture = ports(included);
    expect(
      await resumeJournalEntry(entry({ status: 'AWAITING_WALLET' }), fixture.recoveryPorts),
    ).toEqual({
      kind: 'HASH_REQUIRED',
    });
    expect(fixture.chain.inspectTransaction).toHaveBeenCalledTimes(0);
    expect(fixture.readObservation).toHaveBeenCalledTimes(0);
    expect(fixture.saved[0]?.status).toBe('UNKNOWN');
  });

  it('rejects an unrelated user supplied hash without associating it', async () => {
    const fixture = ports({
      kind: 'INTENT_MISMATCH',
      transactionHash: hash,
      reason: 'VALUE_MISMATCH',
    });
    expect(await resumeJournalEntry(entry(), fixture.recoveryPorts, hash)).toEqual({
      kind: 'REJECTED_CANDIDATE',
      reason: 'VALUE_MISMATCH',
    });
    expect(fixture.saved[0]?.currentTxHash).toBeUndefined();
    expect(fixture.saved[0]?.evidenceSource).toBeUndefined();
  });

  it('associates a matching user hash and reports a reflected projection', async () => {
    const fixture = ports(included);
    expect(await resumeJournalEntry(entry(), fixture.recoveryPorts, hash)).toEqual({
      kind: 'REFLECTED',
    });
    expect(fixture.saved[0]).toMatchObject({
      currentTxHash: hash,
      evidenceSource: 'USER_SUPPLIED',
      association: 'INTENT_MATCH',
      receiptStatus: 'SUCCESS',
      projectionObservation: 'REFLECTED',
    });
  });

  it('keeps on-chain success separate from projection lag', async () => {
    const fixture = ports(included, observation('NOT_REACHED', 'NOT_FOUND', 'NOT_ASSESSED'));
    expect(await resumeJournalEntry(entry(), fixture.recoveryPorts, hash)).toEqual({
      kind: 'SYNCING',
    });
    expect(fixture.saved[0]).toMatchObject({
      receiptStatus: 'SUCCESS',
      projectionObservation: 'NOT_REACHED',
    });
  });

  it('preserves prior evidence when verification becomes unavailable', async () => {
    const fixture = ports({
      kind: 'UNAVAILABLE',
      transactionHash: hash,
      reason: 'RPC_UNAVAILABLE',
    });
    await resumeJournalEntry(
      entry({
        currentTxHash: hash,
        receiptStatus: 'SUCCESS',
        receiptBlockNumber: '105',
        receiptBlockHash: blockHash,
        status: 'INCLUDED_SUCCESS',
      }),
      fixture.recoveryPorts,
    );
    expect(fixture.saved[0]).toMatchObject({
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: '105',
      verificationAvailability: 'UNAVAILABLE',
    });
  });

  it('continues a same-intent repricing with the replacement hash', async () => {
    const fixture = ports({
      ...included,
      transactionHash: replacementHash,
      replacementKind: 'REPRICED',
    });
    expect(
      await resumeJournalEntry(
        entry({ originalTxHash: hash, currentTxHash: hash, status: 'SUBMITTED' }),
        fixture.recoveryPorts,
      ),
    ).toEqual({ kind: 'REFLECTED' });
    expect(fixture.saved[0]).toMatchObject({
      originalTxHash: hash,
      currentTxHash: replacementHash,
      replacementKind: 'REPRICED',
      projectionObservation: 'REFLECTED',
    });
    expect(fixture.readObservation).toHaveBeenCalledWith(
      expect.objectContaining({ observeTxHash: replacementHash }),
    );
  });

  it.each(['CANCELLED', 'DIFFERENT_CALL'] as const)(
    'records a %s replacement without asking the projection to prove funding',
    async (replacementKind) => {
      const fixture = ports({
        kind: 'REPLACED_OR_CANCELLED',
        transactionHash: hash,
        replacementHash,
        replacementKind,
      });
      expect(
        await resumeJournalEntry(
          entry({ originalTxHash: hash, currentTxHash: hash, status: 'SUBMITTED' }),
          fixture.recoveryPorts,
        ),
      ).toEqual({ kind: 'INCONSISTENT' });
      expect(fixture.saved[0]).toMatchObject({
        originalTxHash: hash,
        currentTxHash: replacementHash,
        replacementKind,
        status: 'REPLACED_OR_CANCELLED',
      });
      expect(fixture.readObservation).toHaveBeenCalledTimes(0);
    },
  );

  it('does not let a slow unavailable result replace newer reflected evidence', async () => {
    let resolveInspection: ((value: InspectedTransaction) => void) | undefined;
    const inspection = new Promise<InspectedTransaction>((resolve) => {
      resolveInspection = resolve;
    });
    const fixture = ports(included);
    fixture.recoveryPorts.chain.inspectTransaction = vi.fn(async () => inspection);
    const original = entry({ originalTxHash: hash, currentTxHash: hash, status: 'SUBMITTED' });
    await fixture.recoveryPorts.journal.save(original);

    const slow = resumeJournalEntry(original, fixture.recoveryPorts);
    await vi.waitFor(() => expect(fixture.saved[0]?.verificationAvailability).toBe('VERIFYING'));
    const verifying = fixture.saved[0];
    if (!verifying) throw new Error('verification marker was not saved');
    await fixture.recoveryPorts.journal.save({
      ...verifying,
      verificationRequestId: 'newer-request',
      verificationAvailability: 'AVAILABLE',
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: '105',
      receiptBlockHash: blockHash,
      projectionObservation: 'REFLECTED',
    });

    resolveInspection?.({ kind: 'UNAVAILABLE', transactionHash: hash, reason: 'RPC_UNAVAILABLE' });
    await expect(slow).resolves.toEqual({ kind: 'SUPERSEDED' });
    expect(fixture.saved[0]).toMatchObject({
      verificationRequestId: 'newer-request',
      status: 'INCLUDED_SUCCESS',
      projectionObservation: 'REFLECTED',
      verificationAvailability: 'AVAILABLE',
    });
  });

  it('retains historical receipt evidence but withdraws current reflection after a reorg', async () => {
    const fixture = ports({ kind: 'NONCANONICAL', transactionHash: hash });
    const previouslyReflected = entry({
      originalTxHash: hash,
      currentTxHash: hash,
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: '105',
      receiptBlockHash: blockHash,
      eventLogIndex: 3,
      projectionObservation: 'REFLECTED',
      projectionTransactionHash: hash,
      projectionBlockHash: blockHash,
      projectionLogIndex: 3,
      projectionDeploymentId: deploymentId,
      projectionBuildId: 'build-0',
    });

    expect(isProjectionCurrentlyReflected(previouslyReflected)).toBe(true);
    await expect(resumeJournalEntry(previouslyReflected, fixture.recoveryPorts)).resolves.toEqual({
      kind: 'INCONSISTENT',
    });
    expect(fixture.saved[0]).toMatchObject({
      status: 'ORPHANED',
      receiptStatus: 'SUCCESS',
      receiptBlockHash: blockHash,
      projectionObservation: 'INCONSISTENT',
    });
    expect(isProjectionCurrentlyReflected(fixture.saved[0]!)).toBe(false);
  });

  it('invalidates old reflection when the same hash is re-included with a new event identity', async () => {
    const fixture = ports(included);
    fixture.readObservation.mockRejectedValue(new Error('API unavailable'));
    const oldBlockHash = `0x${'8'.repeat(64)}` as const;
    const previouslyReflected = entry({
      originalTxHash: hash,
      currentTxHash: hash,
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: '104',
      receiptBlockHash: oldBlockHash,
      eventLogIndex: 2,
      projectionObservation: 'REFLECTED',
      projectionTransactionHash: hash,
      projectionBlockHash: oldBlockHash,
      projectionLogIndex: 2,
      projectionDeploymentId: deploymentId,
      projectionBuildId: 'old-build',
    });

    await expect(resumeJournalEntry(previouslyReflected, fixture.recoveryPorts)).resolves.toEqual({
      kind: 'UNAVAILABLE',
      reason: 'API unavailable',
    });
    expect(fixture.saved[0]).toMatchObject({
      currentTxHash: hash,
      receiptBlockHash: blockHash,
      eventLogIndex: 3,
      verificationAvailability: 'UNAVAILABLE',
    });
    expect(fixture.saved[0]?.projectionObservation).toBeUndefined();
    expect(isProjectionCurrentlyReflected(fixture.saved[0]!)).toBe(false);
  });

  it('retains same-identity historical reflection when the observation API is unavailable', async () => {
    const fixture = ports(included);
    fixture.readObservation.mockRejectedValue(new Error('API unavailable'));
    const reflected = entry({
      originalTxHash: hash,
      currentTxHash: hash,
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: '105',
      receiptBlockHash: blockHash,
      eventLogIndex: 3,
      projectionObservation: 'REFLECTED',
      projectionTransactionHash: hash,
      projectionBlockHash: blockHash,
      projectionLogIndex: 3,
      projectionDeploymentId: deploymentId,
      projectionBuildId: 'build-0',
    });

    await expect(resumeJournalEntry(reflected, fixture.recoveryPorts)).resolves.toEqual({
      kind: 'UNAVAILABLE',
      reason: 'API unavailable',
    });
    expect(fixture.saved[0]).toMatchObject({
      projectionObservation: 'REFLECTED',
      verificationAvailability: 'UNAVAILABLE',
    });
    expect(isProjectionCurrentlyReflected(fixture.saved[0]!)).toBe(true);
  });

  it('restores current reflection after an orphaned operation is verified on canonical history', async () => {
    const fixture = ports(included);
    const orphaned = entry({
      originalTxHash: hash,
      currentTxHash: hash,
      status: 'ORPHANED',
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: '105',
      receiptBlockHash: blockHash,
      projectionObservation: 'INCONSISTENT',
    });

    await expect(resumeJournalEntry(orphaned, fixture.recoveryPorts)).resolves.toEqual({
      kind: 'REFLECTED',
    });
    expect(isProjectionCurrentlyReflected(fixture.saved[0]!)).toBe(true);
  });

  it.each([
    'APPROVE_TOKEN',
    'CREATE_SALE',
    'COMPLETE_SALE',
    'CANCEL_SALE',
    'EXPIRE_SALE',
    'WITHDRAW_PAYMENT',
    'RECLAIM_TOKEN',
  ])('records receipt success for %s without claiming projection convergence', async (action) => {
    const fixture = ports({
      kind: 'INCLUDED_SUCCESS',
      transactionHash: hash,
      blockNumber: 105n,
      blockHash,
    });
    const submitted = entry({
      action,
      calldataSummary: action,
      originalTxHash: hash,
      currentTxHash: hash,
      status: 'SUBMITTED',
      saleId: action === 'APPROVE_TOKEN' ? undefined : '7',
    });
    await fixture.recoveryPorts.journal.save(submitted);

    await expect(resumeJournalEntry(submitted, fixture.recoveryPorts)).resolves.toEqual({
      kind: 'INCLUDED',
    });
    expect(fixture.saved[0]).toMatchObject({
      action,
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: '105',
      receiptBlockHash: blockHash,
    });
    expect(fixture.saved[0]?.projectionObservation).toBeUndefined();
    expect(fixture.readObservation).not.toHaveBeenCalled();
  });

  it('resumes a non-funding operation after reload and records a reverted receipt', async () => {
    const fixture = ports({
      kind: 'INCLUDED_REVERTED',
      transactionHash: hash,
      blockNumber: 105n,
      blockHash,
    });
    const submitted = entry({
      action: 'WITHDRAW_PAYMENT',
      calldataSummary: 'WITHDRAW_PAYMENT',
      originalTxHash: hash,
      currentTxHash: hash,
      status: 'SUBMITTED',
    });
    await fixture.recoveryPorts.journal.save(submitted);
    const reloaded = fixture.recoveryPorts.journal.load(deploymentId)[0]!;

    await expect(resumeJournalEntry(reloaded, fixture.recoveryPorts)).resolves.toEqual({
      kind: 'REVERTED',
    });
    expect(fixture.saved[0]).toMatchObject({
      status: 'INCLUDED_REVERTED',
      receiptStatus: 'REVERTED',
      receiptBlockHash: blockHash,
    });
    expect(fixture.readObservation).not.toHaveBeenCalled();
  });
});
