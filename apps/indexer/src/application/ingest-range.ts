import type { ChainReader, ProjectionUnitOfWork } from '../ports/index.js';

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
      await store.markRecoveryRequired('CHECKPOINT_BLOCK_UNAVAILABLE');
      throw new Error('RECOVERY_REQUIRED: checkpoint block unavailable', { cause: error });
    }
    if (canonical.hash !== checkpoint.hash) {
      await store.markRecoveryRequired('CHECKPOINT_HASH_CHANGED');
      throw new Error('RECOVERY_REQUIRED: checkpoint hash changed');
    }
  }
  const head = await chain.getHead();
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
      if (to === from) throw error;
      to = from + (to - from) / 2n;
    }
  }
  const headers: Awaited<ReturnType<ChainReader['getBlock']>>[] = [];
  for (let number = from; number <= to; number += 1n) headers.push(await chain.getBlock(number));
  for (let index = 1; index < headers.length; index += 1) {
    if (headers[index]?.parentHash !== headers[index - 1]?.hash) {
      await store.markRecoveryRequired('PARENT_DISCONTINUITY');
      throw new Error('RECOVERY_REQUIRED: parent discontinuity');
    }
  }
  events = [...events].sort(
    (a, b) =>
      Number(a.blockNumber - b.blockNumber) ||
      a.transactionIndex - b.transactionIndex ||
      a.logIndex - b.logIndex,
  );
  const headerByNumber = new Map(headers.map((header) => [header.number.toString(), header.hash]));
  for (const event of events)
    if (headerByNumber.get(event.blockNumber.toString()) !== event.blockHash) {
      await store.markRecoveryRequired('LOG_BLOCK_HASH_MISMATCH');
      throw new Error('RECOVERY_REQUIRED: log block hash mismatch');
    }
  const end = headers.at(-1);
  if (!end) throw new Error('Missing end block');
  const anchor = await chain.getBlock(to);
  if (anchor.hash !== end.hash) {
    await store.markRecoveryRequired('RANGE_ANCHOR_CHANGED');
    throw new Error('RECOVERY_REQUIRED: range anchor changed');
  }
  await store.commit(headers, events, end);
}
