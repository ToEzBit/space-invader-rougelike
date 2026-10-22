import { TRANS_AM, type TransAm } from '../core/transAm';
import { onAudio } from './context';
import { lowpassMusic } from './music';
import { seededNoise } from './synth';
import { humAt, tickHz, ticksCrossed, TRANS_AM_SOUND, type HumPoint, type Layer } from './transAmLayers';

export type Rig = {
  ctx: BaseAudioContext;
  buses: Record<Layer, AudioNode>;
  now: () => number;
  muffle: (hz: number | null, sec: number) => void;
};

type Chain = { sources: AudioScheduledSourceNode[]; nodes: AudioNode[] };
type Hum = Chain & { saws: { osc: OscillatorNode; ratio: number }[]; lowpass: BiquadFilterNode; lfo: OscillatorNode; fade: GainNode };

type State = { kind: 'idle' } | { kind: 'live'; hum: Hum; msLeft: number; volleys: number } | { kind: 'stageOver' };

const ATTACK_SEC = 0.004;
const SILENT = 0.001;

const live: Record<Layer, number> = { release: 0, hum: 0, shot: 0, tick: 0 };
let heard = { releases: 0, humFromMs: null as number | null, ticksAtMsLeft: [] as number[], shots: 0 };
let gameRig: Rig | null = null;

// The layers bypass the music bus, so muting the music with M leaves TRANS-AM audible.
onAudio((ctx) => {
  gameRig = { ctx, buses: layerBuses(ctx, ctx.destination), now: () => ctx.currentTime, muffle: lowpassMusic };
});

export function layerBuses(ctx: BaseAudioContext, out: AudioNode): Record<Layer, GainNode> {
  const bus = (layer: Layer) => gainNode(ctx, TRANS_AM_SOUND.level[layer], out);
  return { release: bus('release'), hum: bus('hum'), shot: bus('shot'), tick: bus('tick') };
}

export function gameBuses(): Record<Layer, AudioNode> | null {
  return gameRig?.buses ?? null;
}

export function transAmSoundState(): Record<string, unknown> {
  return { live: { ...live }, ...heard, ticksAtMsLeft: [...heard.ticksAtMsLeft] };
}

export class TransAmSound {
  private state: State = { kind: 'idle' };

  constructor(private readonly rig: () => Rig | null = () => gameRig) {}

  release(volleys: number): void {
    const rig = this.rig();
    if (!rig || this.state.kind !== 'idle') return;
    const at = rig.now();
    disconnectWhenEnded('release', releaseHit(rig.ctx, rig.buses.release, at));
    const hum = startHum(rig.ctx, rig.buses.hum, at);
    disconnectWhenEnded('hum', hum);
    rig.muffle(TRANS_AM_SOUND.muffle.cutoffHz, TRANS_AM_SOUND.muffle.downSec);
    this.state = { kind: 'live', hum, msLeft: TRANS_AM.activeMs, volleys };
    heard = { releases: heard.releases + 1, humFromMs: at * 1000, ticksAtMsLeft: [], shots: 0 };
  }

  update(t: TransAm, volleys: number): void {
    const rig = this.rig();
    const s = this.state;
    if (!rig || s.kind !== 'live' || t.kind !== 'active') return;
    const at = rig.now();
    steerHum(s.hum, humAt(TRANS_AM.activeMs - t.msLeft), at);
    for (const i of ticksCrossed(s.msLeft, t.msLeft)) {
      disconnectWhenEnded('tick', tone(rig.ctx, rig.buses.tick, 'triangle', { from: tickHz(i), to: tickHz(i) }, TRANS_AM_SOUND.tick.sec, 1, at));
      heard.ticksAtMsLeft.push(t.msLeft);
    }
    if (volleys > s.volleys) {
      disconnectWhenEnded('shot', tone(rig.ctx, rig.buses.shot, 'triangle', TRANS_AM_SOUND.shot.hz, TRANS_AM_SOUND.shot.sec, 1, at));
      heard.shots++;
    }
    s.msLeft = t.msLeft;
    s.volleys = volleys;
  }

  endActive(): void {
    this.stop();
    if (this.state.kind === 'live') this.state = { kind: 'idle' };
  }

  // World keeps ticking TRANS-AM through the stage's outro, so nothing may start again after this.
  endStage(): void {
    this.stop();
    this.state = { kind: 'stageOver' };
  }

  private stop(): void {
    const rig = this.rig();
    if (!rig || this.state.kind !== 'live') return;
    const at = rig.now();
    const fade = this.state.hum.fade.gain;
    fade.cancelAndHoldAtTime(at);
    fade.linearRampToValueAtTime(0, at + TRANS_AM_SOUND.hum.fadeOutSec);
    for (const s of this.state.hum.sources) s.stop(at + TRANS_AM_SOUND.hum.fadeOutSec);
    rig.muffle(null, TRANS_AM_SOUND.muffle.upSec);
  }
}

function disconnectWhenEnded(layer: Layer, chain: Chain): void {
  live[layer]++;
  let playing = chain.sources.length;
  for (const s of chain.sources)
    s.onended = () => {
      if (--playing > 0) return;
      for (const n of chain.nodes) n.disconnect();
      live[layer]--;
    };
}

function gainNode(ctx: BaseAudioContext, value: number, out: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(out);
  return g;
}

function tone(ctx: BaseAudioContext, out: AudioNode, wave: OscillatorType, hz: { from: number; to: number }, sec: number, gain: number, at: number): Chain {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(hz.from, at);
  osc.frequency.exponentialRampToValueAtTime(hz.to, at + sec);
  const env = gainNode(ctx, 0, out);
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + ATTACK_SEC);
  env.gain.exponentialRampToValueAtTime(gain * SILENT, at + sec);
  osc.connect(env);
  osc.start(at);
  osc.stop(at + sec);
  return { sources: [osc], nodes: [osc, env] };
}

function releaseHit(ctx: BaseAudioContext, out: AudioNode, at: number): Chain {
  const { thump, punch, whoosh } = TRANS_AM_SOUND.release;
  const parts = [tone(ctx, out, 'sine', thump.hz, thump.sec, 1, at), tone(ctx, out, 'triangle', punch.hz, punch.sec, punch.gain, at)];
  const noise = ctx.createBufferSource();
  noise.buffer = seededNoise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = whoosh.q;
  band.frequency.setValueAtTime(whoosh.hz.from, at);
  band.frequency.exponentialRampToValueAtTime(whoosh.hz.to, at + whoosh.sec);
  const env = gainNode(ctx, 0, out);
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(whoosh.gain, at + ATTACK_SEC * 4);
  env.gain.exponentialRampToValueAtTime(whoosh.gain * SILENT, at + whoosh.sec);
  noise.connect(band).connect(env);
  noise.start(at);
  noise.stop(at + whoosh.sec);
  return { sources: [...parts.flatMap((p) => p.sources), noise], nodes: [...parts.flatMap((p) => p.nodes), noise, band, env] };
}

function startHum(ctx: BaseAudioContext, out: AudioNode, at: number): Hum {
  const { q, tremoloDepth } = TRANS_AM_SOUND.hum;
  const p = humAt(0);
  const fade = gainNode(ctx, 0, out);
  fade.gain.setValueAtTime(0, at);
  const tremolo = gainNode(ctx, 1 - tremoloDepth / 2, fade);
  const depth = ctx.createGain();
  depth.gain.value = tremoloDepth / 2;
  depth.connect(tremolo.gain);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = p.tremoloHz;
  lfo.connect(depth);
  const lowpass = ctx.createBiquadFilter();
  lowpass.frequency.value = p.cutoffHz;
  lowpass.Q.value = q;
  lowpass.connect(tremolo);
  const saws = TRANS_AM_SOUND.hum.saws.map(({ ratio, cents }) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = p.hz * ratio;
    osc.detune.value = cents;
    osc.connect(lowpass);
    return { osc, ratio };
  });
  const sources = [...saws.map((s) => s.osc), lfo];
  for (const s of sources) s.start(at);
  return { sources, nodes: [...sources, depth, lowpass, tremolo, fade], saws, lowpass, lfo, fade };
}

function steerHum(hum: Hum, p: HumPoint, at: number): void {
  const { frameSmoothSec } = TRANS_AM_SOUND.hum;
  for (const { osc, ratio } of hum.saws) osc.frequency.setTargetAtTime(p.hz * ratio, at, frameSmoothSec);
  hum.lowpass.frequency.setTargetAtTime(p.cutoffHz, at, frameSmoothSec);
  hum.lfo.frequency.setTargetAtTime(p.tremoloHz, at, frameSmoothSec);
  hum.fade.gain.setTargetAtTime(p.gain, at, frameSmoothSec);
}
