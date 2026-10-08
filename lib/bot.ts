import { q, q1, inr, driverBalance } from "./db";
import { AsyncLocalStorage } from "async_hooks";
import { notifyOwner } from "./notify";

export interface Channel {
  sendText(to: string, body: string): Promise<boolean>;
  sendButtons(to: string, body: string, buttons: { id: string; title: string }[]): Promise<boolean>;
  sendList(to: string, body: string, button: string, rows: { id: string; title: string; description?: string }[]): Promise<boolean>;
  downloadMedia(id: string): Promise<{ mime: string; data: Buffer } | null>;
}
const als = new AsyncLocalStorage<Channel>();
const ch = () => als.getStore()!;
const sendText: Channel["sendText"] = (to, b) => ch().sendText(to, b);
const sendButtons: Channel["sendButtons"] = (to, b, k) => ch().sendButtons(to, b, k);
const sendList: Channel["sendList"] = (to, b, k, r) => ch().sendList(to, b, k, r);
const downloadMedia: Channel["downloadMedia"] = (id) => ch().downloadMedia(id);

export type Incoming =
  | { kind: "text"; text: string }
  | { kind: "choice"; id: string }
  | { kind: "image"; mediaId: string; caption?: string };

type Driver = { id: number; name: string; phone: string };
type Trip = { id: number; truck_id: number; number: string; from_place: string; to_place: string; start_km: number };
type Data = Record<string, any>;

export const CATEGORIES: [string, string][] = [
  ["diesel", "Diesel"],
  ["toll", "Toll"],
  ["bata", "Driver bata"],
  ["loading", "Loading/unloading"],
  ["commission", "Commission"],
  ["repair", "Repair/puncture"],
  ["police", "Police/RTO"],
  ["parking", "Parking/halting"],
  ["other", "Other"],
];
const catLabel = (id: string) => CATEGORIES.find((c) => c[0] === id)?.[1] ?? id;

const SESSION_HOURS = 12;

/* ---------- helpers ---------- */
async function getSession(phone: string): Promise<{ state: string; data: Data }> {
  const s = await q1<{ state: string; data: Data }>(
    `select state, data from sessions where phone=$1 and updated_at > now() - interval '${SESSION_HOURS} hours'`,
    [phone]
  );
  return s ?? { state: "idle", data: {} };
}
const setSession = (phone: string, state: string, data: Data) =>
  q(
    `insert into sessions(phone,state,data,updated_at) values($1,$2,$3,now())
     on conflict(phone) do update set state=$2, data=$3, updated_at=now()`,
    [phone, state, JSON.stringify(data)]
  );
const clearSession = (phone: string) => q(`delete from sessions where phone=$1`, [phone]);

const openTrip = (driverId: number) =>
  q1<Trip>(
    `select t.id, t.truck_id, k.number, t.from_place, t.to_place, t.start_km
     from trips t join trucks k on k.id=t.truck_id where t.driver_id=$1 and t.status='open'`,
    [driverId]
  );

/** "3,500 tyre puncture" -> { amount: 3500, note: "tyre puncture" } */
function parseAmount(text: string): { amount: number; note: string } | null {
  const m = text.replace(/[,\u20B9]/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const note = text.replace(/[,\u20B9]/g, "").replace(m[1], "").replace(/^(rs\.?|inr)\s*/i, "").trim();
  return { amount: parseFloat(m[1]), note };
}

async function saveMedia(mediaId: string): Promise<number | null> {
  const f = await downloadMedia(mediaId);
  if (!f) return null;
  const r = await q1<{ id: number }>(`insert into media(mime,data) values($1,$2) returning id`, [f.mime, f.data]);
  return r!.id;
}

async function truckList(phone: string, body: string) {
  const trucks = await q<{ id: number; number: string }>(`select id, number from trucks where active order by number`);
  if (!trucks.length) return sendText(phone, "No trucks are set up yet. Ask the owner to add them.");
  return sendList(phone, body, "Choose truck", trucks.map((t) => ({ id: `truck:${t.id}`, title: t.number })));
}

async function menu(phone: string, driver: Driver, lead?: string) {
  const trip = await openTrip(driver.id);
  const head = lead ? lead + "\n\n" : `Hi ${driver.name}.\n`;
  if (trip) {
    return sendList(
      phone,
      `${head}Open trip: ${trip.number}, ${trip.from_place} to ${trip.to_place}.\nWhat do you want to do?`,
      "Open menu",
      [
        { id: "menu:expense", title: "Add expense", description: "Diesel, toll, bata, repairs and more" },
        { id: "menu:cash", title: "Cash from owner", description: "Money you received from the owner" },
        { id: "menu:end", title: "End trip", description: "Closing km and freight" },
        { id: "menu:balance", title: "My balance", description: "Cash you are holding" },
      ]
    );
  }
  return sendList(phone, `${head}You have no open trip.\nWhat do you want to do?`, "Open menu", [
    { id: "menu:start", title: "Start trip", description: "Truck, route, starting km, advance" },
    { id: "menu:expense", title: "Add expense", description: "A cost outside a trip" },
    { id: "menu:cash", title: "Cash from owner", description: "Money you received from the owner" },
    { id: "menu:balance", title: "My balance", description: "Cash you are holding" },
  ]);
}

const nextButtons = (phone: string, body: string) =>
  sendButtons(phone, body, [
    { id: "menu:expense", title: "Add expense" },
    { id: "menu:end", title: "End trip" },
    { id: "menu:balance", title: "My balance" },
  ]);

async function balanceText(driverId: number) {
  const b = await driverBalance(driverId);
  const verdict =
    b.balance > 0 ? `You are holding ${inr(b.balance)} of the owner's cash.`
    : b.balance < 0 ? `The owner owes you ${inr(-b.balance)}.`
    : "You and the owner are settled.";
  return (
    `Cash from owner: ${inr(b.advance)}\nFreight you collected: ${inr(b.freight)}\n` +
    `Expenses you paid: ${inr(b.spent)}\nReturned to owner: ${inr(b.returned)}\n\n${verdict}`
  );
}

/* ---------- main entry ---------- */
export function handle(key: string, m: Incoming, channel: Channel) {
  return als.run(channel, () => handleInner(key, m));
}

async function handleInner(phone: string, m: Incoming) {
  const driver = phone.startsWith("tg:")
    ? await q1<Driver>(`select id, name, phone from drivers where telegram_chat_id=$1 and active`, [phone.slice(3)])
    : await q1<Driver>(`select id, name, phone from drivers where phone=$1 and active`, [phone]);
  if (!driver) return; // unknown users are ignored (Telegram linking happens in the route)

  const text = m.kind === "text" ? m.text.trim() : "";
  if (m.kind === "text" && /^(hi|hello|hey|menu|cancel|stop)$/i.test(text)) {
    await clearSession(phone);
    return menu(phone, driver);
  }
  if (m.kind === "choice" && m.id.startsWith("menu:")) {
    await clearSession(phone);
    return startFlow(phone, driver, m.id);
  }

  const { state, data } = await getSession(phone);

  // shortcut: "diesel 3500 hp pump" or "3500 diesel" straight from the menu
  if (state === "idle" && m.kind === "text") {
    const quick = parseQuick(text);
    if (quick) {
      const trip = await openTrip(driver.id);
      const d: Data = { ...quick, trip_id: trip?.id ?? null, truck_id: trip?.truck_id ?? null };
      if (!trip) { await setSession(phone, "exp.truck", d); return truckList(phone, "Which truck is this expense for?"); }
      await setSession(phone, "exp.paid", d);
      return whoPaid(phone, d);
    }
  }
  const retry = (msg: string) => sendText(phone, msg + "\n(Type cancel to stop.)");

  switch (state) {
    /* ----- start trip ----- */
    case "start.truck": {
      if (m.kind !== "choice" || !m.id.startsWith("truck:")) return truckList(phone, "Please pick the truck from the list.");
      data.truck_id = +m.id.slice(6);
      await setSession(phone, "start.from", data);
      return sendText(phone, "Where are you starting from?");
    }
    case "start.from":
      if (!text) return retry("Type the starting place.");
      data.from = text;
      await setSession(phone, "start.to", data);
      return sendText(phone, "Where are you going to?");
    case "start.to":
      if (!text) return retry("Type the destination.");
      data.to = text;
      await setSession(phone, "start.party", data);
      return sendButtons(phone, "Party or load name?", [{ id: "skip", title: "Skip" }]);
    case "start.party":
      data.party = m.kind === "choice" ? null : text || null;
      await setSession(phone, "start.km", data);
      return sendText(phone, "Starting km reading? You can send a photo of the odometer first if you like.");
    case "start.km": {
      if (m.kind === "image") {
        data.start_photo_id = await saveMedia(m.mediaId);
        await setSession(phone, "start.km", data);
        return sendText(phone, "Photo saved. Now type the starting km reading.");
      }
      const p = parseAmount(text);
      if (!p) return retry("Type the km reading as a number, like 84350.");
      const last = await q1<{ km: number }>(`select max(end_km) as km from trips where truck_id=$1`, [data.truck_id]);
      data.start_km = p.amount;
      data.km_warning = last?.km && p.amount < last.km ? `Note: the last trip of this truck closed at ${last.km} km.` : "";
      await setSession(phone, "start.advance", data);
      return sendText(phone, "How much cash did you take from the owner for this trip? Type 0 if none.");
    }
    case "start.advance": {
      const p = parseAmount(text);
      if (!p) return retry("Type the amount as a number. Type 0 if none.");
      const trip = await q1<{ id: number }>(
        `insert into trips(truck_id,driver_id,from_place,to_place,party,start_km,start_photo_id)
         values($1,$2,$3,$4,$5,$6,$7) returning id`,
        [data.truck_id, driver.id, data.from, data.to, data.party, data.start_km, data.start_photo_id ?? null]
      );
      if (p.amount > 0)
        await q(`insert into cash_moves(driver_id,trip_id,kind,amount,note,source) values($1,$2,'advance',$3,'Trip advance','driver')`, [
          driver.id, trip!.id, p.amount,
        ]);
      await clearSession(phone);
      return nextButtons(
        phone,
        `Trip started: ${data.from} to ${data.to}\nStarting km: ${data.start_km}\nAdvance: ${inr(p.amount)}` +
          (data.km_warning ? `\n${data.km_warning}` : "") + `\n\nSafe journey. Log expenses as they happen.`
      );
    }

    /* ----- expense ----- */
    case "exp.truck": {
      if (m.kind !== "choice" || !m.id.startsWith("truck:")) return truckList(phone, "Please pick the truck from the list.");
      data.truck_id = +m.id.slice(6);
      if (data.category) { await setSession(phone, "exp.paid", data); return whoPaid(phone, data); }
      await setSession(phone, "exp.cat", data);
      return categoryList(phone);
    }
    case "exp.cat": {
      if (m.kind !== "choice" || !m.id.startsWith("cat:")) return categoryList(phone);
      data.category = m.id.slice(4);
      await setSession(phone, "exp.amount", data);
      return sendText(phone, `${catLabel(data.category)}: how much? You can add a short note, like "450 puncture".`);
    }
    case "exp.amount": {
      const p = parseAmount(text);
      if (!p || p.amount <= 0) return retry("Type the amount as a number, like 3500.");
      data.amount = p.amount;
      data.note = p.note || null;
      await setSession(phone, "exp.paid", data);
      return whoPaid(phone, data);
    }
    case "exp.paid": {
      if (m.kind !== "choice" || !m.id.startsWith("paid:")) return retry("Tap one of the buttons: I paid, or Owner paid/credit.");
      data.paid_by = m.id.slice(5);
      await setSession(phone, "exp.photo", data);
      return sendButtons(phone, "Send a photo of the bill, or skip.", [{ id: "skip", title: "Skip photo" }]);
    }
    case "exp.photo": {
      let photoId: number | null = null;
      if (m.kind === "image") {
        photoId = await saveMedia(m.mediaId);
        if (m.caption && !data.note) data.note = m.caption;
      } else if (!(m.kind === "choice" && m.id === "skip")) {
        return sendButtons(phone, "Send the bill photo, or tap Skip photo.", [{ id: "skip", title: "Skip photo" }]);
      }
      await q(
        `insert into expenses(trip_id,truck_id,driver_id,category,amount,paid_by,note,photo_id) values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [data.trip_id ?? null, data.truck_id, driver.id, catLabel(data.category), data.amount, data.paid_by, data.note, photoId]
      );
      await clearSession(phone);
      const b = await driverBalance(driver.id);
      return nextButtons(
        phone,
        `Saved: ${catLabel(data.category)} ${inr(data.amount)}, ${data.paid_by === "driver" ? "paid by you" : "paid by owner"}` +
          `${photoId ? ", with bill photo" : ""}.\nCash in your hand: ${inr(b.balance)}`
      );
    }

    /* ----- cash from owner ----- */
    case "cash.amount": {
      const p = parseAmount(text);
      if (!p || p.amount <= 0) return retry("Type the amount as a number.");
      await q(`insert into cash_moves(driver_id,trip_id,kind,amount,note,source) values($1,$2,'advance',$3,$4,'driver')`, [
        driver.id, data.trip_id ?? null, p.amount, p.note || null,
      ]);
      await clearSession(phone);
      const b = await driverBalance(driver.id);
      return menu(phone, driver, `Saved: ${inr(p.amount)} received from owner.\nCash in your hand: ${inr(b.balance)}`);
    }

    /* ----- end trip ----- */
    case "end.km": {
      if (m.kind === "image") {
        data.end_photo_id = await saveMedia(m.mediaId);
        await setSession(phone, "end.km", data);
        return sendText(phone, "Photo saved. Now type the closing km reading.");
      }
      const p = parseAmount(text);
      if (!p) return retry("Type the closing km reading as a number.");
      if (p.amount <= data.start_km) return retry(`Closing km must be more than the starting km (${data.start_km}).`);
      data.end_km = p.amount;
      await setSession(phone, "end.freight", data);
      return sendText(phone, "Total freight for this trip? Type 0 if you don't know it.");
    }
    case "end.freight": {
      const p = parseAmount(text);
      if (!p) return retry("Type the freight amount as a number.");
      data.freight = p.amount;
      await setSession(phone, "end.who", data);
      return sendButtons(phone, `Freight ${inr(p.amount)}. Who received it?`, [
        { id: "fr:driver", title: "I collected" },
        { id: "fr:owner", title: "Paid to owner" },
        { id: "fr:pending", title: "Not yet paid" },
      ]);
    }
    case "end.who": {
      if (m.kind !== "choice" || !m.id.startsWith("fr:")) return retry("Tap one of the three buttons.");
      const who = m.id.slice(3);
      await q(
        `update trips set end_km=$2, freight=$3, freight_received_by=$4, end_photo_id=$5, status='ended', ended_at=now() where id=$1 and status='open'`,
        [data.trip_id, data.end_km, data.freight, who, data.end_photo_id ?? null]
      );
      await clearSession(phone);
      const ex = await q1<{ total: number; mine: number }>(
        `select coalesce(sum(amount),0) total, coalesce(sum(amount) filter (where paid_by='driver'),0) mine from expenses where trip_id=$1`,
        [data.trip_id]
      );
      const km = data.end_km - data.start_km;
      const whoText = who === "driver" ? "collected by you" : who === "owner" ? "paid to owner" : "not yet paid";
      await sendText(
        phone,
        `Trip closed: ${data.from} to ${data.to}\nDistance: ${km} km\nFreight: ${inr(data.freight)}, ${whoText}\n` +
          `Expenses you paid: ${inr(ex!.mine)}\n\n${await balanceText(driver.id)}`
      );
      await notifyOwner(
          `${driver.name} closed a trip on ${data.number}\n${data.from} to ${data.to}, ${km} km\nFreight ${inr(data.freight)} (${who === "driver" ? "collected by driver" : whoText})\n` +
            `Expenses ${inr(ex!.total)}\nTrip profit ${inr(data.freight - ex!.total)}`
      );
      return;
    }
  }

  // idle, or something we did not expect
  if (m.kind === "image") return menu(phone, driver, "To save a bill photo, choose Add expense first, then send the photo when asked.");
  if (m.kind === "text" && text) return menu(phone, driver, "Tip: you can type an expense directly, like \"diesel 3500\" or \"toll 420\".");
  return menu(phone, driver);
}

const whoPaid = (phone: string, d: Data) =>
  sendButtons(phone, `${catLabel(d.category)} ${inr(d.amount)}${d.note ? ", " + d.note : ""}. Who paid?`, [
    { id: "paid:driver", title: "I paid" },
    { id: "paid:owner", title: "Owner paid/credit" },
  ]);

const KEYWORDS: [RegExp, string][] = [
  [/\b(diesel|fuel|petrol|hsd)\b/i, "diesel"], [/\b(toll|fastag)\b/i, "toll"], [/\b(bata|batta|food|meal)\b/i, "bata"],
  [/\b(loading|unloading|labou?r|coolie)\b/i, "loading"], [/\b(commission|broker)\b/i, "commission"],
  [/\b(repair|puncture|tyre|tire|service|mechanic)\b/i, "repair"], [/\b(police|rto|fine|checkpost)\b/i, "police"],
  [/\b(parking|halt|halting)\b/i, "parking"],
];
function parseQuick(text: string): { category: string; amount: number; note: string | null } | null {
  const cat = KEYWORDS.find(([re]) => re.test(text));
  const p = parseAmount(text);
  if (!cat || !p || p.amount <= 0) return null;
  return { category: cat[1], amount: p.amount, note: p.note.replace(cat[0], "").replace(/\s+/g, " ").trim() || null };
}

const categoryList = (phone: string) =>
  sendList(phone, "What kind of expense?", "Choose type", CATEGORIES.map(([id, title]) => ({ id: `cat:${id}`, title })));

async function startFlow(phone: string, driver: Driver, id: string) {
  const trip = await openTrip(driver.id);
  switch (id) {
    case "menu:start":
      if (trip) return menu(phone, driver, "You already have an open trip. End it before starting a new one.");
      await setSession(phone, "start.truck", {});
      return truckList(phone, "Which truck?");
    case "menu:expense":
      if (trip) {
        await setSession(phone, "exp.cat", { trip_id: trip.id, truck_id: trip.truck_id });
        return categoryList(phone);
      }
      await setSession(phone, "exp.truck", {});
      return truckList(phone, "Which truck is this expense for?");
    case "menu:cash":
      await setSession(phone, "cash.amount", { trip_id: trip?.id ?? null });
      return sendText(phone, "How much cash did you receive from the owner?");
    case "menu:end":
      if (!trip) return menu(phone, driver, "You have no open trip to end.");
      await setSession(phone, "end.km", {
        trip_id: trip.id, start_km: trip.start_km, from: trip.from_place, to: trip.to_place, number: trip.number,
      });
      return sendText(phone, `Closing km reading? Starting km was ${trip.start_km}. You can send the odometer photo first.`);
    case "menu:balance":
      return menu(phone, driver, await balanceText(driver.id));
    default:
      return menu(phone, driver);
  }
}
