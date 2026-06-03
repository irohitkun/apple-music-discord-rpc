import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { logger } from "./logger";

export interface SongState {
  song: string;
  artist: string;
  playing: boolean;
  albumArtUrl: string | null;
  songDurationMs: number | null;
  songStartedAt: number;
  updatedAt: number;
}

const DEFAULT_STATE: SongState = {
  song: "",
  artist: "",
  playing: false,
  albumArtUrl: null,
  songDurationMs: null,
  songStartedAt: Date.now(),
  updatedAt: Date.now(),
};

const STATE_FILE = resolve(process.cwd(), "song-state.json");

function loadState(): SongState {
  try {
    const raw = readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as SongState;
    logger.info(
      { song: parsed.song, artist: parsed.artist, playing: parsed.playing },
      "Restored state from disk",
    );
    return parsed;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(s: SongState): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(s), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to persist state to disk");
  }
}

let state: SongState = loadState();

export function getState(): Readonly<SongState> {
  return state;
}

export function setState(update: Partial<SongState>): void {
  state = { ...state, ...update, updatedAt: Date.now() };
  saveState(state);
}
