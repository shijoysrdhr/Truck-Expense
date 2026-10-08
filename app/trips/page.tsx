import Link from "next/link";
import { q, inr } from "@/lib/db";
import { cleanMonth } from "@/lib/period";
import MonthNav from "../MonthNav";

export const dynamic = "force-dynamic";

export default async function Trips({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const m = cleanMonth((await searchParams).m);
  const trips = await q<any>(
    `select t.*, k.number, d.name driver,
       to_char(t.started_at at time zone 'Asia/Kolkata','DD Mon') started,
       coalesce((select sum(amount) from expenses e where e.trip_id=t.id),0) cost
     from trips t join trucks k on k.id=t.truck_id join drivers d on d.id=t.driver_id
     where t.status='open' or to_char(coalesce(t.ended_at,t.started_at) at time zone 'Asia/Kolkata','YYYY-MM')=$1
     order by t.started_at desc`,
    [m]
  );
  return (
    <>
      <h1>Trips</h1>
      <MonthNav path="/trips" m={m} />
      <div className="card">
        <table>
          <thead><tr><th>Started</th><th>Truck</th><th>Route</th><th>Driver</th><th className="r">Km</th><th className="r">Freight</th><th className="r">Costs</th><th className="r">Profit</th><th>Status</th></tr></thead>
          <tbody>
            {trips.map((t) => {
              const p = t.freight - t.cost;
              return (
                <tr key={t.id}>
                  <td>{t.started}</td><td><b>{t.number}</b></td>
                  <td><Link href={`/trips/${t.id}`}>{t.from_place} to {t.to_place}</Link></td><td>{t.driver}</td>
                  <td className="r">{t.end_km ? t.end_km - t.start_km : ""}</td><td className="r">{inr(t.freight)}</td><td className="r">{inr(t.cost)}</td>
                  <td className={`r num ${p < 0 ? "loss" : "gain"}`}>{t.status === "open" ? "" : inr(p)}</td>
                  <td><span className={`tag ${t.status}`}>{t.status === "ended" ? "to review" : t.status}</span></td>
                </tr>
              );
            })}
            {!trips.length ? <tr><td colSpan={9}>No trips in this month.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
