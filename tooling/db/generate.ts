import { execFileSync } from 'node:child_process';
import { required, workspaceRoot } from './args.js';
const root = workspaceRoot();
const name = required('name');
if (!/^[a-z][a-z0-9_-]{1,48}$/.test(name)) throw new Error('INVALID_MIGRATION_NAME');
execFileSync(
  'pnpm',
  [
    '--filter',
    '@motorcove/database',
    'exec',
    'drizzle-kit',
    'generate',
    '--config',
    'drizzle.config.ts',
    '--name',
    name,
  ],
  { cwd: root, stdio: 'inherit' },
);
execFileSync(
  'pnpm',
  ['--filter', '@motorcove/database', 'exec', 'tsx', 'src/maintenance/generate-contract.ts'],
  { cwd: root, stdio: 'inherit' },
);
