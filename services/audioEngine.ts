
import { InstrumentParams, GlobalFXParams, TrackType } from "../types";

/**
 * The context is injectable so the same engine can render offline.
 * Everything about how this project sounds was previously unverifiable:
 * there was no way to run the synth without a browser tab and a pair of ears.
 * scripts/measureMix.mjs renders through this class and measures the result.
 */

/** Instruments that should behave monophonically — a lead line is one voice. */
const MONOPHONIC = new Set<string>(['lead', 'bass']);
/** Voice cap for the polyphonic instruments, to stop releases stacking up. */
const MAX_POLYPHONY = 4;
/** How fast a stolen voice is faded out. Long enough to avoid a click. */
const VOICE_STEAL_FADE = 0.008;

interface ActiveVoice {
  gain: GainNode;
  endsAt: number;
  stop: (at: number) => void;
}

export class AudioEngine {
  ctx: BaseAudioContext;
  masterGain: GainNode;
  delayNode: DelayNode;
  feedbackNode: GainNode;
  reverbNode: ConvolverNode;
  reverbGain: GainNode;
  dryGain: GainNode;
  analyser: AnalyserNode;
  limiter: DynamicsCompressorNode;
  /** Final safety saturator. A compressor is not a brickwall and cannot be one. */
  safetyClip: WaveShaperNode;

  lastFrequencies: Record<string, number> = {};
  private voices = new Map<string, ActiveVoice[]>();
  private noiseBuffer: AudioBuffer;

  constructor(ctx?: BaseAudioContext) {
    this.ctx = ctx ?? new (window.AudioContext || (window as any).webkitAudioContext)();

    // Glue compression, set to catch peaks rather than sit on the whole mix.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-3.0, this.ctx.currentTime);
    this.limiter.knee.setValueAtTime(6, this.ctx.currentTime);
    this.limiter.ratio.setValueAtTime(12, this.ctx.currentTime);
    this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.limiter.release.setValueAtTime(0.15, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6;

    // A DynamicsCompressor lets transients through — the previous chain
    // measured +3.2 dBFS with 3.3% of samples pinned at full scale. This
    // saturates instead of hard-clipping them.
    this.safetyClip = this.ctx.createWaveShaper();
    this.safetyClip.curve = this.makeSaturationCurve();
    this.safetyClip.oversample = '4x';

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.delayNode = this.ctx.createDelay();
    this.feedbackNode = this.ctx.createGain();
    this.reverbNode = this.ctx.createConvolver();
    this.reverbGain = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();

    // dryGain -> limiter -> analyser -> masterGain -> saturator -> out
    this.dryGain.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.safetyClip);
    this.safetyClip.connect(this.ctx.destination);

    this.delayNode.connect(this.feedbackNode);
    this.feedbackNode.connect(this.delayNode);
    this.delayNode.connect(this.dryGain);

    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.limiter);

    // One noise buffer for the whole session. This used to be regenerated for
    // every single note — half a second of random floats per note played.
    this.noiseBuffer = this.createNoiseBuffer(1.0);
    this.generateImpulseResponse();
  }

  async resume() {
    const live = this.ctx as AudioContext;
    if (typeof live.resume === 'function' && live.state === 'suspended') {
      await live.resume();
    }
  }

  setMasterVolume(vol: number) {
    this.masterGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
  }

  updateGlobalFX(params: GlobalFXParams) {
    const now = this.ctx.currentTime;
    this.delayNode.delayTime.setTargetAtTime(params.delayTime, now, 0.1);
    // Feedback at or above 1.0 is a runaway loop; keep it strictly below.
    this.feedbackNode.gain.setTargetAtTime(Math.min(params.delayFeedback, 0.85), now, 0.1);
    this.reverbGain.gain.setTargetAtTime(params.reverbMix, now, 0.1);
  }

  private makeSaturationCurve(): Float32Array {
    const n = 2048;
    const curve = new Float32Array(n);
    const drive = 1.6;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    return curve;
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /**
   * Free a voice slot at `time`, fading whatever is playing rather than
   * cutting it. cancelAndHoldAtTime is what makes this possible: the envelope
   * was scheduled in advance, so the current value is not knowable here.
   */
  private stealVoice(voice: ActiveVoice, time: number) {
    const gain = voice.gain.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(time);
    else gain.cancelScheduledValues(time);
    gain.linearRampToValueAtTime(0.0001, time + VOICE_STEAL_FADE);
    voice.stop(time + VOICE_STEAL_FADE + 0.005);
  }

  private allocateVoice(type: string, time: number, voice: ActiveVoice) {
    const alive = (this.voices.get(type) ?? []).filter((v) => v.endsAt > time);
    const limit = MONOPHONIC.has(type) ? 1 : MAX_POLYPHONY;
    while (alive.length >= limit) {
      const oldest = alive.shift();
      if (oldest) this.stealVoice(oldest, time);
    }
    alive.push(voice);
    this.voices.set(type, alive);
  }

  /**
   * Amplitude envelope that stays monotonically ordered in time.
   *
   * The previous version scheduled the sustain point at `t + duration` and the
   * release after it, without checking that the note outlasted its own attack
   * and decay. Almost no note did: a 16th note at 132 BPM is 114 ms against a
   * 460 ms attack+decay, so events were queued out of order and every note
   * rang for its full release regardless of length. Twelve voices ended up
   * overlapping.
   */
  private applyAmpEnvelope(
    param: AudioParam,
    t: number,
    duration: number,
    params: InstrumentParams,
    peak: number,
  ): number {
    const attack = Math.max(0.001, params.attack);
    const decay = Math.max(0.001, params.decay);
    const release = Math.max(0.01, params.release);
    const sustain = peak * Math.max(0, Math.min(1, params.sustain));

    const attackEnd = t + attack;
    const decayEnd = attackEnd + decay;
    const releaseStart = Math.max(t + Math.max(duration, 0.02), attackEnd + 0.001);

    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(Math.max(peak, 0.0002), attackEnd);

    if (releaseStart >= decayEnd) {
      param.linearRampToValueAtTime(Math.max(sustain, 0.0001), decayEnd);
      param.setValueAtTime(Math.max(sustain, 0.0001), releaseStart);
    } else {
      // The note ends part-way through its decay: ramp to the level actually
      // reached instead of jumping.
      const progress = (releaseStart - attackEnd) / decay;
      const level = peak + (sustain - peak) * progress;
      param.linearRampToValueAtTime(Math.max(level, 0.0001), releaseStart);
    }

    const end = releaseStart + release;
    param.exponentialRampToValueAtTime(0.0001, end);
    return end;
  }

  /** Same ordering discipline for the filter sweep. */
  private applyFilterEnvelope(
    param: AudioParam,
    t: number,
    duration: number,
    params: InstrumentParams,
  ) {
    const base = Math.max(40, params.cutoff);
    const peak = Math.min(18000, base + params.filterEnvAmount * 12000);
    const sustainFreq = Math.max(40, base + (peak - base) * params.filterSustain);

    const attackEnd = t + Math.max(0.001, params.filterAttack);
    const decayEnd = attackEnd + Math.max(0.001, params.filterDecay);
    const releaseStart = Math.max(t + Math.max(duration, 0.02), attackEnd + 0.001);

    param.setValueAtTime(base, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 41), attackEnd);

    if (releaseStart >= decayEnd) {
      param.exponentialRampToValueAtTime(sustainFreq, decayEnd);
      param.setValueAtTime(sustainFreq, releaseStart);
    } else {
      const progress = (releaseStart - attackEnd) / Math.max(0.001, params.filterDecay);
      param.exponentialRampToValueAtTime(
        Math.max(40, peak + (sustainFreq - peak) * progress),
        releaseStart,
      );
    }
    param.exponentialRampToValueAtTime(base, releaseStart + Math.max(0.01, params.filterRelease));
  }

  playInstrument(
    type: string,
    note: string,
    time: number,
    duration: number,
    params: InstrumentParams,
    volume: number = 0.8,
  ) {
    const t = time || this.ctx.currentTime;
    const freq = this.noteToFreq(note);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const noise = this.ctx.createBufferSource();
    const noiseGain = this.ctx.createGain();

    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    noiseGain.gain.value = params.noiseLevel * 0.35;

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = params.vibratoRate;
    lfoGain.gain.value = params.vibratoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    // Portamento. A zero-length exponential ramp is degenerate, so only glide
    // when the patch actually asks for it.
    const glideTime = Math.max(0, params.glide) / 1000;
    if (glideTime > 0.001) {
      const lastFreq = this.lastFrequencies[type] || freq;
      osc1.frequency.setValueAtTime(lastFreq, t);
      osc2.frequency.setValueAtTime(lastFreq, t);
      sub.frequency.setValueAtTime(lastFreq / 2, t);
      osc1.frequency.exponentialRampToValueAtTime(freq, t + glideTime);
      osc2.frequency.exponentialRampToValueAtTime(freq, t + glideTime);
      sub.frequency.exponentialRampToValueAtTime(freq / 2, t + glideTime);
    } else {
      osc1.frequency.setValueAtTime(freq, t);
      osc2.frequency.setValueAtTime(freq, t);
      sub.frequency.setValueAtTime(freq / 2, t);
    }
    this.lastFrequencies[type] = freq;

    osc1.type = params.osc1Wave;
    osc2.type = params.osc2Wave;
    sub.type = 'sine';
    osc2.detune.value = params.detune;

    const mixer = this.ctx.createGain();
    const subGain = this.ctx.createGain();
    subGain.gain.value = params.subLevel * 0.6;

    osc1.connect(mixer);
    osc2.connect(mixer);
    sub.connect(subGain);
    subGain.connect(mixer);
    noise.connect(noiseGain);
    noiseGain.connect(mixer);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = params.resonance;
    this.applyFilterEnvelope(filter.frequency, t, duration, params);

    const vca = this.ctx.createGain();
    const instrumentMultiplier = 0.5;
    const envelopeEnd = this.applyAmpEnvelope(
      vca.gain, t, duration, params, volume * instrumentMultiplier,
    );

    mixer.connect(filter);
    filter.connect(vca);
    vca.connect(this.dryGain);

    if (type !== 'bass') {
      vca.connect(this.delayNode);
      vca.connect(this.reverbNode);
    }

    // The chorus used to tap the filter, upstream of the VCA, so it received a
    // signal that had never passed through the amplitude envelope — an
    // un-enveloped raw tone leaking straight into the mix.
    if (params.chorusMix > 0) {
      this.triggerChorusEffect(vca, t, envelopeEnd, params.chorusMix);
    }

    const stopTime = envelopeEnd + 0.05;
    const stop = (at: number) => {
      const when = Math.min(at, stopTime);
      try {
        osc1.stop(when); osc2.stop(when); sub.stop(when);
        noise.stop(when); lfo.stop(when);
      } catch {
        // Already stopped; harmless.
      }
    };

    this.allocateVoice(type, t, { gain: vca, endsAt: envelopeEnd, stop });

    osc1.start(t); osc2.start(t); sub.start(t); noise.start(t); lfo.start(t);
    osc1.stop(stopTime); osc2.stop(stopTime); sub.stop(stopTime);
    noise.stop(stopTime); lfo.stop(stopTime);
  }

  playDrum(type: TrackType, time: number, volume: number = 1.0) {
    const t = time || this.ctx.currentTime;
    if (type === 'kick') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.dryGain);
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      gain.gain.setValueAtTime(Math.min(volume, 1.0), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.start(t);
      osc.stop(t + 0.45);
    } else if (type === 'snare') {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1800;
      bandpass.Q.value = 0.8;
      const gain = this.ctx.createGain();
      noise.connect(bandpass); bandpass.connect(gain); gain.connect(this.dryGain);
      gain.gain.setValueAtTime(volume * 0.8, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      noise.start(t);
      noise.stop(t + 0.25);
    } else if (type === 'hihat') {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 8000;
      const gain = this.ctx.createGain();
      noise.connect(filter); filter.connect(gain); gain.connect(this.dryGain);
      gain.gain.setValueAtTime(volume * 0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      noise.start(t);
      noise.stop(t + 0.1);
    } else if (type === 'fx') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(2000, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.8);
      gain.gain.setValueAtTime(volume * 0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.connect(gain); gain.connect(this.reverbNode);
      osc.start(t); osc.stop(t + 0.85);
    }
  }

  triggerChorusEffect(inputNode: AudioNode, startTime: number, endTime: number, mix: number) {
    const chorusGain = this.ctx.createGain();
    chorusGain.gain.value = mix * 0.25;
    const delayL = this.ctx.createDelay();
    const delayR = this.ctx.createDelay();
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    delayL.delayTime.value = 0.02;
    delayR.delayTime.value = 0.025;
    osc.frequency.value = 0.5;
    oscGain.gain.value = 0.002;
    osc.connect(oscGain);
    oscGain.connect(delayL.delayTime);
    const inverter = this.ctx.createGain();
    inverter.gain.value = -1;
    oscGain.connect(inverter);
    inverter.connect(delayR.delayTime);
    inputNode.connect(delayL);
    inputNode.connect(delayR);
    delayL.connect(chorusGain);
    delayR.connect(chorusGain);
    chorusGain.connect(this.dryGain);
    osc.start(startTime);
    osc.stop(endTime + 0.1);
  }

  noteToFreq(note: string) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const match = note.match(/^([A-G]#?)(-?\d+)$/);
    if (!match) return 440;
    const semitoneIndex = notes.indexOf(match[1]);
    if (semitoneIndex < 0) return 440;
    const octave = parseInt(match[2], 10);
    const midi = (octave + 1) * 12 + semitoneIndex;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Reverb impulse. The previous one was raw white noise, unnormalised, so its
   * gain depended on nothing in particular and it washed the whole mix out.
   * This one is shorter, low-passed as it decays, and normalised to unit peak.
   */
  generateImpulseResponse() {
    const duration = 1.6;
    const decay = 3.0;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);

    let peak = 0;
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const n = i / length;
        const noise = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
        // Darken the tail: a bright reverb on every voice reads as noise.
        lp += 0.28 * (noise - lp);
        data[i] = lp;
        peak = Math.max(peak, Math.abs(lp));
      }
    }
    if (peak > 0) {
      for (let c = 0; c < 2; c++) {
        const data = impulse.getChannelData(c);
        for (let i = 0; i < length; i++) data[i] /= peak;
      }
    }
    this.reverbNode.buffer = impulse;
  }
}
export const audioEngine = new AudioEngine();
