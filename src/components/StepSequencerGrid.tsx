import React, { useEffect, useState } from 'react';
import { Dices, Eraser, Lock, Minus, Plus, Percent, RotateCcw, Zap } from 'lucide-react';
import {
  clampPartStepCount,
  countActiveSteps,
  countStepPLocks,
  isPartAudible,
  MAX_PART_STEPS,
  midiToNoteName,
  MIN_PART_STEPS,
  ParameterLockGrid,
  PartStepCounts,
  RATCHET_OPTIONS,
  RatchetGrid,
  StepGrid,
  TrigCondition,
  TrigConditionGrid,
} from '../audio/sequencerLogic';
import {
  PART_DEFINITIONS,
  PART_ORDER,
  PartId,
  STEP_COUNT,
} from '../audio/synthConfig';

interface StepDivisionCounterProps {
  partName: string;
  value: number;
  onChange: (nextCount: number) => void;
}

const StepDivisionCounter: React.FC<StepDivisionCounterProps> = ({
  partName,
  value,
  onChange,
}) => {
  const [draft, setDraft] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value));
    }
  }, [value, isFocused]);

  const commitDraft = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      const clamped = clampPartStepCount(parsed);
      onChange(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <div
      className="flex items-center h-8 bg-black border border-[#55ffff]/80 shrink-0"
      title={`${partName} steps per bar (1–16 tuplet division)`}
    >
      <button
        type="button"
        onClick={() => onChange(clampPartStepCount(value - 1))}
        disabled={value <= MIN_PART_STEPS}
        aria-label={`Decrease bar steps for ${partName}`}
        className="w-5 h-full bg-[#111947] hover:bg-[#1f2c6b] disabled:opacity-35 text-[#55ffff] hover:text-white border-r border-[#2e3e82] flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
      >
        <Minus className="w-3 h-3" />
      </button>

      <input
        type="text"
        inputMode="numeric"
        value={isFocused ? draft : String(value)}
        aria-label={`Steps per bar for ${partName}`}
        data-testid={`division-input-${partName.toLowerCase().replace(/[^a-z0-9]/g, '')}`}
        onFocus={(e) => {
          setIsFocused(true);
          setDraft(String(value));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
          setDraft(digits);
          if (digits.length > 0) {
            const parsed = parseInt(digits, 10);
            if (parsed >= MIN_PART_STEPS && parsed <= MAX_PART_STEPS) {
              onChange(parsed);
            }
          }
        }}
        onBlur={() => {
          setIsFocused(false);
          commitDraft(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            const next = clampPartStepCount(value + 1);
            onChange(next);
            setDraft(String(next));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = clampPartStepCount(value - 1);
            onChange(next);
            setDraft(String(next));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft(draft);
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
        onWheel={(e) => {
          e.preventDefault();
          onChange(clampPartStepCount(value + (e.deltaY < 0 ? 1 : -1)));
        }}
        className="w-6 h-full bg-transparent text-center font-mono-tabular text-xs font-extrabold text-[#ffff55] focus:outline-none focus:bg-[#19235c] selection:bg-[#55ffff] selection:text-black"
      />

      <button
        type="button"
        onClick={() => onChange(clampPartStepCount(value + 1))}
        disabled={value >= MAX_PART_STEPS}
        aria-label={`Increase bar steps for ${partName}`}
        className="w-5 h-full bg-[#111947] hover:bg-[#1f2c6b] disabled:opacity-35 text-[#55ffff] hover:text-white border-l border-[#2e3e82] flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
};

export type SequencerEditMode = 'step' | 'pitch' | 'ratchet' | 'cond' | 'plock';

interface StepSequencerGridProps {
  steps: StepGrid;
  stepCounts: PartStepCounts;
  ratchets: RatchetGrid;
  conditions: TrigConditionGrid;
  pLocks: ParameterLockGrid;
  fmNotes: number[];
  selectedPart: PartId;
  partPlayheads: Record<PartId, number>;
  isPlaying: boolean;
  muted: Record<PartId, boolean>;
  soloed: Record<PartId, boolean>;
  editMode: SequencerEditMode;
  activeRatchet: number;
  activeCondition: TrigCondition;
  pLockTarget: { partId: PartId; stepIndex: number } | null;
  onSelectAndTriggerPart: (partId: PartId) => void;
  onToggleStep: (partId: PartId, stepIndex: number, shiftKey?: boolean) => void;
  onCycleStepRatchet: (partId: PartId, stepIndex: number) => void;
  onChangePartStepCount: (partId: PartId, count: number) => void;
  onToggleRatchetEditMode: () => void;
  onSelectActiveRatchet: (ratchet: number) => void;
  onToggleConditionEditMode: () => void;
  onCycleActiveCondition: () => void;
  onTogglePLockEditMode: () => void;
  onToggleMute: (partId: PartId) => void;
  onToggleSolo: (partId: PartId) => void;
  onRandomizePart: (partId: PartId) => void;
  onClearPart: (partId: PartId) => void;
  onClearAll: () => void;
}

const RATCHET_BRUSH_VALUES = RATCHET_OPTIONS.filter((r) => r > 1);

export const StepSequencerGrid: React.FC<StepSequencerGridProps> = ({
  steps,
  stepCounts,
  ratchets,
  conditions,
  pLocks,
  fmNotes,
  selectedPart,
  partPlayheads,
  isPlaying,
  muted,
  soloed,
  editMode,
  activeRatchet,
  activeCondition,
  pLockTarget,
  onSelectAndTriggerPart,
  onToggleStep,
  onCycleStepRatchet,
  onChangePartStepCount,
  onToggleRatchetEditMode,
  onSelectActiveRatchet,
  onToggleConditionEditMode,
  onCycleActiveCondition,
  onTogglePLockEditMode,
  onToggleMute,
  onToggleSolo,
  onRandomizePart,
  onClearPart,
  onClearAll,
}) => {
  const ratchetEditMode = editMode === 'ratchet';
  const condEditMode = editMode === 'cond';
  const pLockEditMode = editMode === 'plock';

  return (
    <section
      aria-label="16-Step 4-Part Sequencer"
      className="temple-window flex flex-col overflow-hidden"
    >
      {/* Dedicated Action Row Above the Sequencer */}
      <div
        className="temple-titlebar-blue border-b-2 border-white px-2.5 py-1 flex flex-wrap items-center justify-between gap-1.5"
        data-testid="sequencer-action-row"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono-tabular text-xs font-extrabold uppercase tracking-wider text-white">
            [SEQ_MATRIX] :: 4x16
          </span>
          <span className="hidden xl:inline font-mono-tabular text-[10px] font-bold text-[#ffff55]">
            {ratchetEditMode
              ? `RATCHET ${activeRatchet}x PAINT`
              : condEditMode
              ? `TRIG COND: ${activeCondition}`
              : pLockEditMode
              ? 'P-LOCK: TAP STEP + TURN KNOBS'
              : editMode === 'pitch'
              ? 'PITCH PAINT: TAP FM STEPS'
              : 'ELEKTRON LOGIC + TUPLETS'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Ratchet Brush Bar */}
          <div
            className="flex items-center bg-black border border-white/80 p-0.5 gap-0.5"
            role="group"
            aria-label="Ratchet controls"
          >
            <button
              type="button"
              onClick={onToggleRatchetEditMode}
              aria-pressed={ratchetEditMode}
              className={`min-h-[28px] px-2 py-0.5 font-mono-tabular text-[11px] font-extrabold uppercase flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                ratchetEditMode
                  ? 'bg-[#ff55ff] text-black'
                  : 'bg-[#111740] text-[#ff88ff] hover:text-white'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Ratchet</span>
            </button>

            {RATCHET_BRUSH_VALUES.map((mult) => {
              const isSelected = ratchetEditMode && activeRatchet === mult;
              return (
                <button
                  key={mult}
                  type="button"
                  onClick={() => onSelectActiveRatchet(mult)}
                  aria-pressed={isSelected}
                  aria-label={`Set ratchet brush ${mult}x`}
                  className={`min-h-[28px] min-w-[26px] px-1 py-0.5 font-mono-tabular text-[11px] font-extrabold cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#ffff55] text-black'
                      : 'bg-[#080c24] text-[#d6e4ff] hover:bg-[#19235c] hover:text-white'
                  }`}
                >
                  {mult}x
                </button>
              );
            })}
          </div>

          {/* Elektron Trig Conditions Brush */}
          <div
            className="flex items-center bg-black border border-white/80 p-0.5 gap-0.5"
            role="group"
            aria-label="Elektron trig condition controls"
          >
            <button
              type="button"
              onClick={onToggleConditionEditMode}
              aria-pressed={condEditMode}
              className={`min-h-[28px] px-2 py-0.5 font-mono-tabular text-[11px] font-extrabold uppercase flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                condEditMode
                  ? 'bg-[#55ffff] text-black'
                  : 'bg-[#111740] text-[#55ffff] hover:text-white'
              }`}
            >
              <Percent className="w-3 h-3" />
              <span>Cond</span>
            </button>

            <button
              type="button"
              onClick={onCycleActiveCondition}
              aria-label={`Cycle trig condition value (${activeCondition})`}
              title="Click to cycle Elektron Trig Condition (100%, 75%, 50%, 25%, 1:2, 2:2, 1:4, 4:4)"
              className="min-h-[28px] min-w-[40px] px-1.5 py-0.5 bg-[#080c24] hover:bg-[#19235c] font-mono-tabular text-[11px] font-extrabold text-[#ffff55] cursor-pointer"
            >
              {activeCondition}
            </button>
          </div>

          {/* Elektron P-Lock Mode */}
          <button
            type="button"
            onClick={onTogglePLockEditMode}
            aria-pressed={pLockEditMode}
            aria-label="Toggle Parameter Lock mode"
            className={`temple-bevel-btn min-h-[32px] px-2.5 py-0.5 border-2 border-white font-mono-tabular text-[11px] font-extrabold uppercase flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              pLockEditMode
                ? 'bg-[#ffff55] text-black'
                : 'bg-[#19235c] hover:bg-[#253380] text-[#ffff55]'
            }`}
          >
            <Lock className="w-3 h-3" />
            <span>P-Lock</span>
          </button>

          <button
            type="button"
            onClick={onClearAll}
            aria-label="Clear all patterns"
            className="temple-bevel-btn min-h-[32px] px-2.5 py-0.5 bg-[#ff5555] hover:bg-[#ff6e6e] border-2 border-white font-mono-tabular text-[11px] font-extrabold uppercase text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="p-1.5 flex flex-col gap-1">
        {/* Beat Quarter Header (visible on tablet/desktop where 16 steps are in 1 row) */}
        <div className="hidden lg:grid lg:grid-cols-[324px_1fr] gap-2 items-center px-1">
          <div className="flex items-center justify-between text-[10px] font-mono-tabular font-bold uppercase tracking-wider text-[#55ffff] pr-1">
            <span>Drum Part</span>
            <span className="text-[#ffff55]">Div 1-16</span>
          </div>
          <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1 text-center">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <span
                key={i}
                className={`text-[10px] font-mono-tabular ${
                  i % 4 === 0 ? 'text-[#ffff55] font-extrabold' : 'text-[#8ea2e8]'
                }`}
              >
                {i + 1}
              </span>
            ))}
          </div>
        </div>

        {/* Four Rows of 16 Steps */}
        <div className="flex flex-col gap-1" data-testid="sequencer-rows">
          {PART_ORDER.map((partId) => {
            const def = PART_DEFINITIONS[partId];
            const rowSteps = steps[partId];
            const rowRatchets = ratchets[partId];
            const rowConditions = conditions[partId];
            const rowPLocks = pLocks[partId];
            const partStepCount = clampPartStepCount(stepCounts[partId]);
            const isSelected = selectedPart === partId;
            const isMuted = muted[partId];
            const isSoloed = soloed[partId];
            const audible = isPartAudible(partId, muted, soloed);
            const activeCount = countActiveSteps(steps, partId, partStepCount);
            const rowPlayhead = partPlayheads[partId];

            return (
              <div
                key={partId}
                data-testid={`part-row-${partId}`}
                className={`border-2 p-1 transition-colors grid grid-cols-1 lg:grid-cols-[324px_1fr] gap-2 items-center ${
                  isSelected
                    ? 'bg-[#161e52] border-[#ffffff]'
                    : 'bg-[#0b1030] border-[#2e3e82]'
                }`}
              >
                {/* Left Part Strip: Name | Div 1-16 Counter | Mute | Solo | Rnd | Clr */}
                <div className="flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectAndTriggerPart(partId)}
                    className="temple-bevel-btn min-h-[36px] flex-1 px-2 py-0.5 bg-black hover:bg-[#19235c] border border-white/80 flex items-center gap-1.5 text-left cursor-pointer transition-colors min-w-0"
                    aria-label={`Select and trigger ${def.name}`}
                  >
                    <span
                      className="w-2 h-5 border border-white/60 shrink-0"
                      style={{
                        backgroundColor: audible ? def.accentHex : '#4b5563',
                        opacity: audible ? 1 : 0.45,
                      }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-mono-tabular font-bold text-white whitespace-nowrap leading-tight truncate">
                        {def.name}
                      </div>
                      <div className="text-[10px] font-mono-tabular text-[#55ffff] whitespace-nowrap leading-tight">
                        {activeCount}/{partStepCount}
                      </div>
                    </div>
                  </button>

                  {/* Polyrhythmic Bar-Division Counter (1..16) to the left of Mute & Solo */}
                  <StepDivisionCounter
                    partName={def.name}
                    value={partStepCount}
                    onChange={(nextCount) => onChangePartStepCount(partId, nextCount)}
                  />

                  {/* Mute / Solo / Random / Clear */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleMute(partId)}
                      aria-pressed={isMuted}
                      aria-label={`Mute ${def.name}`}
                      className={`temple-bevel-btn w-7 h-8 font-mono-tabular text-xs font-extrabold border cursor-pointer ${
                        isMuted
                          ? 'bg-[#ff5555] text-white border-white'
                          : 'bg-[#06091e] text-[#b6c6ff] border-[#3d52a8] hover:text-white'
                      }`}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleSolo(partId)}
                      aria-pressed={isSoloed}
                      aria-label={`Solo ${def.name}`}
                      className={`temple-bevel-btn w-7 h-8 font-mono-tabular text-xs font-extrabold border cursor-pointer ${
                        isSoloed
                          ? 'bg-[#ffff55] text-black border-white'
                          : 'bg-[#06091e] text-[#b6c6ff] border-[#3d52a8] hover:text-white'
                      }`}
                    >
                      S
                    </button>
                    <button
                      type="button"
                      onClick={() => onRandomizePart(partId)}
                      aria-label={`Randomize ${def.name}`}
                      title={`Randomize ${def.name}`}
                      className="temple-bevel-btn w-7 h-8 bg-[#06091e] text-[#55ffff] border border-[#3d52a8] hover:text-white flex items-center justify-center cursor-pointer"
                    >
                      <Dices className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onClearPart(partId)}
                      aria-label={`Clear ${def.name}`}
                      title={`Clear ${def.name}`}
                      className="temple-bevel-btn w-7 h-8 bg-[#06091e] text-[#ff8888] border border-[#3d52a8] hover:text-white flex items-center justify-center cursor-pointer"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 16-Step Tactile Pad Row */}
                <div className="grid grid-cols-8 md:grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
                  {rowSteps.map((isActive, stepIndex) => {
                    const isDisabled = stepIndex >= partStepCount;
                    const isPlayhead = isPlaying && !isDisabled && rowPlayhead === stepIndex;
                    const isAltBeatQuad = Math.floor(stepIndex / 4) % 2 === 1;
                    const ratchet = rowRatchets[stepIndex] ?? 1;
                    const condition = rowConditions[stepIndex] ?? '100%';
                    const lockCount = countStepPLocks(rowPLocks[stepIndex]);
                    const isPLockSelected =
                      !isDisabled &&
                      pLockTarget !== null &&
                      pLockTarget.partId === partId &&
                      pLockTarget.stepIndex === stepIndex;
                    const showRatchet = !isDisabled && isActive && ratchet > 1;
                    const showCond = !isDisabled && isActive && condition !== '100%';
                    const showLock = !isDisabled && lockCount > 0;
                    const noteLabel =
                      partId === 'fmsynth' && isActive && !isDisabled
                        ? midiToNoteName(fmNotes[stepIndex] ?? 48)
                        : null;

                    return (
                      <button
                        key={stepIndex}
                        type="button"
                        disabled={isDisabled}
                        aria-disabled={isDisabled}
                        onClick={(e) => onToggleStep(partId, stepIndex, e.shiftKey)}
                        onContextMenu={(e) => {
                          if (isDisabled) return;
                          e.preventDefault();
                          onCycleStepRatchet(partId, stepIndex);
                        }}
                        aria-pressed={isDisabled ? false : isActive}
                        aria-label={`${def.name} step ${stepIndex + 1}${
                          isDisabled ? ' disabled' : ''
                        }${showRatchet ? ` ratchet ${ratchet}x` : ''}${
                          showCond ? ` condition ${condition}` : ''
                        }${showLock ? ` locked ${lockCount}` : ''}${
                          noteLabel ? ` note ${noteLabel}` : ''
                        }`}
                        data-testid={`step-${partId}-${stepIndex}`}
                        className={`relative min-h-[36px] border flex flex-col items-center justify-between py-0.5 px-0.5 select-none ${
                          isDisabled
                            ? 'bg-[#040717] border-[#192145] opacity-30 cursor-not-allowed'
                            : isPLockSelected
                            ? 'temple-bevel-btn ring-2 ring-[#ff55ff] border-[#ffff55] cursor-pointer active:scale-95'
                            : isPlayhead
                            ? 'temple-bevel-btn ring-2 ring-white border-white bg-[#aa00aa] cursor-pointer active:scale-95'
                            : isActive
                            ? 'temple-bevel-btn border-white cursor-pointer active:scale-95'
                            : isAltBeatQuad
                            ? 'temple-bevel-btn bg-[#080d2b] border-[#2e3e82] hover:border-[#55ffff] cursor-pointer active:scale-95'
                            : 'temple-bevel-btn bg-[#12194a] border-[#4055a8] hover:border-[#55ffff] cursor-pointer active:scale-95'
                        }`}
                        style={
                          !isDisabled && isActive && !isPlayhead
                            ? {
                                backgroundColor: audible ? def.accentHex : '#2a3352',
                              }
                            : undefined
                        }
                      >
                        {/* Top LED Strip (subdivided into N ticks when Ratchet > 1) */}
                        {showRatchet ? (
                          <span className="w-[88%] h-1.5 flex gap-[1px]" aria-hidden="true">
                            {Array.from({ length: ratchet }, (_, idx) => (
                              <span
                                key={idx}
                                className="flex-1 h-full border border-black/50"
                                style={{
                                  backgroundColor: isPlayhead
                                    ? '#ffffff'
                                    : audible
                                    ? '#000000'
                                    : '#6b7280',
                                }}
                              />
                            ))}
                          </span>
                        ) : (
                          <span
                            className="w-4/5 h-1.5 border border-black/50"
                            style={{
                              backgroundColor: isDisabled
                                ? '#090e26'
                                : isPlayhead
                                ? '#ffffff'
                                : isActive
                                ? audible
                                  ? '#000000'
                                  : '#6b7280'
                                : '#000000',
                            }}
                            aria-hidden="true"
                          />
                        )}

                        {/* Step Label / Note + Ratchet / Cond / Lock Tags */}
                        <div className="flex items-center justify-center gap-0.5 leading-none max-w-full overflow-hidden">
                          <span
                            className={`text-[10px] font-mono-tabular font-extrabold leading-none ${
                              isDisabled
                                ? 'text-[#4e5b8c]'
                                : isPlayhead
                                ? 'text-white'
                                : isActive
                                ? audible
                                  ? 'text-black'
                                  : 'text-[#d1d5db]'
                                : 'text-[#a5b9ff]'
                            }`}
                          >
                            {noteLabel ?? stepIndex + 1}
                          </span>
                          {showRatchet && (
                            <span className="px-0.5 bg-black text-[#ff55ff] text-[8px] font-mono-tabular font-extrabold leading-tight">
                              {ratchet}x
                            </span>
                          )}
                          {showCond && !showRatchet && (
                            <span className="px-0.5 bg-black text-[#55ffff] text-[8px] font-mono-tabular font-extrabold leading-tight">
                              {condition}
                            </span>
                          )}
                          {showLock && (
                            <span className="px-0.5 bg-[#aa00aa] text-white text-[8px] font-mono-tabular font-extrabold leading-tight">
                              L
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
