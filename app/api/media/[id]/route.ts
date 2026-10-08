import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await q1<{ mime: string; data: Buffer }>(`select mime, data from media where id=$1`, [parseInt(id, 10) || 0]);
  if (!m) return new NextResponse("not found", { status: 404 });
  return new NextResponse(new Uint8Array(m.data), { headers: { "Content-Type": m.mime, "Cache-Control": "private, max-age=86400" } });
}
