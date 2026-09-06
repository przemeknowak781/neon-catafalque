import React, { useState, useRef } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  step?: number;
  color?: string;
  /** 'sm' keeps a dense parameter panel on one screen. */
  size?: 'sm' | 'md';
}

export const Knob: React.FC<KnobProps> = ({ 
  label, value, min, max, onChange, step = 0.01, color = 'text-neon-cyan', size = 'md'
}) => {
  const px = size === 'sm' ? 40 : 64;
  const centre = px / 2;
  const radius = size === 'sm' ? 13 : 20;
  const stroke = size === 'sm' ? 3 : 4;
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef<number>(0);
  const startValue = useRef<number>(0);

  const angleArc = 270;
  const startAngle = (360 - angleArc) / 2;
  const endAngle = startAngle + angleArc;

  const currentAngle = ((value - min) / (max - min)) * angleArc + startAngle;

  // Polar to Cartesian
  const cx = centre;
  const cy = centre;
  const r = radius;
  
  const rad = (a: number) => (a - 90) * (Math.PI / 180);
  
  const x = cx + r * Math.cos(rad(currentAngle));
  const y = cy + r * Math.sin(rad(currentAngle));

  // SVG Path for the arc
  const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
    const start = {
        x: x + radius * Math.cos(rad(endAngle)),
        y: y + radius * Math.sin(rad(endAngle))
    };
    const end = {
        x: x + radius * Math.cos(rad(startAngle)),
        y: y + radius * Math.sin(rad(startAngle))
    };
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
        "M", start.x, start.y, 
        "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(" ");
  };

  /**
   * Pointer capture rather than window listeners.
   *
   * The drag used to set a state flag on pointerdown and register the move
   * listener from an effect keyed on it. Effects run after the commit, so
   * between the finger landing and the listener existing there is a frame in
   * which moves are dropped — a quick flick could set the value late or not at
   * all. Capturing the pointer routes every subsequent event for it to this
   * element, so React's own handlers are enough, the drag survives the finger
   * leaving the knob, and there is no gap to lose events in.
   *
   * The flag is a ref, not state, for the same reason: it has to be true on
   * the very next event, not after the next render. `isDragging` state is kept
   * only for the visual.
   */
  const dragging = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dy = startY.current - e.clientY;
    const range = max - min;
    // A finger has less room and less precision than a mouse, so the same
    // travel covers the range more slowly on touch.
    const travel = e.pointerType === 'touch' ? 260 : 200;
    let newValue = startValue.current + (dy / travel) * range;

    if (newValue < min) newValue = min;
    if (newValue > max) newValue = max;
    newValue = Math.round(newValue / step) * step;

    // Never let a non-finite value out: these feed AudioParam methods, which
    // throw on NaN and stop the audio graph.
    if (!Number.isFinite(newValue)) return;
    onChange(newValue);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="flex select-none flex-col items-center" style={{ width: px }}>
      <div
        className="group relative cursor-ns-resize"
        // touch-action: none stops the page scrolling under the drag.
        style={{ width: px, height: px, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <svg width={px} height={px} className="overflow-visible">
          {/* Background Track */}
          <path 
            d={describeArc(centre, centre, radius, startAngle, endAngle)}
            fill="none"
            stroke="#333"
            strokeWidth={stroke} 
            strokeLinecap="round"
          />
          {/* Active Value */}
          <path 
            d={describeArc(centre, centre, radius, startAngle, currentAngle)}
            fill="none" 
            className={`stroke-current ${color} filter drop-shadow-[0_0_2px_rgba(176,38,255,0.8)]`}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          {/* Pointer */}
          <circle cx={x} cy={y} r={size === 'sm' ? 2.5 : 3} fill="white" />
        </svg>
      </div>
      <span className={`${size === 'sm' ? 'text-[8px]' : 'text-[10px]'} font-mono text-gray-400 uppercase tracking-wider`}>{label}</span>
      <span className={`${size === 'sm' ? 'text-[7px]' : 'text-[9px]'} font-mono text-gray-500`}>{Math.round(value * 100) / 100}</span>
    </div>
  );
};
