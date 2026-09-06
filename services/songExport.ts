import type { GlobalFXParams, InstrumentParams, Track } from "../types";

/**
 * Taking work out of the app: a preset file, a MIDI file, and a WAV.
 *
 * Everything here is deliberately dependency-free. A MIDI writer is a few
 * dozen lines of byte packing, and pulling a library in for it would be a
 * larger commitment than the feature.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteNameToMidi(note: string): number {
  const match = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 60;
  const index = NOTE_NAMES.indexOf(match[1]);
  if (index < 0) return 60;
  return (parseInt(match[2], 10) + 1) * 12 + index;
}

// --- preset file -----------------------------------------------------------

export interface PresetFile {
  format: 'neon-catafalque-preset';
  version: 1;
  savedAt: string;
  theme?: string;
  bpm: number;
  masterVolume: number;
  instrumentParams: Record<string, InstrumentParams>;
  globalFX: GlobalFXParams;
  generator?: Record<string, unknown>;
}

export function buildPresetFile(data: Omit<PresetFile, 'format' | 'version' | 'savedAt'>): PresetFile {
  return { format: 'neon-catafalque-preset', version: 1, savedAt: new Date().toISOString(), ...data };
}

/**
 * Parse a preset file defensively. This is a file off someone's disk: it may
 * be a different version, a hand-edited mess, or not a preset at all, and the
 * app should say so rather than half-applying it.
 */
export function parsePresetFile(text: string): { preset?: PresetFile; error?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'Not valid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null) return { error: 'Not a preset file.' };

  const candidate = raw as Partial<PresetFile>;
  // Files written before the format tag existed still carry the useful fields.
  if (!candidate.instrumentParams && !candidate.globalFX) {
    return { error: 'No instrument or effect settings in this file.' };
  }
  if (candidate.format && candidate.format !== 'neon-catafalque-preset') {
    return { error: `Unrecognised format "${candidate.format}".` };
  }
  return {
    preset: {
      format: 'neon-catafalque-preset',
      version: 1,
      savedAt: candidate.savedAt ?? '',
      theme: candidate.theme,
      bpm: typeof candidate.bpm === 'number' ? candidate.bpm : 120,
      masterVolume: typeof candidate.masterVolume === 'number' ? candidate.masterVolume : 0.6,
      instrumentParams: candidate.instrumentParams ?? {},
      globalFX: candidate.globalFX ?? ({} as GlobalFXParams),
      generator: candidate.generator,
    },
  };
}

// --- MIDI ------------------------------------------------------------------

const TICKS_PER_QUARTER = 96;
const TICKS_PER_STEP = TICKS_PER_QUARTER / 4; // the grid is sixteenth notes

/** General MIDI percussion keys, so the drum track opens as drums elsewhere. */
const DRUM_KEYS: Record<string, number> = {
  kick: 36, snare: 38, hihat: 42, fx: 49,
};

const MELODIC_CHANNEL: Record<string, number> = { lead: 0, bass: 1, pad: 2, pluck: 3 };

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  let remaining = value >> 7;
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>= 7;
  }
  return bytes;
}

function text(value: string): number[] {
  return [...value].map((c) => c.charCodeAt(0));
}

function uint32(value: number): number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function chunk(id: string, body: number[]): number[] {
  return [...text(id), ...uint32(body.length), ...body];
}

interface MidiEvent { tick: number; data: number[]; }

function buildTrack(events: MidiEvent[], name: string): number[] {
  const body: number[] = [
    0x00, 0xff, 0x03, name.length, ...text(name),
  ];
  const ordered = [...events].sort((a, b) => a.tick - b.tick);
  let last = 0;
  for (const event of ordered) {
    body.push(...variableLength(Math.max(0, event.tick - last)), ...event.data);
    last = event.tick;
  }
  body.push(0x00, 0xff, 0x2f, 0x00); // end of track
  return chunk('MTrk', body);
}

/**
 * A type 1 Standard MIDI File: one track per instrument, drums on channel 10.
 * Velocities carry the arrangement's dynamics, so the exported file has the
 * same shape as what was playing.
 */
export function exportMidi(tracks: readonly Track[], bpm: number, totalSteps: number): Blob {
  const microsPerQuarter = Math.round(60_000_000 / Math.max(20, bpm));
  const tempoTrack = buildTrack([
    { tick: 0, data: [0xff, 0x51, 0x03,
      (microsPerQuarter >> 16) & 0xff, (microsPerQuarter >> 8) & 0xff, microsPerQuarter & 0xff] },
  ], 'Neon Catafalque');

  const chunks: number[][] = [tempoTrack];

  for (const track of tracks) {
    const events: MidiEvent[] = [];

    if (track.notes?.length) {
      const channel = MELODIC_CHANNEL[track.id] ?? 4;
      for (const note of track.notes) {
        const key = noteNameToMidi(note.note);
        const start = Math.round(note.startStep * TICKS_PER_STEP);
        const end = Math.round((note.startStep + Math.max(0.5, note.duration)) * TICKS_PER_STEP);
        const velocity = Math.max(1, Math.min(127, Math.round(note.velocity * 127)));
        events.push({ tick: start, data: [0x90 | channel, key, velocity] });
        events.push({ tick: end, data: [0x80 | channel, key, 0] });
      }
    } else if (track.steps?.length) {
      const key = DRUM_KEYS[track.id] ?? 39;
      track.steps.forEach((step, index) => {
        if (!step.active || index >= totalSteps) return;
        const start = index * TICKS_PER_STEP;
        const velocity = Math.max(1, Math.min(127, Math.round(step.velocity * 127)));
        events.push({ tick: start, data: [0x99, key, velocity] });
        events.push({ tick: start + TICKS_PER_STEP / 2, data: [0x89, key, 0] });
      });
    }

    if (events.length) chunks.push(buildTrack(events, track.name));
  }

  const header = chunk('MThd', [
    0x00, 0x01,                                   // format 1
    (chunks.length >> 8) & 0xff, chunks.length & 0xff,
    (TICKS_PER_QUARTER >> 8) & 0xff, TICKS_PER_QUARTER & 0xff,
  ]);

  return new Blob([new Uint8Array([...header, ...chunks.flat()])], { type: 'audio/midi' });
}

// --- WAV -------------------------------------------------------------------

/** 16-bit stereo WAV from rendered sample data. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const left = channels[0];
  const right = channels[1] ?? channels[0];
  const frames = left.length;
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);

  const writeText = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + frames * 4, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, frames * 4, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, Math.round(l * 32767), true); offset += 2;
    view.setInt16(offset, Math.round(r * 32767), true); offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
