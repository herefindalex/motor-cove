import { resolve } from 'node:path';
import { environmentPaths } from '@motorcove/database/maintenance';

export function workspaceRoot(): string {
  return resolve(import.meta.dirname, '../..');
}
export function value(name: string, args = process.argv.slice(2)): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}
export function flag(name: string, args = process.argv.slice(2)): boolean {
  return args.includes(`--${name}`);
}
export function required(name: string): string {
  const result = value(name);
  if (!result) throw new Error(`ARGUMENT_REQUIRED: --${name}`);
  return result;
}
export function target() {
  return environmentPaths(workspaceRoot(), required('env'));
}
export function output(result: unknown) {
  console.log(JSON.stringify(result, null, 2));
}
