import { Router, type IRouter } from "express";

const router: IRouter = Router();

const GATEWAY_SCRIPT = `#!/usr/bin/env node
// Apple Music → Discord Rich Presence gateway
// Runs in Termux on your Android phone.
// Config: ~/.env  (DISCORD_TOKEN, DISCORD_APPLICATION_ID, REPLIT_URL, API_KEY)
//
// Install deps (once):   npm install ws dotenv
// Run:                   node gateway.js

"use strict";
require("dotenv").config({ path: require("os").homedir() + "/.env" });

const WebSocket = require("ws");
const https = require("https");
const http = require("http");

const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.DISCORD_APPLICATION_ID;
const REPLIT_URL = (process.env.REPLIT_URL || "").replace(/\\/$/, "");
const API_KEY = process.env.API_KEY;

if (!TOKEN || !APP_ID || !REPLIT_URL || !API_KEY) {
  console.error("Missing required env vars. Check ~/.env");
  process.exit(1);
}

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const POLL_INTERVAL_MS = 5000;
const SILENCE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

let heartbeatInterval = null;
let lastSeq = null;
let ws = null;
let lastSongKey = "";
let silenceTimer = null;
const artCache = new Map(); // iTunes URL → mp:external/... string

// Register an external image URL with Discord so it can be used as large_image.
// Calls back with (err, mpUrl) — mpUrl is "mp:external/..." or null on failure.
function registerExternalAsset(imageUrl, callback) {
  const cached = artCache.get(imageUrl);
  if (cached) return callback(null, cached);

  const body = JSON.stringify({ urls: [imageUrl] });
  const req = https.request(
    {
      hostname: "discord.com",
      path: "/api/v10/applications/" + APP_ID + "/external-assets",
      method: "POST",
      headers: {
        "Authorization": TOKEN,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "DiscordBot (gateway.js, 1.0)"
      }
    },
    (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          console.log("[art] Discord API response (status " + res.statusCode + "):", data.slice(0, 200));
          const json = JSON.parse(data);
          const mpUrl = Array.isArray(json) ? json[0]?.url : null;
          if (mpUrl) {
            artCache.set(imageUrl, mpUrl);
            console.log("[art] Using image key:", mpUrl.slice(0, 80));
            callback(null, mpUrl);
          } else {
            console.warn("[art] No url in response — falling back to apple_music asset");
            callback(null, null);
          }
        } catch (e) {
          callback(e, null);
        }
      });
    }
  );
  req.on("error", (e) => {
    console.warn("[art] External asset registration failed:", e.message);
    callback(null, null);
  });
  req.write(body);
  req.end();
}

function fetchCurrentSong(callback) {
  const url = new URL(REPLIT_URL + "/api/current-song");
  const lib = url.protocol === "https:" ? https : http;
  const req = lib.get(url.href, {
    headers: { "x-api-key": API_KEY }
  }, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
      try {
        callback(null, JSON.parse(data));
      } catch (e) {
        callback(e, null);
      }
    });
  });
  req.on("error", (e) => callback(e, null));
  req.end();
}

function buildPresence(state, mpArtUrl) {
  if (!state.playing) {
    return {
      op: 3,
      d: { since: null, activities: [], status: "online", afk: false }
    };
  }

  const startTs = state.songStartedAt || state.updatedAt || Date.now();
  const timestamps = state.songDurationMs
    ? { start: startTs, end: startTs + state.songDurationMs }
    : { start: startTs };

  // Use Discord-proxied album art when available; fall back to the uploaded asset key
  const largeImage = mpArtUrl || "apple_music";
  const assets = mpArtUrl
    ? {
        large_image: mpArtUrl,
        large_text: "Apple Music",
        small_image: "apple_music",
        small_text: "Apple Music"
      }
    : {
        large_image: "apple_music",
        large_text: "Apple Music"
      };

  const activity = {
    name: "Apple Music",
    type: 2, // Listening to
    details: state.song || "Unknown",
    state: state.artist || "Unknown",
    timestamps,
    assets,
    application_id: APP_ID
  };

  return {
    op: 3,
    d: { since: null, activities: [activity], status: "online", afk: false }
  };
}

function sendPresence(state, mpArtUrl) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(buildPresence(state, mpArtUrl || null)));
}

function sendHeartbeat() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ op: 1, d: lastSeq }));
  }
}

function startPolling() {
  return setInterval(() => {
    fetchCurrentSong((err, state) => {
      if (err) {
        console.error("[poll] Error fetching state:", err.message);
        return;
      }

      const key = state.playing
        ? state.song + "|" + state.artist + "|" + state.songStartedAt
        : "stopped";

      if (key === lastSongKey) return;
      lastSongKey = key;

      if (!state.playing) {
        console.log("[presence] Stopped");
        startSilenceTimer();
        sendPresence(state, null);
        return;
      }

      console.log("[presence] Now playing:", state.song, "-", state.artist);
      resetSilenceTimer();

      // Upscale iTunes thumbnail from 100px to 512px for better quality
      const rawArtUrl = state.albumArtUrl
        ? state.albumArtUrl.replace(/\\/100x100bb\\.jpg$/, "/512x512bb.jpg")
        : null;

      if (rawArtUrl) {
        registerExternalAsset(rawArtUrl, (regErr, mpUrl) => {
          if (regErr) console.warn("[art] Registration error:", regErr.message);
          sendPresence(state, mpUrl);
        });
      } else {
        sendPresence(state, null);
      }
    });
  }, POLL_INTERVAL_MS);
}

function resetSilenceTimer() {
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
}

function startSilenceTimer() {
  resetSilenceTimer();
  silenceTimer = setTimeout(() => {
    console.log("[gateway] 15 min of silence — exiting");
    process.exit(0);
  }, SILENCE_TIMEOUT_MS);
}

// Exponential backoff state — resets to 5s after a successful READY
let reconnectDelay = 5000;

function scheduleReconnect() {
  const jitter = Math.floor(Math.random() * 1000);
  const delay = reconnectDelay + jitter;
  console.log("[gateway] Reconnecting in " + Math.round(delay / 1000) + "s...");
  setTimeout(connect, delay);
  // Back off: 5s → 10s → 20s → 40s → 80s → 160s → max 300s
  reconnectDelay = Math.min(reconnectDelay * 2, 300000);
}

function connect() {
  console.log("[gateway] Connecting to Discord...");
  ws = new WebSocket(GATEWAY_URL);
  let pollTimer = null;

  ws.on("open", () => {
    console.log("[gateway] WebSocket connected");
  });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.s != null) lastSeq = msg.s;

    switch (msg.op) {
      case 10: { // HELLO — send IDENTIFY immediately, then start heartbeating
        const interval = msg.d.heartbeat_interval;
        console.log("[gateway] HELLO — heartbeat every", interval, "ms");

        ws.send(JSON.stringify({
          op: 2,
          d: {
            token: TOKEN,
            properties: { os: "android", browser: "Discord Android", device: "Discord Android" },
            presence: { since: null, activities: [], status: "online", afk: false }
          }
        }));

        // First heartbeat after a random jitter, then regular interval
        setTimeout(() => {
          sendHeartbeat();
          heartbeatInterval = setInterval(sendHeartbeat, interval);
        }, Math.floor(Math.random() * interval));
        break;
      }
      case 0: { // DISPATCH
        if (msg.t === "READY") {
          const username = msg.d && msg.d.user ? msg.d.user.username : "unknown";
          reconnectDelay = 5000; // reset backoff on successful login
          console.log("[gateway] Logged in as " + username);
          console.log("[gateway] application_id: " + APP_ID);
          pollTimer = startPolling();
          startSilenceTimer();
        }
        break;
      }
      case 11: break; // HEARTBEAT_ACK
      case 9: // INVALID_SESSION
        console.error("[gateway] Invalid session");
        scheduleReconnect();
        break;
      case 7: // RECONNECT requested by server
        console.log("[gateway] Server requested reconnect");
        ws.close();
        break;
    }
  });

  ws.on("close", (code) => {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

    // 4xxx codes are Discord-level errors — some are unrecoverable
    if (code === 4004) {
      console.error("[gateway] Authentication failed (4004). Check DISCORD_TOKEN in ~/.env — it may have been invalidated. Reset your Discord password to get a new token.");
      process.exit(1);
    }
    if (code === 4013 || code === 4014) {
      console.error("[gateway] Invalid intents (" + code + ") — exiting");
      process.exit(1);
    }
    if (code === 4010 || code === 4011) {
      console.error("[gateway] Invalid shard/sharding required (" + code + ") — exiting");
      process.exit(1);
    }

    console.log("[gateway] Closed: " + code);
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    console.error("[gateway] WS error:", err.message);
  });
}

connect();
`;

router.get("/setup/gateway.js", (_req, res): void => {
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="gateway.js"');
  res.send(GATEWAY_SCRIPT);
});

export default router;
