import Link from "next/link";
import { q, inr, driverBalance } from "@/lib/db";
import { cleanMonth } from "@/lib/period";
import MonthNav from "./MonthNav";

export const dynamic = "force-dynamic";
const cls = (v: number) => (v < 0 ? "loss" : "gain");

export default async function Summary({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const m = cleanMonth((await searchParams).m);

  const trucks = await q<{ id: number; number: string; trips: number; km: number; freight: number; cost: number }>(
    `select t.id, t.number, coalesce(tr.trips,0) trips, coalesce(tr.km,0) km, coalesce(tr.freight,0) freight, coalesce(ex.cost,0) cost
     from trucks t
     left join (select truck_id, count(*) trips, sum(end_km-start_km) km, sum(freight) freight from trips
                where status<>'open' and to_char(ended_at at time zone 'Asia/Kolkata','YYYY-MM')=$1 group by 1) tr on tr.truck_id=t.id
     left join (select truck_id, sum(amount) cost from expenses where to_char(spent_on,'YYYY-MM')=$1 group by 1) ex on ex.truck_id=t.id
     where t.active or tr.trips>0 or ex.cost>0 order by t.number`,
    [m]
  );
  const shared = (await q<{ cost: number }>(`select coalesce(sum(amount),0) cost from expenses where truck_id is null and to_char(spent_on,'YYYY-MM')=$1`, [m]))[0].cost;
  const cats = await q<{ category: string; total: number }>(
    `select category, sum(amount) total from expenses where to_char(spent_on,'YYYY-MM')=$1 group by 1 order by 2 desc`, [m]);
  const pending = await q<{ id: number; number: string; party: string; to_place: string; freight: number }>(
    `select t.id, k.number, t.party, t.to_place, t.freight from trips t join trucks k on k.id=t.truck_id
     where t.status<>'open' and t.freight_received_by='pending' and t.freight>0 order by t.ended_at`);
  const drivers = await q<{ id: number; name: string }>(`select id, name from drivers where active order by name`);
  const balances = await Promise.all(drivers.map(async (d) => ({ ...d, ...(await driverBalance(d.id)) })));

  const freight = trucks.reduce((s, t) => s + t.freight, 0);
  const cost = trucks.reduce((s, t) => s + t.cost, 0) + shared;
  const profit = freight - cost;

  return (
    <>
      <h1>Profit and loss</h1>
      <MonthNav path="/" m={m} />
      <div className="card">
        <div className="sub">Fleet profit</div>
        <div className={`num big ${cls(profit)}`}>{inr(profit)}</div>
        <p className="sub" style={{ marginTop: 8 }}>Freight {inr(freight)}, costs {inr(cost)}{shared ? `, of which ${inr(shared)} shared` : ""}</p>
      </div>

      <h2>By truck</h2>
      <div className="card">
        <table>
          <thead><tr><th>Truck</th><th className="r">Trips</th><th className="r">Km</th><th className="r">Freight</th><th className="r">Costs</th><th className="r">Profit</th><th className="r">Per km</th></tr></thead>
          <tbody>
            {trucks.map((t) => {
              const p = t.freight - t.cost;
              return (
                <tr key={t.id}>
                  <td><b>{t.number}</b></td><td className="r">{t.trips}</td><td className="r">{Math.round(t.km).toLocaleString("en-IN")}</td>
                  <td className="r">{inr(t.freight)}</td><td className="r">{inr(t.cost)}</td>
                  <td className={`r num ${cls(p)}`}>{inr(p)}</td><td className="r">{t.km ? inr(p / t.km) : ""}</td>
                </tr>
              );
            })}
            {!trucks.length ? <tr><td colSpan={7}>No trucks yet. Add them under Setup and cash.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h2>Cash with drivers</h2>
      <div className="card">
        <table>
          <thead><tr><th>Driver</th><th className="r">From owner</th><th className="r">Freight collected</th><th className="r">Expenses paid</th><th className="r">Returned</th><th className="r">Holding now</th></tr></thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.id}>
                <td><b>{b.name}</b></td><td className="r">{inr(b.advance)}</td><td className="r">{inr(b.freight)}</td>
                <td className="r">{inr(b.spent)}</td><td className="r">{inr(b.returned)}</td>
                <td className={`r num ${b.balance < 0 ? "loss" : ""}`}>{inr(b.balance)}</td>
              </tr>
            ))}
            {!balances.length ? <tr><td colSpan={6}>No drivers yet.</td></tr> : null}
          </tbody>
        </table>
        <p className="sub" style={{ margin: "10px 0 0" }}>A negative figure means you owe the driver. Record hand-overs under Setup and cash.</p>
      </div>

      <h2>Freight not yet received</h2>
      <div className="card">
        <table>
          <tbody>
            {pending.map((t) => (
              <tr key={t.id}><td><Link href={`/trips/${t.id}`}>{t.number}</Link></td><td>{t.party || t.to_place}</td><td className="r num">{inr(t.freight)}</td></tr>
            ))}
            {!pending.length ? <tr><td>Nothing pending.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h2>Where the money went</h2>
      <div className="card">
        <table>
          <tbody>
            {cats.map((c) => (<tr key={c.category}><td>{c.category}</td><td className="r num">{inr(c.total)}</td></tr>))}
            {!cats.length ? <tr><td>No expenses this month.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
