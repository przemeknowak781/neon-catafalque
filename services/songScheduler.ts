import type { InstrumentParams, Track, TrackType } from "../types";
import type { AudioEngine } from "./audioEngine";

/**
 * One step of the sequencer, shared by the live transport and the offline
 * renderer.
 *
 * This used to live inside App.tsx, which meant the only way to hear the
 * output was to open a tab. Anything that measures the mix would have had to
 * reimplement it and would then have been testing a copy rather than the thing
 * that actually plays.
 */
export function scheduleStep(
  engine: AudioEngine,
  tracks: readonly Track[],
  params: Record<string, InstrumentParams>,
  stepNumber: number,
  time: number,
  secondsPerStep: number,
): void {
  const hasSoloedTrack = tracks.some((t) => t.isSoloed);

  for (const track of tracks) {
    let playbackVolume = track.volume;
    if (track.isMuted) playbackVolume = 0;
    if (hasSoloedTrack && !track.isSoloed) playbackVolume = 0;
    if (playbackVolume <= 0) continue;

    if (track.notes) {
      for (const noteEvent of track.notes) {
        if (Math.floor(noteEvent.startStep) !== stepNumber) continue;
        const instrument = params[track.id];
        if (!instrument) continue;
        engine.playInstrument(
          track.id,
          noteEvent.note,
          time,
          noteEvent.duration * secondsPerStep,
          instrument,
          // The generator writes dynamics into every note — quieter in the
          // verse, lifted in the chorus — and this used to discard them, so
          // the whole song played flat out at track level with no contrast.
          playbackVolume * noteEvent.velocity,
        );
      }
    } else if (track.steps) {
      const step = track.steps[stepNumber];
      if (step?.active) {
        engine.playDrum(track.id as TrackType, time, playbackVolume * step.velocity);
        // The kick drives the sidechain; nothing else does.
        if (track.id === 'kick') engine.duck(time);
      }
    }
  }
}

export const secondsPerStepAt = (bpm: number): number => (60 / bpm) * 0.25;
