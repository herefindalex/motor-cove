import { decodeEventLog, decodeFunctionData, type Address, type PublicClient } from 'viem';
import { motorCoveEscrowAbi } from '@motorcove/chain-artifacts';
import { chainProfileForId } from '@motorcove/chain-artifacts/profiles';
import type {
  TransactionChainReader,
  InspectedTransaction,
  JournalEntry,
} from '../../capabilities/transactions/index.js';

const equalHex = (left: string | null | undefined, right: string) =>
  left?.toLowerCase() === right.toLowerCase();

const receiptNotFound = (error: unknown) =>
  error instanceof Error &&
  /transaction receipt[\s\S]*(?:not|could not)[\s\S]*found|(?:not|could not)[\s\S]*found[\s\S]*transaction receipt/i.test(
    error.message,
  );

const transactionNotFound = (error: unknown) =>
  error instanceof Error &&
  (error.name === 'TransactionNotFoundError' ||
    /transaction[\s\S]*(?:not found|could not be found)/i.test(error.message));

type TransactionIntentEnvelope = {
  readonly from: string;
  readonly to: string | null;
  readonly value: bigint;
  readonly input: `0x${string}`;
};

export interface TransactionVerificationContext {
  readonly chainId: number;
  readonly deploymentId: `0x${string}`;
  readonly protocolVersion: string;
  readonly nftAddress: Address;
  readonly escrowAddress: Address;
}

function intentMismatchReason(
  entry: JournalEntry,
  transaction: TransactionIntentEnvelope,
): string | undefined {
  if (!equalHex(transaction.from, entry.account)) return 'SENDER_MISMATCH';
  if (!equalHex(transaction.to, entry.intendedContract)) return 'TARGET_MISMATCH';
  if (transaction.value !== BigInt(entry.valueWei)) return 'VALUE_MISMATCH';
  if (!equalHex(transaction.input, entry.intendedCalldata)) return 'CALLDATA_MISMATCH';
  if (entry.action !== 'FUND_SALE') return undefined;
  try {
    const decoded = decodeFunctionData({ abi: motorCoveEscrowAbi, data: transaction.input });
    if (decoded.functionName !== 'fundSale' || decoded.args?.[0] !== BigInt(entry.saleId ?? '-1')) {
      return 'FUNDING_CALL_MISMATCH';
    }
  } catch {
    return 'FUNDING_CALL_MISMATCH';
  }
  return undefined;
}

export function createTransactionChainReader(
  client: PublicClient,
  expected: TransactionVerificationContext,
): TransactionChainReader {
  return {
    async observeFinality(entry, blockNumber, blockHash) {
      try {
        if (entry.chainId !== expected.chainId || (await client.getChainId()) !== expected.chainId)
          return { status: 'UNKNOWN' };
        const profile = chainProfileForId(entry.chainId);
        if (profile.finality.kind === 'IMMEDIATE')
          return { status: 'FINALIZED', headNumber: blockNumber, headHash: blockHash };
        const finalized = await client.getBlock({ blockTag: 'finalized' });
        if (finalized.number === null || !finalized.hash) return { status: 'UNKNOWN' };
        if (finalized.number < blockNumber) return { status: 'UNFINALIZED' };
        const canonical = await client.getBlock({ blockNumber });
        if (!equalHex(canonical.hash, blockHash)) return { status: 'UNKNOWN' };
        return { status: 'FINALIZED', headNumber: finalized.number, headHash: finalized.hash };
      } catch {
        return { status: 'UNKNOWN' };
      }
    },
    async inspectTransaction(entry, transactionHash, mode) {
      try {
        if (entry.chainId !== expected.chainId)
          return unavailable(transactionHash, 'SAVED_CHAIN_ID_MISMATCH');
        if (!equalHex(entry.deploymentId, expected.deploymentId))
          return unavailable(transactionHash, 'SAVED_DEPLOYMENT_ID_MISMATCH');
        if (entry.protocolVersion !== expected.protocolVersion)
          return unavailable(transactionHash, 'SAVED_PROTOCOL_VERSION_MISMATCH');
        const expectedTarget =
          entry.action === 'APPROVE_TOKEN' ? expected.nftAddress : expected.escrowAddress;
        if (!equalHex(entry.intendedContract, expectedTarget))
          return unavailable(transactionHash, 'SAVED_CONTRACT_IDENTITY_MISMATCH');

        const actualChainId = await client.getChainId();
        if (actualChainId !== expected.chainId)
          return unavailable(transactionHash, 'RPC_CHAIN_ID_MISMATCH');
        const actualDeploymentId = await client.readContract({
          address: expected.escrowAddress,
          abi: motorCoveEscrowAbi,
          functionName: 'deploymentId',
        });
        if (!equalHex(actualDeploymentId, expected.deploymentId))
          return unavailable(transactionHash, 'RPC_DEPLOYMENT_ID_MISMATCH');

        if (entry.action === 'FUND_SALE' && !entry.saleId)
          return mismatch(transactionHash, 'FUNDING_SALE_ID_MISSING');
        if (
          mode === 'AUTOMATIC' &&
          entry.finalityStatus === 'FINALIZED' &&
          entry.finalizedHeadNumber &&
          entry.finalizedHeadHash &&
          entry.receiptBlockNumber &&
          entry.receiptBlockHash &&
          BigInt(entry.finalizedHeadNumber) >= BigInt(entry.receiptBlockNumber) &&
          equalHex(entry.currentTxHash ?? entry.originalTxHash, transactionHash)
        ) {
          const finalizedReceipt = {
            transactionHash,
            blockNumber: BigInt(entry.receiptBlockNumber),
            blockHash: entry.receiptBlockHash as `0x${string}`,
          };
          if (entry.receiptStatus === 'REVERTED')
            return { kind: 'INCLUDED_REVERTED', ...finalizedReceipt };
          if (entry.receiptStatus === 'SUCCESS') {
            if (entry.action !== 'FUND_SALE')
              return { kind: 'INCLUDED_SUCCESS', ...finalizedReceipt };
            if (entry.eventLogIndex !== undefined && entry.eventBuyer && entry.eventAmountWei)
              return {
                kind: 'INCLUDED_SUCCESS',
                ...finalizedReceipt,
                logIndex: entry.eventLogIndex,
                buyer: entry.eventBuyer as `0x${string}`,
                amountWei: BigInt(entry.eventAmountWei),
              };
          }
        }
        let transaction;
        try {
          transaction = await client.getTransaction({ hash: transactionHash });
        } catch (transactionError) {
          if (entry.receiptBlockNumber && entry.receiptBlockHash) {
            try {
              const canonical = await client.getBlock({
                blockNumber: BigInt(entry.receiptBlockNumber),
              });
              if (!equalHex(canonical.hash, entry.receiptBlockHash)) {
                return { kind: 'NONCANONICAL', transactionHash };
              }
            } catch {
              // Preserve the original lookup error when the canonical header is also unavailable.
            }
          }
          const savedHash = entry.currentTxHash ?? entry.originalTxHash;
          if (
            entry.receiptBlockNumber === undefined &&
            entry.nonce !== undefined &&
            savedHash !== undefined &&
            equalHex(savedHash, transactionHash) &&
            transactionNotFound(transactionError)
          ) {
            return {
              kind: 'REPLACEMENT_HASH_REQUIRED',
              transactionHash,
              nonce: entry.nonce,
            };
          }
          throw transactionError;
        }
        const originalMismatch = intentMismatchReason(entry, transaction);
        if (originalMismatch) return mismatch(transactionHash, originalMismatch);

        let receipt;
        let effectiveHash = transactionHash;
        let replacementKind: 'REPRICED' | undefined;
        try {
          receipt = await client.getTransactionReceipt({ hash: transactionHash });
        } catch (error) {
          if (receiptNotFound(error)) {
            let replacement:
              | {
                  reason: 'cancelled' | 'replaced' | 'repriced';
                  transaction: TransactionIntentEnvelope & { hash: `0x${string}` };
                }
              | undefined;
            try {
              receipt = await client.waitForTransactionReceipt({
                hash: transactionHash,
                confirmations: 1,
                pollingInterval: 250,
                timeout: 2_000,
                onReplaced: ({ reason, transaction: replacementTransaction }) => {
                  replacement = { reason, transaction: replacementTransaction };
                },
              });
            } catch (waitError) {
              if (waitError instanceof Error && /timed out|timeout/i.test(waitError.message)) {
                return { kind: 'PENDING', transactionHash };
              }
              throw waitError;
            }
            if (replacement) {
              effectiveHash = replacement.transaction.hash;
              if (replacement.reason === 'cancelled') {
                return {
                  kind: 'REPLACED_OR_CANCELLED',
                  transactionHash,
                  replacementHash: effectiveHash,
                  replacementKind: 'CANCELLED',
                };
              }
              if (intentMismatchReason(entry, replacement.transaction)) {
                return {
                  kind: 'REPLACED_OR_CANCELLED',
                  transactionHash,
                  replacementHash: effectiveHash,
                  replacementKind: 'DIFFERENT_CALL',
                };
              }
              replacementKind = 'REPRICED';
            }
          } else {
            throw error;
          }
        }
        const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
        if (!equalHex(canonical.hash, receipt.blockHash)) {
          return { kind: 'NONCANONICAL', transactionHash };
        }
        if (receipt.status !== 'success') {
          return {
            kind: 'INCLUDED_REVERTED',
            transactionHash: effectiveHash,
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            ...(replacementKind ? { replacementKind } : {}),
          };
        }

        if (entry.action !== 'FUND_SALE') {
          return {
            kind: 'INCLUDED_SUCCESS',
            transactionHash: effectiveHash,
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            ...(replacementKind ? { replacementKind } : {}),
          };
        }
        if (!entry.saleId) return mismatch(transactionHash, 'FUNDING_SALE_ID_MISSING');
        const fundingSaleId = entry.saleId;

        for (const log of receipt.logs) {
          if (!equalHex(log.address, entry.intendedContract)) continue;
          if (!equalHex(log.transactionHash, effectiveHash)) continue;
          try {
            const event = decodeEventLog({
              abi: motorCoveEscrowAbi,
              data: log.data,
              topics: log.topics,
            });
            if (event.eventName !== 'SaleFunded') continue;
            const args = event.args as {
              saleId: bigint;
              buyer: `0x${string}`;
              amountWei: bigint;
            };
            if (args.saleId !== BigInt(fundingSaleId)) continue;
            if (!equalHex(args.buyer, entry.account)) continue;
            if (args.amountWei !== BigInt(entry.valueWei)) continue;
            if (log.logIndex === null) {
              return mismatch(transactionHash, 'EVENT_LOG_INDEX_MISSING');
            }
            return {
              kind: 'INCLUDED_SUCCESS',
              transactionHash: effectiveHash,
              blockNumber: receipt.blockNumber,
              blockHash: receipt.blockHash,
              logIndex: log.logIndex,
              buyer: args.buyer,
              amountWei: args.amountWei,
              ...(replacementKind ? { replacementKind } : {}),
            };
          } catch {
            // A receipt may contain unrelated logs. Continue until SaleFunded is found.
          }
        }
        return mismatch(transactionHash, 'SALE_FUNDED_EVENT_MISSING_OR_MISMATCHED');
      } catch (error) {
        return {
          kind: 'UNAVAILABLE',
          transactionHash,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

function mismatch(transactionHash: `0x${string}`, reason: string): InspectedTransaction {
  return { kind: 'INTENT_MISMATCH', transactionHash, reason };
}

function unavailable(transactionHash: `0x${string}`, reason: string): InspectedTransaction {
  return { kind: 'UNAVAILABLE', transactionHash, reason };
}
