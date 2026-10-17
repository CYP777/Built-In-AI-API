import React from 'react';

export interface SteppedRangeSliderProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step: number;
  ticks: number[];
  dots?: number[];
  formatTick?: (val: number) => string;
  badgeValue?: string | number;
  description?: string;
  minLabel?: string;
  maxLabel?: string;
}

export const SteppedRangeSlider: React.FC<SteppedRangeSliderProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  ticks,
  dots,
  formatTick,
  badgeValue,
  description,
  minLabel,
  maxLabel,
}) => {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const dotList = dots || ticks;

  return (
    <div className="space-y-2 py-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          {label}
        </label>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
          {badgeValue !== undefined ? badgeValue : value}
        </span>
      </div>

      {/* Stepped Scale & Slider container */}
      <div className="px-3 pt-1.5 pb-1">
        {/* Tick numbers row above the track */}
        <div className="relative w-full h-5 mb-1.5 select-none">
          {ticks.map((tick) => {
            const tickPercent = Math.min(100, Math.max(0, ((tick - min) / (max - min)) * 100));
            const isSelected = Math.abs(tick - value) < step / 2 + 0.001;
            return (
              <button
                key={tick}
                type="button"
                onClick={() => onChange(tick)}
                style={{ left: `${tickPercent}%` }}
                className={`absolute top-0 -translate-x-1/2 text-[10px] sm:text-xs transition-all cursor-pointer ${
                  isSelected
                    ? 'font-bold text-emerald-700 scale-110'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
                aria-label={`เลือกค่า ${tick}`}
                title={`เลือก ${tick}`}
              >
                {formatTick ? formatTick(tick) : tick}
              </button>
            );
          })}
        </div>

        {/* Interactive track with dots and thumb */}
        <div className="relative flex items-center h-8 select-none group">
          {/* Base track */}
          <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden relative">
            {/* Active filled track */}
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-75"
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Dots along the track */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none">
            {dotList.map((dotVal, idx) => {
              const dotPercent = Math.min(100, Math.max(0, ((dotVal - min) / (max - min)) * 100));
              const isPast = dotVal <= value;
              return (
                <div
                  key={idx}
                  style={{ left: `${dotPercent}%` }}
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full transition-colors ${
                    isPast ? 'bg-white shadow-2xs' : 'bg-slate-400'
                  }`}
                />
              );
            })}
          </div>

          {/* Thumb */}
          <div
            style={{ left: `${percentage}%` }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-white border-2 border-emerald-600 shadow-md flex items-center justify-center pointer-events-none transition-transform duration-75 group-has-[:focus-visible]:scale-115 group-has-[:focus-visible]:ring-3 group-has-[:focus-visible]:ring-emerald-500 group-has-[:focus-visible]:ring-offset-2"
          >
            <div className="h-2 w-2 rounded-full bg-emerald-600/30" />
          </div>

          {/* Native range input overlay for accessible and smooth drag interaction */}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 focus-visible:outline-none"
            aria-label={label}
          />
        </div>

        {/* Min / Max Labels */}
        {(minLabel || maxLabel) && (
          <div className="flex justify-between text-[11px] text-slate-600 pt-1">
            <span>{minLabel}</span>
            <span>{maxLabel}</span>
          </div>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-[11px] text-slate-600 leading-relaxed pt-0.5">
          {description}
        </p>
      )}
    </div>
  );
};
