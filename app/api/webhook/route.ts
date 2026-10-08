import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { handle, Incoming } from "@/lib/bot";
import { validSignature } from "@/lib/whatsapp";
import { whatsapp } from "@/lib/wa-channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Meta's one-time webhook verification
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WA_VERIFY_TOKEN)
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new NextResponse("bad signature", { status: 401 });

  try {
    const body = JSON.parse(raw);
    for (const entry of body.entry ?? [])
      for (const change of entry.changes ?? [])
        for (const msg of change.value?.messages ?? []) {
          // WhatsApp retries deliveries: process each message id once
          const fresh = await q(`insert into processed_messages(id) values($1) on conflict do nothing returning id`, [msg.id]);
          if (!fresh.length) continue;

          let incoming: Incoming | null = null;
          if (msg.type === "text") incoming = { kind: "text", text: msg.text?.body ?? "" };
          else if (msg.type === "interactive") {
            const r = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
            if (r?.id) incoming = { kind: "choice", id: r.id };
          } else if (msg.type === "image") incoming = { kind: "image", mediaId: msg.image.id, caption: msg.image.caption };
          else if (msg.type === "document" && String(msg.document?.mime_type).startsWith("image/"))
            incoming = { kind: "image", mediaId: msg.document.id, caption: msg.document.caption };

          if (incoming) await handle(msg.from, incoming, whatsapp);
        }
  } catch (e) {
    console.error("webhook error", e); // still answer 200 so Meta does not retry forever
  }
  return NextResponse.json({ ok: true });
}
