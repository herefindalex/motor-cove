import { spawnSync } from 'node:child_process';
const commands = [
  ['db:check'],
  ['test:migrations'],
  ['test:db'],
  ['test:seeds'],
  ['test:recovery'],
];
for (const args of commands) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  JSON.stringify({
    status: 'ok',
    profile: 'temporary-sqlite-only',
    commands: commands.map((item) => `pnpm ${item.join(' ')}`),
  }),
);
