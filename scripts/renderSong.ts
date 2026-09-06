/**
 * Offline render entry point, bundled and run inside a headless browser page.
 *
 * Renders a generated song through OfflineAudioContext using the same engine
 * and the same scheduler the live transport uses, then hands back raw samples
 * so they can be measured and written to a WAV.
 */

import { AudioEngine } from '../services/audioEngine';
import { scheduleStep, secondsPerStepAt } from '../services/songScheduler';
import { generatorService, type GeneratorSettings } from '../services/earwormGenerator';
import {
  DEFAULT_LEAD_PARAMS,
  DEFAULT_BASS_PARAMS,
  DEFAULT_PAD_PARAMS,
  DEFAULT_PLUCK_PARAMS,
  DEFAULT_GLOBAL_FX,
  INITIAL_TRACKS,
} from '../constants';
import type { InstrumentParams } from '../types';

export interface RenderOptions {
  seed: number;
  settings?: Partial<GeneratorSettings>;
  /** Bars to render; the rest of the song is truncated. */
  bars?: number;
  sampleRate?: number;
  /** Use the app's calibrated mixer levels instead of whatever the generator set. */
  useAppMixerLevels?: boolean;
}

export interface RenderResult {
  channels: Float32Array[];
  sampleRate: number;
  bpm: number;
  durationSeconds: number;
  /** Peak simultaneous voice count, sampled per step. */
  peakVoices: number;
  noteCount: number;
}

const PARAMS: Record<string, InstrumentParams> = {
  lead: DEFAULT_LEAD_PARAMS,
  bass: DEFAULT_BASS_PARAMS,
  pad: DEFAULT_PAD_PARAMS,
  pluck: DEFAULT_PLUCK_PARAMS,
};

export async function renderSong(options: RenderOptions): Promise<RenderResult> {
  const { seed, bars = 16, sampleRate = 44100, useAppMixerLevels = false } = options;

  const song = generatorService.generate({
    totalSteps: 256,
    mode: 'aeolian',
    harmonicMotion: 'conjunct',
    contour: 'arch',
    rhythmDensity: 0.5,
    entropy: 0.4,
    bassMode: 'driving',
    drumMode: 'four-floor',
    seed,
    ...options.settings,
  });

  let tracks = song.tracks;
  if (useAppMixerLevels) {
    const levels = new Map(INITIAL_TRACKS.map((t) => [t.id, t.volume]));
    tracks = tracks.map((t) => ({ ...t, volume: levels.get(t.id) ?? t.volume }));
  }

  const secondsPerStep = secondsPerStepAt(song.bpm);
  const steps = bars * 16;
  // Tail so the last note's release is captured rather than cut off.
  const durationSeconds = steps * secondsPerStep + 4;

  const ctx = new OfflineAudioContext(2, Math.ceil(durationSeconds * sampleRate), sampleRate);
  const engine = new AudioEngine(ctx);
  engine.updateGlobalFX(DEFAULT_GLOBAL_FX);
  engine.setMasterVolume(0.8);

  // Count how many notes are sounding at once — voice pile-up is the usual
  // cause of a mix turning to mush, and it is invisible in the note data.
  let peakVoices = 0;
  let noteCount = 0;
  const releases: number[] = [];

  for (let step = 0; step < steps; step++) {
    const time = 0.05 + step * secondsPerStep;

    for (const track of tracks) {
      if (!track.notes) continue;
      for (const n of track.notes) {
        if (Math.floor(n.startStep) !== step) continue;
        noteCount++;
        const params = PARAMS[track.id];
        const end = time + n.duration * secondsPerStep + (params?.release ?? 0);
        releases.push(end);
      }
    }
    const alive = releases.filter((end) => end > time).length;
    peakVoices = Math.max(peakVoices, alive);

    scheduleStep(engine, tracks, PARAMS, step, time, secondsPerStep);
  }

  const buffer = await ctx.startRendering();
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));

  return {
    channels,
    sampleRate,
    bpm: song.bpm,
    durationSeconds,
    peakVoices,
    noteCount,
  };
}

// Expose for the Playwright driver.
(window as unknown as { renderSong: typeof renderSong }).renderSong = renderSong;
