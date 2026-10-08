"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { sessionToken } from "@/lib/auth";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => parseFloat(s(f, k).replace(/,/g, "")) || 0;
const idOrNull = (f: FormData, k: string) => parseInt(s(f, k), 10) || null;

export async function login(f: FormData) {
  if (!process.env.ADMIN_PASSWORD || s(f, "password") !== process.env.ADMIN_PASSWORD) redirect("/login?e=1");
  (await cookies()).set("auth", await sessionToken(), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 60, path: "/" });
  redirect("/");
}

export async function addTruck(f: FormData) {
  const number = s(f, "number").toUpperCase();
  if (number) await q(`insert into trucks(number) values($1) on conflict(number) do update set active=true`, [number]);
  revalidatePath("/setup");
}

export async function addDriver(f: FormData) {
  let phone = s(f, "phone").replace(/\D/g, "");
  if (phone.length === 10) phone = "91" + phone;
  const name = s(f, "name");
  if (name && phone.length >= 11)
    await q(`insert into drivers(name,phone) values($1,$2) on conflict(phone) do update set name=$1, active=true`, [name, phone]);
  revalidatePath("/setup");
}

export async function toggleActive(f: FormData) {
  const table = s(f, "table") === "drivers" ? "drivers" : "trucks";
  await q(`update ${table} set active = not active where id=$1`, [idOrNull(f, "id")]);
  revalidatePath("/setup");
}

export async function addCashMove(f: FormData) {
  const amount = num(f, "amount");
  const kind = s(f, "kind") === "return" ? "return" : "advance";
  if (amount > 0 && idOrNull(f, "driver_id"))
    await q(`insert into cash_moves(driver_id,kind,amount,note,moved_on,source) values($1,$2,$3,$4,coalesce(nullif($5,'')::date,current_date),'owner')`, [
      idOrNull(f, "driver_id"), kind, amount, s(f, "note") || null, s(f, "date"),
    ]);
  revalidatePath("/"); revalidatePath("/setup");
}

export async function addOwnerExpense(f: FormData) {
  const amount = num(f, "amount");
  if (amount > 0)
    await q(
      `insert into expenses(truck_id,category,amount,paid_by,note,spent_on) values($1,$2,$3,'owner',$4,coalesce(nullif($5,'')::date,current_date))`,
      [idOrNull(f, "truck_id"), s(f, "category") || "Other", amount, s(f, "note") || null, s(f, "date")]
    );
  revalidatePath("/expenses"); revalidatePath("/");
}

export async function deleteExpense(f: FormData) {
  await q(`delete from expenses where id=$1`, [idOrNull(f, "id")]);
  revalidatePath("/expenses"); revalidatePath("/");
  const trip = idOrNull(f, "trip_id");
  if (trip) revalidatePath(`/trips/${trip}`);
}

export async function updateTrip(f: FormData) {
  const id = idOrNull(f, "id");
  const who = ["driver", "owner", "pending"].includes(s(f, "freight_received_by")) ? s(f, "freight_received_by") : "pending";
  await q(`update trips set freight=$2, freight_received_by=$3, party=$4 where id=$1`, [id, num(f, "freight"), who, s(f, "party") || null]);
  if (s(f, "approve") === "1") await q(`update trips set status='approved' where id=$1 and status='ended'`, [id]);
  revalidatePath(`/trips/${id}`); revalidatePath("/trips"); revalidatePath("/");
}
