import React from 'react';
import { Track } from '../types';
import { STEPS_PER_BAR, arrangementByName } from '../services/arrangement';

interface SequencerGridProps {
  tracks: Track[];
  currentStep: number;
  totalSteps: number;
  selectedTrackId: string;
  /** Which form template the grid is drawing. */
  arrangement: string;
  onToggleStep: (trackId: string, stepIndex: number) => void;
  onSelectTrack: (trackId: string) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  /** Rebuild this one part against the song's existing plan. */
  onRegenerate: (trackId: string) => void;
  /** False until a song has been generated, since there is no plan before that. */
  canRegenerate: boolean;
}

/** SVG needs real colours, not utility class names. */
const TRACK_COLOURS: Record<string, string> = {
  lead: '#b026ff',
  pluck: '#2dd4bf',
  pad: '#3b82f6',
  bass: '#6366f1',
  fx: '#ff00ff',
  hihat: '#facc15',
  snare: '#22d3ee',
  kick: '#ef4444',
};

const SECTION_TINTS: Record<string, string> = {
  intro: 'transparent',
  verse: 'rgba(255,255,255,0.022)',
  chorus: 'rgba(176,38,255,0.08)',
  bridge: 'rgba(0,243,255,0.055)',
  outro: 'rgba(255,255,255,0.015)',
};

/** The grid reads the same arrangement the generator builds from. */
function sectionOf(bar: number, arrangement: string): { name: string; tint: string; isStart: boolean } {
  const section = arrangementByName(arrangement).sectionAtBar(bar);
  return {
    name: section.label,
    tint: SECTION_TINTS[section.kind] ?? 'transparent',
    isStart: section.barInSection === 0,
  };
}

const noteToMidi = (note: string): number => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const m = note.match(/^([A-G]#?)(-?\d+)$/);
  return m ? (parseInt(m[2], 10) + 1) * 12 + names.indexOf(m[1]) : 60;
};

/**
 * One lane per track, all of them on screen at once.
 *
 * The previous grid gave an expanded track a full 29-row piano roll at 32 px a
 * row and 24 px a step — nearly a thousand pixels tall and six thousand wide
 * for a single part, so one track filled the viewport and the other seven were
 * somewhere below the fold. Here every track is a fixed-height lane drawn as a
 * scaling SVG, so the whole arrangement is legible at a glance and nothing
 * scrolls in either direction. The selected lane grows to stay editable.
 */
export const SequencerGrid: React.FC<SequencerGridProps> = ({
  tracks, currentStep, totalSteps, selectedTrackId, arrangement,
  onToggleStep, onSelectTrack, onToggleMute, onToggleSolo, onRegenerate, canRegenerate,
}) => {
  const bars = Math.max(1, Math.ceil(totalSteps / STEPS_PER_BAR));
  const anySoloed = tracks.some((t) => t.isSoloed);

  return (
    <div className="flex h-full min-h-0 w-full select-none flex-col font-mono">
      {/* Ruler */}
      <div className="flex h-5 shrink-0 items-stretch border-b border-zinc-800">
        <div className="w-[112px] shrink-0 border-r border-zinc-800" />
        <div className="relative flex-1">
          <svg className="h-full w-full" viewBox={`0 0 ${totalSteps} 10`} preserveAspectRatio="none">
            {Array.from({ length: bars }, (_, bar) => {
              const { tint } = sectionOf(bar, arrangement);
              return (
                <rect key={bar} x={bar * STEPS_PER_BAR} y={0} width={STEPS_PER_BAR} height={10}
                      fill={tint} />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex">
            {Array.from({ length: bars }, (_, bar) => {
              const { name, isStart } = sectionOf(bar, arrangement);
              return (
                <div key={bar}
                     className={`min-w-0 flex-1 overflow-visible whitespace-nowrap pl-1 text-[7px] uppercase tracking-widest ${
                       isStart ? 'border-l border-zinc-600 text-zinc-400' : 'border-l border-zinc-800/40 text-zinc-600'}`}>
                  {isStart ? name : ''}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lanes */}
      <div className="flex min-h-0 flex-1 flex-col">
        {tracks.map((track) => {
          const isSelected = track.id === selectedTrackId;
          const colour = TRACK_COLOURS[track.id] ?? '#a1a1aa';
          const dimmed = track.isMuted || (anySoloed && !track.isSoloed);

          return (
            <div key={track.id}
                 onClick={() => onSelectTrack(track.id)}
                 style={{ flexGrow: isSelected ? 3 : 1 }}
                 className={`flex min-h-0 basis-0 cursor-pointer items-stretch border-b border-zinc-900 transition-colors ${
                   isSelected ? 'bg-white/[0.03]' : 'hover:bg-white/[0.015]'}`}>

              {/*
                Label. One row on a desktop, two on a phone: at 14 px the mute,
                solo and rebuild buttons are hard to hit with a mouse and
                impossible with a thumb, and three of them plus a track name
                will not fit across a phone in one row at a usable size. They
                are 28 px here — short of the 44 px a primary control wants,
                which is a deliberate trade for eight lanes on one screen;
                play and generate, the controls that matter most, are 40 px on
                the top bar.
              */}
              <div className={`flex w-[96px] shrink-0 flex-col justify-center gap-1 border-r px-1 lg:w-[112px] lg:flex-row lg:items-center lg:gap-1.5 lg:px-2 ${
                isSelected ? 'border-zinc-700' : 'border-zinc-800'}`}>
                <div className="flex min-w-0 items-center gap-1 lg:contents">
                  <span className="h-3 w-[3px] shrink-0 rounded-full"
                        style={{ backgroundColor: colour, opacity: dimmed ? 0.25 : 1 }} />
                  <span className={`min-w-0 flex-1 truncate text-[9px] font-bold uppercase tracking-wider ${
                    dimmed ? 'text-zinc-600' : 'text-zinc-300'}`}>
                    {track.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 lg:contents">
                  <button onClick={(e) => { e.stopPropagation(); onToggleMute(track.id); }}
                          title="Mute"
                          className={`h-7 w-7 shrink-0 rounded-sm border text-[10px] leading-none lg:h-3.5 lg:w-3.5 lg:text-[7px] ${
                            track.isMuted ? 'border-neon-pink/60 bg-neon-pink/20 text-neon-pink'
                                          : 'border-zinc-700 text-zinc-600 hover:text-zinc-300'}`}>M</button>
                  <button onClick={(e) => { e.stopPropagation(); onToggleSolo(track.id); }}
                          title="Solo"
                          className={`h-7 w-7 shrink-0 rounded-sm border text-[10px] leading-none lg:h-3.5 lg:w-3.5 lg:text-[7px] ${
                            track.isSoloed ? 'border-neon-cyan/60 bg-neon-cyan/20 text-neon-cyan'
                                           : 'border-zinc-700 text-zinc-600 hover:text-zinc-300'}`}>S</button>
                  <button onClick={(e) => { e.stopPropagation(); onRegenerate(track.id); }}
                          disabled={!canRegenerate}
                          title={canRegenerate
                            ? 'Rebuild this part against the same chords and hook'
                            : 'Generate a song first'}
                          className={`h-7 w-7 shrink-0 rounded-sm border text-[10px] leading-none lg:h-3.5 lg:w-3.5 lg:text-[7px] ${
                            canRegenerate
                              ? 'border-zinc-700 text-zinc-600 hover:border-neon-purple/60 hover:text-neon-purple'
                              : 'border-zinc-800 text-zinc-800'}`}>↻</button>
                </div>
              </div>

              {/* Content */}
              <div className="relative min-w-0 flex-1">
                <Lane track={track} totalSteps={totalSteps} bars={bars} colour={colour}
                      dimmed={dimmed} arrangement={arrangement} onToggleStep={onToggleStep} />
                <div className="pointer-events-none absolute inset-y-0 w-px bg-white/70"
                     style={{ left: `${(currentStep / totalSteps) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const LANE_UNITS = 100;

const Lane: React.FC<{
  track: Track; totalSteps: number; bars: number; colour: string; dimmed: boolean;
  arrangement: string;
  onToggleStep: (trackId: string, stepIndex: number) => void;
}> = ({ track, totalSteps, bars, colour, dimmed, arrangement, onToggleStep }) => {
  const opacity = dimmed ? 0.22 : 1;

  // Map pitch into the lane, with a little padding so notes never touch the edge.
  let low = 0, high = 1;
  if (track.notes?.length) {
    const midi = track.notes.map((n) => noteToMidi(n.note));
    low = Math.min(...midi);
    high = Math.max(...midi);
    if (high === low) { high = low + 1; }
  }
  const yOf = (midi: number) => {
    const t = (midi - low) / (high - low);
    return 8 + (1 - t) * (LANE_UNITS - 22);
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!track.steps) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const step = Math.floor(((e.clientX - rect.left) / rect.width) * totalSteps);
    if (step >= 0 && step < totalSteps) onToggleStep(track.id, step);
  };

  return (
    <svg className={`h-full w-full ${track.steps ? 'cursor-pointer' : ''}`}
         viewBox={`0 0 ${totalSteps} ${LANE_UNITS}`} preserveAspectRatio="none"
         onClick={handleClick}>
      {Array.from({ length: bars }, (_, bar) => (
        <rect key={`s${bar}`} x={bar * STEPS_PER_BAR} y={0} width={STEPS_PER_BAR} height={LANE_UNITS}
              fill={sectionOf(bar, arrangement).tint} />
      ))}
      {Array.from({ length: bars }, (_, bar) => (
        <line key={`b${bar}`} x1={bar * STEPS_PER_BAR} x2={bar * STEPS_PER_BAR} y1={0} y2={LANE_UNITS}
              stroke={sectionOf(bar, arrangement).isStart ? '#52525b' : '#27272a'}
              strokeWidth={sectionOf(bar, arrangement).isStart ? 0.9 : 0.4} vectorEffect="non-scaling-stroke" />
      ))}

      {track.notes?.map((note) => (
        <rect key={note.id}
              x={note.startStep}
              y={yOf(noteToMidi(note.note)) - 4}
              width={Math.max(0.8, note.duration)}
              height={8}
              rx={1.5}
              fill={colour}
              opacity={opacity * (0.45 + note.velocity * 0.55)} />
      ))}

      {track.steps?.map((step, i) => step.active ? (
        <rect key={i} x={i + 0.15} y={LANE_UNITS * 0.18} width={0.7}
              height={LANE_UNITS * (0.28 + step.velocity * 0.5)}
              rx={0.3} fill={colour} opacity={opacity * (0.5 + step.velocity * 0.5)} />
      ) : null)}
    </svg>
  );
};
