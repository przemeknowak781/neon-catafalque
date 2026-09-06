
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
  /** Second echo tap, so the repeats can bounce between the channels. */
  delayNodeR: DelayNode;
  delayDampR: BiquadFilterNode;
  feedbackNodeR: GainNode;
  delayPanL: StereoPannerNode;
  delayPanR: StereoPannerNode;
  /** §4 "modulation (chorus/flanger) as mood glue", and the phaser the
   *  Polymoog lead was recorded through. */
  phaserBus: GainNode;
  flangerBus: GainNode;
  /** Return levels. Every effect needs a master level or it cannot be mixed:
   *  a send decides how much of a voice goes in, a return how much comes back.
   *  Previously only the reverb had one, so the chorus and echo were stuck at
   *  unity and the phaser's send doubled as its level. */
  chorusReturn: GainNode;
  delayReturn: GainNode;
  phaserReturn: GainNode;
  flangerReturn: GainNode;
  private phaserStages: BiquadFilterNode[] = [];
  private phaserLfoDepth: GainNode | null = null;
  private phaserLfo: OscillatorNode | null = null;
  private flangerDelay: DelayNode | null = null;
  private flangerLfo: OscillatorNode | null = null;
  private flangerFeedback: GainNode | null = null;
  private reverbSize = 2.4;
  private reverbDamp = 0.25;
  /** Everything melodic passes through here so the kick can duck it. */
  duckGain: GainNode;
  /** Mastering chain. */
  subsonic: BiquadFilterNode;
  glue: DynamicsCompressorNode;
  lowShelf: BiquadFilterNode;
  airShelf: BiquadFilterNode;
  widthSide: GainNode;
  masterDrive: WaveShaperNode;
  private chorusLfos: OscillatorNode[] = [];
  private driveCurves = new Map<number, Float32Array>();

  /**
   * Deterministic noise, used everywhere the engine wants randomness: the
   * noise buffer behind the drums, and the per-oscillator tuning drift that
   * stands in for analogue instability.
   *
   * Both drew on the global generator, which made two renders of the same song
   * differ — measured at 0.91 in sample value, near full scale. Nothing
   * measured through this engine was reproducible, so no before/after
   * comparison of a change to it could be trusted. The character is unchanged:
   * the drift is still a different small offset per voice, it is just the same
   * one each time the song is played.
   */
  private noiseSeed = 0x2545f491;
  private random(): number {
    this.noiseSeed = (this.noiseSeed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.noiseSeed ^ (this.noiseSeed >>> 15), 1 | this.noiseSeed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

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
    // Trimmed after the filter went to 24 dB/octave: resonance on the first
    // stage adds roughly 2.5 dB at the peak.
    this.masterGain.gain.value = 0.45;

    // A DynamicsCompressor lets transients through — the previous chain
    // measured +3.2 dBFS with 3.3% of samples pinned at full scale. This
    // saturates instead of hard-clipping them.
    this.safetyClip = this.ctx.createWaveShaper();
    this.safetyClip.curve = this.makeSaturationCurve(1.6);
    this.safetyClip.oversample = '4x';

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.dryGain = this.ctx.createGain();

    // Sidechain ducking. Web Audio has no sidechain input, but the whole song
    // is scheduled ahead of time, so the duck can simply be written into a
    // gain envelope at each kick. That is exact rather than approximate, and
    // the pumping it produces is most of what makes electronic music breathe.
    this.duckGain = this.ctx.createGain();
    this.duckGain.gain.value = 1;
    this.dryGain.connect(this.duckGain);

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

    this.duckGain.connect(this.subsonic);
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
    this.phaserBus = this.ctx.createGain();
    this.flangerBus = this.ctx.createGain();

    // Buses stay at unity; the returns carry the level. Muting the input of a
    // feedback effect kills its tail dead, which is not what a mix control
    // should do.
    this.chorusReturn = this.ctx.createGain();
    this.delayReturn = this.ctx.createGain();
    this.phaserReturn = this.ctx.createGain();
    this.flangerReturn = this.ctx.createGain();
    this.phaserReturn.gain.value = 0;
    this.flangerReturn.gain.value = 0;
    this.chorusReturn.connect(this.dryGain);
    this.delayReturn.connect(this.dryGain);
    this.phaserReturn.connect(this.dryGain);
    this.flangerReturn.connect(this.dryGain);

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
    // Into the mix, not past it. The return used to go straight to the
    // limiter, so the plate — the widest, longest element in a darkwave mix —
    // was the one thing that never got widened, never got the bus
    // compression, and never ducked under the kick.
    this.reverbGain.connect(this.dryGain);

    // Two taps with crossed feedback: with ping-pong on, a repeat leaves one
    // side and returns on the other. Damped, so an echo decays into the dark
    // rather than hissing at the top.
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNodeR = this.ctx.createDelay(2.0);
    this.feedbackNode = this.ctx.createGain();
    this.feedbackNodeR = this.ctx.createGain();
    this.delayDamp = this.ctx.createBiquadFilter();
    this.delayDampR = this.ctx.createBiquadFilter();
    this.delayDamp.type = 'lowpass';
    this.delayDampR.type = 'lowpass';
    this.delayDamp.frequency.value = 2600;
    this.delayDampR.frequency.value = 2600;
    this.delayPanL = this.ctx.createStereoPanner();
    this.delayPanR = this.ctx.createStereoPanner();
    this.delayPanL.pan.value = 0;
    this.delayPanR.pan.value = 0;

    this.delayBus.connect(this.delayNode);
    this.delayNode.connect(this.delayDamp);
    this.delayDamp.connect(this.feedbackNode);
    this.delayNodeR.connect(this.delayDampR);
    this.delayDampR.connect(this.feedbackNodeR);
    // Crossed: left feeds right and right feeds left.
    this.feedbackNode.connect(this.delayNodeR);
    this.feedbackNodeR.connect(this.delayNode);

    this.delayNode.connect(this.delayPanL);
    this.delayNodeR.connect(this.delayPanR);
    this.delayPanL.connect(this.delayReturn);
    this.delayPanR.connect(this.delayReturn);
    // Echo into the plate, so repeats dissolve rather than stopping dead.
    this.delayPanL.connect(this.reverbBus);

    this.buildStereoChorus();
    this.buildPhaser();
    this.buildFlanger();
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
   * Phaser: four allpass stages swept by an LFO, summed with the dry signal so
   * the cancellation notches move through the spectrum.
   *
   * "Cars" was recorded through one — widely reported as an MXR Phase 90 —
   * alongside plate reverb, and it is a large part of why that lead sounds the
   * way it does rather than like a plain string patch.
   */
  private buildPhaser() {
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.4;
    const depth = this.ctx.createGain();
    depth.gain.value = 700;
    lfo.connect(depth);

    let node: AudioNode = this.phaserBus;
    for (let stage = 0; stage < 4; stage++) {
      const allpass = this.ctx.createBiquadFilter();
      allpass.type = 'allpass';
      allpass.frequency.value = 300 + stage * 320;
      allpass.Q.value = 0.7;
      depth.connect(allpass.frequency);
      node.connect(allpass);
      node = allpass;
      this.phaserStages.push(allpass);
    }

    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.32;
    node.connect(feedback);
    feedback.connect(this.phaserStages[0]);

    node.connect(this.phaserReturn);
    lfo.start(0);
    this.phaserLfo = lfo;
    this.phaserLfoDepth = depth;
  }

  /**
   * Flanger: a very short modulated delay fed back on itself. §4 names it
   * alongside the chorus as the modulation that glues the mood together.
   * The difference from the chorus is the delay length — single-digit
   * milliseconds, so the comb notches are audible as a sweep.
   */
  private buildFlanger() {
    const delay = this.ctx.createDelay(0.05);
    delay.delayTime.value = 0.004;

    const lfo = this.ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 0.25;
    const depth = this.ctx.createGain();
    depth.gain.value = 0.0025;
    lfo.connect(depth);
    depth.connect(delay.delayTime);

    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.55;
    delay.connect(feedback);
    feedback.connect(delay);

    const spread = this.ctx.createStereoPanner();
    spread.pan.value = 0.35;

    this.flangerBus.connect(delay);
    delay.connect(spread);
    spread.connect(this.flangerReturn);

    lfo.start(0);
    this.flangerDelay = delay;
    this.flangerLfo = lfo;
    this.flangerFeedback = feedback;
  }

  /**
   * §4 "chorus/flanger as mood glue" — and the reason darkwave records sound
   * wide. Two modulated taps in quadrature, panned apart. The previous chorus
   * summed both taps to the same mono bus, so it thickened the sound without
   * placing any of it: a render measured a stereo correlation of 0.997, which
   * is a mono mix by any other name.
   */
  private buildStereoChorus() {
    // Juno-106 figures: Chorus I runs its LFO at roughly 0.5 Hz and Chorus II
    // at roughly 0.8 Hz. The delay sits around 6 ms — a user measurement
    // rather than Roland documentation, which is the only figure available.
    // The previous 17 and 23 ms taps at a third of a hertz were a doubler,
    // not a chorus.
    const spread = 0.85;
    const rates = [0.5, 0.8];
    const bases = [0.006, 0.0075];

    for (let side = 0; side < 2; side++) {
      const delay = this.ctx.createDelay(0.2);
      delay.delayTime.value = bases[side];

      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = rates[side];
      const depth = this.ctx.createGain();
      depth.gain.value = 0.0025;
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
      panner.connect(this.chorusReturn);
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

  private duckDepth = 0;
  private duckRelease = 0.18;

  /**
   * Duck the mix at `time`. Called by the scheduler on every kick, so the
   * amount of pumping follows the kick pattern rather than a fixed LFO.
   */
  duck(time: number) {
    if (this.duckDepth <= 0.001) return;
    const gain = this.duckGain.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(time);
    gain.setValueAtTime(1 - this.duckDepth, time);
    gain.linearRampToValueAtTime(1, time + this.duckRelease);
  }

  /** Beats per second, so the echo can be locked to the transport. */
  private beatSeconds = 60 / 120;

  setTempo(bpm: number) {
    this.beatSeconds = 60 / Math.max(20, bpm);
  }

  /** Whether any effect setting has been applied yet. */
  private fxApplied = false;

  updateGlobalFX(params: GlobalFXParams) {
    const now = this.ctx.currentTime;

    /**
     * Smoothing is for a knob being turned, not for the first time a value is
     * set. Every parameter here used to glide to its value over a 0.1 s time
     * constant, including on a freshly built engine — so an offline render
     * began with the echo time sweeping up from zero, which is a tape
     * pitch-shift, and with every effect return fading in over roughly half a
     * second. The opening bar of an exported WAV was not the song.
     *
     * On the first call the value is simply set; after that it glides.
     */
    const set = (param: AudioParam, value: number) => {
      if (this.fxApplied) param.setTargetAtTime(value, now, 0.1);
      else param.setValueAtTime(value, now);
    };

    // An echo that ignores the tempo fights the groove. A division locks it;
    // delayTime remains the manual setting when no division is chosen.
    const time = params.delayDivision
      ? Math.max(0.001, this.beatSeconds * params.delayDivision)
      : Math.max(0.001, params.delayTime);
    set(this.delayNode.delayTime, time);
    set(this.delayNodeR.delayTime, time);

    // Feedback at or above 1.0 is a runaway loop; keep it strictly below. With
    // crossed taps the loop passes through both, so each carries the square
    // root of the intended regeneration.
    const feedback = Math.min(params.delayFeedback, 0.85);
    const perTap = Math.sqrt(feedback);
    set(this.feedbackNode.gain, perTap);
    set(this.feedbackNodeR.gain, perTap);

    const pingPong = params.delayPingPong ?? true;
    set(this.delayPanL.pan, pingPong ? -0.8 : 0);
    set(this.delayPanR.pan, pingPong ? 0.8 : 0);

    set(this.reverbGain.gain, params.reverbMix);

    // Regenerating the impulse is expensive, so only when it actually changed.
    const size = params.reverbSize ?? 2.4;
    const damp = params.reverbDamp ?? 0.25;
    if (Math.abs(size - this.reverbSize) > 0.05 || Math.abs(damp - this.reverbDamp) > 0.02) {
      this.reverbSize = size;
      this.reverbDamp = damp;
      this.generateImpulseResponse();
    }

    this.duckDepth = Math.max(0, Math.min(0.9, params.sidechain ?? 0));
    this.duckRelease = Math.max(0.03, Math.min(0.6, params.sidechainRelease ?? 0.18));

    set(this.chorusReturn.gain, params.chorusMix ?? 1);
    set(this.delayReturn.gain, params.delayMix ?? 1);

    // Echo damping: how dark each repeat gets. Fixed at 2.6 kHz before, which
    // is one particular echo rather than a control.
    const echoTone = Math.max(400, Math.min(16000, params.delayDamp ?? 2600));
    set(this.delayDamp.frequency, echoTone);
    set(this.delayDampR.frequency, echoTone);

    // Pre-delay. §4 asks for it by name: the dry transient has to be heard
    // before the tail, or the source sits inside the reverb.
    set(this.reverbPreDelay.delayTime, Math.max(0, Math.min(0.25, params.reverbPreDelay ?? 0.028)));

    set(this.phaserReturn.gain, params.phaserMix ?? 0);
    if (this.phaserLfo) {
      set(this.phaserLfo.frequency, Math.max(0.02, Math.min(8, params.phaserRate ?? 0.4)));
    }

    if (this.phaserLfoDepth) {
      // Sweep width. A shallow phaser is a tone control; a deep one is the
      // effect. 700 Hz was hardcoded.
      set(this.phaserLfoDepth.gain, 200 + (params.phaserDepth ?? 0.5) * 1600);
    }

    set(this.flangerReturn.gain, params.flangerMix ?? 0);
    if (this.flangerLfo) {
      set(this.flangerLfo.frequency, Math.max(0.02, Math.min(6, params.flangerRate ?? 0.25)));
    }
    if (this.flangerFeedback) {
      set(this.flangerFeedback.gain, Math.min(0.9, params.flangerFeedback ?? 0.55));
    }

    // Mastering.
    set(this.widthSide.gain, params.width ?? 1);
    set(this.lowShelf.gain, params.lowShelf ?? 0);
    set(this.airShelf.gain, params.airShelf ?? 0);
    const glueAmount = params.glue ?? 0.35;
    set(this.glue.threshold, -6 - glueAmount * 24);
    set(this.glue.ratio, 1 + glueAmount * 3);
    const drive = params.masterDrive ?? 0.2;
    this.masterDrive.curve = this.makeSaturationCurve(1 + drive * 2.5);

    this.fxApplied = true;
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
    for (let i = 0; i < length; i++) data[i] = this.random() * 2 - 1;
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

    // The Juno-106's LFO is a triangle running 0.1-30 Hz into three
    // destinations: DCO pitch, VCF cutoff and pulse width. Two of those are
    // implemented here.
    const lfo = this.ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = Math.max(0.1, Math.min(30, params.vibratoRate));

    // Pitch modulation belongs on detune, in cents. Driving frequency in Hz,
    // as this did, means a fixed deviation: the same setting is over an
    // octave of wobble on a bass note and a few cents on a lead.
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = params.vibratoDepth;
    lfo.connect(lfoGain);

    const lfoToFilter = this.ctx.createGain();
    lfoToFilter.gain.value = (params.lfoToFilter ?? 0) * 2000;
    lfo.connect(lfoToFilter);

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

      const drift = (this.random() * 2 - 1) * 4.5;
      osc.detune.setValueAtTime(detuneCents + drift, t);
      osc.detune.linearRampToValueAtTime(
        detuneCents + drift + (this.random() * 2 - 1) * 4.5, stopTime);
      lfoGain.connect(osc.detune);

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

    // Two cascaded biquads: 24 dB/octave, which is the slope of the Moog
    // ladder the Source is built on and of the filters these patches are
    // reconstructing. One BiquadFilterNode is 12 dB/octave — half the
    // steepness, and audibly a different instrument.
    const filterA = this.ctx.createBiquadFilter();
    const filterB = this.ctx.createBiquadFilter();
    filterA.type = 'lowpass';
    filterB.type = 'lowpass';
    // Resonance on the first stage only; peaking both would square the
    // emphasis and self-oscillate at ordinary settings.
    filterA.Q.value = params.resonance;
    filterB.Q.value = 0.5;
    this.applyFilterEnvelope(filterA.frequency, t, duration, params);
    this.applyFilterEnvelope(filterB.frequency, t, duration, params);
    lfoToFilter.connect(filterA.frequency);
    lfoToFilter.connect(filterB.frequency);
    filterA.connect(filterB);
    const filter = filterB;

    const vca = this.ctx.createGain();
    const instrumentMultiplier = 0.5;
    const envelopeEnd = this.applyAmpEnvelope(
      vca.gain, t, duration, params, volume * instrumentMultiplier,
    );

    mixer.connect(filterA);

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

    // The phaser and flanger are opt-in per patch. Every melodic voice used to
    // feed both at 0.7, which is not how either is used on a record: one LFO
    // sweeping the lead, the pad and the pluck together is a wash, and the
    // only way to keep it from swamping the mix was to hold the return so low
    // that the effect stopped being audible at all — measured at -25 dB of
    // difference energy, which is a control that does nothing. One source at a
    // real level is the treatment; three at an inaudible one is not.
    const phaserSend = params.phaserSend ?? 0;
    if (phaserSend > 0) this.send(vca, this.phaserBus, phaserSend);
    const flangerSend = params.flangerSend ?? 0;
    if (flangerSend > 0) this.send(vca, this.flangerBus, flangerSend);

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
  /**
   * Plate impulse: a sparse pattern of early reflections in front of a
   * decaying diffuse tail.
   *
   * The early reflections are what carry the impression of a room. A tail
   * alone — which is what this was — is a noise burst that follows the note,
   * and it reads as wash rather than as space. The tap times below are
   * prime-ish millisecond figures so the taps do not reinforce each other into
   * an audible pitch, which is the standard construction for a plate or a
   * Schroeder reverberator (Schroeder, "Natural Sounding Artificial
   * Reverberation", JAES 10(3), 1962).
   *
   * The noise comes from the engine's own seeded stream, so the
   * same settings give the same reverb every time. Nothing measured through
   * this engine was reproducible while the tail was random.
   */
  generateImpulseResponse() {
    const duration = Math.max(0.4, this.reverbSize);
    const decay = 2.6;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);

    // mulberry32, the same generator the note engine uses.
    let seed = 0x9e3779b9;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
    };

    // Early reflections, in milliseconds, offset per channel so the pair is
    // decorrelated from the first tap rather than only in the tail.
    const earlyMs = [
      [11, 19, 29, 41, 53, 67],
      [13, 23, 31, 43, 59, 71],
    ];

    let peak = 0;
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const n = i / length;
        const noise = rand() * Math.pow(1 - n, decay);
        // Darken the tail: a bright reverb on every voice reads as noise.
        // Damping: a lower coefficient loses the top of the tail faster.
        const coefficient = (1 - this.reverbDamp) * (c === 0 ? 0.34 : 0.38);
        lp += Math.max(0.02, coefficient) * (noise - lp);
        data[i] = lp;
      }
      // Build in front of the tail rather than replacing it: each tap is a
      // short burst, quieter the later it arrives.
      earlyMs[c].forEach((ms, k) => {
        const at = Math.floor((ms / 1000) * sampleRate);
        if (at >= length) return;
        const level = 0.9 * Math.pow(0.72, k);
        const width = Math.max(8, Math.floor(sampleRate * 0.0015));
        for (let i = 0; i < width && at + i < length; i++) {
          data[at + i] += level * (1 - i / width) * rand();
        }
      });
      for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
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
