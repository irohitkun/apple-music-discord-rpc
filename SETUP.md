# Setup Guide — Apple Music → Discord Rich Presence

Complete step-by-step instructions to get this running from scratch.

---

## Prerequisites

- Android phone with Apple Music installed
- MacroDroid app ([Play Store](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid))
- Termux app — **install from [F-Droid](https://f-droid.org/packages/com.termux/), NOT the Play Store** (Play Store version is outdated and breaks Node.js)
- A Discord account
- A Replit account (free tier works)

---

## Step 1 — Fork & deploy the Replit server

1. Fork this repo or open it in Replit
2. In Replit **Secrets**, add:
   - `API_KEY` — any long random string, e.g. `openssl rand -hex 32` output
   - `SESSION_SECRET` — another random string
3. Run the server: `pnpm --filter @workspace/api-server run dev`
4. Note your Replit domain — it looks like `https://xxxx.pike.replit.dev`

The server self-pings `/api/healthz` every 4 minutes to stay alive on free tier.

---

## Step 2 — Discord Developer Portal

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** — name it "Apple Music" (or anything)
3. Copy the **Application ID** from the top of the General Information page — you'll need it later
4. Go to **Rich Presence → Art Assets**
5. Upload a PNG of the Apple Music logo (white music note on red rounded-square background)
   - Name it exactly **`apple_music`** — lowercase, no spaces, no file extension in the name field
   - This is shown as the small icon when album art is displayed, and as the fallback large image
6. Click **Save Changes**

---

## Step 3 — Get your Discord user token

> ⚠️ **Your Discord token gives full access to your account. Never share it or commit it to git.**  
> Discord may invalidate it if they detect unusual activity — reset your password to get a new one.

**On Android (Chrome):**

1. Open `discord.com` in Chrome (not the app)
2. Open DevTools via `chrome://inspect` or connect to PC Chrome DevTools
3. Go to **Network** tab, filter by `XHR`
4. Send any message or open any channel
5. Find a request to `discord.com/api/...` and look at the **`Authorization`** request header — that value is your token

**Alternative (desktop):**

1. Open Discord desktop app
2. Press `Ctrl+Shift+I` → Console tab
3. Paste: `webpackChunkdiscord_app.push([[Math.random()],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]);m.filter(m=>m?.exports?.default?.getToken).map(m=>m.exports.default.getToken())[0]`

---

## Step 4 — Termux setup

```bash
# 1. Install Node.js
pkg install nodejs

# 2. Install gateway dependencies
npm install -g ws dotenv

# 3. Create your config file
nano ~/.env
```

Paste into `~/.env` (replace all placeholder values):

```env
DISCORD_TOKEN=your_discord_token_here
DISCORD_APPLICATION_ID=your_application_id_here
REPLIT_URL=https://xxxx.pike.replit.dev
API_KEY=same_api_key_as_replit_secrets
```

Save with `Ctrl+O`, exit with `Ctrl+X`.

```bash
# 4. Download the gateway script
curl "https://xxxx.pike.replit.dev/api/setup/gateway.js" -o ~/gateway.js

# 5. Run it
termux-wake-lock && node ~/gateway.js
```

You should see:
```
[gateway] Connecting to Discord...
[gateway] WebSocket connected
[gateway] HELLO — heartbeat every 41250 ms
[gateway] Logged in as yourusername
[gateway] application_id: 123456789012345678
```

If you see `Authentication failed (4004)` — your token is invalid. Reset your Discord password and repeat Step 3.

---

## Step 5 — MacroDroid macros

### Macro 1: Song Playing

**Trigger:** Notification Received → App: Apple Music  
**Actions:**

1. HTTP Request
   - Method: `POST`
   - URL: `https://xxxx.pike.replit.dev/api/now-playing`
   - Headers: `x-api-key: your_api_key`
   - Body (JSON):
     ```json
     {"song":"[not_title]","artist":"[not_text]","playing":true}
     ```
   - ⚠️ Use the **variable picker** for `[not_title]` and `[not_text]` — do NOT type them manually or they won't expand

2. (Optional) Termux:Task → run `start-gateway.sh` to auto-start the gateway when music plays

### Macro 2: Song Stopped

**Trigger:** Notification Dismissed → App: Apple Music  
**Actions:**

1. HTTP Request
   - Method: `POST`
   - URL: `https://xxxx.pike.replit.dev/api/now-playing`
   - Headers: `x-api-key: your_api_key`
   - Body: `{"playing":false}`

---

## Step 6 — Verify it works

1. Play a song in Apple Music
2. Wait ~5 seconds for MacroDroid to fire and the gateway to poll
3. Open your Discord profile — you should see **"Listening to Apple Music"** with song, artist, album art, and timer

---

## Keeping the gateway running

The gateway exits automatically after **15 minutes of silence** (no song playing). To keep it persistent:

**Option A — run manually when needed:**
```bash
termux-wake-lock && node ~/gateway.js
```

**Option B — auto-start script (`~/start-gateway.sh`):**
```bash
#!/data/data/com.termux/files/usr/bin/bash
pkill -f gateway.js 2>/dev/null
sleep 2
termux-wake-lock
node ~/gateway.js &
```
```bash
chmod +x ~/start-gateway.sh
```
Then use MacroDroid → Termux:Task to trigger it on Apple Music notifications.

---

## Troubleshooting

### Gateway loops with `Closed: 1006`
Discord is rate-limiting due to too many rapid reconnects. Wait 2–3 minutes, then restart. The gateway uses exponential backoff (5 s → 10 s → 20 s → … → 5 min) to avoid this.

### `Authentication failed (4004)`
Your Discord token was invalidated. Reset your Discord password → log back in → extract the new token → update `~/.env`.

### Album art not showing (grey circle)
The `apple_music` asset PNG likely has a transparent background — Discord can't render it on a dark card. Re-upload with a solid red (`#FC3C44`) background.

### Three lines of text showing
The `large_text` field (tooltip on desktop, sometimes visible on mobile) was previously set to the song title. Latest version sets it to "Apple Music". Re-download `gateway.js`.

### Polling error / cannot reach server
The Replit server may have gone to sleep. The self-ping every 4 min prevents this, but if it just restarted it takes ~30 s to come back up. The gateway will recover automatically on the next poll.

### MacroDroid sending artist + album name
`[not_text]` on Apple Music notifications contains `artist\nalbum` on two lines. The server strips everything after the first newline. Make sure you're using the latest server version.

---

## Updating the gateway script

After any server-side update, re-download the gateway:

```bash
pkill -f gateway.js
curl "https://xxxx.pike.replit.dev/api/setup/gateway.js" -o ~/gateway.js
termux-wake-lock && node ~/gateway.js
```

---

## Self-hosting (optional)

A `Dockerfile` is included at the repo root for running the API server on your own VPS. You'll need a public HTTPS URL for MacroDroid to POST to. Update `REPLIT_URL` in `~/.env` accordingly.
