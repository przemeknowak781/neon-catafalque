import type { TapeAutomation, Track } from "../types";
import { ANEMOIA_BPM, ANEMOIA_STEPS, ANEMOIA_TAPE, buildAnemoiaTracks } from "./anemoia";

/**
 * Songs that ship with the app, written by hand rather than generated.
 *
 * A song is notes plus the decisions that make them sound as intended: a
 * tempo, a form for the grid to draw, the sound preset it was voiced for, and
 * what the tape does as it plays. It carries no generator plan, so the
 * rebuild buttons stay off for it — rebuilding one part of a written song
 * against a generated plan would produce a different song in that lane.
 */
export interface BuiltInSong {
  name: string;
  /** What it is, honestly, for the tooltip. */
  note: string;
  bpm: number;
  totalSteps: number;
  /** Form name in ARRANGEMENT_PRESETS, so the grid labels its sections. */
  arrangement: string;
  /** The SONG_PRESETS entry it was voiced for. */
  soundPreset: string;
  /** The tape's moves through the song. */
  automation: readonly TapeAutomation[];
  /** Built fresh on every load, so an edit in the grid never alters the original. */
  build: () => Track[];
}

export const BUILT_IN_SONGS: readonly BuiltInSong[] = [
  {
    name: 'Anemoia',
    note: 'Written by hand, in E-flat with a last chorus in F, 112 BPM. A chorus that opens on IVmaj9 - III7b9 - vi9 - v9 I9 and comes home from the hexatonic pole, B minor, every voice moving a semitone; a verse on a C pedal; a bridge in major thirds; and a tape that is clearest in the choruses and dissolves at the end.',
    bpm: ANEMOIA_BPM,
    totalSteps: ANEMOIA_STEPS,
    arrangement: 'Anemoia',
    soundPreset: 'Anemoia',
    automation: ANEMOIA_TAPE,
    build: buildAnemoiaTracks,
  },
];

export const builtInSongByName = (name?: string): BuiltInSong | undefined =>
  BUILT_IN_SONGS.find((song) => song.name === name);
