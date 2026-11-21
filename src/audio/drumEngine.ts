import {
  calculateDuckMinGain,
  computeDistortionSample,
  dbToGain,
  getFmCarrierGainCompensation,
  midiToFreq,
} from './sequencerLogic';
import {
  DEFAULT_MASTER_FX,
  DEFAULT_MIXER_LEVELS,
  DistortionMode,
  FmCarrierWave,
  HatMode,
  KickSubMode,
  MasterFxParams,
  PartId,
  PartParams,
  SnareWireTone,
} from './synthConfig';

const SUPERSAW_DETUNE_CENTS = [-22, -10, 0, 10, 22];

export class VolcaDrumEngine {
  private ctx: AudioContext | null = null;
  private channelGains: Record<PartId, GainNode> | null = null;
  private duckBus: GainNode | null = null;
  private masterMixBus: GainNode | null = null;
  private distShaper: WaveShaperNode | null = null;
  private toneFilter: BiquadFilterNode | null = null;
  private pumpCompressor: DynamicsCompressorNode | null = null;
  private makeupNode: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private safetyLimiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private masterVolume = 0.85;
  private mixerLevels: Record<PartId, number> = { ...DEFAULT_MIXER_LEVELS };
  private masterFx: MasterFxParams = { ...DEFAULT_MASTER_FX };
  private distortionCurveCache = new Map<number, Float32Array<ArrayBuffer>>();
  private masterCurveCache = new Map<string, Float32Array<ArrayBuffer>>();

  private getCachedDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const key = Math.round(Math.max(0, Math.min(1, amount)) * 100);
    const hit = this.distortionCurveCache.get(key);
    if (hit) return hit;

    const samples = 1024;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    const drive = 1 + (key / 100) * 14;
    const norm = Math.tanh(drive);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * drive) / norm;
    }
    this.distortionCurveCache.set(key, curve);
    return curve;
  }

  private getCachedMasterDistortionCurve(
    drivePercent: number,
    mode: DistortionMode
  ): Float32Array<ArrayBuffer> {
    const quantizedDrive = Math.round(Math.max(0, Math.min(100, drivePercent)));
    const key = `${mode}:${quantizedDrive}`;
    const hit = this.masterCurveCache.get(key);
    if (hit) return hit;

    const samples = 1024;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = computeDistortionSample(x, quantizedDrive, mode);
    }
    this.masterCurveCache.set(key, curve);
    return curve;
  }

  public ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      this.duckBus = this.ctx.createGain();
      this.duckBus.gain.value = 1.0;

      this.masterMixBus = this.ctx.createGain();
      this.masterMixBus.gain.value = 1.0;

      this.channelGains = {
        kick: this.ctx.createGain(),
        snare: this.ctx.createGain(),
        hihat: this.ctx.createGain(),
        fmsynth: this.ctx.createGain(),
      };
      this.channelGains.kick.gain.value = this.mixerLevels.kick / 100;
      this.channelGains.snare.gain.value = this.mixerLevels.snare / 100;
      this.channelGains.hihat.gain.value = this.mixerLevels.hihat / 100;
      this.channelGains.fmsynth.gain.value = this.mixerLevels.fmsynth / 100;

      this.distShaper = this.ctx.createWaveShaper();
      this.distShaper.oversample = '2x';
      this.distShaper.curve = this.getCachedMasterDistortionCurve(
        this.masterFx.distDrive,
        this.masterFx.distMode
      );

      this.toneFilter = this.ctx.createBiquadFilter();
      this.toneFilter.type = 'lowpass';
      this.toneFilter.frequency.value = this.masterFx.distTone;
      this.toneFilter.Q.value = 0.7;

      this.pumpCompressor = this.ctx.createDynamicsCompressor();
      this.pumpCompressor.threshold.value = this.masterFx.compThresh;
      this.pumpCompressor.knee.value = 5;
      this.pumpCompressor.ratio.value = this.masterFx.compRatio;
      this.pumpCompressor.attack.value = 0.003;
      this.pumpCompressor.release.value = this.masterFx.compRelease / 1000;

      this.makeupNode = this.ctx.createGain();
      this.makeupNode.gain.value = dbToGain(this.masterFx.makeupGain);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;

      this.safetyLimiter = this.ctx.createDynamicsCompressor();
      this.safetyLimiter.threshold.value = -1.5;
      this.safetyLimiter.knee.value = 0;
      this.safetyLimiter.ratio.value = 20;
      this.safetyLimiter.attack.value = 0.001;
      this.safetyLimiter.release.value = 0.06;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;

      // Signal Chain:
      // [snare/hihat/fmsynth] -> channelGain -> duckBus -> masterMixBus
      // [kick] -> channelGain -> masterMixBus
      // masterMixBus -> distShaper -> toneFilter -> pumpCompressor -> makeupNode -> masterGain -> safetyLimiter -> analyser -> out
      this.channelGains.kick.connect(this.masterMixBus);
      this.channelGains.snare.connect(this.duckBus);
      this.channelGains.hihat.connect(this.duckBus);
      this.channelGains.fmsynth.connect(this.duckBus);
      this.duckBus.connect(this.masterMixBus);
      this.masterMixBus.connect(this.distShaper);
      this.distShaper.connect(this.toneFilter);
      this.toneFilter.connect(this.pumpCompressor);
      this.pumpCompressor.connect(this.makeupNode);
      this.makeupNode.connect(this.masterGain);
      this.masterGain.connect(this.safetyLimiter);
      this.safetyLimiter.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return this.ctx;
  }

  public getCurrentTime(): number {
    return this.ensureContext().currentTime;
  }

  public setMasterVolume(volumePercent: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volumePercent / 100));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.015);
    }
  }

  public setChannelVolume(partId: PartId, volumePercent: number): void {
    const clamped = Math.max(0, Math.min(100, volumePercent));
    this.mixerLevels[partId] = clamped;
    if (this.channelGains && this.ctx) {
      this.channelGains[partId].gain.setTargetAtTime(
        clamped / 100,
        this.ctx.currentTime,
        0.012
      );
    }
  }

  public setAllChannelVolumes(levels: Record<PartId, number>): void {
    this.setChannelVolume('kick', levels.kick);
    this.setChannelVolume('snare', levels.snare);
    this.setChannelVolume('hihat', levels.hihat);
    this.setChannelVolume('fmsynth', levels.fmsynth);
  }

  public setMasterFx(nextFx: MasterFxParams): void {
    const modeChanged =
      nextFx.distMode !== this.masterFx.distMode ||
      nextFx.distDrive !== this.masterFx.distDrive;
    this.masterFx = { ...nextFx };

    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (modeChanged && this.distShaper) {
      this.distShaper.curve = this.getCachedMasterDistortionCurve(
        nextFx.distDrive,
        nextFx.distMode
      );
    }
    if (this.toneFilter) {
      this.toneFilter.frequency.setTargetAtTime(nextFx.distTone, now, 0.015);
    }
    if (this.pumpCompressor) {
      this.pumpCompressor.threshold.setTargetAtTime(nextFx.compThresh, now, 0.015);
      this.pumpCompressor.ratio.setTargetAtTime(nextFx.compRatio, now, 0.015);
      this.pumpCompressor.release.setTargetAtTime(nextFx.compRelease / 1000, now, 0.015);
    }
    if (this.makeupNode) {
      this.makeupNode.gain.setTargetAtTime(dbToGain(nextFx.makeupGain), now, 0.015);
    }
  }

  public getCompressionReductionDb(): number {
    if (!this.pumpCompressor) return 0;
    return Math.abs(this.pumpCompressor.reduction || 0);
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public triggerPart(
    partId: PartId,
    params: PartParams,
    time?: number,
    fmMidiNote?: number
  ): void {
    const ctx = this.ensureContext();
    const when = Math.max(ctx.currentTime + 0.002, time ?? ctx.currentTime + 0.005);

    switch (partId) {
      case 'kick':
        this.triggerBassDrum(ctx, when, params);
        this.triggerSidechainPump(when);
        break;
      case 'snare':
        this.triggerFmSnare(ctx, when, params);
        break;
      case 'hihat':
        this.triggerHiHat(ctx, when, params);
        break;
      case 'fmsynth':
        this.triggerFmSynth(ctx, when, params, fmMidiNote);
        break;
    }
  }

  private triggerSidechainPump(time: number): void {
    if (!this.duckBus || this.masterFx.scPump <= 0.5) return;
    const minGain = calculateDuckMinGain(this.masterFx.scPump);
    const releaseSec = Math.max(0.04, this.masterFx.compRelease / 1000);
    const g = this.duckBus.gain;

    g.cancelScheduledValues(time);
    g.setValueAtTime(1.0, time);
    g.linearRampToValueAtTime(minGain, time + 0.004);
    g.exponentialRampToValueAtTime(1.0, time + releaseSec);
  }

  private triggerBassDrum(ctx: AudioContext, time: number, params: PartParams): void {
    const kickOut = this.channelGains?.kick;
    if (!kickOut) return;

    const pitch = Number(params.pitch ?? 46);
    const sweep = Number(params.sweep ?? 280);
    const decaySec = Number(params.decay ?? 410) / 1000;
    const drive = Number(params.drive ?? 68) / 100;
    const clickAmt = Number(params.click ?? 42) / 100;
    const level = Number(params.level ?? 92) / 100;
    const subMode = (params.subMode as KickSubMode) ?? 'deep';

    const sweepTime = subMode === 'punch' ? 0.036 : subMode === 'overdrive' ? 0.048 : 0.062;
    const modeDrive =
      subMode === 'overdrive' ? Math.min(1, drive + 0.32) : subMode === 'punch' ? drive * 0.85 : drive;
    const subBoostDb = subMode === 'deep' ? 7.5 : subMode === 'punch' ? 4.0 : 5.5;

    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(pitch + sweep, time);
    bodyOsc.frequency.exponentialRampToValueAtTime(Math.max(24, pitch * 1.15), time + sweepTime);
    bodyOsc.frequency.exponentialRampToValueAtTime(Math.max(22, pitch), time + decaySec * 0.65);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, time);
    bodyGain.gain.linearRampToValueAtTime(1.0, time + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, time + decaySec);

    const subOsc = ctx.createOscillator();
    subOsc.type = subMode === 'overdrive' ? 'triangle' : 'sine';
    subOsc.frequency.setValueAtTime(Math.max(28, pitch * 0.98), time);
    subOsc.frequency.exponentialRampToValueAtTime(Math.max(24, pitch * 0.88), time + decaySec);

    const subGain = ctx.createGain();
    const subMix = subMode === 'deep' ? 0.55 : subMode === 'punch' ? 0.35 : 0.45;
    subGain.gain.setValueAtTime(0.0001, time);
    subGain.gain.linearRampToValueAtTime(subMix, time + 0.008);
    subGain.gain.exponentialRampToValueAtTime(0.0008, time + decaySec * 1.08);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.getCachedDistortionCurve(modeDrive * 0.72);
    shaper.oversample = '2x';

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.setValueAtTime(82, time);
    lowShelf.gain.setValueAtTime(subBoostDb, time);

    const outGain = ctx.createGain();
    outGain.gain.setValueAtTime(level * 1.05, time);

    bodyOsc.connect(bodyGain);
    subOsc.connect(subGain);
    bodyGain.connect(shaper);
    subGain.connect(shaper);
    shaper.connect(lowShelf);
    lowShelf.connect(outGain);
    outGain.connect(kickOut);

    bodyOsc.start(time);
    subOsc.start(time);
    bodyOsc.stop(time + decaySec + 0.05);
    subOsc.stop(time + decaySec * 1.1 + 0.05);

    if (clickAmt > 0.02 && this.noiseBuffer) {
      const clickNoise = ctx.createBufferSource();
      clickNoise.buffer = this.noiseBuffer;

      const clickFilter = ctx.createBiquadFilter();
      clickFilter.type = 'bandpass';
      clickFilter.frequency.setValueAtTime(subMode === 'punch' ? 2400 : 1650, time);
      clickFilter.Q.setValueAtTime(1.6, time);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(clickAmt * 0.45 * level, time);
      clickGain.gain.exponentialRampToValueAtTime(0.0008, time + 0.016);

      clickNoise.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(kickOut);

      clickNoise.start(time);
      clickNoise.stop(time + 0.024);
    }
  }

  private triggerFmSnare(ctx: AudioContext, time: number, params: PartParams): void {
    const snareOut = this.channelGains?.snare;
    if (!snareOut) return;

    const pitch = Number(params.pitch ?? 182);
    const fmDepth = Number(params.fmDepth ?? 66) / 100;
    const ratio = Number(params.ratio ?? 2.7);
    const snappy = Number(params.snappy ?? 64) / 100;
    const decaySec = Number(params.decay ?? 195) / 1000;
    const level = Number(params.level ?? 82) / 100;
    const wireTone = (params.wireTone as SnareWireTone) ?? 'crisp';

    const carrier = ctx.createOscillator();
    carrier.type = 'triangle';
    carrier.frequency.setValueAtTime(pitch * 1.85, time);
    carrier.frequency.exponentialRampToValueAtTime(pitch, time + 0.032);

    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(pitch * ratio, time);

    const modGain = ctx.createGain();
    const maxIndexHz = pitch * fmDepth * 4.8;
    modGain.gain.setValueAtTime(Math.max(1, maxIndexHz), time);
    modGain.gain.exponentialRampToValueAtTime(1, time + Math.min(decaySec * 0.75, 0.14));

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, time);
    bodyGain.gain.linearRampToValueAtTime(0.75 * level, time + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, time + decaySec * 0.85);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(bodyGain);
    bodyGain.connect(snareOut);

    carrier.start(time);
    modulator.start(time);
    carrier.stop(time + decaySec + 0.04);
    modulator.stop(time + decaySec + 0.04);

    if (snappy > 0.02 && this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(
        wireTone === 'tight' ? 1800 : wireTone === 'crisp' ? 1200 : 750,
        time
      );

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(
        wireTone === 'tight' ? 3100 : wireTone === 'crisp' ? 4200 : 1950,
        time
      );
      bp.Q.setValueAtTime(wireTone === 'trash' ? 1.8 : 0.9, time);

      const noiseGain = ctx.createGain();
      const wireDecay = wireTone === 'tight' ? decaySec * 0.75 : decaySec * 1.1;
      noiseGain.gain.setValueAtTime(0.0001, time);
      noiseGain.gain.linearRampToValueAtTime(snappy * 0.85 * level, time + 0.002);
      noiseGain.gain.exponentialRampToValueAtTime(0.0008, time + wireDecay);

      noise.connect(hp);
      hp.connect(bp);

      if (wireTone === 'trash') {
        const trashClip = ctx.createWaveShaper();
        trashClip.curve = this.getCachedDistortionCurve(0.55);
        bp.connect(trashClip);
        trashClip.connect(noiseGain);
      } else {
        bp.connect(noiseGain);
      }

      noiseGain.connect(snareOut);
      noise.start(time);
      noise.stop(time + wireDecay + 0.04);
    }
  }

  private triggerHiHat(ctx: AudioContext, time: number, params: PartParams): void {
    const hihatOut = this.channelGains?.hihat;
    if (!hihatOut) return;

    const pitchScale = Number(params.pitch ?? 106) / 100;
    const metallicAmt = Number(params.metallic ?? 74) / 100;
    const cutoff = Number(params.cutoff ?? 7200);
    const resonance = Number(params.resonance ?? 3.4);
    const baseDecaySec = Number(params.decay ?? 85) / 1000;
    const level = Number(params.level ?? 74) / 100;
    const hatMode = (params.hatMode as HatMode) ?? 'closed';

    const decaySec =
      hatMode === 'closed'
        ? Math.min(0.16, baseDecaySec * 0.75)
        : hatMode === 'open'
        ? Math.max(0.22, baseDecaySec * 1.45)
        : Math.max(0.14, baseDecaySec * 1.2);

    const masterHatGain = ctx.createGain();
    masterHatGain.gain.setValueAtTime(0.0001, time);
    masterHatGain.gain.linearRampToValueAtTime(level * 0.62, time + 0.002);
    if (hatMode === 'sizzle') {
      masterHatGain.gain.exponentialRampToValueAtTime(level * 0.18, time + decaySec * 0.35);
      masterHatGain.gain.exponentialRampToValueAtTime(0.0008, time + decaySec);
    } else {
      masterHatGain.gain.exponentialRampToValueAtTime(0.0008, time + decaySec);
    }

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(cutoff, time);
    hp.Q.setValueAtTime(resonance * 0.45, time);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(Math.min(15500, cutoff * 1.35), time);
    bp.Q.setValueAtTime(resonance * 0.35, time);

    hp.connect(bp);
    bp.connect(masterHatGain);
    masterHatGain.connect(hihatOut);

    const ratios = [205.3, 304.8, 369.6, 522.7, 540.0, 800.4];
    const clusterGain = ctx.createGain();
    clusterGain.gain.setValueAtTime(metallicAmt * 0.34, time);
    clusterGain.connect(hp);

    ratios.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq * pitchScale, time);
      osc.connect(clusterGain);
      osc.start(time);
      osc.stop(time + decaySec + 0.03);
    });

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const noiseGain = ctx.createGain();
      const noiseMix = Math.max(0.18, 1 - metallicAmt * 0.65);
      noiseGain.gain.setValueAtTime(noiseMix * 0.7, time);

      noise.connect(noiseGain);
      noiseGain.connect(hp);
      noise.start(time);
      noise.stop(time + decaySec + 0.03);
    }
  }

  private triggerFmSynth(
    ctx: AudioContext,
    time: number,
    params: PartParams,
    stepMidiNote?: number
  ): void {
    const fmOut = this.channelGains?.fmsynth;
    if (!fmOut) return;

    const rootMidi = Number(params.pitch ?? 48);
    const effectiveMidi =
      stepMidiNote !== undefined ? stepMidiNote + (rootMidi - 48) : rootMidi;
    const carrierFreq = midiToFreq(Math.max(24, Math.min(96, effectiveMidi)));

    const ratio = Number(params.ratio ?? 2.0);
    const fmIndex = Number(params.fmIndex ?? 58) / 100;
    const modEnvSec = Number(params.modEnv ?? 145) / 1000;
    const fmDrive = Number(params.drive ?? 0);
    const decaySec = Number(params.decay ?? 260) / 1000;
    const level = Number(params.level ?? 78) / 100;
    const carrierWave = (params.carrierWave as FmCarrierWave) ?? 'triangle';

    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(carrierFreq * ratio, time);

    const isBrightWave =
      carrierWave === 'sawtooth' ||
      carrierWave === 'square' ||
      carrierWave === 'supersaw';

    const modGain = ctx.createGain();
    // Tame excessive aliasing/loudness on harmonic-rich FM carriers
    const indexScale = isBrightWave ? 4.2 : 6.5;
    const peakDev = carrierFreq * fmIndex * indexScale;
    modGain.gain.setValueAtTime(Math.max(0.5, peakDev), time);
    modGain.gain.exponentialRampToValueAtTime(Math.max(0.5, peakDev * 0.08), time + modEnvSec);

    const waveGain = getFmCarrierGainCompensation(carrierWave);
    const driveTrim = fmDrive > 1 ? 1 / (1 + (fmDrive / 100) * 0.48) : 1;

    const ampGain = ctx.createGain();
    ampGain.gain.setValueAtTime(0.0001, time);
    ampGain.gain.linearRampToValueAtTime(level * 0.62 * waveGain * driveTrim, time + 0.004);
    ampGain.gain.exponentialRampToValueAtTime(0.0008, time + decaySec);

    modulator.connect(modGain);

    const carriers: OscillatorNode[] = [];
    let lastNode: AudioNode;

    if (carrierWave === 'supersaw') {
      const unisonMix = ctx.createGain();
      unisonMix.gain.setValueAtTime(1 / Math.sqrt(SUPERSAW_DETUNE_CENTS.length), time);
      for (const cents of SUPERSAW_DETUNE_CENTS) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(carrierFreq, time);
        osc.detune.setValueAtTime(cents, time);
        modGain.connect(osc.frequency);
        osc.connect(unisonMix);
        carriers.push(osc);
      }
      lastNode = unisonMix;
    } else {
      const carrier = ctx.createOscillator();
      carrier.type = carrierWave;
      carrier.frequency.setValueAtTime(carrierFreq, time);
      modGain.connect(carrier.frequency);
      carriers.push(carrier);
      lastNode = carrier;
    }

    if (isBrightWave) {
      const tameFilter = ctx.createBiquadFilter();
      tameFilter.type = 'lowpass';
      tameFilter.frequency.setValueAtTime(
        Math.min(6000, Math.max(1800, carrierFreq * 7.5)),
        time
      );
      tameFilter.Q.setValueAtTime(0.65, time);
      lastNode.connect(tameFilter);
      lastNode = tameFilter;
    }

    if (fmDrive > 1) {
      const fmShaper = ctx.createWaveShaper();
      fmShaper.oversample = '2x';
      fmShaper.curve = this.getCachedMasterDistortionCurve(fmDrive, 'tape');
      lastNode.connect(fmShaper);
      lastNode = fmShaper;
    }

    lastNode.connect(ampGain);
    ampGain.connect(fmOut);

    for (const osc of carriers) {
      osc.start(time);
      osc.stop(time + decaySec + 0.04);
    }
    modulator.start(time);
    modulator.stop(time + decaySec + 0.04);
  }
}
