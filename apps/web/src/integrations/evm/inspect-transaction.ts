import { decodeEventLog, decodeFunctionData, type PublicClient } from 'viem';
import { motorCoveEscrowAbi } from '@motorcove/chain-artifacts';
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

type TransactionIntentEnvelope = {
  readonly from: string;
  readonly to: string | null;
  readonly value: bigint;
  readonly input: `0x${string}`;
};

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

export function createTransactionChainReader(client: PublicClient): TransactionChainReader {
  return {
    async inspectTransaction(entry, transactionHash) {
      try {
        if (entry.action === 'FUND_SALE' && !entry.saleId)
          return mismatch(transactionHash, 'FUNDING_SALE_ID_MISSING');
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
