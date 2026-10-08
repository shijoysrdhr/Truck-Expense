import crypto from "crypto";

const V = process.env.WA_API_VERSION || "v21.0";
const base = () => `https://graph.facebook.com/${V}/${process.env.WA_PHONE_NUMBER_ID}/messages`;
const auth = () => ({ Authorization: `Bearer ${process.env.WA_TOKEN}` });

async function send(to: string, payload: Record<string, unknown>) {
  const res = await fetch(base(), {
    method: "POST",
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload }),
  });
  if (!res.ok) console.error("WhatsApp send failed", res.status, await res.text());
  return res.ok;
}

export const sendText = (to: string, body: string) => send(to, { type: "text", text: { body } });

/** Up to 3 buttons, titles max 20 characters. */
export const sendButtons = (to: string, body: string, buttons: { id: string; title: string }[]) =>
  send(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
    },
  });

/** Up to 10 rows, titles max 24 characters. */
export const sendList = (to: string, body: string, button: string, rows: { id: string; title: string; description?: string }[]) =>
  send(to, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: button.slice(0, 20),
        sections: [{ title: "Choose", rows: rows.slice(0, 10).map((r) => ({ ...r, title: r.title.slice(0, 24) })) }],
      },
    },
  });

export async function downloadMedia(mediaId: string): Promise<{ mime: string; data: Buffer } | null> {
  try {
    const meta = await fetch(`https://graph.facebook.com/${V}/${mediaId}`, { headers: auth() });
    if (!meta.ok) return null;
    const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
    const file = await fetch(url, { headers: auth() });
    if (!file.ok) return null;
    return { mime: mime_type || "image/jpeg", data: Buffer.from(await file.arrayBuffer()) };
  } catch (e) {
    console.error("media download failed", e);
    return null;
  }
}

export function validSignature(raw: string, header: string | null) {
  const secret = process.env.WA_APP_SECRET;
  if (!secret || !header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
