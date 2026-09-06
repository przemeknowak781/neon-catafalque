/**
 * The song's shape, in one place.
 *
 * composerAgent.ts already knew this arrangement, but only the AI path used
 * it: the procedural generator produced its own 16-bar mini-song and the
 * sequencer grid drew a third guess at the section boundaries. Three
 * definitions of the same structure is two too many.
 *
 * Proportions follow composerAgent's 416-step layout, which lines up exactly
 * with the 4-bar hook phrase from earworm.md §3.1: a verse or a chorus is one
 * statement of the phrase.
 */

export type SectionKind = 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro';

export interface Section {
  kind: SectionKind;
  label: string;
  bars: number;
  /** 0-based index among sections of the same kind, for escalating variation. */
  repeat: number;
}

export const STEPS_PER_BAR = 16;
export const BARS_PER_PHRASE = 4;

export const SONG_ARRANGEMENT: readonly Section[] = [
  { kind: 'intro',  label: 'INTRO',    bars: 2, repeat: 0 },
  { kind: 'verse',  label: 'VERSE 1',  bars: 4, repeat: 0 },
  { kind: 'chorus', label: 'CHORUS 1', bars: 4, repeat: 0 },
  { kind: 'verse',  label: 'VERSE 2',  bars: 4, repeat: 1 },
  { kind: 'chorus', label: 'CHORUS 2', bars: 4, repeat: 1 },
  { kind: 'bridge', label: 'BRIDGE',   bars: 2, repeat: 0 },
  { kind: 'chorus', label: 'CHORUS 3', bars: 4, repeat: 2 },
  { kind: 'outro',  label: 'OUTRO',    bars: 2, repeat: 0 },
];

export const SONG_BARS = SONG_ARRANGEMENT.reduce((n, s) => n + s.bars, 0);
export const SONG_STEPS = SONG_BARS * STEPS_PER_BAR;

export interface PlacedSection extends Section {
  startBar: number;
  /** Which bar within this section, 0-based. */
  barInSection: number;
}

const PLACED: PlacedSection[] = [];
{
  let bar = 0;
  for (const section of SONG_ARRANGEMENT) {
    for (let i = 0; i < section.bars; i++) {
      PLACED.push({ ...section, startBar: bar, barInSection: i });
    }
    bar += section.bars;
  }
}

/** The section covering a bar. Repeats the whole arrangement past its end. */
export function sectionAtBar(bar: number): PlacedSection {
  return PLACED[((bar % SONG_BARS) + SONG_BARS) % SONG_BARS];
}

export const sectionAtStep = (step: number): PlacedSection =>
  sectionAtBar(Math.floor(step / STEPS_PER_BAR));

/**
 * Which layers play, per section — composerAgent's variation rules, which it
 * introduced with "Variation prevents habituation". Holding the hook back
 * through the intro and the first verse is what makes the first chorus land.
 */
export interface SectionLayers {
  lead: boolean;
  pluck: boolean;
  pad: boolean;
  bass: boolean;
  drums: boolean;
  /** Play the A' variation of the hook rather than A. */
  useVariation: boolean;
  /** Scales note velocity, so energy climbs across the song. */
  energy: number;
  /** Verse states the hook thinned out; chorus states it whole. */
  sparseLead: boolean;
}

export function layersFor(section: PlacedSection): SectionLayers {
  switch (section.kind) {
    case 'intro':
      return { lead: false, pluck: false, pad: true, bass: true, drums: true,
               useVariation: false, energy: 0.6, sparseLead: false };
    case 'verse':
      return { lead: true, pluck: section.repeat > 0, pad: section.repeat > 0,
               bass: true, drums: true, useVariation: section.repeat > 0,
               energy: 0.72 + section.repeat * 0.04, sparseLead: true };
    case 'chorus':
      return { lead: true, pluck: true, pad: true, bass: true, drums: true,
               useVariation: section.repeat > 0,
               energy: 0.92 + section.repeat * 0.03, sparseLead: false };
    case 'bridge':
      // Drop the kit: the silence is what makes the last chorus arrive.
      return { lead: true, pluck: false, pad: true, bass: false, drums: false,
               useVariation: true, energy: 0.65, sparseLead: true };
    case 'outro':
      return { lead: false, pluck: false, pad: true, bass: true, drums: false,
               useVariation: false, energy: 0.5, sparseLead: false };
  }
}

/** True in the last bar of a section, where a transition fill belongs. */
export const isSectionTail = (section: PlacedSection): boolean =>
  section.barInSection === section.bars - 1;
