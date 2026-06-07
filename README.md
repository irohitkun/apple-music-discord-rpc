# Apple Music → Discord Rich Presence

Show what you're listening to on Apple Music as a Discord Rich Presence status — with album art, song title, artist, and a live progress timer.
suggested to read [credits](https://github.com/irohitkun/apple-music-discord-rpc#credits) before proceeding

```
Apple Music (phone)
  └─ MacroDroid notification capture
       └─ POST /api/now-playing  →  Replit API server
                                        └─ album art via iTunes India API
            GET /api/current-song  ←──────────────────┘
                 │
           Termux gateway (phone)
                 └─ Discord WebSocket (wss://gateway.discord.gg)
                       └─ Rich Presence type 2 "Listening to Apple Music"
```

**Why run the gateway on the phone?**  
Discord flags Rich Presence connections from datacenter IPs (Replit) with code 4004. A residential/mobile IP (Termux on your phone) doesn't get flagged.

---

## What it looks like

- **Header:** Listening to Apple Music  
- **Line 1:** Song title  
- **Line 2:** Artist name(s)  
- **Timer:** Elapsed / total (when song duration is known)  
- **Large image:** Album art (fetched from iTunes India store)  
- **Small icon:** Apple Music logo (your uploaded Discord asset)

---

## Repository layout

```
artifacts/api-server/
├── src/
│   ├── index.ts              # Express server entry; self-ping every 4 min
│   ├── routes/
│   │   ├── index.ts          # Route registration
│   │   ├── now-playing.ts    # POST /api/now-playing + GET /api/current-song
│   │   └── setup.ts          # GET /api/setup/gateway.js  (serves Termux script)
│   └── lib/
│       ├── state.ts          # In-memory + disk-persisted song state
│       └── itunes.ts         # iTunes Search API (India store) for art + duration
├── build.mjs                 # esbuild bundler config
└── package.json
```

---

## Quick start

See **[SETUP.md](SETUP.md)** for the full step-by-step guide.

---

## API reference

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/now-playing` | `x-api-key` | MacroDroid webhook — update song state |
| `GET` | `/api/current-song` | `x-api-key` | Termux gateway poll — current state |
| `GET` | `/api/setup/gateway.js` | none | Download the Termux gateway script |
| `GET` | `/api/healthz` | none | Health check / self-ping target |

### POST /api/now-playing

```json
{ "song": "Song Title", "artist": "Artist Name", "playing": true }
```

or to signal playback stopped:

```json
{ "playing": false }
```

### GET /api/current-song response

```json
{
  "playing": true,
  "song": "Song Title",
  "artist": "Artist Name",
  "albumArtUrl": "https://is1-ssl.mzstatic.com/...",
  "songDurationMs": 262489,
  "songStartedAt": 1717400000000,
  "updatedAt": 1717400000000
}
```

---

## Stack

- **Runtime:** Node.js 24, TypeScript 5.9
- **Server:** Express 5 (hosted on Replit free tier)
- **Build:** esbuild → `dist/index.mjs`
- **State:** In-memory + `song-state.json` on disk (survives restarts)
- **Album art:** iTunes Search API (`country=in`) — no API key needed
- **Gateway:** Plain Node.js CommonJS script (`ws`, `dotenv`) running in Termux

---

## Architecture decisions

| Decision | Reason |
|----------|--------|
| Gateway runs on phone (Termux) | Discord bans datacenter IPs for user Rich Presence |
| State persisted to disk | MacroDroid re-sends on song change; disk survives Replit restart |
| Self-ping every 4 min | Prevents Replit free tier from suspending the server |
| iTunes India store (`country=in`) | Bollywood/regional tracks absent from US catalog |
| Exponential backoff on reconnect | Flat 5 s retry floods Discord and triggers token rate-limit |

---

## Secrets

| Secret | Where | Purpose |
|--------|-------|---------|
| `API_KEY` | Replit Secrets | Shared key between MacroDroid and Termux gateway |
| `SESSION_SECRET` | Replit Secrets | Express session signing |
| `DISCORD_TOKEN` | `~/.env` on phone | Your Discord user token (never put in Replit) |
| `DISCORD_APPLICATION_ID` | `~/.env` on phone | Your Discord app ID |

> **Never commit tokens or API keys.** `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID` live only in `~/.env` on the phone.

---

## License

[MIT](LICENSE)

---

## Credits

This project was initiated and designed by [Rohit (@irohitkun)](https://github.com/irohitkun)

The original goal was to create a lightweight Apple Music → Discord Rich Presence bridge for Android devices without requiring a traditional desktop RPC setup.

A significant portion of the implementation was developed using AI-assisted tools. Project architecture, requirements, testing, debugging, deployment decisions, and feature direction were provided by the project author.

This repository is open source to encourage experimentation, improvements, and community contributions, especially regarding timestamp synchronization and album artwork limitations.
