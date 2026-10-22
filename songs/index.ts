import type { TapeAutomation, Track } from "../types";
import { ANEMOIA_BPM, ANEMOIA_HOOK, ANEMOIA_STEPS, ANEMOIA_TAPE, anemoiaHarmony, buildAnemoiaTracks } from "./anemoia";
import {
  SUMMER_BPM, SUMMER_CHORUS_STARTS, SUMMER_SECTIONS, SUMMER_STEPS, SUMMER_TAPE, buildSummerTracks, summerHarmony,
} from "./summer";

/** What the checks in verifyEarworm need to know about a song's shape and harmony. */
export interface SongAnalysis {
  /** Bars [from, to) of the intro, the bridge and every chorus, in order. */
  intro: [number, number];
  bridge: [number, number];
  choruses: [number, number][];
  /** First bar of each chorus and its transposition in semitones. */
  chorusStarts: [number, number][];
  harmony: () => { bar: number; at: number; name: string; root: number; tones: number[]; pad: number[] }[];
}

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
  /** Where the generator is pointed when the song loads. */
  generator: { key: string; mode: string; harmony: string };
  analysis: SongAnalysis;
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
    generator: { key: 'D#', mode: 'ionian', harmony: 'Royal Road' },
    analysis: {
      intro: ANEMOIA_HOOK.sections.signOn,
      bridge: ANEMOIA_HOOK.sections.bridge,
      choruses: [ANEMOIA_HOOK.sections.chorus1, ANEMOIA_HOOK.sections.chorus2, ANEMOIA_HOOK.sections.chorus3],
      chorusStarts: ANEMOIA_HOOK.chorusStarts,
      harmony: anemoiaHarmony,
    },
  },
  {
    name: 'The Summer We Never Had',
    note: 'Written by hand, in D with a last chorus in E-flat, 108 BPM. The canon progression over a falling bass that turns to the borrowed minor iv, a melody of sequences and appoggiaturas sung in three-voice chords, a sixteenth-note arpeggio, and the chorus heard first as a memory in the intro.',
    bpm: SUMMER_BPM,
    totalSteps: SUMMER_STEPS,
    arrangement: 'The Summer We Never Had',
    soundPreset: 'The Summer We Never Had',
    automation: SUMMER_TAPE,
    build: buildSummerTracks,
    generator: { key: 'D', mode: 'ionian', harmony: 'Auto' },
    analysis: {
      intro: SUMMER_SECTIONS.intro,
      bridge: SUMMER_SECTIONS.bridge,
      choruses: [SUMMER_SECTIONS.chorus1, SUMMER_SECTIONS.chorus2, SUMMER_SECTIONS.chorus3],
      chorusStarts: SUMMER_CHORUS_STARTS,
      harmony: summerHarmony,
    },
  },
];

export const builtInSongByName = (name?: string): BuiltInSong | undefined =>
  BUILT_IN_SONGS.find((song) => song.name === name);
