import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  startSelfPing();
});

function startSelfPing(): void {
  // Ping /api/healthz every 4 minutes to keep the server alive on Replit
  const PING_INTERVAL_MS = 4 * 60 * 1000;
  const domains = process.env["REPLIT_DOMAINS"];
  if (!domains) {
    logger.warn("REPLIT_DOMAINS not set — self-ping disabled");
    return;
  }
  const domain = domains.split(",")[0]?.trim();
  if (!domain) return;

  const url = `https://${domain}/api/healthz`;
  logger.info({ url }, "Self-ping enabled");

  setInterval(async () => {
    try {
      const res = await fetch(url);
      logger.debug({ status: res.status }, "Self-ping");
    } catch (err) {
      logger.warn({ err }, "Self-ping failed");
    }
  }, PING_INTERVAL_MS);
}
