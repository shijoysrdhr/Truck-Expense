import { NextRequest, NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { handle, Incoming } from "@/lib/bot";
import { telegram, answerCallback, askForPhone } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TG_WEBHOOK_SECRET) return new NextResponse("forbidden", { status: 403 });
  try {
    const u = await req.json();
    const msg = u.message ?? u.edited_message;
    const cb = u.callback_query;
    const chat = String(msg?.chat?.id ?? cb?.message?.chat?.id ?? "");
    if (!chat) return NextResponse.json({ ok: true });
    const key = "tg:" + chat;

    // Meta and Telegram both retry: process each update once
    const fresh = await q(`insert into processed_messages(id) values($1) on conflict do nothing returning id`, ["tg:" + u.update_id]);
    if (!fresh.length) return NextResponse.json({ ok: true });

    if (cb) await answerCallback(cb.id);

    const known = await q1<{ id: number }>(`select id from drivers where telegram_chat_id=$1 and active`, [chat]);
    if (!known) {
      // link this chat to a driver by phone number (contact share)
      if (msg?.contact?.phone_number) {
        const phone = String(msg.contact.phone_number).replace(/\D/g, "");
        const d = await q1<{ id: number; name: string }>(
          `update drivers set telegram_chat_id=$1 where active and (phone=$2 or phone='91'||$2 or '91'||phone=$2) returning id, name`, [chat, phone]);
        if (!d) await telegram.sendText(key, "This number is not in the driver list. Ask the owner to add it, then tap Share my number again.");
        else await handle(key, { kind: "text", text: "hi" }, telegram);
      } else await askForPhone(key);
      return NextResponse.json({ ok: true });
    }

    let incoming: Incoming | null = null;
    if (cb?.data) incoming = { kind: "choice", id: cb.data };
    else if (msg?.photo?.length) incoming = { kind: "image", mediaId: msg.photo[msg.photo.length - 1].file_id, caption: msg.caption };
    else if (msg?.document && String(msg.document.mime_type).startsWith("image/")) incoming = { kind: "image", mediaId: msg.document.file_id, caption: msg.caption };
    else if (typeof msg?.text === "string") incoming = { kind: "text", text: msg.text.replace(/^\/start\b.*/i, "hi").replace(/^\//, "") };

    if (incoming) await handle(key, incoming, telegram);
  } catch (e) {
    console.error("telegram webhook", e);
  }
  return NextResponse.json({ ok: true });
}
