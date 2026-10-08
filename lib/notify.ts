import { sendText as waText } from "./whatsapp";
import { telegram } from "./telegram";

/** Ping the owner on whichever channels are configured. */
export async function notifyOwner(text: string) {
  const jobs: Promise<unknown>[] = [];
  if (process.env.OWNER_PHONE && process.env.WA_TOKEN) jobs.push(waText(process.env.OWNER_PHONE, text));
  if (process.env.OWNER_TELEGRAM_CHAT_ID && process.env.TG_BOT_TOKEN) jobs.push(telegram.sendText(process.env.OWNER_TELEGRAM_CHAT_ID, text));
  await Promise.allSettled(jobs);
}
