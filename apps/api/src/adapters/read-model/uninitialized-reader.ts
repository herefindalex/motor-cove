import type { ReadModelReader } from '@motorcove/database/reader';

export class UninitializedReader implements ReadModelReader {
  private unavailable(): never {
    throw new Error('Read model is not initialized; run pnpm dev:bootstrap');
  }
  deploymentDescriptor() {
    return this.unavailable();
  }
  listSales() {
    return this.unavailable();
  }
  getSale() {
    return this.unavailable();
  }
  observeFunding() {
    return this.unavailable();
  }
  listVehicles() {
    return this.unavailable();
  }
  systemStatus() {
    return this.unavailable();
  }
  recentEvents() {
    return this.unavailable();
  }
  latestReconciliation() {
    return this.unavailable();
  }
  async close(): Promise<void> {}
}
