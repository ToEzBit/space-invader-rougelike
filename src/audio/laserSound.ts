import { onAudio } from './context';
import { seededNoise } from './synth';

export type Rig = { ctx: BaseAudioContext; out: AudioNode; now: () => number };

export const LASER_BUZZ = {
  gain: 0.05,
  fadeInSec: 0.04,
  fadeOutSec: 0.08,
  saws: [
    { hz: 110, cents: 0 },
    { hz: 220, cents: 14 },
  ],
  cutoffHz: 1500,
  q: 5,
  tremolo: { hz: 32, depth: 0.5 },
  hiss: { hz: 3400, q: 1.4, gain: 0.5 },
} as const;

type Buzz = { sources: AudioScheduledSourceNode[]; nodes: AudioNode[]; fade: GainNode };

// stageOver refuses to start again: the beam can keep burning through the stage's outro.
type State = { kind: 'idle' } | { kind: 'live'; buzz: Buzz } | { kind: 'stageOver' };

let gameRig: Rig | null = null;
const heard = { starts: 0, stops: 0, live: 0 };

onAudio((ctx) => {
  gameRig = { ctx, out: ctx.destination, now: () => ctx.currentTime };
});

export function laserSoundState(): typeof heard {
  return { ...heard };
}

export class LaserSound {
  private state: State = { kind: 'idle' };

  constructor(private readonly rig: () => Rig | null = () => gameRig) {}

  // Called on every frame the beam burns, so a beam that outlives a stop picks its buzz up again.
  hold(): void {
    const rig = this.rig();
    if (!rig || this.state.kind !== 'idle') return;
    const buzz = startBuzz(rig.ctx, rig.out, rig.now());
    heard.starts++;
    heard.live++;
    let playing = buzz.sources.length;
    for (const s of buzz.sources)
      s.onended = () => {
        if (--playing > 0) return;
        for (const n of buzz.nodes) n.disconnect();
        heard.live--;
      };
    this.state = { kind: 'live', buzz };
  }

  stop(): void {
    this.fadeOut();
    if (this.state.kind === 'live') this.state = { kind: 'idle' };
  }

  endStage(): void {
    this.fadeOut();
    this.state = { kind: 'stageOver' };
  }

  private fadeOut(): void {
    const rig = this.rig();
    const s = this.state;
    if (!rig || s.kind !== 'live') return;
    const at = rig.now();
    const fade = s.buzz.fade.gain;
    fade.cancelAndHoldAtTime(at);
    fade.linearRampToValueAtTime(0, at + LASER_BUZZ.fadeOutSec);
    for (const source of s.buzz.sources) source.stop(at + LASER_BUZZ.fadeOutSec);
    heard.stops++;
  }
}

function startBuzz(ctx: BaseAudioContext, out: AudioNode, at: number): Buzz {
  const { gain, fadeInSec, saws, cutoffHz, q, tremolo, hiss } = LASER_BUZZ;
  const fade = ctx.createGain();
  fade.gain.value = 0;
  fade.gain.setValueAtTime(0, at);
  fade.gain.linearRampToValueAtTime(gain, at + fadeInSec);
  fade.connect(out);
  const throb = ctx.createGain();
  throb.gain.value = 1 - tremolo.depth / 2;
  throb.connect(fade);
  const depth = ctx.createGain();
  depth.gain.value = tremolo.depth / 2;
  depth.connect(throb.gain);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = tremolo.hz;
  lfo.connect(depth);
  const lowpass = ctx.createBiquadFilter();
  lowpass.frequency.value = cutoffHz;
  lowpass.Q.value = q;
  lowpass.connect(throb);
  const oscs = saws.map(({ hz, cents }) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz;
    osc.detune.value = cents;
    osc.connect(lowpass);
    return osc;
  });
  const noise = ctx.createBufferSource();
  noise.buffer = seededNoise(ctx);
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = hiss.hz;
  band.Q.value = hiss.q;
  const hissGain = ctx.createGain();
  hissGain.gain.value = hiss.gain;
  noise.connect(band).connect(hissGain).connect(throb);
  const sources = [...oscs, lfo, noise];
  for (const s of sources) s.start(at);
  return { sources, nodes: [...sources, depth, lowpass, band, hissGain, throb, fade], fade };
}
