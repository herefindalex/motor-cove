import { decodeEventLog, type Address, type PublicClient } from 'viem';
import { motorCoveEscrowAbi, vehicleNftAbi } from '@motorcove/chain-artifacts';
import type { BlockHeader, ChainReader } from '../../ports/index.js';
import type { NormalizedEvent, OrderedEvent } from '../../domain/events.js';

function requiredHash(value: `0x${string}` | null, name: string): `0x${string}` {
  if (!value) throw new Error(`${name} is missing from mined block/log`);
  return value;
}
function asString(value: unknown): string {
  if (typeof value !== 'bigint' && typeof value !== 'number' && typeof value !== 'string')
    throw new Error('Unexpected numeric event argument');
  return String(value);
}
function asAddress(value: unknown): Address {
  if (typeof value !== 'string' || !value.startsWith('0x'))
    throw new Error('Unexpected address event argument');
  return value as Address;
}

export class ViemChainReader implements ChainReader {
  constructor(
    private readonly client: PublicClient,
    private readonly nft: Address,
    private readonly escrow: Address,
  ) {}
  private async block(number?: bigint): Promise<BlockHeader> {
    const block =
      number === undefined
        ? await this.client.getBlock()
        : await this.client.getBlock({ blockNumber: number });
    return {
      number: block.number,
      hash: requiredHash(block.hash, 'block hash'),
      parentHash: block.parentHash,
      timestamp: block.timestamp,
    };
  }
  getHead() {
    return this.block();
  }
  getBlock(number: bigint) {
    return this.block(number);
  }
  async getEvents(headers: readonly BlockHeader[]): Promise<readonly OrderedEvent[]> {
    const logs = [];
    for (let offset = 0; offset < headers.length; offset += 8) {
      const batch = headers.slice(offset, offset + 8);
      logs.push(
        ...(
          await Promise.all(
            batch.map((header) =>
              this.client.getLogs({
                address: [this.nft, this.escrow],
                blockHash: header.hash,
              }),
            ),
          )
        ).flat(),
      );
    }
    return logs.flatMap((log): OrderedEvent[] => {
      const isNft = log.address.toLowerCase() === this.nft.toLowerCase();
      const decoded = decodeEventLog({
        abi: isNft ? vehicleNftAbi : motorCoveEscrowAbi,
        data: log.data,
        topics: log.topics,
        strict: true,
      });
      const a = decoded.args as Record<string, unknown>;
      let event: NormalizedEvent;
      switch (decoded.eventName) {
        case 'Transfer':
          event = {
            kind: 'Transfer',
            tokenId: asString(a.tokenId),
            from: asAddress(a.from),
            to: asAddress(a.to),
          };
          break;
        case 'SaleCreated':
          event = {
            kind: 'SaleCreated',
            saleId: asString(a.saleId),
            tokenId: asString(a.tokenId),
            seller: asAddress(a.seller),
            priceWei: asString(a.priceWei),
          };
          break;
        case 'SaleFunded':
          event = {
            kind: 'SaleFunded',
            saleId: asString(a.saleId),
            buyer: asAddress(a.buyer),
            amountWei: asString(a.amountWei),
            fundedAt: asString(a.fundedAt),
            expiresAt: asString(a.expiresAt),
          };
          break;
        case 'SaleCompleted':
          event = { kind: 'SaleCompleted', saleId: asString(a.saleId) };
          break;
        case 'SaleCancelled':
          event = { kind: 'SaleCancelled', saleId: asString(a.saleId) };
          break;
        case 'SaleExpired':
          event = { kind: 'SaleExpired', saleId: asString(a.saleId) };
          break;
        case 'PaymentClaimCreated':
          event = {
            kind: 'PaymentClaimCreated',
            saleId: asString(a.saleId),
            beneficiary: asAddress(a.beneficiary),
            amountWei: asString(a.amountWei),
            claimKind: Number(a.kind) === 1 ? 'SELLER_PROCEEDS' : 'BUYER_REFUND',
          };
          break;
        case 'PaymentWithdrawn':
          event = {
            kind: 'PaymentWithdrawn',
            saleId: asString(a.saleId),
            recipient: asAddress(a.recipient),
          };
          break;
        case 'TokenReclaimed':
          event = {
            kind: 'TokenReclaimed',
            saleId: asString(a.saleId),
            tokenId: asString(a.tokenId),
            recipient: asAddress(a.recipient),
          };
          break;
        case 'Approval':
        case 'ApprovalForAll':
        case 'OwnershipTransferred':
          return [];
        default:
          throw new Error('UNSUPPORTED_EVENT');
      }
      if (log.blockNumber === null || log.transactionIndex === null || log.logIndex === null)
        throw new Error('Pending log cannot be indexed');
      return [
        {
          blockNumber: log.blockNumber,
          blockHash: requiredHash(log.blockHash, 'log block hash'),
          transactionHash: requiredHash(log.transactionHash, 'transaction hash'),
          transactionIndex: log.transactionIndex,
          logIndex: log.logIndex,
          contractAddress: log.address,
          topics: log.topics,
          data: log.data,
          event,
        },
      ];
    });
  }
}
