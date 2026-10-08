import { q, inr } from "@/lib/db";
import { cleanMonth } from "@/lib/period";
import MonthNav from "../MonthNav";
import { addOwnerExpense, deleteExpense } from "../actions";

export const dynamic = "force-dynamic";
const CATS = ["Driver salary", "Repairs and service", "Tyres", "EMI", "Insurance", "Tax, permit and fitness", "Diesel", "Fines and RTO", "Other"];

export default async function Expenses({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const m = cleanMonth((await searchParams).m);
  const trucks = await q<{ id: number; number: string }>(`select id, number from trucks where active order by number`);
  const rows = await q<any>(
    `select e.*, k.number from expenses e left join trucks k on k.id=e.truck_id
     where e.trip_id is null and to_char(e.spent_on,'YYYY-MM')=$1 order by e.spent_on desc, e.id desc`, [m]);
  return (
    <>
      <h1>Owner expenses</h1>
      <p className="sub">Costs outside a trip: EMI, insurance, tyres, salary, workshop bills. Drivers' non-trip expenses also show here.</p>
      <form action={addOwnerExpense} className="card row">
        <div><label htmlFor="d">Date</label><input id="d" type="date" name="date" /></div>
        <div><label htmlFor="t">Truck</label><select id="t" name="truck_id"><option value="">Shared</option>{trucks.map((t) => <option key={t.id} value={t.id}>{t.number}</option>)}</select></div>
        <div><label htmlFor="c">Category</label><select id="c" name="category">{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label htmlFor="a">Amount</label><input id="a" name="amount" inputMode="decimal" required /></div>
        <div><label htmlFor="n">Note</label><input id="n" name="note" /></div>
        <button>Add expense</button>
      </form>
      <MonthNav path="/expenses" m={m} />
      <div className="card">
        <table>
          <thead><tr><th>Date</th><th>Truck</th><th>Category</th><th>Note</th><th className="r">Amount</th><th></th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.spent_on}</td><td>{e.number ?? "Shared"}</td><td>{e.category}</td>
                <td>{e.note}{e.photo_id ? <> <a href={`/api/media/${e.photo_id}`} target="_blank">bill</a></> : null}</td>
                <td className="r num">{inr(e.amount)}</td>
                <td><form action={deleteExpense}><input type="hidden" name="id" value={e.id} /><button className="ghost">Delete</button></form></td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={6}>Nothing logged this month.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
