import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Address, Hex } from 'viem';

export type ChainSeedStepStatus = 'PREPARED' | 'SUBMITTED' | 'VERIFIED' | 'UNKNOWN';

export interface ChainSeedReceipt {
  readonly transactionHash: Hex;
  readonly blockNumber: string;
  readonly blockHash: Hex;
  readonly contractAddress: Address | null;
  readonly outcome: 'SUCCESS' | 'REVERTED';
}

interface ChainSeedStep {
  readonly intent: string;
  status: ChainSeedStepStatus;
  transactionHash?: Hex;
  receipt?: ChainSeedReceipt;
  error?: string;
  updatedAt: string;
}

interface ChainSeedJournalData {
  readonly formatVersion: 1;
  readonly environmentId: string;
  readonly chainId: number;
  readonly account: Address;
  readonly deploymentId: Hex;
  readonly createdAt: string;
  updatedAt: string;
  readonly steps: Record<string, ChainSeedStep>;
}

interface OpenJournalIdentity {
  readonly environmentId: string;
  readonly chainId: number;
  readonly account: Address;
  readonly newDeploymentId: Hex;
}

const now = () => new Date().toISOString();

function parseJournal(path: string): ChainSeedJournalData {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ChainSeedJournalData>;
  if (
    value.formatVersion !== 1 ||
    typeof value.environmentId !== 'string' ||
    typeof value.chainId !== 'number' ||
    typeof value.account !== 'string' ||
    typeof value.deploymentId !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.steps !== 'object' ||
    value.steps === null
  ) {
    throw new Error('CHAIN_SEED_JOURNAL_INVALID');
  }
  return value as ChainSeedJournalData;
}

export class ChainSeedJournal {
  private constructor(
    private readonly path: string,
    private readonly data: ChainSeedJournalData,
  ) {}

  static open(path: string, identity: OpenJournalIdentity) {
    if (existsSync(path)) {
      const data = parseJournal(path);
      if (
        data.environmentId !== identity.environmentId ||
        data.chainId !== identity.chainId ||
        data.account.toLowerCase() !== identity.account.toLowerCase()
      ) {
        throw new Error('CHAIN_SEED_JOURNAL_IDENTITY_MISMATCH');
      }
      return new ChainSeedJournal(path, data);
    }

    const timestamp = now();
    const data: ChainSeedJournalData = {
      formatVersion: 1,
      environmentId: identity.environmentId,
      chainId: identity.chainId,
      account: identity.account,
      deploymentId: identity.newDeploymentId,
      createdAt: timestamp,
      updatedAt: timestamp,
      steps: {},
    };
    const journal = new ChainSeedJournal(path, data);
    journal.save();
    return journal;
  }

  get deploymentId() {
    return this.data.deploymentId;
  }

  async transaction(
    stepId: string,
    intent: string,
    submit: () => Promise<Hex>,
    waitForReceipt: (hash: Hex) => Promise<ChainSeedReceipt>,
  ) {
    let step = this.data.steps[stepId];
    if (step && step.intent !== intent) throw new Error(`CHAIN_SEED_INTENT_MISMATCH: ${stepId}`);

    if (!step) {
      step = {
        intent,
        status: 'PREPARED',
        updatedAt: now(),
      };
      this.data.steps[stepId] = step;
      this.save();
      try {
        const transactionHash = await submit();
        step.transactionHash = transactionHash;
        step.status = 'SUBMITTED';
        step.updatedAt = now();
        this.save();
      } catch (error) {
        step.status = 'UNKNOWN';
        step.error = error instanceof Error ? error.message : String(error);
        step.updatedAt = now();
        this.save();
        throw new Error(`CHAIN_SEED_AMBIGUOUS: ${stepId}`);
      }
    } else if (step.status === 'PREPARED') {
      step.status = 'UNKNOWN';
      step.error = 'Process stopped after PREPARED before a transaction hash was journaled';
      step.updatedAt = now();
      this.save();
      throw new Error(`CHAIN_SEED_AMBIGUOUS: ${stepId}`);
    }

    if (step.status === 'UNKNOWN') throw new Error(`CHAIN_SEED_AMBIGUOUS: ${stepId}`);
    if (!step.transactionHash) throw new Error(`CHAIN_SEED_JOURNAL_INVALID: ${stepId}`);

    const receipt = await waitForReceipt(step.transactionHash);
    if (step.receipt) {
      if (
        step.receipt.blockNumber !== receipt.blockNumber ||
        step.receipt.blockHash !== receipt.blockHash ||
        step.receipt.outcome !== receipt.outcome ||
        step.receipt.contractAddress?.toLowerCase() !== receipt.contractAddress?.toLowerCase()
      ) {
        step.status = 'UNKNOWN';
        step.error = 'Previously verified receipt changed';
        step.updatedAt = now();
        this.save();
        throw new Error(`CHAIN_SEED_RECEIPT_CHANGED: ${stepId}`);
      }
    } else {
      step.receipt = receipt;
      step.status = 'VERIFIED';
      step.updatedAt = now();
      this.save();
    }

    if (receipt.outcome !== 'SUCCESS') throw new Error(`CHAIN_SEED_REVERTED: ${stepId}`);
    return receipt;
  }

  private save() {
    this.data.updatedAt = now();
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp-${process.pid}`;
    writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.path);
  }
}
