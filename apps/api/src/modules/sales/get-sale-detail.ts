import type { SalesReader } from './ports.js';

export const getSaleDetail = (reader: SalesReader, saleId: string) => reader.getSale(saleId);
