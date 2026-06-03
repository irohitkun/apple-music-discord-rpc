import { Router, type IRouter } from "express";
import { getState, setState } from "../lib/state";
import { fetchTrackInfo } from "../lib/itunes";

const router: IRouter = Router();

function requireApiKey(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const key = req.headers["x-api-key"];
  const expected = process.env["API_KEY"];
  if (!expected || key !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.post(
  "/now-playing",
  requireApiKey,
  async (req, res): Promise<void> => {
    const { song, artist, playing } = req.body as {
      song?: string;
      artist?: string;
      playing?: boolean;
    };

    if (typeof playing !== "boolean") {
      res.status(400).json({ error: "playing (boolean) is required" });
      return;
    }

    if (!playing) {
      setState({ playing: false });
      req.log.info("Song stopped");
      res.json({ ok: true });
      return;
    }

    if (typeof song !== "string" || typeof artist !== "string") {
      res
        .status(400)
        .json({ error: "song and artist are required when playing=true" });
      return;
    }

    // Strip newlines — Apple Music notifications include album name on a second
    // line which MacroDroid captures as part of [not_text].
    const cleanSong = song.split(/\r?\n/)[0]?.trim() ?? song;
    const cleanArtist = artist.split(/\r?\n/)[0]?.trim() ?? artist;

    const current = getState();
    const sameSong =
      current.playing &&
      current.song === cleanSong &&
      current.artist === cleanArtist;

    // Preserve songStartedAt if this is the same song (e.g. scrub notification)
    // so the elapsed timer stays accurate and doesn't reset mid-song.
    setState({
      song: cleanSong,
      artist: cleanArtist,
      playing: true,
      albumArtUrl: sameSong ? current.albumArtUrl : null,
      songDurationMs: sameSong ? current.songDurationMs : null,
      songStartedAt: sameSong ? current.songStartedAt : Date.now(),
    });

    if (sameSong) {
      req.log.info({ song: cleanSong, artist: cleanArtist }, "Same song notification (scrub?) — kept start time");
      res.json({ ok: true, albumArtUrl: current.albumArtUrl });
      return;
    }

    req.log.info({ song: cleanSong, artist: cleanArtist }, "New song — fetching track info");
    const { artUrl, durationMs } = await fetchTrackInfo(cleanSong, cleanArtist);
    setState({ albumArtUrl: artUrl, songDurationMs: durationMs });
    req.log.info({ artUrl, durationMs }, "Track info resolved");

    res.json({ ok: true, albumArtUrl: artUrl });
  },
);

router.get("/current-song", async (req, res): Promise<void> => {
  const key = req.headers["x-api-key"];
  const expected = process.env["API_KEY"];
  if (!expected || key !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(getState());
});

export default router;
