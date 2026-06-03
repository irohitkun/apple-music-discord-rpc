import { logger } from "./logger";

export interface ItunesResult {
  artUrl: string | null;
  durationMs: number | null;
}

export async function fetchTrackInfo(
  song: string,
  artist: string,
): Promise<ItunesResult> {
  try {
    // Strip explicit marker emoji (🅴) that Apple Music appends to song titles
    const cleanSong = song.replace(/\s*🅴\s*/g, "").trim();
    const cleanArtist = artist.split(",")[0]?.trim() ?? artist;
    const query = encodeURIComponent(`${cleanSong} ${cleanArtist}`);
    // Search India store — Bollywood tracks are absent from the US catalog
    const url = `https://itunes.apple.com/search?term=${query}&entity=musicTrack&limit=1&country=in`;

    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ status: res.status }, "iTunes search returned non-OK status");
      return { artUrl: null, durationMs: null };
    }

    const data = (await res.json()) as {
      results?: { artworkUrl100?: string; trackTimeMillis?: number }[];
    };
    const result = data.results?.[0];
    if (!result) return { artUrl: null, durationMs: null };

    const artUrl = result.artworkUrl100
      ? result.artworkUrl100.replace("100x100bb", "600x600bb")
      : null;
    const durationMs = result.trackTimeMillis ?? null;

    return { artUrl, durationMs };
  } catch (err) {
    logger.warn({ err }, "Failed to fetch track info from iTunes");
    return { artUrl: null, durationMs: null };
  }
}
