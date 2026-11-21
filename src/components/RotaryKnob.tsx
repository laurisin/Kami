import React, { useCallback, useRef, useState } from 'react';

interface RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  displayValue: string;
  accentColor: string;
  size?: 'sm' | 'md';
  onChange: (nextValue: number) => void;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  displayValue,
  accentColor,
  size = 'md',
  onChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startY: number; startValue: number } | null>(null);

  const normalized = max > min ? (value - min) / (max - min) : 0;
  const clampedNorm = Math.max(0, Math.min(1, normalized));
  const angleDeg = -135 + clampedNorm * 270;

  const snapValue = useCallback(
    (raw: number) => {
      const clamped = Math.max(min, Math.min(max, raw));
      const stepped = min + Math.round((clamped - min) / step) * step;
      const decimals = step < 1 ? 1 : 0;
      return Number(Math.max(min, Math.min(max, stepped)).toFixed(decimals));
    },
    [min, max, step]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = { startY: e.clientY, startValue: value };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const deltaY = dragStartRef.current.startY - e.clientY;
    const range = max - min;
    const nextRaw = dragStartRef.current.startValue + (deltaY / 140) * range;
    const nextVal = snapValue(nextRaw);
    if (nextVal !== value) {
      onChange(nextVal);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current) {
      dragStartRef.current = null;
      setIsDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const fineStep = step;
    const coarseStep = Math.max(step, (max - min) / 16);
    const delta = e.shiftKey ? coarseStep : fineStep;

    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(snapValue(value + delta));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(snapValue(value - delta));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const delta = Math.max(step, (max - min) / 40);
    onChange(snapValue(value + dir * delta));
  };

  const dim = size === 'sm' ? 44 : 54;
  const center = dim / 2;
  const radius = size === 'sm' ? 17 : 21;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 270 / 360;
  const trackLength = circumference * arcFraction;
  const activeLength = trackLength * clampedNorm;

  return (
    <div className="flex flex-col items-center select-none">
      <span className="text-[10px] font-mono-tabular font-bold uppercase tracking-wider text-[#a8e6ff] mb-0.5 whitespace-nowrap">
        {label}
      </span>

      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={displayValue}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        style={{ width: dim, height: dim, touchAction: 'none' }}
        className={`relative flex items-center justify-center rounded-full cursor-ns-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffff55] transition-transform ${
          isDragging ? 'scale-105' : ''
        }`}
        title={`${label}: ${displayValue} (drag or double-tap to reset)`}
      >
        <svg
          width={dim}
          height={dim}
          viewBox={`0 0 ${dim} ${dim}`}
          className="absolute inset-0 pointer-events-none"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1e295e"
            strokeWidth={size === 'sm' ? 3.5 : 4}
            strokeDasharray={`${trackLength} ${circumference}`}
            strokeLinecap="butt"
            transform={`rotate(135 ${center} ${center})`}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth={size === 'sm' ? 3.5 : 4}
            strokeDasharray={`${activeLength} ${circumference}`}
            strokeLinecap="butt"
            transform={`rotate(135 ${center} ${center})`}
          />
        </svg>

        <div
          style={{
            width: size === 'sm' ? 28 : 34,
            height: size === 'sm' ? 28 : 34,
            transform: `rotate(${angleDeg}deg)`,
          }}
          className="relative rounded-full bg-[#070a1c] border-2 border-[#ffffff] shadow-[2px_2px_0px_#000000] flex items-start justify-center pointer-events-none"
        >
          <span
            className="w-[3px] mt-1"
            style={{
              height: size === 'sm' ? 8 : 10,
              backgroundColor: accentColor,
            }}
          />
        </div>
      </div>

      <span
        className="mt-0.5 px-1.5 py-0.5 bg-black border border-[#3a4a8a] text-[10px] font-mono-tabular font-bold whitespace-nowrap"
        style={{ color: isDragging ? '#ffff55' : '#ffffff' }}
      >
        {displayValue}
      </span>
    </div>
  );
};
