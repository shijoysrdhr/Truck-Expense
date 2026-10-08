export function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}
export function cleanMonth(m?: string) {
  return m && /^\d{4}-\d{2}$/.test(m) ? m : currentMonth();
}
export function shiftMonth(m: string, d: number) {
  let [y, mo] = m.split("-").map(Number);
  mo += d;
  if (mo < 1) { mo = 12; y--; }
  if (mo > 12) { mo = 1; y++; }
  return `${y}-${String(mo).padStart(2, "0")}`;
}
export function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
