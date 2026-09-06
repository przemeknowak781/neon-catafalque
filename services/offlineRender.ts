import type { InstrumentParams, Track } from "../types";
import { AudioEngine } from "./audioEngine";
import { scheduleStep, secondsPerStepAt } from "./songScheduler";
import type { GlobalFXParams } from "../types";

/**
 * Render a song to samples without a speaker.
 *
 * The same engine, the same scheduler and the same effect settings the
 * transport uses, driven by an OfflineAudioContext. Both the WAV export and
 * scripts/measureMix.mjs go through here, so what is measured and what is
 * exported are what is heard.
 */
export interface OfflineRenderOptions {
  tracks: readonly Track[];
  params: Record<string, InstrumentParams>;
  globalFX: GlobalFXParams;
  bpm: number;
  totalSteps: number;
  masterVolume?: number;
  sampleRate?: number;
  /** Extra seconds so the last note's release is captured, not cut off. */
  tailSeconds?: number;
  onProgress?: (fraction: number) => void;
}

export interface OfflineRenderResult {
  channels: Float32Array[];
  sampleRate: number;
  durationSeconds: number;
}

export async function renderOffline(options: OfflineRenderOptions): Promise<OfflineRenderResult> {
  const {
    tracks, params, globalFX, bpm, totalSteps,
    // Matches the app's own default. The renderer previously used 0.8, so
    // every measurement taken through it described a hotter mix than the one
    // the transport actually plays.
    masterVolume = 0.6, sampleRate = 44100, tailSeconds = 4,
  } = options;

  const secondsPerStep = secondsPerStepAt(bpm);
  const durationSeconds = totalSteps * secondsPerStep + tailSeconds;

  const ctx = new OfflineAudioContext(2, Math.ceil(durationSeconds * sampleRate), sampleRate);
  const engine = new AudioEngine(ctx);
  engine.setTempo(bpm);
  engine.updateGlobalFX(globalFX);
  engine.setMasterVolume(masterVolume);

  for (let step = 0; step < totalSteps; step++) {
    // A small offset so nothing is scheduled at exactly zero, where an
    // envelope's first ramp would have no room.
    scheduleStep(engine, tracks, params, step, 0.05 + step * secondsPerStep, secondsPerStep);
    if (options.onProgress && step % 64 === 0) options.onProgress(step / totalSteps);
  }

  const buffer = await ctx.startRendering();
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  options.onProgress?.(1);

  return { channels, sampleRate, durationSeconds };
}
