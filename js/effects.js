// Glitch effects that work on cross-origin iframes.
//
// Chrome refuses to run SVG pixel filters (displacement, channel split, …) on
// embedded YouTube players, because the page isn't allowed to read their pixels.
// What *does* work is anything the compositor does without reading pixels:
// CSS filters, transforms, clip-path, masks, blend-mode overlays and
// backdrop-filter strips. Everything here is built from those.

import { h } from './dom.js';

const rand = (a = 1) => (Math.random() * 2 - 1) * a;

/** Mask that cuts random horizontal bands out of a layer (revealing decks below). */
export function makeTear(amount) {
  const n = 1 + Math.floor(Math.random() * (1 + amount / 20));
  const gaps = Array.from({ length: n }, () => {
    const hgt = 1 + Math.random() * amount * 0.12;
    const y = Math.random() * (100 - hgt);
    return [y, y + hgt];
  }).sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const g of gaps) {
    const last = merged[merged.length - 1];
    if (last && g[0] <= last[1]) last[1] = Math.max(last[1], g[1]);
    else merged.push([...g]);
  }

  // Hard-stop gradient: opaque everywhere except the gaps.
  const stops = ['#000 0%'];
  for (const [a, b] of merged) {
    const A = a.toFixed(2), B = b.toFixed(2);
    stops.push(`#000 ${A}%`, `transparent ${A}%`, `transparent ${B}%`, `#000 ${B}%`);
  }
  stops.push('#000 100%');
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

/** Per-deck animated state: shake, tear, strobe, hue cycle, blinds. */
export class DeckGlitch {
  constructor() {
    this.tx = 0; this.ty = 0; this.skew = 0; this.shakeNext = 0;
    this.tear = null; this.tearNext = 0;
  }

  /** Returns the dynamic style values for this frame. */
  frame(now, fx, kick = false) {
    // On a detected kick, fire shake/tear immediately instead of waiting for the next random tick.
    if (kick) {
      this.shakeNext = 0;
      if (fx.tear > 0) {
        this.tear = makeTear(fx.tear);
        this.tearNext = now + 60 + Math.random() * 120;
      }
    }

    // Shake: jittery translate, with occasional skew kicks.
    if (fx.shake > 0) {
      if (now >= this.shakeNext) {
        const amp = fx.shake * 0.4;
        this.tx = rand(amp);
        this.ty = rand(amp * 0.5);
        this.skew = Math.random() < fx.shake / 300 ? rand(fx.shake * 0.2) : 0;
        this.shakeNext = now + 40 + Math.random() * 90;
      }
    } else {
      this.tx = this.ty = this.skew = 0;
    }

    // Tear: bursts of missing bands, more often and bigger as the amount rises.
    if (fx.tear > 0) {
      if (now >= this.tearNext) {
        this.tear = Math.random() < (fx.tear / 100) * 0.8 ? makeTear(fx.tear) : null;
        this.tearNext = now + 50 + Math.random() * 220;
      }
    } else {
      this.tear = null;
    }

    // Strobe: hard on/off flicker, 1–15 Hz.
    let strobeOff = false;
    if (fx.strobe > 0) {
      const hz = 1 + fx.strobe * 0.14;
      strobeOff = Math.floor((now / 1000) * hz * 2) % 2 === 1;
    }

    // Hue cycle: up to one full rotation per second.
    const hue = fx.hueSpeed > 0 ? (fx.hue + (now / 1000) * fx.hueSpeed * 3.6) % 360 : fx.hue;

    // Mask layers (intersected): tear bands and scrolling blinds.
    const masks = [];
    if (this.tear) masks.push({ image: this.tear, pos: '0 0', size: '100% 100%' });
    if (fx.blinds > 0) {
      const period = 16;
      const solid = (period * (1 - (fx.blinds / 100) * 0.9)).toFixed(2);
      masks.push({
        image: `repeating-linear-gradient(to bottom, #000 0 ${solid}px, transparent ${solid}px ${period}px)`,
        pos: `0 ${((now / 40) % period).toFixed(1)}px`,
        size: 'auto',
      });
    }

    return { tx: this.tx, ty: this.ty, skew: this.skew, strobeOff, hue, masks };
  }
}

const BAR_FILTERS = [
  'invert(1)',
  'hue-rotate(90deg) saturate(4)',
  'hue-rotate(200deg) saturate(3)',
  'contrast(4) brightness(1.4)',
  'grayscale(1) contrast(3)',
  'invert(1) hue-rotate(180deg)',
  'blur(6px) saturate(3)',
];

/** Master effects drawn over all decks: glitch bars and scanlines. */
export class MasterFx {
  constructor(stage, state) {
    this.state = state;
    this.bars = Array.from({ length: 6 }, () => ({ el: h('div', { class: 'glitch-bar' }), next: 0 }));
    this.scan = h('div', { class: 'scanlines' });
    stage.append(...this.bars.map((b) => b.el), this.scan);
    this.apply();
  }

  apply() {
    this.scan.style.opacity = String(this.state.scan / 100);
  }

  tick(now, audio) {
    const kick = audio?.active ? audio.value('beat') : 0;
    const amt = Math.min(100, this.state.bars + this.state.kick * kick);
    for (const bar of this.bars) {
      if (audio?.onset && this.state.kick > 0) bar.next = 0;
      if (amt <= 0) {
        if (bar.el.style.display !== 'none') bar.el.style.display = 'none';
        continue;
      }
      if (now < bar.next) continue;
      bar.next = now + 40 + Math.random() * 260;
      if (Math.random() < (amt / 100) * 0.6) {
        const hgt = 0.5 + Math.random() * amt * 0.12;
        const s = bar.el.style;
        s.display = 'block';
        s.top = `${(Math.random() * (100 - hgt)).toFixed(2)}%`;
        s.height = `${hgt.toFixed(2)}%`;
        s.backdropFilter = BAR_FILTERS[Math.floor(Math.random() * BAR_FILTERS.length)];
      } else {
        bar.el.style.display = 'none';
      }
    }
  }
}
