// Per-deck SVG filter chain. Only the stages that are switched on get built,
// so a deck with all glitch effects at 0 pays no filter cost at all.
//
// Stages (in order): warp → rgb split → posterize → edges

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const ISOLATE = {
  r: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  g: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  b: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
};

export class DeckEffects {
  constructor(index, defs) {
    this.id = `fx-deck-${index}`;
    this.filter = svg('filter', {
      id: this.id,
      x: 0, y: 0, width: 1, height: 1,
      'color-interpolation-filters': 'sRGB',
    });
    defs.appendChild(this.filter);
    this.signature = null;
    this.n = {};
    this.nextJitter = 0;
  }

  static stagesFor(fx) {
    const s = [];
    if (fx.warp > 0) s.push('warp');
    if (fx.rgb > 0) s.push('rgb');
    if (fx.posterize > 0) s.push('posterize');
    if (fx.edges > 0) s.push('edges');
    return s;
  }

  /** Rebuilds the chain if the set of active stages changed; returns the CSS url() or ''. */
  sync(fx) {
    const stages = DeckEffects.stagesFor(fx);
    const sig = stages.join('|');
    if (sig !== this.signature) {
      this.build(stages);
      this.signature = sig;
    }
    this.update(fx);
    return stages.length ? `url(#${this.id})` : '';
  }

  build(stages) {
    const f = this.filter;
    f.replaceChildren();
    this.n = {};
    let input = 'SourceGraphic';

    for (const stage of stages) {
      if (stage === 'warp') {
        this.n.turb = svg('feTurbulence', {
          type: 'fractalNoise', baseFrequency: '0.006 0.009', numOctaves: 2, seed: 7, result: 'noise',
        });
        this.n.disp = svg('feDisplacementMap', {
          in: input, in2: 'noise', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result: 'warped',
        });
        f.append(this.n.turb, this.n.disp);
        input = 'warped';
      } else if (stage === 'rgb') {
        // Split into R, G, B, shift R and B in opposite directions, screen them back together.
        for (const c of ['r', 'g', 'b']) {
          f.append(svg('feColorMatrix', { in: input, type: 'matrix', values: ISOLATE[c], result: `ch_${c}` }));
        }
        this.n.offR = svg('feOffset', { in: 'ch_r', dx: 0, dy: 0, result: 'off_r' });
        this.n.offB = svg('feOffset', { in: 'ch_b', dx: 0, dy: 0, result: 'off_b' });
        f.append(
          this.n.offR,
          this.n.offB,
          svg('feBlend', { in: 'off_r', in2: 'ch_g', mode: 'screen', result: 'rg' }),
          svg('feBlend', { in: 'rg', in2: 'off_b', mode: 'screen', result: 'split' }),
        );
        input = 'split';
      } else if (stage === 'posterize') {
        const ct = svg('feComponentTransfer', { in: input, result: 'poster' });
        this.n.post = ['feFuncR', 'feFuncG', 'feFuncB'].map((t) => svg(t, { type: 'discrete', tableValues: '0 1' }));
        ct.append(...this.n.post);
        f.append(ct);
        input = 'poster';
      } else if (stage === 'edges') {
        f.append(svg('feConvolveMatrix', {
          in: input, order: 3, kernelMatrix: '-1 -1 -1 -1 8 -1 -1 -1 -1', preserveAlpha: 'true', result: 'edge',
        }));
        // Crossfade original → edge-detected: k2*in + k3*in2
        this.n.edgeMix = svg('feComposite', {
          in: input, in2: 'edge', operator: 'arithmetic', k1: 0, k2: 1, k3: 0, k4: 0, result: 'edged',
        });
        f.append(this.n.edgeMix);
        input = 'edged';
      }
    }
  }

  /** Pushes static parameter values into the existing chain. */
  update(fx) {
    if (this.n.disp) this.n.disp.setAttribute('scale', String(fx.warp * 2.5));
    if (this.n.offR && !fx.rgbJitter) {
      this.n.offR.setAttribute('dx', String(fx.rgb));
      this.n.offR.setAttribute('dy', '0');
      this.n.offB.setAttribute('dx', String(-fx.rgb));
      this.n.offB.setAttribute('dy', '0');
    }
    if (this.n.post) {
      const levels = Math.max(2, 12 - Math.round(fx.posterize));
      const table = Array.from({ length: levels }, (_, i) => (i / (levels - 1)).toFixed(3)).join(' ');
      for (const fn of this.n.post) fn.setAttribute('tableValues', table);
    }
    if (this.n.edgeMix) {
      const a = fx.edges / 100;
      this.n.edgeMix.setAttribute('k2', String(1 - a));
      this.n.edgeMix.setAttribute('k3', String(a * 1.6));
    }
  }

  /** Per-frame animation (warp drift, rgb jitter). */
  tick(now, fx) {
    if (this.n.turb && fx.warpSpeed > 0) {
      const phase = (now / 1000) * (fx.warpSpeed / 100) * 2;
      const fx_ = 0.004 + 0.003 * Math.sin(phase);
      const fy = 0.006 + 0.004 * Math.cos(phase * 1.3);
      this.n.turb.setAttribute('baseFrequency', `${fx_.toFixed(5)} ${fy.toFixed(5)}`);
    }
    if (this.n.offR && fx.rgbJitter && now >= this.nextJitter) {
      const a = fx.rgb;
      const r = () => (Math.random() * 2 - 1) * a;
      this.n.offR.setAttribute('dx', r().toFixed(1));
      this.n.offR.setAttribute('dy', (r() * 0.3).toFixed(1));
      this.n.offB.setAttribute('dx', r().toFixed(1));
      this.n.offB.setAttribute('dy', (r() * 0.3).toFixed(1));
      this.nextJitter = now + 30 + Math.random() * 160; // hold each glitch for a random beat
    }
  }
}
