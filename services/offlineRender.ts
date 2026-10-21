import type { InstrumentParams, TapeAutomation, Track } from "../types";
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
  /** A song's tape moves, so an export of it sounds like it plays. */
  automation?: readonly TapeAutomation[] | null;
  onProgress?: (fraction: number) => void;
}

export interface OfflineRenderResult {
  channels: Float32Array[];
  sampleRate: number;
  durationSeconds: number;
}

/** Steps scheduled per window; two bars. */
const WINDOW_STEPS = 32;

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

  // A small offset so nothing is scheduled at exactly zero, where an
  // envelope's first ramp would have no room.
  const stepTime = (step: number) => 0.05 + step * secondsPerStep;
  const scheduleRange = (from: number, to: number) => {
    for (let step = from; step < Math.min(to, totalSteps); step++) {
      scheduleStep(engine, tracks, params, step, stepTime(step), secondsPerStep, options.automation);
    }
  };

  /**
   * Schedule ahead in windows, not all at once.
   *
   * Every note builds its voice the moment it is scheduled, and a voice that
   * has not started yet is still part of the graph the renderer walks on
   * every 128-sample quantum. Scheduling a whole song up front therefore
   * costs (notes) x (length): quadratic in the length of the song. A 16-bar
   * sketch never noticed; the 72-bar built-in song took longer than ten
   * minutes to render. Suspending the render every two bars and scheduling
   * the next two — what the live transport does with its lookahead — keeps
   * the graph to the notes actually near the playhead.
   *
   * Where suspend() is unavailable the old behaviour is kept: slow, but the
   * same samples.
   */
  const canSuspend = typeof (ctx as OfflineAudioContext & { suspend?: unknown }).suspend === 'function';
  if (!canSuspend) {
    scheduleRange(0, totalSteps);
  } else {
    scheduleRange(0, WINDOW_STEPS);
    const quantum = 128 / sampleRate;
    // Wake half a window before each window starts. Suspend times are
    // quantised to the render quantum, and two suspends at one time is an
    // error, so windows that would collide are merged into one wake-up.
    const wakeUps = new Map<number, number[]>();
    for (let from = WINDOW_STEPS; from < totalSteps; from += WINDOW_STEPS) {
      const ideal = stepTime(from) - (WINDOW_STEPS / 2) * secondsPerStep;
      const frame = Math.max(1, Math.floor(ideal / quantum));
      const key = frame * quantum;
      wakeUps.set(key, [...(wakeUps.get(key) ?? []), from]);
    }
    for (const [at, windows] of wakeUps) {
      ctx.suspend(at).then(() => {
        for (const from of windows) scheduleRange(from, from + WINDOW_STEPS);
        options.onProgress?.(Math.min(1, windows[windows.length - 1] / totalSteps));
        return ctx.resume();
      });
    }
  }

  const buffer = await ctx.startRendering();
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  options.onProgress?.(1);

  return { channels, sampleRate, durationSeconds };
}
