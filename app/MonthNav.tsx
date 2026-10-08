import Link from "next/link";
import { shiftMonth, monthLabel } from "@/lib/period";

export default function MonthNav({ path, m }: { path: string; m: string }) {
  return (
    <div className="nav">
      <Link href={`${path}?m=${shiftMonth(m, -1)}`}>Previous</Link>
      <b className="num">{monthLabel(m)}</b>
      <Link href={`${path}?m=${shiftMonth(m, 1)}`}>Next</Link>
    </div>
  );
}
