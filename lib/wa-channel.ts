import type { Channel } from "./bot";
import { sendText, sendButtons, sendList, downloadMedia } from "./whatsapp";
export const whatsapp: Channel = { sendText, sendButtons, sendList, downloadMedia };
