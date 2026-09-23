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
const SOURCE_READ_CONCURRENCY = 8;

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

function isRangeLimitFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { message?: unknown; shortMessage?: unknown };
  const message = [candidate.message, candidate.shortMessage]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return /range.?limit|too many (?:blocks|results)|response size|limit exceeded/i.test(message);
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
  maximumTarget?: bigint,
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
  if (head.number < indexingDepth) {
    if (checkpoint) {
      await store.markRecoveryRequired('CHECKPOINT_EXCEEDS_ELIGIBLE_TARGET');
      throw new Error('RECOVERY_REQUIRED: checkpoint exceeds eligible indexing target');
    }
    return;
  }
  const eligibleTarget = head.number - indexingDepth;
  const target =
    maximumTarget !== undefined && maximumTarget < eligibleTarget ? maximumTarget : eligibleTarget;
  const from = checkpoint ? checkpoint.number + 1n : startBlock;
  if (checkpoint && checkpoint.number > target) {
    await store.markRecoveryRequired('CHECKPOINT_EXCEEDS_ELIGIBLE_TARGET');
    throw new Error('RECOVERY_REQUIRED: checkpoint exceeds eligible indexing target');
  }
  if (from > target) {
    if (target === eligibleTarget) await store.markCurrent?.(head.number);
    return;
  }

  let to = from + batchSize - 1n < target ? from + batchSize - 1n : target;
  let events: Awaited<ReturnType<ChainReader['getEvents']>>;
  let headers: Awaited<ReturnType<ChainReader['getBlock']>>[];
  for (;;) {
    headers = [];
    let headerReads: Array<Promise<Awaited<ReturnType<ChainReader['getBlock']>>>> = [];
    for (let number = from; number <= to; number += 1n) {
      headerReads.push(readChain(`block ${number}`, () => chain.getBlock(number)));
      if (headerReads.length === SOURCE_READ_CONCURRENCY) {
        headers.push(...(await Promise.all(headerReads)));
        headerReads = [];
      }
    }
    headers.push(...(await Promise.all(headerReads)));
    try {
      events = await chain.getEvents(headers);
      break;
    } catch (error) {
      if (!isTransportFailure(error) && !isRangeLimitFailure(error)) throw error;
      if (to === from) {
        if (isTransportFailure(error))
          throw new ChainTransportUnavailableError('event range', error);
        throw error;
      }
      to = from + (to - from) / 2n;
    }
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
  if (end.number === eligibleTarget) await store.markCurrent?.(head.number);
}
