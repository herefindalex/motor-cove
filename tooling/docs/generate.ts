import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateDatabaseDocumentation } from './generate-database.js';

const root = resolve(import.meta.dirname, '../..');
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(root, path), 'utf8')) as unknown;
const escape = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
const replace = (path: string, start: string, end: string, body: string, check: boolean) => {
  const absolute = resolve(root, path);
  const current = readFileSync(absolute, 'utf8');
  const from = current.indexOf(start),
    to = current.indexOf(end);
  if (from < 0 || to < from) throw new Error(`GENERATED_MARKER_MISSING: ${path}`);
  const next = `${current.slice(0, from + start.length)}\n${body.trim()}\n${current.slice(to)}`;
  if (check && next !== current) throw new Error(`GENERATED_DOC_DRIFT: ${path}`);
  if (!check) writeFileSync(absolute, next);
};
export async function generate(check = false) {
  const databaseDocumentation = await generateDatabaseDocumentation(check);
  const capabilityData = readJson('docs/_meta/capabilities.json') as {
    capabilities: Array<{
      id: string;
      name: string;
      implementation: string;
      verification: string[];
      limits: string;
    }>;
  };
  const evidence = readJson('docs/evidence/verification.json') as {
    runs: Array<{ id: string; status: string }>;
  };
  const states = new Map(evidence.runs.map((run) => [run.id, run.status]));
  const capabilityRows = [
    '| ID | Capability | Implementation | Evidence | Main limit |',
    '| --- | --- | --- | --- | --- |',
    ...capabilityData.capabilities.map(
      (item) =>
        `| ${item.id} | ${escape(item.name)} | ${item.implementation} | ${item.verification.length ? item.verification.map((id) => `${id}: ${states.get(id) ?? 'missing'}`).join('<br>') : 'source inspection only'} | ${escape(item.limits)} |`,
    ),
  ].join('\n');
  replace(
    'docs/engineering-capability-map.md',
    '<!-- GENERATED:CAPABILITIES:START -->',
    '<!-- GENERATED:CAPABILITIES:END -->',
    capabilityRows,
    check,
  );
  const commands = (
    readJson('docs/_meta/commands.json') as {
      commands: Array<{ command: string; status: string; effect: string; prerequisite: string }>;
    }
  ).commands;
  const commandRows = [
    '| Command | Status | Effect | Prerequisite |',
    '| --- | --- | --- | --- |',
    ...commands.map(
      (item) =>
        `| \`${escape(item.command)}\` | ${item.status} | ${escape(item.effect)} | ${escape(item.prerequisite)} |`,
    ),
  ].join('\n');
  replace(
    'docs/reference/commands.md',
    '<!-- GENERATED:COMMANDS:START -->',
    '<!-- GENERATED:COMMANDS:END -->',
    commandRows,
    check,
  );
  console.log(
    JSON.stringify({
      status: 'ok',
      mode: check ? 'check' : 'write',
      capabilities: capabilityData.capabilities.length,
      commands: commands.length,
      databaseTables: databaseDocumentation.tables,
    }),
  );
}
await generate(process.argv.includes('--check'));
