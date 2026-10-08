import { notFound } from "next/navigation";
import { q, q1, inr } from "@/lib/db";
import { updateTrip, deleteExpense } from "../../actions";

export const dynamic = "force-dynamic";

export default async function Trip({ params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10) || 0;
  const t = await q1<any>(
    `select t.*, k.number, d.name driver,
       to_char(t.started_at at time zone 'Asia/Kolkata','DD Mon YYYY, HH12:MI AM') started,
       to_char(t.ended_at at time zone 'Asia/Kolkata','DD Mon YYYY, HH12:MI AM') ended
     from trips t join trucks k on k.id=t.truck_id join drivers d on d.id=t.driver_id where t.id=$1`, [id]);
  if (!t) notFound();
  const expenses = await q<any>(`select * from expenses where trip_id=$1 order by created_at`, [id]);
  const cash = await q<any>(`select * from cash_moves where trip_id=$1 order by created_at`, [id]);
  const cost = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = t.freight - cost;

  return (
    <>
      <h1>{t.number}: {t.from_place} to {t.to_place}</h1>
      <p className="sub">{t.driver}, started {t.started}{t.ended ? `, closed ${t.ended}` : ", still open"} <span className={`tag ${t.status}`}>{t.status === "ended" ? "to review" : t.status}</span></p>

      <div className="grid">
        <div className="card"><div className="sub">Distance</div><div className="num big">{t.end_km ? `${t.end_km - t.start_km} km` : "open"}</div><p className="sub" style={{ margin: "6px 0 0" }}>{t.start_km} to {t.end_km ?? "?"}</p></div>
        <div className="card"><div className="sub">Trip profit</div><div className={`num big ${profit < 0 ? "loss" : "gain"}`}>{inr(profit)}</div><p className="sub" style={{ margin: "6px 0 0" }}>Freight {inr(t.freight)}, costs {inr(cost)}</p></div>
      </div>

      {t.start_photo_id || t.end_photo_id ? (
        <>
          <h2>Odometer photos</h2>
          <div className="photos">
            {t.start_photo_id ? <a href={`/api/media/${t.start_photo_id}`} target="_blank"><img src={`/api/media/${t.start_photo_id}`} alt="Starting odometer" /></a> : null}
            {t.end_photo_id ? <a href={`/api/media/${t.end_photo_id}`} target="_blank"><img src={`/api/media/${t.end_photo_id}`} alt="Closing odometer" /></a> : null}
          </div>
        </>
      ) : null}

      <h2>Freight and review</h2>
      <form action={updateTrip} className="card row">
        <input type="hidden" name="id" value={t.id} />
        <div><label htmlFor="party">Party</label><input id="party" name="party" defaultValue={t.party ?? ""} /></div>
        <div><label htmlFor="freight">Freight</label><input id="freight" name="freight" inputMode="decimal" defaultValue={t.freight} /></div>
        <div><label htmlFor="who">Received by</label>
          <select id="who" name="freight_received_by" defaultValue={t.freight_received_by}>
            <option value="driver">Driver collected</option><option value="owner">Paid to owner</option><option value="pending">Not yet received</option>
          </select></div>
        <button name="approve" value="0" className="ghost" style={{ minHeight: 42 }}>Save changes</button>
        {t.status === "ended" ? <button name="approve" value="1">Save and approve</button> : null}
      </form>

      <h2>Expenses</h2>
      <div className="card">
        <table>
          <thead><tr><th>Bill</th><th>Type</th><th>Note</th><th>Paid by</th><th className="r">Amount</th><th></th></tr></thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{e.photo_id ? <a href={`/api/media/${e.photo_id}`} target="_blank"><img className="thumb" src={`/api/media/${e.photo_id}`} alt={`Bill for ${e.category}`} /></a> : "none"}</td>
                <td><b>{e.category}</b><br /><span className="sub">{e.spent_on}</span></td><td>{e.note}</td><td>{e.paid_by}</td><td className="r num">{inr(e.amount)}</td>
                <td><form action={deleteExpense}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="trip_id" value={t.id} /><button className="ghost">Delete</button></form></td>
              </tr>
            ))}
            {!expenses.length ? <tr><td colSpan={6}>No expenses logged on this trip.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h2>Cash the driver says he received</h2>
      <div className="card">
        <table><tbody>
          {cash.map((c) => (<tr key={c.id}><td>{c.moved_on}</td><td>{c.note}</td><td className="r num">{inr(c.amount)}</td></tr>))}
          {!cash.length ? <tr><td>None on this trip.</td></tr> : null}
        </tbody></table>
      </div>
    </>
  );
}
