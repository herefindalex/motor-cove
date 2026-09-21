import type { SalesReader } from './ports.js';
export const listSales = (reader: SalesReader) => reader.listSales();
