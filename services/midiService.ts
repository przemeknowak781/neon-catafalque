
import { audioEngine } from "./audioEngine";
// Fix: InstrumentParams is the correct type exported from types.ts
import { InstrumentParams } from "../types";

export class MIDIService {
  access: MIDIAccess | null = null;
  inputs: MIDIInput[] = [];
  onActivity: (() => void) | null = null;
  // Fix: use InstrumentParams instead of non-existent SynthParams
  synthParams: InstrumentParams | null = null;

  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn("Web MIDI API not supported");
      return;
    }

    try {
      this.access = await navigator.requestMIDIAccess();
      this.updateInputs();
      this.access.onstatechange = () => this.updateInputs();
    } catch (e) {
      console.error("MIDI Access Failed", e);
    }
  }

  updateInputs() {
    if (!this.access) return;
    this.inputs = Array.from(this.access.inputs.values());
    this.inputs.forEach(input => {
      input.onmidimessage = (msg) => this.handleMIDIMessage(msg);
    });
  }

  // Fix: use InstrumentParams instead of non-existent SynthParams
  setParams(params: InstrumentParams) {
    this.synthParams = params;
  }

  handleMIDIMessage(msg: MIDIMessageEvent) {
    const data = msg.data;
    if (!data) return;
    
    const [status, data1, data2] = data;
    const command = status & 0xf0;
    
    // Note On
    if (command === 0x90 && data2 > 0) {
      this.onActivity?.();
      const note = this.midiToNoteName(data1);
      if (this.synthParams) {
        // Trigger lead synth with standard MIDI-mapped velocity
        const velocity = data2 / 127;
        // Fix: playLead does not exist on AudioEngine. Use playInstrument('lead', ...)
        audioEngine.playInstrument('lead', note, audioEngine.ctx.currentTime, 0.4, this.synthParams, velocity);
      }
    }
  }

  midiToNoteName(midi: number): string {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = notes[midi % 12];
    return `${note}${octave}`;
  }
}

export const midiService = new MIDIService();
