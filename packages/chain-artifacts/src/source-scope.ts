import { toEventSelector, type AbiEvent } from 'viem';
import { motorCoveEscrowAbi } from './generated/motorcove-escrow.js';
import { vehicleNftAbi } from './generated/vehicle-nft.js';

export const LOG_SCOPE_VERSION = 'motorcove-v3';

const nftEventNames = ['Transfer'] as const;
const escrowEventNames = [
  'PaymentClaimCreated',
  'PaymentWithdrawn',
  'SaleCancelled',
  'SaleCompleted',
  'SaleCreated',
  'SaleExpired',
  'SaleFunded',
  'TokenReclaimed',
] as const;

function eventTopics(
  abi: readonly { readonly type: string; readonly name?: string }[],
  names: readonly string[],
): readonly `0x${string}`[] {
  return names
    .map((name) => {
      const event = abi.find((item) => item.type === 'event' && item.name === name);
      if (!event) throw new Error(`SOURCE_SCOPE_EVENT_MISSING: ${name}`);
      return toEventSelector(event as AbiEvent).toLowerCase() as `0x${string}`;
    })
    .sort();
}

const nftTopics = eventTopics(vehicleNftAbi, nftEventNames);
const escrowTopics = eventTopics(motorCoveEscrowAbi, escrowEventNames);

export function motorCoveSourceScope(nftAddress: string, escrowAddress: string) {
  return [
    { role: 'NFT', address: nftAddress.toLowerCase(), eventTopics: nftTopics },
    { role: 'ESCROW', address: escrowAddress.toLowerCase(), eventTopics: escrowTopics },
  ] as const;
}

export function isMotorCoveSourceLog(
  scope: ReturnType<typeof motorCoveSourceScope>,
  log: { readonly address: string; readonly topics: readonly string[] },
): boolean {
  const topic = log.topics[0]?.toLowerCase();
  return (
    topic !== undefined &&
    scope.some(
      (source) =>
        source.address === log.address.toLowerCase() &&
        source.eventTopics.includes(topic as `0x${string}`),
    )
  );
}
