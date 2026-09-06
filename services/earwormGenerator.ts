
import { NoteEvent, Track, TrackType, SequencerStep } from "../types";
import { SCALE_NOTES } from "../constants";

// --- MUSIC THEORY CORE ---
const NOTE_MAP: { [key: string]: number } = {};
SCALE_NOTES.forEach((note, i) => { NOTE_MAP[note] = i; });

const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10], // Natural Minor
  dorian: [0, 2, 3, 5, 7, 9, 10],  // Minor w/ Major 6
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11], // Harmonic Minor
};

// Rhythmic Cells
const RHYTHM_CELLS = [
  [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0], // The "Motor"
  [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0], // The "Tresillo-ish"
  [1,0,1,0, 1,0,0,0, 1,0,1,0, 0,0,1,0], // The "EBM"
  [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,1,0], // The "Syncopated"
  [1,0,0,1, 0,0,1,0, 1,0,0,0, 1,0,1,0], // The "Gallop"
];

// --- GENERATOR TYPES ---
export type GenMode = 'aeolian' | 'dorian' | 'harmonic_minor';
export type GenContour = 'arch' | 'descent' | 'wave' | 'random';
export type GenHarmonicMotion = 'conjunct' | 'disjunct' | 'static';
export type GenBass = 'driving' | 'sustained' | 'acid' | 'walking';
export type GenDrums = 'four-floor' | 'breakbeat' | 'tribal';

export interface GeneratorSettings {
    totalSteps: number;
    mode: GenMode;
    harmonicMotion: GenHarmonicMotion;
    contour: GenContour;
    rhythmDensity: number; // 0.0 - 1.0
    entropy: number;       // 0.0 - 1.0 (Surprise/Twist)
    bassMode: GenBass;
    drumMode: GenDrums;
}

export class EarwormGenerator {
  
  generate(config: GeneratorSettings): { tracks: Track[] } {
    const { totalSteps, mode, harmonicMotion, contour, rhythmDensity, entropy, bassMode, drumMode } = config;

    // 1. Establish Theory Context
    const scaleIntervals = MODES[mode];
    
    // 2. Procedural Harmony Generation (No Presets)
    // Generate a 4-bar loop based on motion rules
    const chordLoop = this.generateProceduralProgression(4, harmonicMotion);
    const chords = this.expandChords(chordLoop, totalSteps);

    // 3. Generate Tracks Coherently
    // All tracks share the same 'chords' and 'scaleIntervals' context
    const { drumTracks, kickSteps } = this.generateDrums(totalSteps, drumMode);
    
    const bassTrack = this.generateBass(totalSteps, chords, kickSteps, bassMode, scaleIntervals);
    
    const leadTrack = this.generateEarwormHook(totalSteps, chords, contour, rhythmDensity, entropy, scaleIntervals);
    
    const pluckTrack = this.generateCounterMelody(totalSteps, chords, leadTrack.notes || [], scaleIntervals, rhythmDensity);
    
    const padTrack = this.generateAtmosphere(totalSteps, chords, scaleIntervals);

    return {
      tracks: [leadTrack, pluckTrack, padTrack, bassTrack, ...drumTracks]
    };
  }

  // --- PROCEDURAL HARMONY ENGINE ---
  private generateProceduralProgression(length: number, motion: GenHarmonicMotion): number[] {
    const loop = [0]; // Always start on Tonic (i)
    let current = 0;

    for(let i = 1; i < length; i++) {
        const next = this.pickNextChord(current, motion);
        loop.push(next);
        current = next;
    }
    return loop;
  }

  private pickNextChord(current: number, motion: GenHarmonicMotion): number {
      // Transition Weights Matrix (Darkwave Context)
      const degrees = [0, 1, 2, 3, 4, 5, 6];
      const weights: Record<number, number> = {};
      degrees.forEach(d => weights[d] = 0.1); // Baseline probability

      // Avoid 'ii' (1) generally as it's often too jazzy/bright unless diminished usage (rare)
      weights[1] = 0.05;

      if (motion === 'static') {
          // Drone-like, stay on i, or shift slightly to bVI/bVII
          weights[0] = 20; 
          weights[5] = 2; // bVI
          weights[6] = 2; // bVII
          weights[3] = 1; // iv
      } 
      else if (motion === 'conjunct') {
          // Stepwise flow (The "Goth" Sound)
          // i(0) -> bVI(5), bVII(6)
          if (current === 0) { weights[5] = 8; weights[6] = 6; weights[2] = 2; }
          // bVI(5) -> bVII(6), i(0), v(4)
          else if (current === 5) { weights[6] = 8; weights[0] = 4; weights[4] = 3; }
          // bVII(6) -> i(0), bVI(5)
          else if (current === 6) { weights[0] = 8; weights[5] = 5; weights[4] = 2; }
          // v(4) -> bVI(5), i(0)
          else if (current === 4) { weights[5] = 5; weights[0] = 3; }
          // iv(3) -> v(4), III(2)
          else if (current === 3) { weights[4] = 5; weights[2] = 3; }
      } 
      else { // 'disjunct'
          // Angular leaps (Pop/Dramatic)
          // i(0) -> iv(3), v(4), III(2)
          if (current === 0) { weights[3] = 8; weights[4] = 6; weights[2] = 4; }
          // iv(3) -> bVII(6), i(0)
          else if (current === 3) { weights[6] = 6; weights[0] = 4; weights[4] = 2; }
          // III(2) -> bVI(5)
          else if (current === 2) { weights[5] = 8; weights[0] = 2; }
          // v(4) -> i(0) (Strong resolution)
          else if (current === 4) { weights[0] = 10; weights[2] = 2; }
          // bVI(5) -> i(0) (Plagal-ish leap)
          else if (current === 5) { weights[0] = 5; weights[2] = 3; }
      }

      // Weighted Random Selection
      let sum = 0;
      degrees.forEach(d => sum += weights[d]);
      let r = Math.random() * sum;
      
      for(const d of degrees) {
          r -= weights[d];
          if (r <= 0) return d;
      }
      return 0; // Fallback
  }

  private expandChords(loop: number[], totalSteps: number): number[] {
      const chords: number[] = [];
      const stepsPerBar = 16;
      for (let i = 0; i < totalSteps; i++) {
          const bar = Math.floor(i / stepsPerBar);
          const loopIndex = bar % loop.length;
          chords.push(loop[loopIndex]);
      }
      return chords;
  }

  // --- THE EARWORM ENGINE (Lead) ---
  private generateEarwormHook(
      totalSteps: number, 
      chords: number[], 
      contour: GenContour, 
      density: number, 
      surprise: number, 
      scaleIntervals: number[]
  ): Track {
    const notes: NoteEvent[] = [];
    
    // Core Motif Generation
    // 1. Rhythm: Procedurally mutated from a cell based on density
    const motifRhythm = this.generateRhythmCell(density);
    // 2. Pitch: Procedurally contoured with entropy-based twists
    const motifPitch = this.generateMelodicContour(motifRhythm, contour, surprise);

    // Phrase Architecture
    for (let bar = 0; bar < 16; bar++) {
        const stepOffset = bar * 16;
        const section = this.getSection(stepOffset);
        const chordDegree = chords[stepOffset];

        if (section === 'intro' || section === 'outro') continue; 

        // Verse: Lower velocity, sparser
        if (section === 'verse') {
             // A - A - B - A structure logic (simplified)
             // Omit motif on bar 3 of verse (Call and Wait)
             if (bar % 4 !== 2) { 
                 this.renderMotif(notes, motifPitch, stepOffset, chordDegree, scaleIntervals, 0, 0.7);
             }
        }
        
        // Chorus: Lifted, louder
        if (section === 'chorus') {
            // Transpose up based on surprise factor (Dynamic Lift)
            const lift = Math.floor(2 + (surprise * 3)); // 2-5 scale steps up
            this.renderMotif(notes, motifPitch, stepOffset, chordDegree, scaleIntervals, lift, 0.9);
        }
    }

    return { id: 'lead', name: 'LEAD', color: 'bg-neon-purple', volume: 0.75, isCollapsed: false, notes: this.cleanupOverlaps(notes) };
  }

  // --- MELODIC CONTOUR GENERATOR ---
  private generateMelodicContour(
      rhythm: boolean[], 
      bias: GenContour, 
      surprise: number
  ): { relativeStep: number, scaleOffset: number }[] {
      const contour: { relativeStep: number, scaleOffset: number }[] = [];
      let currentScaleIdx = 14; // Start approx C3/G3 area
      
      let direction = 1;
      if (bias === 'descent') direction = -1;
      if (bias === 'random') direction = Math.random() > 0.5 ? 1 : -1;

      let noteCount = 0;
      const totalNotes = rhythm.filter(Boolean).length;
      
      rhythm.forEach((active, step) => {
          if (!active) return;
          
          let delta = 0;
          
          // Rule-based Contour Logic
          if (bias === 'arch') {
              // Rise first half, Fall second half
              if (noteCount < totalNotes / 2) delta = Math.random() > 0.3 ? 1 : 0; 
              else delta = Math.random() > 0.3 ? -1 : 0;
          } else if (bias === 'descent') {
              delta = Math.random() > 0.4 ? -1 : 0;
          } else if (bias === 'wave') {
              delta = (step % 4 === 0) ? direction * -2 : direction; 
          }

          // The "Twist" - Entropy Injection
          if (Math.random() < (surprise * 0.35)) {
              delta = direction * (Math.floor(Math.random() * 3) + 2); // Sudden leap
              direction *= -1; 
          }

          currentScaleIdx += delta;
          // Soft clamp to keeping melody index valid
          currentScaleIdx = Math.max(7, Math.min(21, currentScaleIdx));

          contour.push({ relativeStep: step, scaleOffset: currentScaleIdx });
          noteCount++;
      });
      return contour;
  }

  private renderMotif(
      trackNotes: NoteEvent[], 
      motif: { relativeStep: number, scaleOffset: number }[], 
      startStep: number, 
      chordDegree: number, 
      scaleIntervals: number[], 
      transposeScaleSteps: number,
      velocityBase: number
  ) {
      motif.forEach(m => {
          let idx = m.scaleOffset + transposeScaleSteps;
          
          // Rule: Harmonic Coherence
          // Strong beats (0, 4, 8, 12) MUST lock to the Chord
          if (m.relativeStep % 4 === 0) {
              const root = chordDegree;
              const third = (chordDegree + 2) % 7;
              const fifth = (chordDegree + 4) % 7;
              
              const currentDegree = idx % 7;
              if (currentDegree !== root && currentDegree !== third && currentDegree !== fifth) {
                 // Find closest chord tone
                 const distToRoot = Math.abs(currentDegree - root);
                 const distToThird = Math.abs(currentDegree - third);
                 // Simple snap to root for stability
                 idx = (idx - currentDegree) + root; 
              }
          }

          const noteName = this.getNoteFromScale(idx, scaleIntervals);

          trackNotes.push({
              id: Math.random().toString(),
              note: noteName,
              startStep: startStep + m.relativeStep,
              duration: 2, 
              velocity: velocityBase + (Math.random() * 0.1)
          });
      });
  }

  // --- COUNTER MELODY (Pluck) ---
  private generateCounterMelody(totalSteps: number, chords: number[], leadNotes: NoteEvent[], scaleIntervals: number[], density: number): Track {
    const notes: NoteEvent[] = [];
    const arpPattern = [0, 2, 4, 7]; // R-3-5-8

    for (let step = 0; step < totalSteps; step++) {
        const section = this.getSection(step);
        if (section === 'intro' || section === 'outro') continue;

        // Rule: Do not clash with Lead on dense settings
        if (step % 2 !== 0 && density < 0.6) continue; 
        if (Math.random() > density * 1.2) continue; // Slightly more active than lead density implies

        const bar = Math.floor(step / 16);
        const chord = chords[step]; // Pre-expanded array
        
        const arpIdx = step % 4;
        const scaleDegree = (chord + arpPattern[arpIdx]) % 7;
        const octaveOffset = Math.floor((chord + arpPattern[arpIdx]) / 7) + 2; 
        
        const noteName = this.getNoteFromScale(scaleDegree + (octaveOffset * 7), scaleIntervals);

        notes.push({
            id: Math.random().toString(),
            note: noteName,
            startStep: step,
            duration: 0.5,
            velocity: 0.5 + (section === 'chorus' ? 0.2 : 0)
        });
    }
    return { id: 'pluck', name: 'PLUCK', color: 'bg-teal-500', volume: 0.6, isCollapsed: true, notes };
  }

  // --- ATMOSPHERE (Pad) ---
  private generateAtmosphere(totalSteps: number, chords: number[], scaleIntervals: number[]): Track {
      const notes: NoteEvent[] = [];
      for (let i = 0; i < totalSteps; i+=16) {
          const section = this.getSection(i);
          if (section === 'verse' && i % 32 === 0) continue; 

          const chord = chords[i];
          // Pad Logic: Play Root + 5th high up
          const noteName = this.getNoteFromScale(chord + 14, scaleIntervals); 
          
          notes.push({
              id: Math.random().toString(),
              note: noteName,
              startStep: i,
              duration: 16,
              velocity: section === 'chorus' ? 0.6 : 0.35
          });
      }
      return { id: 'pad', name: 'PAD', color: 'bg-blue-800', volume: 0.4, isCollapsed: true, notes };
  }

  // --- BASS ENGINE ---
  private generateBass(totalSteps: number, chords: number[], kickSteps: SequencerStep[], mode: GenBass, scaleIntervals: number[]): Track {
    const notes: NoteEvent[] = [];
    const drivingRhythm = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]; 
    const acidRhythm =    [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,1,0,1];

    for (let bar = 0; bar < 16; bar++) {
        const stepOffset = bar * 16;
        const section = this.getSection(stepOffset);
        
        if (section === 'intro' && bar < 1) continue;

        let rhythm = mode === 'acid' ? acidRhythm : drivingRhythm;
        if (mode === 'sustained') rhythm = [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];

        rhythm.forEach((active, i) => {
            if (!active) return;
            const absStep = stepOffset + i;
            const chord = chords[absStep];

            // Rule: Kick Interaction
            if (mode === 'driving' && !kickSteps[absStep]?.active && Math.random() < 0.2) return; 

            let scaleDegree = chord;
            
            // Octaves
            if (mode === 'driving' || mode === 'acid') {
                if (i % 4 === 2) scaleDegree += 7; 
            }
            // Walking
            if (mode === 'walking') {
                if (i > 12) scaleDegree = (scaleDegree + 1) % 7; 
            }

            const noteName = this.getNoteFromScale(scaleDegree, scaleIntervals); // Base C1

            notes.push({
                id: Math.random().toString(),
                note: noteName,
                startStep: absStep,
                duration: mode === 'sustained' ? 16 : 0.8,
                velocity: section === 'chorus' ? 1.0 : 0.85
            });
        });
    }
    return { id: 'bass', name: 'BASS', color: 'bg-indigo-600', volume: 0.8, isCollapsed: false, notes };
  }

  // --- DRUM ENGINE ---
  private generateDrums(totalSteps: number, mode: GenDrums): { drumTracks: Track[], kickSteps: SequencerStep[] } {
    const kickSteps: SequencerStep[] = Array(totalSteps).fill({ active: false, velocity: 0 });
    const snareSteps: SequencerStep[] = Array(totalSteps).fill({ active: false, velocity: 0 });
    const hihatSteps: SequencerStep[] = Array(totalSteps).fill({ active: false, velocity: 0 });
    const fxSteps: SequencerStep[] = Array(totalSteps).fill({ active: false, velocity: 0 });

    const kickPattern = mode === 'breakbeat' ? [0, 3, 8, 11] : [0, 4, 8, 12];
    
    for (let i = 0; i < totalSteps; i++) {
        const section = this.getSection(i);
        const barPos = i % 16;

        if (section !== 'intro' || i > 16) {
             if (kickPattern.includes(barPos)) kickSteps[i] = { active: true, velocity: 1.0 };
        }

        if (section === 'verse' || section === 'chorus') {
            if (barPos === 4 || barPos === 12) snareSteps[i] = { active: true, velocity: 0.9 };
            if (i % 64 >= 60 && i % 2 === 0) snareSteps[i] = { active: true, velocity: 0.8 };
        }

        if (section !== 'intro') {
            if (i % 2 === 0) hihatSteps[i] = { active: true, velocity: i % 4 === 0 ? 0.7 : 0.5 };
            if ((mode === 'breakbeat' || section === 'chorus') && i % 2 !== 0 && Math.random() > 0.5) {
                 hihatSteps[i] = { active: true, velocity: 0.4 };
            }
        }

        if (i % 64 === 0 && section !== 'intro') fxSteps[i] = { active: true, velocity: 0.8 }; 
    }

    const drumTracks: Track[] = [
        { id: 'fx', name: 'FX', color: 'bg-neon-pink', volume: 0.5, isCollapsed: false, steps: fxSteps },
        { id: 'hihat', name: 'HH', color: 'bg-yellow-400', volume: 0.5, isCollapsed: false, steps: hihatSteps },
        { id: 'snare', name: 'SD', color: 'bg-cyan-400', volume: 0.7, isCollapsed: false, steps: snareSteps },
        { id: 'kick', name: 'BD', color: 'bg-red-500', volume: 0.9, isCollapsed: false, steps: kickSteps },
    ];
    return { drumTracks, kickSteps };
  }

  // --- UTILS ---
  private getNoteFromScale(scaleIndex: number, scaleIntervals: number[]): string {
      const octave = Math.floor(scaleIndex / 7) + 1; // Start at C1
      const degree = scaleIndex % 7;
      const semitoneOffset = scaleIntervals[degree];
      const baseMidi = 24 + (octave - 1) * 12 + semitoneOffset;
      return this.midiToNote(baseMidi);
  }

  private midiToNote(midi: number): string {
      const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor(midi / 12) - 1;
      const noteName = notes[midi % 12];
      return `${noteName}${octave}`;
  }

  private generateRhythmCell(density: number): boolean[] {
      const template = RHYTHM_CELLS[Math.floor(Math.random() * RHYTHM_CELLS.length)];
      return template.map(beat => {
          if (beat) return Math.random() < 0.95; 
          return Math.random() < (density * 0.3); 
      });
  }

  private getSection(step: number): 'intro' | 'verse' | 'chorus' | 'outro' {
      if (step < 32) return 'intro';
      if (step < 96) return 'verse';
      if (step < 160) return 'chorus';
      if (step < 224) return 'verse';
      return 'outro';
  }

  private cleanupOverlaps(notes: NoteEvent[]): NoteEvent[] {
    notes.sort((a, b) => a.startStep - b.startStep);
    for (let i = 0; i < notes.length - 1; i++) {
        const curr = notes[i];
        const next = notes[i+1];
        if (curr.startStep + curr.duration > next.startStep) {
            curr.duration = Math.max(0.25, next.startStep - curr.startStep);
        }
    }
    return notes;
  }
}
export const generatorService = new EarwormGenerator();
