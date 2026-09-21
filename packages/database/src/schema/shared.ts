import { sql } from 'drizzle-orm';

export const canonicalUint256 = (column: string, positive = false) => {
  const value = sql.raw(`"${column}"`);
  const lower = positive ? sql`${value} <> '0' AND ` : sql``;
  return sql`${lower}length(${value}) BETWEEN 1 AND 78
    AND (${value} = '0' OR substr(${value}, 1, 1) BETWEEN '1' AND '9')
    AND ${value} NOT GLOB '*[^0-9]*'
    AND (length(${value}) < 78 OR ${value} <= '115792089237316195423570985008687907853269984665640564039457584007913129639935')`;
};

export const safeInteger = (column: string) => {
  const value = sql.raw(`"${column}"`);
  return sql`${value} >= 0 AND ${value} <= 9007199254740991`;
};

export const hexLength = (column: string, chars: number) => {
  const value = sql.raw(`"${column}"`);
  const totalLength = sql.raw(String(chars + 2));
  return sql`length(${value}) = ${totalLength} AND substr(${value}, 1, 2) = '0x' AND lower(${value}) = ${value} AND substr(${value}, 3) NOT GLOB '*[^0-9a-f]*'`;
};
