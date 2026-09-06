
import { Track, NoteEvent, SequencerStep, TrackType } from "../types";
import { AISongResult, AISectionData, AINote } from "./aiComposer";

// Configuration for the full song structure
const ARRANGEMENT_STRUCTURE = [
  { type: 'intro', bars: 4 },   // 64 steps
  { type: 'verse', bars: 8 },   // 128 steps (Verse 1)
  { type: 'chorus', bars: 8 },  // 128 steps (Chorus 1)
  { type: 'verse', bars: 8 },   // 128 steps (Verse 2 - Variation)
  { type: 'chorus', bars: 8 },  // 128 steps (Chorus 2)
  { type: 'break', bars: 4 },   // 64 steps (Bridge/Breakdown)
  { type: 'chorus', bars: 8 },  // 128 steps (Chorus 3 - High Energy)
  { type: 'outro', bars: 4 },   // 64 steps
];

export class ComposerAgent {
  
  public composeFullSong(seed: AISongResult, currentTracks: Track[]): { tracks: Track[], totalSteps: number } {
    const STEPS_PER_BAR = 16;
    let currentStep = 0;
    
    // We will build new arrays for every track
    const trackBuilders: Record<string, { notes: NoteEvent[], steps: SequencerStep[] }> = {};
    currentTracks.forEach(t => {
      trackBuilders[t.id] = { notes: [], steps: [] };
    });

    // --- 1. THE ARRANGEMENT LOOP ---
    // Iterate through the song structure and paste/modify sections
    const structure = [
        { name: 'INTRO', source: 'intro', len: 32 },
        { name: 'VERSE 1', source: 'verse', len: 64 },
        { name: 'CHORUS 1', source: 'chorus', len: 64 },
        { name: 'VERSE 2', source: 'verse', len: 64 },
        { name: 'CHORUS 2', source: 'chorus', len: 64 },
        { name: 'BRIDGE', source: 'intro', len: 32 }, // Repurpose intro for bridge but strip drums
        { name: 'CHORUS 3', source: 'chorus', len: 64 },
        { name: 'OUTRO', source: 'intro', len: 32 }
    ];

    structure.forEach((section, sectionIdx) => {
        const sourceData = seed[section.source as 'intro' | 'verse' | 'chorus'];
        const sectionLength = section.len;
        
        // Loop the source material if section length > source length
        // (e.g. Verse source is 32, but Verse section is 64)
        const sourceLen = section.source === 'chorus' ? 64 : 32;
        const loops = Math.ceil(sectionLength / sourceLen);

        for (let l = 0; l < loops; l++) {
            const loopOffset = l * sourceLen;
            const absoluteStart = currentStep + loopOffset;
            const remaining = sectionLength - loopOffset;
            const pasteLen = Math.min(sourceLen, remaining);

            // Apply specific variations based on section type (Science of Earworms: Variation prevents habituation)
            const variation = this.getVariationRules(section.name, l, loops);

            this.pasteSection(
                trackBuilders, 
                sourceData, 
                absoluteStart, 
                pasteLen, 
                variation
            );
        }
        
        // --- 2. TRANSITIONAL FILLS (The "Drop") ---
        // Create craving/release by removing elements before big sections
        if (section.name.includes('VERSE') || section.name.includes('BRIDGE')) {
             const transitionStart = currentStep + sectionLength - 4; // Last 4 steps
             this.applyTransition(trackBuilders, transitionStart, 4);
        }

        currentStep += sectionLength;
    });

    // --- 3. FINALIZE TRACKS ---
    const finalTracks = currentTracks.map(t => {
        const builder = trackBuilders[t.id];
        const newTrack = { ...t };
        
        if (newTrack.notes) {
            newTrack.notes = builder.notes;
        } else if (newTrack.steps) {
            // Fill any gaps if total steps grew
            const filledSteps = new Array(currentStep).fill({ active: false, velocity: 0 });
            builder.steps.forEach((s, i) => {
                if (i < currentStep) filledSteps[i] = s;
            });
            newTrack.steps = filledSteps;
        }
        return newTrack;
    });

    return { tracks: finalTracks, totalSteps: currentStep };
  }

  private getVariationRules(sectionName: string, loopIndex: number, totalLoops: number) {
      const v = {
          muteLead: false,
          mutePad: false,
          mutePluck: false,
          muteDrums: false,
          velocityScale: 1.0,
          addEnergy: false
      };

      if (sectionName === 'INTRO') {
          v.muteLead = true; // Save the hook for later
          v.mutePluck = true;
      }
      else if (sectionName === 'VERSE 1') {
          v.mutePluck = true; // Save counter-melody for Verse 2 (Development)
          v.mutePad = true;   // Keep it dry and driving
      }
      else if (sectionName === 'CHORUS 1') {
          v.addEnergy = true; // Full power
      }
      else if (sectionName === 'VERSE 2') {
          // VARIATION: Add Pluck, maybe lighter Pad. 
          // This "Change in Texture" re-engages the brain (Habituation prevention)
          v.mutePad = false;
          v.mutePluck = false; 
      }
      else if (sectionName === 'BRIDGE') {
          v.muteDrums = true; // Drop out
          v.muteLead = true;  // Atmosphere only
          v.mutePluck = false; // Arps only
      }
      else if (sectionName === 'CHORUS 3') {
          v.velocityScale = 1.1; // "Belting" the final chorus
      }
      else if (sectionName === 'OUTRO') {
          v.muteLead = true;
          v.velocityScale = 0.8; // Fade feel
      }

      return v;
  }

  private pasteSection(
      builders: Record<string, { notes: NoteEvent[], steps: SequencerStep[] }>, 
      source: AISectionData, 
      startStep: number, 
      length: number,
      rules: any
  ) {
      // INSTRUMENTS
      const processNotes = (trackId: string, notes: AINote[], mute: boolean) => {
          if (mute) return;
          notes.forEach(n => {
              if (n.s < length) {
                  builders[trackId].notes.push({
                      id: Math.random().toString(36),
                      note: n.n,
                      startStep: startStep + n.s,
                      duration: n.d,
                      velocity: (0.8 + (Math.random() * 0.1)) * rules.velocityScale
                  });
              }
          });
      };

      processNotes('lead', source.lead, rules.muteLead);
      processNotes('bass', source.bass, false);
      processNotes('pad', source.pad, rules.mutePad);
      processNotes('pluck', source.pluck, rules.mutePluck);

      // DRUMS
      const processDrums = (trackId: string, pattern: boolean[]) => {
          if (rules.muteDrums && trackId !== 'fx') return; // Keep FX even in break usually? No, let's cut.
          if (rules.muteDrums) return;

          for(let i=0; i<length; i++) {
              if (pattern[i]) {
                  builders[trackId].steps[startStep + i] = { 
                      active: true, 
                      velocity: (trackId === 'kick' ? 1.0 : 0.9) * rules.velocityScale 
                  };
              }
          }
      };

      processDrums('kick', source.kick);
      processDrums('snare', source.snare);
      processDrums('hihat', source.hihat);
      processDrums('fx', source.fx);
  }

  private applyTransition(builders: Record<string, any>, start: number, len: number) {
      // "The Drop": Silence the low end to make the impact of the next section harder
      // Mute Kick and Bass notes that start in this window
      for(let i=0; i<len; i++) {
          const s = start + i;
          if (builders['kick'].steps[s]) builders['kick'].steps[s] = { active: false, velocity: 0 };
          
          // Filter out bass notes starting here
          builders['bass'].notes = builders['bass'].notes.filter((n: NoteEvent) => 
              !(n.startStep >= s && n.startStep < s + 1)
          );
      }
      
      // Add a Snare Roll? (Simple fill)
      for(let i=0; i<len; i++) {
          builders['snare'].steps[start + i] = { active: true, velocity: 0.6 + (i * 0.1) };
      }
  }
}

export const composerAgent = new ComposerAgent();
