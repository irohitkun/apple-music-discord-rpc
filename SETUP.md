# Setup Guide — Apple Music → Discord Rich Presence

Complete step-by-step instructions to get this running from scratch.

---

## Prerequisites

- Android phone with Apple Music installed
- MacroDroid app ([Play Store](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid))
- Termux app — **install from [F-Droid](https://f-droid.org/packages/com.termux/), NOT the Play Store** (Play Store version is outdated and breaks Node.js)
- A Discord account
- A Replit account (free tier works) **or** a VPS / home server (see [Self-Hosting](#self-hosting-vps--home-server))

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
   - Make sure the PNG has a **solid red (`#FC3C44`) background** — transparent PNGs are invisible on Discord's dark card
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
3. Paste:
   ```js
   webpackChunkdiscord_app.push([[Math.random()],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]);m.filter(m=>m?.exports?.default?.getToken).map(m=>m.exports.default.getToken())[0]
   ```

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
Then use MacroDroid → Termux:Task to trigger `start-gateway.sh` on Apple Music notifications.

---

## Self-hosting (VPS / home server)

If you'd rather not use Replit, you can run the API server yourself. The only hard requirement is a **stable public HTTPS URL** that MacroDroid can reach. Below is an honest breakdown of every viable option.

---

### Option A — VPS with a real domain (recommended)

This is the most reliable setup. You rent a small server, point a domain at it, and get proper TLS via Let's Encrypt.

**Minimum specs:** 512 MB RAM, 1 vCPU — any cheap VPS works (Hetzner CAX11 ~€4/mo, Oracle Always Free, Fly.io free tier, Railway, Render free tier).

#### 1. Build and copy the server

```bash
# On your local machine / Replit shell
pnpm --filter @workspace/api-server run build
# Produces artifacts/api-server/dist/index.mjs
```

Copy `dist/` to your VPS:
```bash
scp -r artifacts/api-server/dist/ user@your-vps-ip:~/apple-music-rpc/
scp artifacts/api-server/package.json user@your-vps-ip:~/apple-music-rpc/
```

#### 2. Install Node.js on the VPS (Ubuntu/Debian)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
cd ~/apple-music-rpc && npm install --omit=dev
```

#### 3. Create environment file

```bash
nano ~/apple-music-rpc/.env
```
```env
PORT=3000
API_KEY=your_api_key
SESSION_SECRET=your_session_secret
NODE_ENV=production
```

#### 4. Run it behind nginx + Let's Encrypt

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Get a free TLS cert (replace with your domain)
sudo certbot --nginx -d api.yourdomain.com
```

`/etc/nginx/sites-available/apple-music-rpc`:
```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/apple-music-rpc /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

#### 5. Keep it running with systemd

`/etc/systemd/system/apple-music-rpc.service`:
```ini
[Unit]
Description=Apple Music Discord RPC API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/apple-music-rpc
EnvironmentFile=/home/ubuntu/apple-music-rpc/.env
ExecStart=/usr/bin/node dist/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now apple-music-rpc
sudo systemctl status apple-music-rpc
```

Update `REPLIT_URL` in Termux `~/.env` to `https://api.yourdomain.com`.

---

### Option B — Docker (any VPS or home server)

A `Dockerfile` is included in the repo root. Useful if you prefer containers.

```bash
# On your VPS
git clone https://github.com/irohitkun/apple-music-discord-rpc.git
cd apple-music-discord-rpc

docker build -t apple-music-rpc .

docker run -d \
  --name apple-music-rpc \
  --restart unless-stopped \
  -p 3000:3000 \
  -e API_KEY=your_api_key \
  -e SESSION_SECRET=your_secret \
  -e NODE_ENV=production \
  -v $(pwd)/data:/app/data \
  apple-music-rpc
```

Put nginx + Certbot in front of port 3000 the same way as Option A.

---

### Option C — Tunneling tools (ngrok, Cloudflare Tunnel, localtunnel)

Tunneling tools expose a port on your **home machine or laptop** to the internet without needing a VPS or domain. They are quick to set up but come with real trade-offs.

#### ngrok

```bash
# Install, then:
ngrok http 3000
# Gives you: https://abc123.ngrok-free.app
```

**Drawbacks:**
- Free plan gives a **random URL that changes every restart** — you have to update MacroDroid every time
- Free plan allows only **1 simultaneous connection** and has a request rate limit
- ngrok servers are US/EU datacenters — adds latency if you're in Asia/India
- ngrok can and does go down; your presence breaks with it
- Paid plan (~$10/mo) gives a static domain but at that price a Hetzner VPS is cheaper and more reliable

#### Cloudflare Tunnel (`cloudflared`)

```bash
cloudflared tunnel --url http://localhost:3000
# Gives you: https://random-words.trycloudflare.com
```

**Drawbacks:**
- The free quick-tunnel URL is also **random and ephemeral** — regenerates on restart
- Named tunnels (stable URL) require a Cloudflare account and a domain you own — if you have that, Option A is just as easy
- All traffic routes through Cloudflare's network — Cloudflare can inspect unencrypted payloads between their edge and your origin
- Adds a hop compared to a direct VPS

#### localtunnel

```bash
npx localtunnel --port 3000
# Gives you: https://random-name.loca.lt
```

**Drawbacks:**
- URL changes on every restart (same problem as ngrok free)
- The service is community-maintained with **no SLA** — it goes down without warning for hours at a time
- Frequently rate-limited; not suitable for a production webhook receiver
- All traffic passes through a third-party server you have no control over

#### serveo / bore.pub / similar

Same category of drawbacks as localtunnel — ephemeral URLs, third-party infrastructure, reliability not guaranteed.

---

### Tunneling tools — when they actually make sense

| Use case | Good choice |
|----------|------------|
| Quick local testing for 30 minutes | ngrok free / cloudflared quick tunnel |
| Showing it to a friend once | Any tunnel |
| Always-on production webhook | **Don't use tunnels** — use a VPS or Replit |
| Home server you leave on 24/7 | Cloudflare Tunnel with a named tunnel + your own domain |

**Bottom line:** if your MacBook is asleep, your tunnel is dead and your presence goes dark. For something that should work every time you play music, run it on a server that's always on.

---

### Option D — Home server (always-on PC / Raspberry Pi)

If you have a machine that stays on 24/7, you can run the server there and expose it with a Cloudflare named tunnel (no open ports on your router needed).

```bash
# Install cloudflared and log in
cloudflared tunnel login
cloudflared tunnel create apple-music-rpc

# Create config at ~/.cloudflared/config.yml
tunnel: <tunnel-id>
credentials-file: /home/user/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404

# Route your domain
cloudflared tunnel route dns apple-music-rpc api.yourdomain.com

# Run as a service
sudo cloudflared service install
sudo systemctl start cloudflared
```

**Drawbacks vs VPS:**
- Your home internet going down = presence goes dark
- ISPs sometimes block incoming connections or rotate IPs (Cloudflare Tunnel sidesteps the port-forwarding issue, but not the uptime issue)
- If the machine restarts or sleeps, you need to ensure auto-start

---

### Comparison table

| Option | Cost | Stable URL | Uptime | Setup complexity |
|--------|------|-----------|--------|-----------------|
| Replit free | Free | ✅ | ✅ (self-ping) | ⭐ Easy |
| VPS + domain | ~€4/mo | ✅ | ✅ | ⭐⭐ Medium |
| Docker on VPS | ~€4/mo | ✅ | ✅ | ⭐⭐ Medium |
| Home server + Cloudflare Tunnel | Cost of hardware | ✅ (with domain) | ⚠️ Depends on ISP | ⭐⭐⭐ Complex |
| ngrok free | Free | ❌ changes | ⚠️ | ⭐ Easy but unreliable |
| Cloudflare quick tunnel | Free | ❌ changes | ⚠️ | ⭐ Easy but unreliable |
| localtunnel | Free | ❌ changes | ❌ often down | ⭐ Easiest but worst |

---

## Troubleshooting

### Gateway loops with `Closed: 1006`
Discord is rate-limiting due to too many rapid reconnects. Wait 2–3 minutes, then restart. The gateway uses exponential backoff (5 s → 10 s → 20 s → … → 5 min) to avoid this getting worse.

### `Authentication failed (4004)`
Your Discord token was invalidated. Reset your Discord password → log back in → extract the new token → update `~/.env`.

### Album art not showing (grey circle)
The `apple_music` asset PNG likely has a transparent background — Discord can't render it on a dark card. Re-upload with a solid red (`#FC3C44`) background.

### Third line showing under artist
The `large_text` field was previously set to the song title. Latest version sets it to "Apple Music". Re-download `gateway.js` from the server and restart.

### Polling error / cannot reach server
The Replit server may have gone to sleep. The self-ping every 4 min prevents this, but on first start it takes ~30 s. The gateway recovers automatically on the next poll cycle.

### MacroDroid sending artist + album name
`[not_text]` on Apple Music notifications contains `artist\nalbum` on two lines. The server strips everything after the first newline. Make sure you're on the latest server version.

### iTunes returns no album art
Happens for regional songs not in the India iTunes store, or songs with special characters/emoji in the title. The server strips the explicit marker emoji (🅴) automatically. If art is still missing, the `apple_music` asset is used as fallback.

---

## Updating the gateway script

After any server-side update, re-download the gateway:

```bash
pkill -f gateway.js
curl "https://xxxx.pike.replit.dev/api/setup/gateway.js" -o ~/gateway.js
termux-wake-lock && node ~/gateway.js
```
