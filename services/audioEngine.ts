
import { InstrumentParams, GlobalFXParams, TrackType } from "../types";

class AudioEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  delayNode: DelayNode;
  feedbackNode: GainNode;
  reverbNode: ConvolverNode;
  reverbGain: GainNode;
  dryGain: GainNode;
  analyser: AnalyserNode;
  limiter: DynamicsCompressorNode;
  
  distortionCurve: Float32Array;
  lastFrequencies: Record<string, number> = {};

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Master Limiter setup - Prevent digital clipping and glue the mix
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime); // Hard ceiling
    this.limiter.knee.setValueAtTime(10, this.ctx.currentTime); // Soft knee for musicality
    this.limiter.ratio.setValueAtTime(20, this.ctx.currentTime); // Acting as a limiter
    this.limiter.attack.setValueAtTime(0.001, this.ctx.currentTime);
    this.limiter.release.setValueAtTime(0.1, this.ctx.currentTime);
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6; // Safer default
    
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.delayNode = this.ctx.createDelay();
    this.feedbackNode = this.ctx.createGain();
    this.reverbNode = this.ctx.createConvolver();
    this.reverbGain = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();

    // Routing: dryGain -> limiter -> analyser -> masterGain -> destination
    this.dryGain.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    
    this.delayNode.connect(this.feedbackNode);
    this.feedbackNode.connect(this.delayNode);
    this.delayNode.connect(this.dryGain);

    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.limiter);
    
    this.distortionCurve = this.makeDistortionCurve(40);
    this.generateImpulseResponse();
  }

  async resume() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setMasterVolume(vol: number) {
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(vol, now, 0.05);
  }

  updateGlobalFX(params: GlobalFXParams) {
    const now = this.ctx.currentTime;
    this.delayNode.delayTime.setTargetAtTime(params.delayTime, now, 0.1);
    this.feedbackNode.gain.setTargetAtTime(params.delayFeedback, now, 0.1);
    this.reverbGain.gain.setTargetAtTime(params.reverbMix, now, 0.1);
  }

  makeDistortionCurve(amount: number) {
    const k = amount || 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  playInstrument(type: string, note: string, time: number, duration: number, params: InstrumentParams, volume: number = 0.8) {
    const t = time || this.ctx.currentTime;
    const freq = this.noteToFreq(note);
    
    // Core Oscillators
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const noise = this.ctx.createBufferSource();
    const noiseGain = this.ctx.createGain();
    
    // Noise generation
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    noise.loop = true;
    noiseGain.gain.value = params.noiseLevel * 0.5; // Tamed noise

    // Vibrato
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = params.vibratoRate;
    lfoGain.gain.value = params.vibratoDepth; 
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    // Glide / Portamento
    const lastFreq = this.lastFrequencies[type] || freq;
    osc1.frequency.setValueAtTime(lastFreq, t);
    osc2.frequency.setValueAtTime(lastFreq, t);
    sub.frequency.setValueAtTime(lastFreq / 2, t);
    
    const glideTime = params.glide / 1000;
    osc1.frequency.exponentialRampToValueAtTime(freq, t + glideTime);
    osc2.frequency.exponentialRampToValueAtTime(freq, t + glideTime);
    sub.frequency.exponentialRampToValueAtTime(freq / 2, t + glideTime);
    
    this.lastFrequencies[type] = freq;

    // Oscillator Config
    osc1.type = params.osc1Wave;
    osc2.type = params.osc2Wave;
    sub.type = 'sine';
    
    osc2.detune.value = params.detune;

    const mixer = this.ctx.createGain();
    const subGain = this.ctx.createGain();
    subGain.gain.value = params.subLevel * 0.6; // Tamed sub

    osc1.connect(mixer);
    osc2.connect(mixer);
    sub.connect(subGain);
    subGain.connect(mixer);
    noise.connect(noiseGain);
    noiseGain.connect(mixer);

    // Filter + Envelope
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = params.resonance;
    
    // Filter ADSR
    const baseFreq = params.cutoff;
    const peakFreq = Math.min(20000, baseFreq + (params.filterEnvAmount * 12000));
    filter.frequency.setValueAtTime(baseFreq, t);
    filter.frequency.exponentialRampToValueAtTime(peakFreq, t + params.filterAttack);
    filter.frequency.exponentialRampToValueAtTime(baseFreq + (peakFreq - baseFreq) * params.filterSustain, t + params.filterAttack + params.filterDecay);
    filter.frequency.setValueAtTime(baseFreq + (peakFreq - baseFreq) * params.filterSustain, t + duration);
    filter.frequency.exponentialRampToValueAtTime(baseFreq, t + duration + params.filterRelease);

    // Master Amp ADSR
    const vca = this.ctx.createGain();
    vca.gain.setValueAtTime(0, t);
    // Standardize instrument gain to provide 6dB of headroom
    const instrumentMultiplier = 0.5;
    vca.gain.linearRampToValueAtTime(volume * instrumentMultiplier, t + params.attack);
    vca.gain.linearRampToValueAtTime(volume * instrumentMultiplier * params.sustain, t + params.attack + params.decay);
    vca.gain.setValueAtTime(volume * instrumentMultiplier * params.sustain, t + duration);
    vca.gain.exponentialRampToValueAtTime(0.001, t + duration + params.release);

    mixer.connect(filter);
    filter.connect(vca);
    vca.connect(this.dryGain);
    
    // Global FX sends
    if (type !== 'bass') {
      vca.connect(this.delayNode);
      vca.connect(this.reverbNode);
    }

    // Chorus simulation based on params.chorusMix
    if (params.chorusMix > 0) {
      this.triggerChorusEffect(filter, t, t + duration + params.release, params.chorusMix);
    }

    osc1.start(t);
    osc2.start(t);
    sub.start(t);
    noise.start(t);
    lfo.start(t);

    const stopTime = t + duration + params.release + 0.1;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    sub.stop(stopTime);
    noise.stop(stopTime);
    lfo.stop(stopTime);
  }

  playDrum(type: TrackType, time: number, volume: number = 1.0) {
    const t = time || this.ctx.currentTime;
    if (type === 'kick') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.dryGain);
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.15); // Better punch
      gain.gain.setValueAtTime(volume * 1.2, t); // Boost kick specifically
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.5);
    } else if (type === 'snare') {
      const noise = this.ctx.createBufferSource();
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const gain = this.ctx.createGain();
      noise.connect(gain);
      gain.connect(this.dryGain);
      gain.gain.setValueAtTime(volume * 1.1, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      noise.start(t);
    } else if (type === 'hihat') {
      const noise = this.ctx.createBufferSource();
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = 8000;
      const gain = this.ctx.createGain();
      noise.connect(filter); filter.connect(gain); gain.connect(this.dryGain);
      gain.gain.setValueAtTime(volume * 0.9, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
      noise.start(t);
    } else if (type === 'fx') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = 2000;
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.8);
        gain.gain.setValueAtTime(volume * 0.15, t); // Scaled down FX volume
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.connect(gain); gain.connect(this.reverbNode);
        osc.start(t); osc.stop(t + 0.8);
    }
  }

  triggerChorusEffect(inputNode: AudioNode, startTime: number, endTime: number, mix: number) {
     const chorusGain = this.ctx.createGain();
     chorusGain.gain.value = mix * 0.4; // Tamed chorus volume
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
     osc.stop(endTime);
  }

  noteToFreq(note: string) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const match = note.match(/^([a-zA-Z#]+)(\d+)$/);
    if (!match) return 440;
    const semitoneIndex = notes.indexOf(match[1]);
    const octave = parseInt(match[2]);
    const midi = (octave + 1) * 12 + semitoneIndex;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  generateImpulseResponse() {
    const duration = 2.0, decay = 2.0, sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0), right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
        const n = i / length;
        left[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
        right[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
    }
    this.reverbNode.buffer = impulse;
  }
}
export const audioEngine = new AudioEngine();
