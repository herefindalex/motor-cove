import { randomUUID } from 'node:crypto';
import { openProjectionWriter } from '@motorcove/database/projection-writer';
import { motorCoveEscrowAbi, vehicleNftAbi } from '@motorcove/chain-artifacts';
import { createPublicClient, http, type Address } from 'viem';
import { loadConfig } from '../runtime/config.js';

const statuses = ['NONE', 'LISTED', 'FUNDED', 'COMPLETED', 'CANCELLED', 'EXPIRED'];
const claimKinds = ['NONE', 'SELLER_PROCEEDS', 'BUYER_REFUND'];
const claimStatuses = ['NONE', 'CLAIMABLE', 'WITHDRAWN'];
const config = loadConfig();
const writer = await openProjectionWriter(config.environment);
try {
  const db = writer.database;
  const checkpoint = db
    .prepare(
      'SELECT last_scanned_block AS blockNumber,last_scanned_hash AS blockHash,projector_version AS projectorVersion,projection_build_id AS projectionBuildId,log_scope_hash AS logScopeHash FROM indexer_checkpoint WHERE deployment_id=?',
    )
    .get(config.manifest.deploymentId) as
    | {
        blockNumber: number | null;
        blockHash: `0x${string}` | null;
        projectorVersion: string;
        projectionBuildId: string;
        logScopeHash: string;
      }
    | undefined;
  if (!checkpoint || checkpoint.blockNumber === null || checkpoint.blockHash === null)
    throw new Error('READ_MODEL_UNINITIALIZED');
  const blockNumber = BigInt(checkpoint.blockNumber);
  const client = createPublicClient({ transport: http(config.rpcUrl) });
  const head = await client.getBlock();
  let comparison: 'MATCH' | 'MISMATCH' | 'UNVERIFIABLE' = 'MATCH';
  const differences: Array<Record<string, unknown>> = [];
  let lastSaleId: string | null = null;
  let lastTokenId: string | null = null;
  try {
    const before = await client.getBlock({ blockNumber });
    if (before.hash !== checkpoint.blockHash) throw new Error('ANCHOR_HASH_MISMATCH');
    const sales = db
      .prepare(
        'SELECT sale_id AS saleId,token_id AS tokenId,seller,buyer,price_wei AS priceWei,CAST(funded_at AS TEXT) AS fundedAt,CAST(expires_at AS TEXT) AS expiresAt,status,token_reclaimed AS tokenReclaimed FROM sales WHERE deployment_id=? ORDER BY length(sale_id),sale_id',
      )
      .all(config.manifest.deploymentId) as Array<Record<string, unknown>>;
    const saleCount = await client.readContract({
      address: config.manifest.escrow.address as Address,
      abi: motorCoveEscrowAbi,
      functionName: 'saleCount',
      blockNumber,
    });
    if (saleCount > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('RECONCILIATION_SCOPE_TOO_LARGE');
    lastSaleId = String(saleCount);
    const projectedSaleIds = new Set(sales.map((sale) => String(sale.saleId)));
    for (let saleId = 1n; saleId <= saleCount; saleId += 1n) {
      const canonicalSaleId = String(saleId);
      if (!projectedSaleIds.has(canonicalSaleId))
        differences.push({
          saleId: canonicalSaleId,
          field: 'sale',
          projected: null,
          chain: 'PRESENT',
        });
    }
    for (const projected of sales) {
      const saleId = BigInt(String(projected.saleId));
      const chainSale = await client.readContract({
        address: config.manifest.escrow.address as Address,
        abi: motorCoveEscrowAbi,
        functionName: 'getSale',
        args: [saleId],
        blockNumber,
      });
      const expected = {
        tokenId: String(chainSale.tokenId),
        seller: chainSale.seller.toLowerCase(),
        buyer:
          chainSale.buyer === '0x0000000000000000000000000000000000000000'
            ? null
            : chainSale.buyer.toLowerCase(),
        priceWei: String(chainSale.priceWei),
        fundedAt: chainSale.fundedAt === 0n ? null : String(chainSale.fundedAt),
        expiresAt: chainSale.expiresAt === 0n ? null : String(chainSale.expiresAt),
        status: statuses[chainSale.status],
        tokenReclaimed: chainSale.tokenReclaimed ? 1 : 0,
      };
      for (const [field, value] of Object.entries(expected))
        if (projected[field] !== value)
          differences.push({
            saleId: String(saleId),
            field,
            projected: projected[field],
            chain: value,
          });
      const projectedClaim = db
        .prepare(
          'SELECT beneficiary, amount_wei AS amountWei, kind, status FROM payment_claims WHERE deployment_id=? AND sale_id=?',
        )
        .get(config.manifest.deploymentId, String(saleId)) as Record<string, unknown> | undefined;
      const chainClaim = await client.readContract({
        address: config.manifest.escrow.address as Address,
        abi: motorCoveEscrowAbi,
        functionName: 'getPaymentClaim',
        args: [saleId],
        blockNumber,
      });
      const expectedClaim =
        chainClaim.status === 0
          ? undefined
          : {
              beneficiary: chainClaim.beneficiary.toLowerCase(),
              amountWei: String(chainClaim.amountWei),
              kind: claimKinds[chainClaim.kind],
              status: claimStatuses[chainClaim.status],
            };
      if (JSON.stringify(projectedClaim) !== JSON.stringify(expectedClaim))
        differences.push({
          saleId: String(saleId),
          field: 'paymentClaim',
          projected: projectedClaim ?? null,
          chain: expectedClaim ?? null,
        });
    }
    const owners = db
      .prepare(
        'SELECT token_id AS tokenId, owner FROM token_ownership WHERE deployment_id=? ORDER BY CAST(token_id AS INTEGER)',
      )
      .all(config.manifest.deploymentId) as Array<{ tokenId: string; owner: string }>;
    const nextTokenId = await client.readContract({
      address: config.manifest.nft.address as Address,
      abi: vehicleNftAbi,
      functionName: 'nextTokenId',
      blockNumber,
    });
    const mintedTokenCount = nextTokenId - 1n;
    if (mintedTokenCount > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('RECONCILIATION_SCOPE_TOO_LARGE');
    lastTokenId = mintedTokenCount === 0n ? null : String(mintedTokenCount);
    const projectedOwners = new Map(owners.map((row) => [row.tokenId, row.owner]));
    for (let tokenId = 1n; tokenId < nextTokenId; tokenId += 1n) {
      const owner = await client.readContract({
        address: config.manifest.nft.address as Address,
        abi: vehicleNftAbi,
        functionName: 'ownerOf',
        args: [tokenId],
        blockNumber,
      });
      const canonicalTokenId = String(tokenId);
      const projectedOwner = projectedOwners.get(canonicalTokenId);
      if (owner.toLowerCase() !== projectedOwner)
        differences.push({
          tokenId: canonicalTokenId,
          field: 'currentOwner',
          projected: projectedOwner ?? null,
          chain: owner.toLowerCase(),
        });
      projectedOwners.delete(canonicalTokenId);
    }
    for (const [tokenId, projectedOwner] of projectedOwners) {
      differences.push({
        tokenId,
        field: 'currentOwner',
        projected: projectedOwner,
        chain: null,
      });
    }
    const after = await client.getBlock({ blockNumber });
    if (after.hash !== checkpoint.blockHash) throw new Error('ANCHOR_CHANGED_DURING_READ');
    if (differences.length) comparison = 'MISMATCH';
  } catch (error) {
    comparison = 'UNVERIFIABLE';
    differences.push({ error: error instanceof Error ? error.message : String(error) });
  }
  const freshness =
    head.number === blockNumber && head.hash === checkpoint.blockHash
      ? 'CURRENT'
      : 'PROJECTION_LAGGING';
  const report = {
    id: randomUUID(),
    deploymentId: config.manifest.deploymentId,
    comparison,
    freshness,
    blockNumber: checkpoint.blockNumber,
    blockHash: checkpoint.blockHash,
    projectorVersion: checkpoint.projectorVersion,
    projectionBuildId: checkpoint.projectionBuildId,
    logScopeHash: checkpoint.logScopeHash,
    scope: {
      sales: { firstSaleId: '1', lastSaleId },
      paymentClaims: true,
      tokenOwnership: { firstTokenId: '1', lastTokenId },
    },
    differences,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO reconciliation_runs(id,deployment_id,comparison,freshness,block_number,block_hash,projector_version,projection_build_id,log_scope_hash,scope_json,differences_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    report.id,
    report.deploymentId,
    report.comparison,
    report.freshness,
    report.blockNumber,
    report.blockHash,
    report.projectorVersion,
    report.projectionBuildId,
    report.logScopeHash,
    JSON.stringify(report.scope),
    JSON.stringify(report.differences),
    report.createdAt,
  );
  console.log(JSON.stringify(report));
  if (comparison !== 'MATCH') process.exitCode = 1;
} finally {
  await writer.close();
}
