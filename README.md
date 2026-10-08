# Truck bot: Telegram/WhatsApp driver log + owner P&L dashboard

Next.js (App Router) + Postgres. Drivers can use Telegram, WhatsApp, or both; the same conversation runs on either. Same shape as the CT CRM, so it deploys to Railway the same way.

## What's inside
- `lib/bot.ts`: the driver conversation (start trip, add expense with bill photo, cash from owner, end trip, my balance)
- `app/api/telegram/route.ts`: Telegram webhook (links a driver by his shared phone number)
- `app/api/webhook/route.ts`: Meta webhook (verification, signature check, de-duplication)
- `lib/whatsapp.ts`: send text / buttons / lists, download media
- `schema.sql`: tables
- `app/`: owner dashboard (P&L by truck, trips to review with bill photos, owner expenses, cash with drivers, setup)

## Deploy
1. Create a Railway project with a Postgres plugin. Run `schema.sql` against it (`npm run migrate`, or paste it into the Railway query tab).
2. Set the variables from `.env.example`.
3. Deploy this repo. Build `npm run build`, start `npm start`.
4. Open the site, log in with `ADMIN_PASSWORD`, go to Setup and cash, add the trucks and the drivers' phone numbers.

### Telegram (recommended: 5 minutes, no approvals)
5. Message @BotFather, `/newbot`, copy the token into `TG_BOT_TOKEN`. Set `TG_WEBHOOK_SECRET` to any random string.
6. Register the webhook once (replace the placeholders):
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR-APP/api/telegram&secret_token=<SECRET>&allowed_updates=%5B%22message%22,%22callback_query%22%5D"`
7. Send the drivers the bot link (`t.me/YourBotName`). They tap Start, tap "Share my number", and they're in.
8. For your own trip-closed pings: send /start to the bot, open `https://api.telegram.org/bot<TOKEN>/getUpdates`, copy `message.chat.id` into `OWNER_TELEGRAM_CHAT_ID`.

### WhatsApp (optional, needs a Meta business app)
9. In Meta for Developers, WhatsApp, Configuration: callback URL `https://YOUR-APP/api/webhook`, verify token = `WA_VERIFY_TOKEN`, subscribe to `messages`. Drivers send "Hi" to the bot number.

Use a separate number (or at least a separate webhook app) from the CT CRM. One WhatsApp number delivers to one webhook, so sharing the CRM number means routing inside the CRM's webhook instead.

## Things to know
- Drivers can type an expense in one line from the menu: `diesel 3500 hp pump`, `toll 420`, `bata 300`. The bot only asks who paid and for a photo.
- If you already ran the first `schema.sql`, run the `alter table` line at the bottom of it.
- Only numbers listed under Drivers get replies. Everyone else is ignored.
- Driver balance = cash from owner + freight he collected, minus expenses he paid and cash he returned. Expenses marked "Owner paid/credit" (pump credit, FASTag) count in the P&L but not in his balance.
- Cash entries typed by a driver are marked `driver` in the cash list so you can check them against what you actually gave.
- Revenue counts in the month a trip is closed; expenses count on the day they were logged. Times are IST.
- Bill and odometer photos are stored in Postgres (`media` table) to keep the deploy simple. WhatsApp compresses them to roughly 100 to 300 KB each. If that grows, move `saveMedia` in `lib/bot.ts` to R2 or S3 and keep the URL instead.
- The "trip closed" ping to `OWNER_PHONE` is a plain text message, so it only arrives if that number messaged the bot in the last 24 hours. For guaranteed delivery, create a utility template and send that instead in `lib/bot.ts` (case `end.who`).
- Drivers can type `cancel` or `menu` at any point. A half-finished entry is kept for 12 hours.
- The WhatsApp list menu allows 10 rows, so up to 10 active trucks and 10 expense categories.
