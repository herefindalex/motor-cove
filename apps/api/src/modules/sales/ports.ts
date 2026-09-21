import type { ReadModelReader } from '@motorcove/database/reader';
export type SalesReader = Pick<ReadModelReader, 'listSales' | 'getSale' | 'observeFunding'>;
