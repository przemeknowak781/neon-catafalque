
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
  /** Send buses, so voices carry sends instead of building their own effects. */
  chorusBus: GainNode;
  reverbBus: GainNode;
  delayBus: GainNode;
  reverbPreDelay: DelayNode;
  delayDamp: BiquadFilterNode;
  /** Mastering chain. */
  subsonic: BiquadFilterNode;
  glue: DynamicsCompressorNode;
  lowShelf: BiquadFilterNode;
  airShelf: BiquadFilterNode;
  widthSide: GainNode;
  masterDrive: WaveShaperNode;
  private chorusLfos: OscillatorNode[] = [];
  private driveCurves = new Map<number, Float32Array>();

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
    this.masterGain.gain.value = 0.56;

    // A DynamicsCompressor lets transients through — the previous chain
    // measured +3.2 dBFS with 3.3% of samples pinned at full scale. This
    // saturates instead of hard-clipping them.
    this.safetyClip = this.ctx.createWaveShaper();
    this.safetyClip.curve = this.makeSaturationCurve(1.6);
    this.safetyClip.oversample = '4x';

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.dryGain = this.ctx.createGain();

    // --- mastering chain ---------------------------------------------------
    // Everything above this point is the mix; this is what happens to the sum.
    // Previously the sum met a compressor, a gain and a saturator, in that
    // order, and nothing else.

    // Subsonic filter. Nothing musical lives below 28 Hz, but the kick's pitch
    // envelope and the reverb tail both put energy there, and it eats headroom
    // the limiter then has to work around.
    this.subsonic = this.ctx.createBiquadFilter();
    this.subsonic.type = 'highpass';
    this.subsonic.frequency.value = 28;
    this.subsonic.Q.value = 0.7;

    // Bus compression, kept separate from the final limiter: one is glue, the
    // other is a ceiling, and asking a single stage to be both is why the
    // earlier chain pumped.
    this.glue = this.ctx.createDynamicsCompressor();
    this.glue.threshold.setValueAtTime(-18, this.ctx.currentTime);
    this.glue.knee.setValueAtTime(12, this.ctx.currentTime);
    this.glue.ratio.setValueAtTime(2, this.ctx.currentTime);
    this.glue.attack.setValueAtTime(0.02, this.ctx.currentTime);
    this.glue.release.setValueAtTime(0.25, this.ctx.currentTime);

    this.lowShelf = this.ctx.createBiquadFilter();
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 110;

    this.airShelf = this.ctx.createBiquadFilter();
    this.airShelf.type = 'highshelf';
    this.airShelf.frequency.value = 7000;

    this.masterDrive = this.ctx.createWaveShaper();
    this.masterDrive.curve = this.makeSaturationCurve(1.2);
    this.masterDrive.oversample = '2x';

    this.dryGain.connect(this.subsonic);
    this.subsonic.connect(this.glue);
    this.glue.connect(this.lowShelf);
    this.lowShelf.connect(this.airShelf);
    this.airShelf.connect(this.masterDrive);

    // Mid/side width. The side signal is scaled and recombined, so the control
    // can collapse the mix to mono or push the chorus and reverb wider without
    // touching anything centred.
    const widthOut = this.buildWidthStage(this.masterDrive);

    widthOut.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.safetyClip);
    this.safetyClip.connect(this.ctx.destination);

    // --- send buses --------------------------------------------------------
    // Voices carry sends rather than each building its own effects. The old
    // engine created a chorus — two delays, an oscillator and three gains —
    // per note, and tapped it upstream of the amplitude envelope.
    this.chorusBus = this.ctx.createGain();
    this.reverbBus = this.ctx.createGain();
    this.delayBus = this.ctx.createGain();

    // §4 "reverb pre-delay": the dry transient has to be heard before the
    // tail arrives, or the source sits inside the reverb instead of in front
    // of it. Feeding a convolver directly, as before, gives no pre-delay.
    this.reverbPreDelay = this.ctx.createDelay(0.5);
    this.reverbPreDelay.delayTime.value = 0.028;
    this.reverbNode = this.ctx.createConvolver();
    this.reverbGain = this.ctx.createGain();
    this.reverbBus.connect(this.reverbPreDelay);
    this.reverbPreDelay.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.limiter);

    this.delayNode = this.ctx.createDelay(2.0);
    this.feedbackNode = this.ctx.createGain();
    // Damp the repeats so an echo decays into the dark instead of hissing.
    this.delayDamp = this.ctx.createBiquadFilter();
    this.delayDamp.type = 'lowpass';
    this.delayDamp.frequency.value = 2600;
    this.delayBus.connect(this.delayNode);
    this.delayNode.connect(this.delayDamp);
    this.delayDamp.connect(this.feedbackNode);
    this.feedbackNode.connect(this.delayNode);
    this.delayNode.connect(this.dryGain);
    this.delayNode.connect(this.reverbBus);

    this.buildStereoChorus();
    this.noiseBuffer = this.createNoiseBuffer(2.0);
    this.generateImpulseResponse();
  }

  /**
   * Mid/side width, built from splitters and gains: mid = (L+R)/2,
   * side = (L-R)/2, then L = mid + side*w and R = mid - side*w.
   */
  private buildWidthStage(input: AudioNode): AudioNode {
    const splitter = this.ctx.createChannelSplitter(2);
    input.connect(splitter);

    const mid = this.ctx.createGain();
    const side = this.ctx.createGain();
    mid.gain.value = 1;
    side.gain.value = 1;

    const half = (value: number) => {
      const g = this.ctx.createGain();
      g.gain.value = value;
      return g;
    };
    const lToMid = half(0.5), rToMid = half(0.5);
    const lToSide = half(0.5), rToSide = half(-0.5);

    splitter.connect(lToMid, 0); splitter.connect(rToMid, 1);
    splitter.connect(lToSide, 0); splitter.connect(rToSide, 1);
    lToMid.connect(mid); rToMid.connect(mid);
    lToSide.connect(side); rToSide.connect(side);

    this.widthSide = side;

    const outL = this.ctx.createGain();
    const outR = this.ctx.createGain();
    const sideInverted = half(-1);
    side.connect(sideInverted);

    mid.connect(outL); side.connect(outL);
    mid.connect(outR); sideInverted.connect(outR);

    const merger = this.ctx.createChannelMerger(2);
    outL.connect(merger, 0, 0);
    outR.connect(merger, 0, 1);
    return merger;
  }

  /**
   * §4 "chorus/flanger as mood glue" — and the reason darkwave records sound
   * wide. Two modulated taps in quadrature, panned apart. The previous chorus
   * summed both taps to the same mono bus, so it thickened the sound without
   * placing any of it: a render measured a stereo correlation of 0.997, which
   * is a mono mix by any other name.
   */
  private buildStereoChorus() {
    const spread = 0.85;
    const rates = [0.33, 0.47];
    const bases = [0.017, 0.023];

    for (let side = 0; side < 2; side++) {
      const delay = this.ctx.createDelay(0.2);
      delay.delayTime.value = bases[side];

      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = rates[side];
      const depth = this.ctx.createGain();
      depth.gain.value = 0.0035;
      lfo.connect(depth);

      if (side === 1) {
        // Quadrature-ish: invert one side so the two taps move apart.
        const invert = this.ctx.createGain();
        invert.gain.value = -1;
        depth.connect(invert);
        invert.connect(delay.delayTime);
      } else {
        depth.connect(delay.delayTime);
      }

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = side === 0 ? -spread : spread;

      this.chorusBus.connect(delay);
      delay.connect(panner);
      panner.connect(this.dryGain);
      lfo.start(0);
      this.chorusLfos.push(lfo);
    }
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
    this.delayNode.delayTime.setTargetAtTime(Math.max(0.001, params.delayTime), now, 0.1);
    // Feedback at or above 1.0 is a runaway loop; keep it strictly below.
    this.feedbackNode.gain.setTargetAtTime(Math.min(params.delayFeedback, 0.85), now, 0.1);
    this.reverbGain.gain.setTargetAtTime(params.reverbMix, now, 0.1);

    // Mastering.
    this.widthSide.gain.setTargetAtTime(params.width ?? 1, now, 0.1);
    this.lowShelf.gain.setTargetAtTime(params.lowShelf ?? 0, now, 0.1);
    this.airShelf.gain.setTargetAtTime(params.airShelf ?? 0, now, 0.1);
    const glueAmount = params.glue ?? 0.35;
    this.glue.threshold.setTargetAtTime(-6 - glueAmount * 24, now, 0.1);
    this.glue.ratio.setTargetAtTime(1 + glueAmount * 3, now, 0.1);
    const drive = params.masterDrive ?? 0.2;
    this.masterDrive.curve = this.makeSaturationCurve(1 + drive * 2.5);
  }

  /** Cached saturation curves — one shaper curve per drive amount, not per note. */
  private driveCurve(amount: number): Float32Array {
    const key = Math.round(amount * 20) / 20;
    let curve = this.driveCurves.get(key);
    if (!curve) {
      curve = this.makeSaturationCurve(1 + key * 6);
      this.driveCurves.set(key, curve);
    }
    return curve;
  }

  private makeSaturationCurve(drive: number): Float32Array {
    const n = 2048;
    const curve = new Float32Array(n);
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

    const mixer = this.ctx.createGain();
    const stopTime = t + Math.max(duration, 0.02) + Math.max(0.01, params.release) + 0.15;

    const noise = this.ctx.createBufferSource();
    const noiseGain = this.ctx.createGain();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    noiseGain.gain.value = params.noiseLevel * 0.35;
    noise.connect(noiseGain);
    noiseGain.connect(mixer);

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = params.vibratoRate;
    lfoGain.gain.value = params.vibratoDepth;
    lfo.connect(lfoGain);

    // Portamento. A zero-length exponential ramp is degenerate, so only glide
    // when the patch actually asks for it.
    const glideTime = Math.max(0, params.glide) / 1000;
    const glideFrom = glideTime > 0.001 ? (this.lastFrequencies[type] || freq) : null;
    this.lastFrequencies[type] = freq;

    const oscillators: OscillatorNode[] = [];

    /**
     * One oscillator of the stack.
     *
     * Every voice gets its own detune offset and a slow drift across the note.
     * Two oscillators tuned to exactly the same pitch are mathematically one
     * waveform, which is why a patch with detune set to 0.08 cents sounded
     * like a chip rather than a synth: nothing was beating against anything.
     */
    const addOscillator = (
      wave: OscillatorType, frequency: number, level: number,
      detuneCents: number, pan: number,
    ) => {
      const osc = this.ctx.createOscillator();
      osc.type = wave;

      if (glideFrom !== null) {
        osc.frequency.setValueAtTime(glideFrom * (frequency / freq), t);
        osc.frequency.exponentialRampToValueAtTime(frequency, t + glideTime);
      } else {
        osc.frequency.setValueAtTime(frequency, t);
      }

      const drift = (Math.random() * 2 - 1) * 4.5;
      osc.detune.setValueAtTime(detuneCents + drift, t);
      osc.detune.linearRampToValueAtTime(
        detuneCents + drift + (Math.random() * 2 - 1) * 4.5, stopTime);
      lfoGain.connect(osc.frequency);

      const gain = this.ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain);

      if (pan !== 0) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pan;
        gain.connect(panner);
        panner.connect(mixer);
      } else {
        gain.connect(mixer);
      }
      oscillators.push(osc);
    };

    // Unison stack: detuned copies spread across the stereo field. This is the
    // difference between a single waveform and something that sounds played.
    const unison = Math.max(1, Math.min(7, Math.round(params.unison ?? 1)));
    const spread = params.unisonDetune ?? 14;
    const perVoice = 1 / Math.sqrt(unison);

    for (let i = 0; i < unison; i++) {
      const position = unison === 1 ? 0 : i / (unison - 1) - 0.5;
      const offset = position * 2 * spread;
      const pan = position * 1.3;
      addOscillator(params.osc1Wave, freq, perVoice, offset, pan);
      addOscillator(params.osc2Wave, freq, perVoice * 0.85, params.detune + offset * 0.7, -pan);
    }

    if (params.subLevel > 0) {
      addOscillator('sine', freq / 2, params.subLevel * 0.6, 0, 0);
    }

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

    // §4 "mild chorus/saturation". Drive before the VCA so the envelope shapes
    // the saturated tone rather than the saturation reacting to the envelope.
    const drive = params.drive ?? 0;
    let voiceTail: AudioNode = filter;
    if (drive > 0) {
      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this.driveCurve(drive);
      shaper.oversample = '2x';
      // Saturation adds level; pull it back so drive is a tone control.
      const compensate = this.ctx.createGain();
      compensate.gain.value = 1 / (1 + drive * 0.8);
      filter.connect(shaper);
      shaper.connect(compensate);
      voiceTail = compensate;
    }
    voiceTail.connect(vca);

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, params.pan ?? 0));
    vca.connect(panner);
    panner.connect(this.dryGain);

    // Sends. The bass stays dry and centred: it is the anchor.
    const reverbSend = params.reverbSend ?? (type === 'bass' ? 0 : 0.35);
    if (reverbSend > 0) this.send(vca, this.reverbBus, reverbSend);

    const delaySend = params.delaySend ?? 0;
    if (delaySend > 0) this.send(vca, this.delayBus, delaySend);

    if (params.chorusMix > 0) this.send(vca, this.chorusBus, params.chorusMix);

    const finalStop = Math.max(envelopeEnd + 0.05, stopTime);
    const stop = (at: number) => {
      const when = Math.min(at, finalStop);
      try {
        oscillators.forEach((osc) => osc.stop(when));
        noise.stop(when);
        lfo.stop(when);
      } catch {
        // Already stopped; harmless.
      }
    };

    this.allocateVoice(type, t, { gain: vca, endsAt: envelopeEnd, stop });

    oscillators.forEach((osc) => { osc.start(t); osc.stop(finalStop); });
    noise.start(t); noise.stop(finalStop);
    lfo.start(t); lfo.stop(finalStop);
  }

  /**
   * Drum machine voices, §4: "tight kick, snare/clap with gated verb".
   *
   * These were three noise bursts and a sine sweep. A darkwave kit is a drum
   * machine, and drum machines have character: a click on the kick, a tuned
   * shell under the snare's noise, and a metallic hat built from inharmonic
   * squares rather than filtered white noise.
   */
  playDrum(type: TrackType, time: number, volume: number = 1.0) {
    const t = time || this.ctx.currentTime;
    const level = Math.max(0, Math.min(1.2, volume));

    if (type === 'kick') {
      const body = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      body.frequency.setValueAtTime(165, t);
      body.frequency.exponentialRampToValueAtTime(48, t + 0.09);
      bodyGain.gain.setValueAtTime(level * 0.8, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);

      // The click is what makes a kick audible on small speakers.
      const click = this.ctx.createBufferSource();
      click.buffer = this.noiseBuffer;
      const clickFilter = this.ctx.createBiquadFilter();
      clickFilter.type = 'highpass';
      clickFilter.frequency.value = 2600;
      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(level * 0.3, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this.driveCurve(0.3);
      body.connect(bodyGain); bodyGain.connect(shaper);
      click.connect(clickFilter); clickFilter.connect(clickGain); clickGain.connect(shaper);
      shaper.connect(this.dryGain);

      body.start(t); body.stop(t + 0.4);
      click.start(t); click.stop(t + 0.04);

    } else if (type === 'snare') {
      const out = this.ctx.createGain();
      out.gain.value = level * 2.6;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = 0.06;
      out.connect(panner);
      panner.connect(this.dryGain);

      // Noise layer.
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const band = this.ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1900;
      band.Q.value = 0.7;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.62, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      noise.connect(band); band.connect(noiseGain); noiseGain.connect(out);
      noise.start(t); noise.stop(t + 0.2);

      // Tuned shell underneath, which is what stops it sounding like static.
      for (const [freq, gainValue, decay] of [[185, 0.4, 0.09], [331, 0.24, 0.06]] as const) {
        const shell = this.ctx.createOscillator();
        shell.type = 'triangle';
        shell.frequency.setValueAtTime(freq, t);
        shell.frequency.exponentialRampToValueAtTime(freq * 0.78, t + decay);
        const shellGain = this.ctx.createGain();
        shellGain.gain.setValueAtTime(gainValue, t);
        shellGain.gain.exponentialRampToValueAtTime(0.001, t + decay);
        shell.connect(shellGain); shellGain.connect(out);
        shell.start(t); shell.stop(t + decay + 0.02);
      }

      // §4 gated verb: a healthy send that is cut off short, rather than a
      // tail left to ring. The gate is what makes it read as eighties.
      const gate = this.ctx.createGain();
      gate.gain.setValueAtTime(0.9, t);
      gate.gain.setValueAtTime(0.9, t + 0.11);
      gate.gain.linearRampToValueAtTime(0.0001, t + 0.14);
      out.connect(gate);
      gate.connect(this.reverbBus);

    } else if (type === 'hihat') {
      // Six inharmonic squares through a highpass: the classic metallic hat.
      const out = this.ctx.createGain();
      out.gain.setValueAtTime(level * 1.5, t);
      out.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      const highpass = this.ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 7800;
      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 10200;
      bandpass.Q.value = 0.9;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = -0.18;

      const oscillators: OscillatorNode[] = [];
      for (const ratio of [1, 1.342, 1.2312, 1.6532, 1.9523, 2.1523]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        // Fundamentals in the kilohertz, so their square harmonics land in
        // the band the filters pass. At 260 Hz, as first written, the highpass
        // at 7.8 kHz removed essentially the whole hat.
        osc.frequency.value = 812 * ratio;
        osc.connect(bandpass);
        oscillators.push(osc);
      }
      bandpass.connect(highpass); highpass.connect(out);
      out.connect(panner); panner.connect(this.dryGain);
      oscillators.forEach((osc) => { osc.start(t); osc.stop(t + 0.07); });

    } else if (type === 'fx') {
      // A filtered noise sweep into the plate reads as space; a bare sine
      // sweep reads as a test tone.
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const sweep = this.ctx.createBiquadFilter();
      sweep.type = 'bandpass';
      sweep.Q.value = 3.5;
      sweep.frequency.setValueAtTime(5200, t);
      sweep.frequency.exponentialRampToValueAtTime(320, t + 1.1);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(level * 0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = 0.3;

      noise.connect(sweep); sweep.connect(gain);
      gain.connect(panner); panner.connect(this.dryGain);
      this.send(gain, this.reverbBus, 0.8);
      noise.start(t); noise.stop(t + 1.2);
    }
  }

  /** One gain node feeding a shared bus, rather than a whole effect per note. */
  private send(from: AudioNode, to: AudioNode, amount: number) {
    const gain = this.ctx.createGain();
    gain.gain.value = amount;
    from.connect(gain);
    gain.connect(to);
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
    const duration = 2.4;
    const decay = 2.6;
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
        lp += (c === 0 ? 0.24 : 0.27) * (noise - lp);
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
