import type { NoteEvent } from "../types";

/**
 * The toolkit the written songs share: pitch spelling, chords, phrases, a
 * pad that holds its common tones, and a harmoniser that turns a melody into
 * block chords. Each song file is then only its score.
 */

export const STEPS_PER_BAR = 16;
export const bar = (n: number) => n * STEPS_PER_BAR;

// --- pitch spelling -------------------------------------------------------

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * 'Eb5', 'Cb4', 'F#3' to MIDI. Spelled as a musician writes them, so a score
 * reads in the key it is in; C-flat 4 is B3, which is what it sounds as.
 */
export function midiOf(name: string): number {
  const match = name.match(/^([A-G])(bb|b|#)?(-?\d)$/);
  if (!match) throw new Error(`Unreadable pitch ${name}`);
  const accidental = match[2] === 'b' ? -1 : match[2] === 'bb' ? -2 : match[2] === '#' ? 1 : 0;
  return (parseInt(match[3], 10) + 1) * 12 + LETTER[match[1]] + accidental;
}

/** Pitch class of a spelled name without octave: 'Cb' is 11. */
export const pcOf = (name: string) => ((midiOf(`${name}4`) % 12) + 12) % 12;

/** The engine's spelling: sharps only. */
export const engineName = (midi: number): string =>
  `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

// --- melody ---------------------------------------------------------------

/** One note of a phrase: step within its bar, pitch, length in steps. */
export type Cell = readonly [step: number, pitch: string, length: number];
export type Bar = readonly Cell[];

export interface Builder { notes: NoteEvent[]; add: (step: number, pitch: string | number, length: number, velocity: number) => void }

export function builder(id: string): Builder {
  const notes: NoteEvent[] = [];
  return {
    notes,
    add(step, pitch, length, velocity) {
      const midi = typeof pitch === 'number' ? pitch : midiOf(pitch);
      notes.push({
        id: `${id}-${notes.length}`,
        note: engineName(midi),
        startStep: step,
        duration: length,
        velocity: Math.round(velocity * 1000) / 1000,
      });
    },
  };
}

/**
 * Lay a phrase of bars down starting at a bar, optionally transposed. A
 * struck instrument gets `struck` set: every note one step long, because it
 * rings on its own release and the written length means nothing to it.
 */
export function phrase(target: Builder, startBar: number, bars: readonly Bar[], velocity: number, transpose = 0, struck = false) {
  bars.forEach((cells, b) => {
    for (const [step, pitch, length] of cells) {
      // The held note a touch louder than the pick-up notes: it is the one
      // the phrase leans on.
      const v = velocity * (length >= 6 ? 1.04 : length <= 2 ? 0.9 : 0.95);
      target.add(bar(startBar + b) + step, midiOf(pitch) + transpose, struck ? 1 : length, Math.min(1, v));
    }
  });
}

/** The same phrase at half speed, every onset doubled, struck. */
export function augmented(target: Builder, startStep: number, bars: readonly Bar[], velocity: number, transpose = 0) {
  bars.forEach((cells, b) => {
    for (const [step, pitch] of cells) {
      target.add(startStep + (b * STEPS_PER_BAR + step) * 2, midiOf(pitch) + transpose, 1, velocity);
    }
  });
}

// --- harmony --------------------------------------------------------------

/**
 * A chord: its symbol, its root (for the bass), every tone the symbol names
 * (the pad voices some of them; the melody may carry the rest), the voicing,
 * and where in the bar it starts.
 */
export interface Chord { at: number; name: string; root: string; tones: readonly string[]; pad: readonly string[] }
export const chord = (name: string, root: string, tones: readonly string[], pad: readonly string[], at = 0): Chord =>
  ({ name, root, tones, pad, at });

/** A chord a number of semitones up: root, voicing and tones, respelled with sharps. */
export const lift = (c: Chord, semitones: number): Chord => ({
  ...c,
  name: `${c.name}+${semitones}`,
  root: engineName(midiOf(c.root) + semitones),
  tones: c.tones.map((t) => SHARP_NAMES[(pcOf(t) + semitones) % 12]),
  pad: c.pad.map((p) => engineName(midiOf(p) + semitones)),
});

/** The same chord starting part-way through a bar. */
export const at = (c: Chord, step: number): Chord => ({ ...c, at: step });

export const chordAt = (bars: Chord[][], step: number): Chord => {
  const chords = bars[Math.floor(step / STEPS_PER_BAR)];
  return [...chords].reverse().find((c) => c.at <= step % STEPS_PER_BAR) ?? chords[0];
};

/** Chords per bar, as MIDI and pitch classes, for the checks in verifyEarworm. */
export function harmonyMap(bars: Chord[][]): { bar: number; at: number; name: string; root: number; tones: number[]; pad: number[] }[] {
  return bars.flatMap((chords, b) =>
    chords.map((c) => ({
      bar: b, at: c.at, name: c.name, root: midiOf(c.root),
      tones: c.tones.map(pcOf), pad: c.pad.map(midiOf),
    })));
}

/**
 * Pad: the harmony, with common tones held across the barline rather than
 * struck again. A pad that re-attacks every note on every chord is a keyboard
 * player hitting the chord; one that only moves the voices that change is a
 * string section.
 */
export function buildPad(bars: Chord[][], energy: (bar: number) => number): NoteEvent[] {
  const pad = builder('pad');
  const spans: { start: number; end: number; pitches: number[]; velocity: number }[] = [];
  bars.forEach((chords, b) => {
    chords.forEach((c, i) => {
      const start = bar(b) + c.at;
      const end = i + 1 < chords.length ? bar(b) + chords[i + 1].at : bar(b + 1);
      spans.push({ start, end, pitches: c.pad.map(midiOf), velocity: energy(b) });
    });
  });
  const open = new Map<number, { start: number; velocity: number }>();
  spans.forEach((span, i) => {
    const next = spans[i + 1];
    for (const p of span.pitches) {
      if (!open.has(p)) open.set(p, { start: span.start, velocity: span.velocity });
    }
    for (const [p, from] of [...open]) {
      const continues = next && next.pitches.includes(p) && next.start === span.end;
      if (!continues) {
        pad.add(from.start, p, span.end - from.start, from.velocity);
        open.delete(p);
      }
    }
  });
  return pad.notes;
}

/**
 * A melody as block chords: under every melody note, the nearest `voices`
 * tones of the chord written for that moment — its colours included — each at
 * least a minor third below the voice above, never below the pad's top voice,
 * and never a semitone from anything the pad is sounding. Where the pad leaves
 * no room the melody takes fewer voices. The melody stays the top voice and
 * the loudest; the voices under it are quieter, so the tune reads through.
 */
export function harmonise(melody: NoteEvent[], bars: Chord[][], pad: NoteEvent[], voices = 2, under = 0.6): NoteEvent[] {
  const lead = builder('lead');
  for (const n of melody) {
    const top = midiOf(n.note);
    lead.add(n.startStep, top, n.duration, n.velocity);
    const c = chordAt(bars, n.startStep);
    const tones = new Set([...c.tones.map(pcOf), ((midiOf(c.root) % 12) + 12) % 12]);
    const padNow = pad
      .filter((p) => p.startStep < n.startStep + n.duration && p.startStep + p.duration > n.startStep)
      .map((p) => midiOf(p.note));
    const floor = Math.max(-1, ...padNow);
    let above = top;
    let placed = 0;
    for (let m = top - 3; m >= floor && placed < voices; m--) {
      if (m > above - 3) continue;
      if (!tones.has(((m % 12) + 12) % 12)) continue;
      if (padNow.some((p) => Math.abs(p - m) === 1)) continue;
      lead.add(n.startStep, m, n.duration, n.velocity * under);
      above = m;
      placed++;
    }
  }
  return lead.notes;
}
