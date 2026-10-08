import { Pool, types } from "pg";

types.setTypeParser(1700, (v) => parseFloat(v)); // numeric -> number
types.setTypeParser(1082, (v) => v);             // date -> "YYYY-MM-DD"
types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint (count)

const g = globalThis as unknown as { _pool?: Pool };
export const pool =
  g._pool ??
  (g._pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "1" ? { rejectUnauthorized: false } : undefined,
  }));

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(text, params as any[])).rows as T[];
}
export async function q1<T = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}

export const inr = (v: number | null | undefined) => {
  const n = Math.round(Number(v) || 0);
  return (n < 0 ? "\u2212" : "") + "\u20B9" + Math.abs(n).toLocaleString("en-IN");
};

/** Cash the driver is holding that belongs to the owner (negative = owner owes driver). */
export async function driverBalance(driverId: number) {
  const r = await q1<{ advance: number; returned: number; freight: number; spent: number }>(
    `select
      coalesce((select sum(amount) from cash_moves where driver_id=$1 and kind='advance'),0) as advance,
      coalesce((select sum(amount) from cash_moves where driver_id=$1 and kind='return'),0) as returned,
      coalesce((select sum(freight) from trips where driver_id=$1 and status<>'open' and freight_received_by='driver'),0) as freight,
      coalesce((select sum(amount) from expenses where driver_id=$1 and paid_by='driver'),0) as spent`,
    [driverId]
  );
  const b = r!;
  return { ...b, balance: b.advance + b.freight - b.spent - b.returned };
}
