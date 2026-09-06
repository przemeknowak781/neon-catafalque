import React, { useState, useEffect, useRef } from 'react';

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
  const px = size === 'sm' ? 44 : 64;
  const centre = px / 2;
  const radius = size === 'sm' ? 14 : 20;
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

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dy = startY.current - e.clientY;
      const range = max - min;
      const delta = (dy / 200) * range; // Sensitivity
      let newValue = startValue.current + delta;
      
      // Clamp
      if (newValue < min) newValue = min;
      if (newValue > max) newValue = max;
      
      // Step
      newValue = Math.round(newValue / step) * step;
      
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, max, min, step, onChange]);

  return (
    <div className="flex select-none flex-col items-center" style={{ width: px }}>
      <div
        className="group relative cursor-ns-resize"
        style={{ width: px, height: px }}
        onMouseDown={handleMouseDown}
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
