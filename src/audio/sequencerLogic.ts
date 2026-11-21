import {
  AllPartParams,
  createDefaultParams,
  DEFAULT_MASTER_FX,
  DEFAULT_MIXER_LEVELS,
  DistortionMode,
  FmCarrierWave,
  KnobDefinition,
  MasterFxParams,
  MasterKnobDefinition,
  PART_DEFINITIONS,
  PART_ORDER,
  PartId,
  PartParams,
  STEP_COUNT,
} from './synthConfig';

export type StepGrid = Record<PartId, boolean[]>;
export type RatchetGrid = Record<PartId, number[]>;
export type PartStepCounts = Record<PartId, number>;
export type MixerLevels = Record<PartId, number>;

export const TRIG_CONDITIONS = [
  '100%',
  '75%',
  '50%',
  '25%',
  '1:2',
  '2:2',
  '1:4',
  '4:4',
] as const;

export type TrigCondition = (typeof TRIG_CONDITIONS)[number];
export type TrigConditionGrid = Record<PartId, TrigCondition[]>;
export type ParameterLockGrid = Record<PartId, Array<Partial<PartParams> | null>>;

export const MIN_PART_STEPS = 1;
export const MAX_PART_STEPS = STEP_COUNT;
export const RATCHET_OPTIONS = [1, 2, 3, 4, 6, 8] as const;

export interface SequencerState {
  bpm: number;
  swing: number; // -99 to +99 percent
  masterVolume: number; // 0 to 100
  mixerLevels: MixerLevels;
  selectedPart: PartId;
  steps: StepGrid;
  stepCounts: PartStepCounts;
  ratchets: RatchetGrid;
  conditions: TrigConditionGrid;
  pLocks: ParameterLockGrid;
  fmNotes: number[];
  muted: Record<PartId, boolean>;
  soloed: Record<PartId, boolean>;
  params: AllPartParams;
  masterFx: MasterFxParams;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(clamped / 12) - 1;
  const note = NOTE_NAMES[clamped % 12];
  return `${note}${octave}`;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function cloneSteps(steps: StepGrid): StepGrid {
  return {
    kick: [...steps.kick],
    snare: [...steps.snare],
    hihat: [...steps.hihat],
    fmsynth: [...steps.fmsynth],
  };
}

export function createEmptySteps(): StepGrid {
  return {
    kick: Array(STEP_COUNT).fill(false),
    snare: Array(STEP_COUNT).fill(false),
    hihat: Array(STEP_COUNT).fill(false),
    fmsynth: Array(STEP_COUNT).fill(false),
  };
}

export function createDefaultStepCounts(): PartStepCounts {
  return {
    kick: STEP_COUNT,
    snare: STEP_COUNT,
    hihat: STEP_COUNT,
    fmsynth: STEP_COUNT,
  };
}

export function createEmptyRatchets(): RatchetGrid {
  return {
    kick: Array(STEP_COUNT).fill(1),
    snare: Array(STEP_COUNT).fill(1),
    hihat: Array(STEP_COUNT).fill(1),
    fmsynth: Array(STEP_COUNT).fill(1),
  };
}

export function createDefaultMixerLevels(): MixerLevels {
  return { ...DEFAULT_MIXER_LEVELS };
}

export function clampMixerLevel(val: number): number {
  if (!Number.isFinite(val)) return 85;
  return Math.max(0, Math.min(100, Math.round(val)));
}

export function createEmptyConditions(): TrigConditionGrid {
  return {
    kick: Array(STEP_COUNT).fill('100%'),
    snare: Array(STEP_COUNT).fill('100%'),
    hihat: Array(STEP_COUNT).fill('100%'),
    fmsynth: Array(STEP_COUNT).fill('100%'),
  };
}

export function createEmptyPLocks(): ParameterLockGrid {
  return {
    kick: Array(STEP_COUNT).fill(null),
    snare: Array(STEP_COUNT).fill(null),
    hihat: Array(STEP_COUNT).fill(null),
    fmsynth: Array(STEP_COUNT).fill(null),
  };
}

export function nextTrigCondition(current: TrigCondition): TrigCondition {
  const idx = TRIG_CONDITIONS.indexOf(current);
  return TRIG_CONDITIONS[(idx + 1) % TRIG_CONDITIONS.length];
}

export function shouldTriggerCondition(
  condition: TrigCondition,
  barIndex: number,
  rng: () => number = Math.random
): boolean {
  switch (condition) {
    case '100%':
      return true;
    case '75%':
      return rng() < 0.75;
    case '50%':
      return rng() < 0.5;
    case '25%':
      return rng() < 0.25;
    case '1:2':
      return barIndex % 2 === 0;
    case '2:2':
      return barIndex % 2 === 1;
    case '1:4':
      return barIndex % 4 === 0;
    case '4:4':
      return barIndex % 4 === 3;
    default:
      return true;
  }
}

export function resolveEffectiveStepParams(
  baseParams: PartParams,
  lock: Partial<PartParams> | null | undefined
): PartParams {
  if (!lock) return baseParams;
  return { ...baseParams, ...lock } as PartParams;
}

export function countStepPLocks(lock: Partial<PartParams> | null | undefined): number {
  if (!lock) return 0;
  return Object.keys(lock).length;
}

export function clampPartStepCount(count: number): number {
  if (!Number.isFinite(count)) return STEP_COUNT;
  return Math.max(MIN_PART_STEPS, Math.min(MAX_PART_STEPS, Math.round(count)));
}

export function clampRatchetCount(ratchet: number): number {
  if (!Number.isFinite(ratchet)) return 1;
  const rounded = Math.round(ratchet);
  if ((RATCHET_OPTIONS as readonly number[]).includes(rounded)) {
    return rounded;
  }
  let closest: number = RATCHET_OPTIONS[0];
  let bestDiff = Math.abs(rounded - closest);
  for (const opt of RATCHET_OPTIONS) {
    const diff = Math.abs(rounded - opt);
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = opt;
    }
  }
  return closest;
}

export function nextRatchetCount(current: number): number {
  const normalized = clampRatchetCount(current);
  const idx = (RATCHET_OPTIONS as readonly number[]).indexOf(normalized);
  return RATCHET_OPTIONS[(idx + 1) % RATCHET_OPTIONS.length];
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function computeDistortionSample(
  x: number,
  drivePercent: number,
  mode: DistortionMode
): number {
  const norm = Math.max(0, Math.min(1, drivePercent / 100));
  if (norm <= 0.01) return x;

  if (mode === 'tape') {
    const k = 1 + norm * 6.5;
    return Math.tanh(x * k) / Math.tanh(k);
  }
  if (mode === 'fuzz') {
    // Asymmetric hard/soft diode clip
    const k = 1 + norm * 18;
    const biased = x * k + norm * 0.18;
    return Math.max(-0.92, Math.min(0.92, Math.tanh(biased)));
  }
  // Wavefolder crunch
  const foldGain = 1 + norm * 4.2;
  return Math.sin(x * foldGain * (Math.PI / 2));
}

export function formatMasterFxValue(def: MasterKnobDefinition, value: number): string {
  if (def.unit === 'dB') {
    const r = Math.round(value);
    return r > 0 ? `+${r} dB` : `${r} dB`;
  }
  if (def.unit === 'Hz' && value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  if (def.unit === ':1') {
    return `${Math.round(value)}:1`;
  }
  return `${Math.round(value)}${def.unit === '%' ? '%' : ` ${def.unit}`}`;
}

export function calculateDuckMinGain(scPumpPercent: number): number {
  const norm = Math.max(0, Math.min(1, scPumpPercent / 100));
  // Up to 92% ducking at 100% SC Pump for unmistakable rhythmic pumping
  return Math.max(0.08, 1 - norm * 0.92);
}

export const MIN_BPM = 3;
export const MAX_BPM = 333;
export const MIN_SWING = -99;
export const MAX_SWING = 99;

const DEFAULT_FM_NOTES = [36, 36, 43, 39, 36, 36, 43, 46, 36, 48, 43, 39, 41, 43, 46, 48];

export function createInitialSequencerState(): SequencerState {
  return {
    bpm: 120,
    swing: 0,
    masterVolume: 85,
    mixerLevels: createDefaultMixerLevels(),
    selectedPart: 'kick',
    steps: createEmptySteps(),
    stepCounts: createDefaultStepCounts(),
    ratchets: createEmptyRatchets(),
    conditions: createEmptyConditions(),
    pLocks: createEmptyPLocks(),
    fmNotes: [...DEFAULT_FM_NOTES],
    muted: {
      kick: false,
      snare: false,
      hihat: false,
      fmsynth: false,
    },
    soloed: {
      kick: false,
      snare: false,
      hihat: false,
      fmsynth: false,
    },
    params: createDefaultParams(),
    masterFx: { ...DEFAULT_MASTER_FX },
  };
}

export function clampBpm(bpm: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
}

export function clampSwing(swing: number): number {
  return Math.max(MIN_SWING, Math.min(MAX_SWING, Math.round(swing)));
}

export function formatSwingValue(swing: number): string {
  const s = clampSwing(swing);
  return s > 0 ? `+${s}%` : `${s}%`;
}

export function bpmToStepDurationMs(bpm: number): number {
  const safeBpm = clampBpm(bpm);
  // 16th note duration = (60 / bpm) / 4 seconds
  return (60000 / safeBpm) / 4;
}

export function bpmToBarDurationSec(bpm: number): number {
  // 1 four-beat bar = 16 standard 16th notes
  return (16 * bpmToStepDurationMs(bpm)) / 1000;
}

export function partStepDurationSec(bpm: number, partStepCount: number): number {
  const n = clampPartStepCount(partStepCount);
  return bpmToBarDurationSec(bpm) / n;
}

export function calculateSwingDelayMs(
  stepIndex: number,
  stepDurationMs: number,
  swingPercent: number
): number {
  const clampedSwing = clampSwing(swingPercent);
  if (stepIndex % 2 === 1) {
    // Negative swing anticipates odd steps (down to -99%), positive delays up to +99%
    return (clampedSwing / 100) * stepDurationMs;
  }
  return 0;
}

export function calculatePolyrhythmSwingOffsetSec(
  stepIndex: number,
  partStepCount: number,
  bpm: number,
  swingPercent: number
): number {
  const n = clampPartStepCount(partStepCount);
  if (n <= 1) return 0;
  const stepDurMs = partStepDurationSec(bpm, n) * 1000;
  return calculateSwingDelayMs(stepIndex, stepDurMs, swingPercent) / 1000;
}

export function calculatePartStepHitTimeSec(
  barOriginSec: number,
  barIndex: number,
  stepIndex: number,
  partStepCount: number,
  bpm: number,
  swingPercent: number
): number {
  const n = clampPartStepCount(partStepCount);
  const barDurSec = bpmToBarDurationSec(bpm);
  const nominalSec = barOriginSec + (barIndex + stepIndex / n) * barDurSec;
  const swingOffsetSec = calculatePolyrhythmSwingOffsetSec(
    stepIndex,
    n,
    bpm,
    swingPercent
  );
  return nominalSec + swingOffsetSec;
}

export function calculateRatchetSubHitTimesSec(
  hitTimeSec: number,
  stepIndex: number,
  partStepCount: number,
  bpm: number,
  swingPercent: number,
  ratchetCount: number
): number[] {
  const count = clampRatchetCount(ratchetCount);
  if (count <= 1) return [hitTimeSec];

  const n = clampPartStepCount(partStepCount);
  const stepDurSec = partStepDurationSec(bpm, n);
  const swingNorm = clampSwing(swingPercent) / 100;

  let gapToNextStepSec = stepDurSec;
  if (n > 1) {
    if (stepIndex % 2 === 0) {
      // Even step: next step is odd unless this is the final step wrapping to bar's even step 0
      gapToNextStepSec = stepIndex + 1 < n ? (1 + swingNorm) * stepDurSec : stepDurSec;
    } else {
      // Odd step: next step is always even (either stepIndex+1 or next bar step 0)
      gapToNextStepSec = (1 - swingNorm) * stepDurSec;
    }
  }

  // Keep burst comfortably inside the swung gap without negative/zero collapse at +-99%
  const spanSec = Math.max(0.014, gapToNextStepSec);
  return Array.from({ length: count }, (_, i) => hitTimeSec + (i / count) * spanSec);
}

export function alignPartStepToBarPhase(
  barPhase: number,
  newStepCount: number
): { barIndex: number; stepIndex: number } {
  const n = clampPartStepCount(newStepCount);
  const safePhase = Math.max(0, barPhase);
  const globalStep = Math.ceil(safePhase * n - 1e-9);
  return {
    barIndex: Math.floor(globalStep / n),
    stepIndex: globalStep % n,
  };
}

export function computeLookaheadHorizonSec(
  currentTimeSec: number,
  baseLookaheadSec: number,
  bpm: number,
  swingPercent: number
): number {
  const clampedSwing = clampSwing(swingPercent);
  const stepDurSec = bpmToStepDurationMs(bpm) / 1000;
  const maxAnticipationSec = clampedSwing < 0 ? (-clampedSwing / 100) * stepDurSec : 0;
  return currentTimeSec + baseLookaheadSec + maxAnticipationSec;
}

export function getFmCarrierGainCompensation(wave: FmCarrierWave): number {
  if (wave === 'supersaw') return 0.44;
  if (wave === 'square') return 0.52;
  if (wave === 'sawtooth') return 0.54;
  if (wave === 'triangle') return 0.9;
  return 1.0;
}

export function toggleStepInGrid(grid: StepGrid, partId: PartId, stepIndex: number): StepGrid {
  if (stepIndex < 0 || stepIndex >= STEP_COUNT) {
    return grid;
  }
  const nextRow = [...grid[partId]];
  nextRow[stepIndex] = !nextRow[stepIndex];
  return {
    ...grid,
    [partId]: nextRow,
  };
}

export function setStepRatchetInGrid(
  ratchets: RatchetGrid,
  partId: PartId,
  stepIndex: number,
  ratchet: number
): RatchetGrid {
  if (stepIndex < 0 || stepIndex >= STEP_COUNT) {
    return ratchets;
  }
  const nextRow = [...ratchets[partId]];
  nextRow[stepIndex] = clampRatchetCount(ratchet);
  return {
    ...ratchets,
    [partId]: nextRow,
  };
}

export function clearPartInGrid(grid: StepGrid, partId: PartId): StepGrid {
  return {
    ...grid,
    [partId]: Array(STEP_COUNT).fill(false),
  };
}

export function clearPartRatchets(ratchets: RatchetGrid, partId: PartId): RatchetGrid {
  return {
    ...ratchets,
    [partId]: Array(STEP_COUNT).fill(1),
  };
}

export function clearPartConditions(
  conditions: TrigConditionGrid,
  partId: PartId
): TrigConditionGrid {
  return {
    ...conditions,
    [partId]: Array(STEP_COUNT).fill('100%'),
  };
}

export function clearPartPLocks(
  pLocks: ParameterLockGrid,
  partId: PartId
): ParameterLockGrid {
  return {
    ...pLocks,
    [partId]: Array(STEP_COUNT).fill(null),
  };
}

export function randomizePartSteps(partId: PartId, rng: () => number = Math.random): boolean[] {
  return Array.from({ length: STEP_COUNT }, (_, idx) => {
    const r = rng();
    if (partId === 'kick') {
      return idx % 4 === 0 ? r < 0.78 : r < 0.16;
    }
    if (partId === 'snare') {
      return idx % 8 === 4 ? r < 0.85 : r < 0.18;
    }
    if (partId === 'hihat') {
      return idx % 2 === 0 ? r < 0.7 : r < 0.35;
    }
    return r < 0.42;
  });
}

export function isPartAudible(
  partId: PartId,
  muted: Record<PartId, boolean>,
  soloed: Record<PartId, boolean>
): boolean {
  const anySolo = PART_ORDER.some((id) => soloed[id]);
  if (anySolo) {
    return Boolean(soloed[partId]);
  }
  return !muted[partId];
}

export function clampParamValue(def: KnobDefinition, rawValue: number): number {
  const clamped = Math.max(def.min, Math.min(def.max, rawValue));
  const steps = Math.round((clamped - def.min) / def.step);
  const snapped = def.min + steps * def.step;
  // Avoid floating point drift like 2.7000000000000002
  const decimals = def.step < 1 ? 1 : 0;
  return Number(Math.min(def.max, Math.max(def.min, snapped)).toFixed(decimals));
}

export function formatParamValue(def: KnobDefinition, value: number): string {
  if (def.unit === 'note') {
    return midiToNoteName(value);
  }
  if (def.unit === 'x') {
    return `${value.toFixed(1)}x`;
  }
  if (def.unit === 'Q') {
    return `${value.toFixed(1)} Q`;
  }
  if (def.unit === 'Hz' && value >= 1000) {
    return `${(value / 1000).toFixed(1)}kHz`;
  }
  return `${Math.round(value)}${def.unit === '%' ? '%' : ` ${def.unit}`}`;
}

export function countActiveSteps(
  grid: StepGrid,
  partId: PartId,
  stepLimit: number = STEP_COUNT
): number {
  const limit = clampPartStepCount(stepLimit);
  return grid[partId].slice(0, limit).filter(Boolean).length;
}

export function getKnobDefinition(partId: PartId, key: string): KnobDefinition | undefined {
  return PART_DEFINITIONS[partId].knobs.find((k) => k.key === key);
}
