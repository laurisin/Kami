export type PartId = 'kick' | 'snare' | 'hihat' | 'fmsynth';

export type KickSubMode = 'deep' | 'punch' | 'overdrive';
export type SnareWireTone = 'tight' | 'crisp' | 'trash';
export type HatMode = 'closed' | 'open' | 'sizzle';
export type FmCarrierWave = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'supersaw';

export interface KnobDefinition {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: 'Hz' | 'ms' | '%' | 'x' | 'Q' | 'note';
}

export interface ModeOption<T extends string = string> {
  value: T;
  label: string;
}

export interface PartDefinition {
  id: PartId;
  name: string;
  shortName: string;
  engineLabel: string;
  accentHex: string;
  knobs: KnobDefinition[];
  modeLabel: string;
  modeKey: string;
  modeOptions: ModeOption[];
  defaultMode: string;
}

export interface PartParams {
  [key: string]: number | string;
}

export type AllPartParams = Record<PartId, PartParams>;

export const PART_ORDER: PartId[] = ['kick', 'snare', 'hihat', 'fmsynth'];

export const STEP_COUNT = 16;

export const DEFAULT_MIXER_LEVELS: Record<PartId, number> = {
  kick: 90,
  snare: 85,
  hihat: 80,
  fmsynth: 82,
};

export type DistortionMode = 'tape' | 'fuzz' | 'fold';

export interface MasterFxParams {
  scPump: number; // 0..100 % kick sidechain ducking
  compThresh: number; // -42..0 dB
  compRatio: number; // 1..20 :1
  compRelease: number; // 40..600 ms
  distDrive: number; // 0..100 %
  distMode: DistortionMode;
  distTone: number; // 1200..14000 Hz
  makeupGain: number; // -6..12 dB
}

export const DEFAULT_MASTER_FX: MasterFxParams = {
  scPump: 48,
  compThresh: -18,
  compRatio: 8,
  compRelease: 165,
  distDrive: 22,
  distMode: 'tape',
  distTone: 9800,
  makeupGain: 2,
};

export interface MasterKnobDefinition {
  key: keyof Omit<MasterFxParams, 'distMode'>;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: 'dB' | 'ms' | '%' | 'Hz' | ':1';
}

export const MASTER_FX_KNOBS: MasterKnobDefinition[] = [
  { key: 'scPump', label: 'SC Pump', min: 0, max: 100, step: 1, defaultValue: 48, unit: '%' },
  { key: 'compThresh', label: 'Thresh', min: -42, max: 0, step: 1, defaultValue: -18, unit: 'dB' },
  { key: 'compRelease', label: 'Release', min: 40, max: 600, step: 5, defaultValue: 165, unit: 'ms' },
  { key: 'distDrive', label: 'Crunch', min: 0, max: 100, step: 1, defaultValue: 22, unit: '%' },
  { key: 'distTone', label: 'Tone', min: 1200, max: 14000, step: 100, defaultValue: 9800, unit: 'Hz' },
  { key: 'makeupGain', label: 'Makeup', min: -6, max: 12, step: 1, defaultValue: 2, unit: 'dB' },
];

export const DISTORTION_MODES: ModeOption<DistortionMode>[] = [
  { value: 'tape', label: 'Tape' },
  { value: 'fuzz', label: 'Fuzz' },
  { value: 'fold', label: 'Fold' },
];

export const PART_DEFINITIONS: Record<PartId, PartDefinition> = {
  kick: {
    id: 'kick',
    name: 'Bass Drum',
    shortName: 'BD',
    engineLabel: 'Analog Sub + Waveshaper',
    accentHex: '#ffff55',
    modeLabel: 'Sub Drive',
    modeKey: 'subMode',
    defaultMode: 'deep',
    modeOptions: [
      { value: 'deep', label: 'Deep Sub' },
      { value: 'punch', label: 'Punch' },
      { value: 'overdrive', label: 'Overdrive' },
    ],
    knobs: [
      { key: 'pitch', label: 'Pitch', min: 34, max: 80, step: 1, defaultValue: 46, unit: 'Hz' },
      { key: 'sweep', label: 'Sweep', min: 80, max: 520, step: 5, defaultValue: 280, unit: 'Hz' },
      { key: 'decay', label: 'Decay', min: 90, max: 850, step: 10, defaultValue: 410, unit: 'ms' },
      { key: 'drive', label: 'Fatness', min: 0, max: 100, step: 1, defaultValue: 68, unit: '%' },
      { key: 'click', label: 'Beater', min: 0, max: 100, step: 1, defaultValue: 42, unit: '%' },
      { key: 'level', label: 'Level', min: 0, max: 100, step: 1, defaultValue: 92, unit: '%' },
    ],
  },
  snare: {
    id: 'snare',
    name: 'FM Snare',
    shortName: 'SD',
    engineLabel: '2-Op FM Drum + Noise Wires',
    accentHex: '#ff5555',
    modeLabel: 'Wire Tone',
    modeKey: 'wireTone',
    defaultMode: 'crisp',
    modeOptions: [
      { value: 'tight', label: 'Tight' },
      { value: 'crisp', label: 'Crisp' },
      { value: 'trash', label: 'Trash' },
    ],
    knobs: [
      { key: 'pitch', label: 'Pitch', min: 110, max: 300, step: 2, defaultValue: 182, unit: 'Hz' },
      { key: 'fmDepth', label: 'FM Depth', min: 0, max: 100, step: 1, defaultValue: 66, unit: '%' },
      { key: 'ratio', label: 'Ratio', min: 0.5, max: 7.5, step: 0.1, defaultValue: 2.7, unit: 'x' },
      { key: 'snappy', label: 'Snappy', min: 0, max: 100, step: 1, defaultValue: 64, unit: '%' },
      { key: 'decay', label: 'Decay', min: 60, max: 480, step: 5, defaultValue: 195, unit: 'ms' },
      { key: 'level', label: 'Level', min: 0, max: 100, step: 1, defaultValue: 82, unit: '%' },
    ],
  },
  hihat: {
    id: 'hihat',
    name: 'Hi-Hat',
    shortName: 'HH',
    engineLabel: '6-Osc Metallic + Resonant Filter',
    accentHex: '#55ffff',
    modeLabel: 'Hat Mode',
    modeKey: 'hatMode',
    defaultMode: 'closed',
    modeOptions: [
      { value: 'closed', label: 'Closed' },
      { value: 'open', label: 'Open' },
      { value: 'sizzle', label: 'Sizzle' },
    ],
    knobs: [
      { key: 'pitch', label: 'Grain', min: 50, max: 200, step: 2, defaultValue: 106, unit: '%' },
      { key: 'metallic', label: 'Metallic', min: 0, max: 100, step: 1, defaultValue: 74, unit: '%' },
      { key: 'cutoff', label: 'Cutoff', min: 2200, max: 13000, step: 100, defaultValue: 7200, unit: 'Hz' },
      { key: 'resonance', label: 'Reso', min: 0.5, max: 12, step: 0.1, defaultValue: 3.4, unit: 'Q' },
      { key: 'decay', label: 'Decay', min: 25, max: 620, step: 5, defaultValue: 85, unit: 'ms' },
      { key: 'level', label: 'Level', min: 0, max: 100, step: 1, defaultValue: 74, unit: '%' },
    ],
  },
  fmsynth: {
    id: 'fmsynth',
    name: 'FM Synth',
    shortName: 'FM',
    engineLabel: '2-Op Harmonic FM Voice',
    accentHex: '#55ff55',
    modeLabel: 'Carrier',
    modeKey: 'carrierWave',
    defaultMode: 'triangle',
    modeOptions: [
      { value: 'sine', label: 'Sine' },
      { value: 'triangle', label: 'Tri' },
      { value: 'sawtooth', label: 'Saw' },
      { value: 'square', label: 'Sqr' },
      { value: 'supersaw', label: 'Supersaw' },
    ],
    knobs: [
      { key: 'pitch', label: 'Root', min: 36, max: 72, step: 1, defaultValue: 48, unit: 'note' },
      { key: 'ratio', label: 'Ratio', min: 0.5, max: 8, step: 0.5, defaultValue: 2.0, unit: 'x' },
      { key: 'fmIndex', label: 'Mod Index', min: 0, max: 100, step: 1, defaultValue: 58, unit: '%' },
      { key: 'modEnv', label: 'Mod Env', min: 20, max: 500, step: 5, defaultValue: 145, unit: 'ms' },
      { key: 'drive', label: 'Drive', min: 0, max: 100, step: 1, defaultValue: 0, unit: '%' },
      { key: 'decay', label: 'Decay', min: 60, max: 950, step: 10, defaultValue: 260, unit: 'ms' },
      { key: 'level', label: 'Level', min: 0, max: 100, step: 1, defaultValue: 78, unit: '%' },
    ],
  },
};

export function createDefaultParams(): AllPartParams {
  const result = {} as AllPartParams;
  for (const partId of PART_ORDER) {
    const def = PART_DEFINITIONS[partId];
    const params: PartParams = {
      [def.modeKey]: def.defaultMode,
    };
    for (const knob of def.knobs) {
      params[knob.key] = knob.defaultValue;
    }
    result[partId] = params;
  }
  return result;
}

export interface GroovePreset {
  id: string;
  label: string;
  bpm: number;
  swing: number;
  steps: Record<PartId, boolean[]>;
  fmNotes: number[];
}

export const STARTER_GROOVES: GroovePreset[] = [
  {
    id: 'detroit',
    label: 'Detroit 4x4',
    bpm: 124,
    swing: 12,
    steps: {
      kick:    [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, true],
      snare:   [false, false, false, false, true, false, false, true, false, false, false, false, true, false, false, false],
      hihat:   [true, false, true, false, true, false, true, true, true, false, true, false, true, false, true, false],
      fmsynth: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, true, false],
    },
    fmNotes: [36, 36, 43, 39, 36, 36, 43, 46, 36, 48, 43, 39, 41, 43, 46, 48],
  },
  {
    id: 'electro',
    label: 'Electro Break',
    bpm: 132,
    swing: 18,
    steps: {
      kick:    [true, false, false, true, false, false, true, false, false, false, true, false, false, true, false, false],
      snare:   [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, true],
      hihat:   [true, true, true, false, true, true, true, false, true, true, true, false, true, true, true, true],
      fmsynth: [true, false, true, false, false, true, false, true, true, false, false, true, false, true, false, true],
    },
    fmNotes: [40, 40, 47, 43, 40, 52, 47, 45, 40, 43, 47, 50, 43, 47, 52, 55],
  },
  {
    id: 'acidfm',
    label: 'Sub & FM Arp',
    bpm: 128,
    swing: 8,
    steps: {
      kick:    [true, false, false, false, true, false, false, false, true, false, false, true, true, false, false, false],
      snare:   [false, false, false, false, true, false, false, false, false, false, false, false, true, false, true, false],
      hihat:   [false, false, true, false, false, false, true, false, false, false, true, false, false, true, true, false],
      fmsynth: [true, true, false, true, true, false, true, false, true, true, false, true, true, false, true, true],
    },
    fmNotes: [38, 50, 45, 41, 38, 50, 48, 45, 38, 50, 45, 53, 50, 45, 48, 57],
  },
];
