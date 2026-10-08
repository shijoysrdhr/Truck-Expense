import { q, inr } from "@/lib/db";
import { addTruck, addDriver, toggleActive, addCashMove } from "../actions";

export const dynamic = "force-dynamic";

export default async function Setup() {
  const trucks = await q<any>(`select * from trucks order by number`);
  const drivers = await q<any>(`select * from drivers order by name`);
  const moves = await q<any>(
    `select c.*, d.name from cash_moves c join drivers d on d.id=c.driver_id order by c.created_at desc limit 30`);
  return (
    <>
      <h1>Setup and cash</h1>

      <h2>Cash given or returned</h2>
      <form action={addCashMove} className="card row">
        <div><label htmlFor="cd">Driver</label><select id="cd" name="driver_id" required>{drivers.filter((d) => d.active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div><label htmlFor="ck">What happened</label><select id="ck" name="kind"><option value="return">Driver returned cash to me</option><option value="advance">I gave cash to driver</option></select></div>
        <div><label htmlFor="ca">Amount</label><input id="ca" name="amount" inputMode="decimal" required /></div>
        <div><label htmlFor="cdt">Date</label><input id="cdt" type="date" name="date" /></div>
        <div><label htmlFor="cn">Note</label><input id="cn" name="note" /></div>
        <button>Record</button>
      </form>
      <div className="card" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Date</th><th>Driver</th><th>Entry</th><th>Entered by</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {moves.map((c) => (<tr key={c.id}><td>{c.moved_on}</td><td>{c.name}</td><td>{c.kind === "advance" ? "Given to driver" : "Returned by driver"}{c.note ? `, ${c.note}` : ""}</td><td>{c.source}</td><td className="r num">{inr(c.amount)}</td></tr>))}
            {!moves.length ? <tr><td colSpan={5}>No cash entries yet.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h2>Trucks</h2>
      <form action={addTruck} className="card row">
        <div><label htmlFor="tn">Registration number</label><input id="tn" name="number" placeholder="KL 11 AB 1234" required /></div>
        <button>Add truck</button>
      </form>
      <div className="card" style={{ marginTop: 12 }}>
        <table><tbody>
          {trucks.map((t) => (
            <tr key={t.id}><td><b>{t.number}</b></td><td>{t.active ? "Active" : "Hidden from drivers"}</td>
              <td className="r"><form action={toggleActive}><input type="hidden" name="table" value="trucks" /><input type="hidden" name="id" value={t.id} /><button className="ghost">{t.active ? "Hide" : "Show"}</button></form></td></tr>
          ))}
          {!trucks.length ? <tr><td>No trucks yet.</td></tr> : null}
        </tbody></table>
      </div>

      <h2>Drivers</h2>
      <p className="sub">Only these numbers can use the bot, on WhatsApp or Telegram. On Telegram the driver opens the bot, taps Start, and shares his number once.</p>
      <form action={addDriver} className="card row">
        <div><label htmlFor="dn">Name</label><input id="dn" name="name" required /></div>
        <div><label htmlFor="dp">WhatsApp number</label><input id="dp" name="phone" inputMode="tel" placeholder="98XXXXXXXX" required /></div>
        <button>Add driver</button>
      </form>
      <div className="card" style={{ marginTop: 12 }}>
        <table><tbody>
          {drivers.map((d) => (
            <tr key={d.id}><td><b>{d.name}</b></td><td>{d.phone}</td><td>{d.telegram_chat_id ? "Telegram linked" : "WhatsApp only"}</td><td>{d.active ? "Active" : "Blocked"}</td>
              <td className="r"><form action={toggleActive}><input type="hidden" name="table" value="drivers" /><input type="hidden" name="id" value={d.id} /><button className="ghost">{d.active ? "Block" : "Unblock"}</button></form></td></tr>
          ))}
          {!drivers.length ? <tr><td>No drivers yet.</td></tr> : null}
        </tbody></table>
      </div>
    </>
  );
}
