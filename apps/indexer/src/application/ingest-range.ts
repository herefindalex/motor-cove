import type { ChainReader, ProjectionUnitOfWork } from '../ports/index.js';

export class ChainTransportUnavailableError extends Error {
  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    super(`CHAIN_TRANSPORT_UNAVAILABLE: ${operation}`, { cause });
    this.name = 'ChainTransportUnavailableError';
  }
}

const transportErrorNames = new Set([
  'ChainDisconnectedError',
  'HttpRequestError',
  'ProviderDisconnectedError',
  'SocketClosedError',
  'TimeoutError',
  'WebSocketRequestError',
]);

function isTransportFailure(error: unknown, seen = new Set<unknown>()): boolean {
  if (typeof error !== 'object' || error === null || seen.has(error)) return false;
  seen.add(error);
  const candidate = error as { name?: unknown; message?: unknown; cause?: unknown };
  if (typeof candidate.name === 'string' && transportErrorNames.has(candidate.name)) return true;
  if (
    typeof candidate.message === 'string' &&
    /timed? out|econnrefused|econnreset|enotfound|fetch failed|network error/i.test(
      candidate.message,
    )
  )
    return true;
  return isTransportFailure(candidate.cause, seen);
}

async function readChain<T>(operation: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof ChainTransportUnavailableError) throw error;
    if (isTransportFailure(error)) throw new ChainTransportUnavailableError(operation, error);
    throw error;
  }
}

function isBlockNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'BlockNotFoundError'
  );
}

export async function ingestRange(
  chain: ChainReader,
  store: ProjectionUnitOfWork,
  batchSize = 100n,
  startBlock = 0n,
  indexingDepth = 0n,
): Promise<void> {
  if (batchSize < 1n) throw new Error('INDEX_BATCH_SIZE_INVALID');
  if (indexingDepth < 0n) throw new Error('INDEXING_DEPTH_INVALID');

  const checkpoint = await store.checkpoint();
  if (checkpoint) {
    let canonical;
    try {
      canonical = await chain.getBlock(checkpoint.number);
    } catch (error) {
      if (!isBlockNotFound(error) && isTransportFailure(error)) {
        throw new ChainTransportUnavailableError('checkpoint block', error);
      }
      if (!isBlockNotFound(error)) throw error;
      await store.markRecoveryRequired('CHECKPOINT_BLOCK_UNAVAILABLE');
      throw new Error('RECOVERY_REQUIRED: checkpoint block unavailable', { cause: error });
    }
    if (canonical.hash !== checkpoint.hash) {
      await store.markRecoveryRequired('CHECKPOINT_HASH_CHANGED');
      throw new Error('RECOVERY_REQUIRED: checkpoint hash changed');
    }
  }

  const head = await readChain('chain head', () => chain.getHead());
  store.observe?.(head.number);
  if (head.number < indexingDepth) return;
  const target = head.number - indexingDepth;
  const from = checkpoint ? checkpoint.number + 1n : startBlock;
  if (from > target) return;

  let to = from + batchSize - 1n < target ? from + batchSize - 1n : target;
  let events: Awaited<ReturnType<ChainReader['getEvents']>>;
  for (;;) {
    try {
      events = await chain.getEvents(from, to);
      break;
    } catch (error) {
      if (to === from) {
        if (isTransportFailure(error))
          throw new ChainTransportUnavailableError('event range', error);
        throw error;
      }
      to = from + (to - from) / 2n;
    }
  }

  const headers: Awaited<ReturnType<ChainReader['getBlock']>>[] = [];
  for (let number = from; number <= to; number += 1n) {
    headers.push(await readChain(`block ${number}`, () => chain.getBlock(number)));
  }
  const first = headers[0];
  if (!first || first.number !== from) {
    await store.markRecoveryRequired('RANGE_START_MISMATCH');
    throw new Error('RECOVERY_REQUIRED: range start mismatch');
  }
  if (checkpoint && first.parentHash !== checkpoint.hash) {
    await store.markRecoveryRequired('CHECKPOINT_PARENT_DISCONTINUITY');
    throw new Error('RECOVERY_REQUIRED: checkpoint parent discontinuity');
  }
  for (let index = 1; index < headers.length; index += 1) {
    if (headers[index]?.parentHash !== headers[index - 1]?.hash) {
      await store.markRecoveryRequired('PARENT_DISCONTINUITY');
      throw new Error('RECOVERY_REQUIRED: parent discontinuity');
    }
  }

  const orderedEvents = [...events].sort(
    (left, right) =>
      Number(left.blockNumber - right.blockNumber) ||
      left.transactionIndex - right.transactionIndex ||
      left.logIndex - right.logIndex,
  );
  const headerByNumber = new Map(
    headers.map((header) => [header.number.toString(), header.hash] as const),
  );
  for (const event of orderedEvents) {
    if (headerByNumber.get(event.blockNumber.toString()) !== event.blockHash) {
      await store.markRecoveryRequired('LOG_BLOCK_HASH_MISMATCH');
      throw new Error('RECOVERY_REQUIRED: log block hash mismatch');
    }
  }

  const end = headers.at(-1);
  if (!end) throw new Error('RANGE_EMPTY');
  const anchor = await readChain(`range anchor ${to}`, () => chain.getBlock(to));
  if (anchor.hash !== end.hash) {
    await store.markRecoveryRequired('RANGE_ANCHOR_CHANGED');
    throw new Error('RECOVERY_REQUIRED: range anchor changed');
  }
  await store.commit(headers, orderedEvents, end);
}
