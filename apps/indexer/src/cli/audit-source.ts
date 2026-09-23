import { createReadOnlyReader } from '@motorcove/database/reader';
import { chainProfileForId } from '@motorcove/chain-artifacts/profiles';
import { createPublicClient, http } from 'viem';
import { runSourceAudit } from '../adapters/evm/run-source-audit.js';
import { loadConfig } from '../runtime/config.js';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const from = option('from');
const to = option('to');
const secondaryRpcUrl = option('secondary-rpc-url');
if (!from || !to || !secondaryRpcUrl || !/^\d+$/.test(from) || !/^\d+$/.test(to))
  throw new Error('SOURCE_AUDIT_ARGUMENTS_INVALID: --from --to --secondary-rpc-url required');

const config = loadConfig();
const reader = await createReadOnlyReader(config.environment, config.manifest.deploymentId);
try {
  const report = await runSourceAudit({
    reader,
    secondary: createPublicClient({ transport: http(secondaryRpcUrl) }),
    manifest: config.manifest,
    profile: chainProfileForId(config.manifest.chainId),
    primaryRpcUrl: config.rpcUrl,
    secondaryRpcUrl,
    fromBlock: BigInt(from),
    toBlock: BigInt(to),
  });
  console.log(JSON.stringify(report));
  if (report.result !== 'MATCH') process.exitCode = 1;
} finally {
  await reader.close();
}
