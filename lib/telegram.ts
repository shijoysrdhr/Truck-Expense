import type { Channel } from "./bot";

const api = (method: string) => `https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/${method}`;

async function call(method: string, body: Record<string, unknown>) {
  const res = await fetch(api(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) console.error("Telegram", method, res.status, await res.text());
  return res.ok;
}
const chatId = (to: string) => to.replace(/^tg:/, "");

/** Buttons and lists both become inline keyboards; the same ids come back as callback data. */
export const telegram: Channel = {
  sendText: (to, body) => call("sendMessage", { chat_id: chatId(to), text: body }),
  sendButtons: (to, body, buttons) =>
    call("sendMessage", {
      chat_id: chatId(to), text: body,
      reply_markup: { inline_keyboard: [buttons.map((b) => ({ text: b.title, callback_data: b.id }))] },
    }),
  sendList: (to, body, _button, rows) =>
    call("sendMessage", {
      chat_id: chatId(to), text: body,
      reply_markup: { inline_keyboard: rows.map((r) => [{ text: r.description ? `${r.title}  \u2013 ${r.description}` : r.title, callback_data: r.id }]) },
    }),
  async downloadMedia(fileId) {
    try {
      const meta = await fetch(api("getFile") + `?file_id=${encodeURIComponent(fileId)}`);
      if (!meta.ok) return null;
      const { result } = (await meta.json()) as { result: { file_path: string } };
      const file = await fetch(`https://api.telegram.org/file/bot${process.env.TG_BOT_TOKEN}/${result.file_path}`);
      if (!file.ok) return null;
      const ext = result.file_path.split(".").pop()?.toLowerCase();
      return { mime: ext === "png" ? "image/png" : "image/jpeg", data: Buffer.from(await file.arrayBuffer()) };
    } catch (e) {
      console.error("telegram media", e);
      return null;
    }
  },
};

export const answerCallback = (id: string) => call("answerCallbackQuery", { callback_query_id: id });

export const askForPhone = (to: string) =>
  call("sendMessage", {
    chat_id: chatId(to),
    text: "Welcome. Tap the button below to share your phone number so I can find you in the driver list.",
    reply_markup: { keyboard: [[{ text: "Share my number", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
  });
