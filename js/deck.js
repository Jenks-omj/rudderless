import { h } from './dom.js';
import { parseVideoId, fetchTitle, searchVideos } from './youtube.js';
import { DeckEffects } from './effects.js';

// YT.PlayerState values
const PS = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

const ACCENTS = ['#ff3d7f', '#3dd6ff', '#b6ff3d', '#ffb43d'];

export const BLEND_MODES = [
  'normal', 'screen', 'plus-lighter', 'lighten', 'darken', 'multiply', 'difference',
  'exclusion', 'overlay', 'hard-light', 'soft-light', 'color-dodge', 'color-burn',
  'hue', 'saturation', 'color', 'luminosity',
];

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export const FX_DEFAULTS = {
  opacity: 1, blend: 'normal',
  hue: 0, sat: 100, contrast: 100, bright: 100, invert: 0, blur: 0,
  scale: 1, rotate: 0, flipX: false, flipY: false,
  warp: 0, warpSpeed: 30, rgb: 0, rgbJitter: false, posterize: 0, edges: 0,
};

const FX_GROUPS = [
  {
    title: 'Color',
    sliders: [
      { key: 'hue', label: 'Hue', min: 0, max: 360, step: 1, unit: '°' },
      { key: 'sat', label: 'Saturate', min: 0, max: 400, step: 1, unit: '%' },
      { key: 'contrast', label: 'Contrast', min: 0, max: 400, step: 1, unit: '%' },
      { key: 'bright', label: 'Bright', min: 0, max: 300, step: 1, unit: '%' },
      { key: 'invert', label: 'Invert', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'blur', label: 'Blur', min: 0, max: 20, step: 0.5, unit: 'px' },
    ],
  },
  {
    title: 'Transform',
    sliders: [
      { key: 'scale', label: 'Zoom', min: 0.25, max: 4, step: 0.01, unit: '×' },
      { key: 'rotate', label: 'Rotate', min: -180, max: 180, step: 1, unit: '°' },
    ],
    toggles: [{ key: 'flipX', label: 'Mirror X' }, { key: 'flipY', label: 'Mirror Y' }],
  },
  {
    title: 'Glitch',
    sliders: [
      { key: 'warp', label: 'Warp', min: 0, max: 100, step: 1 },
      { key: 'warpSpeed', label: 'Warp spd', min: 0, max: 100, step: 1 },
      { key: 'rgb', label: 'RGB split', min: 0, max: 60, step: 1, unit: 'px' },
      { key: 'posterize', label: 'Posterize', min: 0, max: 10, step: 1 },
      { key: 'edges', label: 'Edges', min: 0, max: 100, step: 1, unit: '%' },
    ],
    toggles: [{ key: 'rgbJitter', label: 'RGB jitter' }],
  },
];

export function defaultDeckState(index) {
  return {
    on: true,
    playlist: [],
    index: 0,
    loop: false,
    muted: true,
    volume: 80,
    rate: 1,
    fx: { ...FX_DEFAULTS, blend: index === 0 ? 'normal' : 'screen', opacity: index === 0 ? 1 : 0.7 },
  };
}

/** Merges saved (untrusted) state over defaults, keeping only well-typed values. */
export function hydrateDeckState(saved, index) {
  const d = defaultDeckState(index);
  if (!saved || typeof saved !== 'object') return d;
  const playlist = Array.isArray(saved.playlist)
    ? saved.playlist
      .filter((it) => it && typeof it.id === 'string' && /^[\w-]{11}$/.test(it.id))
      .map((it) => ({ id: it.id, title: typeof it.title === 'string' ? it.title : null }))
    : [];
  const fx = { ...d.fx };
  if (saved.fx && typeof saved.fx === 'object') {
    for (const k of Object.keys(fx)) {
      if (typeof saved.fx[k] === typeof fx[k]) fx[k] = saved.fx[k];
    }
  }
  if (!BLEND_MODES.includes(fx.blend)) fx.blend = d.fx.blend;
  const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  return {
    on: saved.on !== false,
    playlist,
    index: Math.min(Math.max(0, Math.floor(num(saved.index, 0))), Math.max(0, playlist.length - 1)),
    loop: !!saved.loop,
    muted: saved.muted !== false,
    volume: num(saved.volume, 80),
    rate: RATES.includes(saved.rate) ? saved.rate : 1,
    fx,
  };
}

export class Deck {
  constructor({ index, state, stage, defs, mount, onChange, getApiKey }) {
    this.index = index;
    this.state = state;
    this.onChange = onChange;
    this.getApiKey = getApiKey;

    this.player = null;
    this.ready = false;
    this.playerState = PS.UNSTARTED;
    this.hasVideo = false;      // has a video been loaded into the player?
    this.suppressUntil = 0;     // ignore end-of-clip checks while a new clip spins up
    this.lastPoll = 0;
    this.errorStreak = 0;

    this.layer = h('div', { class: 'layer' }, h('div', { id: `player-${index}` }));
    stage.appendChild(this.layer);
    this.effects = new DeckEffects(index, defs);

    this.buildUI(mount);
    this.applyFx();
    this.renderAll();
  }

  get current() { return this.state.playlist[this.state.index] || null; }
  get isPlaying() { return this.playerState === PS.PLAYING || this.playerState === PS.BUFFERING; }

  serialize() {
    return { ...this.state, playlist: this.state.playlist.map(({ id, title }) => ({ id, title })) };
  }

  // ---------------------------------------------------------------- player

  attachPlayer(YT) {
    this.player = new YT.Player(`player-${this.index}`, {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3,
        rel: 0, playsinline: 1, mute: 1, origin: location.origin,
      },
      events: {
        onReady: () => this.onReady(),
        onStateChange: (e) => this.onStateChange(e.data),
        onError: (e) => this.onError(e.data),
      },
    });
  }

  onReady() {
    this.ready = true;
    this.applyAudio();
    this.renderTransport();
  }

  onStateChange(s) {
    this.playerState = s;
    if (s === PS.PLAYING) {
      this.errorStreak = 0;
      if (this.player.getPlaybackRate() !== this.state.rate) this.player.setPlaybackRate(this.state.rate);
      const item = this.current;
      const title = this.player.getVideoData?.()?.title;
      if (item && title && !item.title) {
        item.title = title;
        this.renderPlaylist();
        this.onChange();
      }
      this.renderNowPlaying();
    } else if (s === PS.ENDED) {
      this.handleEnd();
    }
    this.renderTransport();
  }

  onError(code) {
    const item = this.current;
    if (item) item.error = code;
    this.errorStreak++;
    const why = code === 101 || code === 150 ? 'embedding disabled by owner'
      : code === 100 ? 'video not found / private'
        : `error ${code}`;
    this.renderPlaylist();
    if (this.errorStreak < this.state.playlist.length) {
      this.setStatus(`Skipped: ${why}`, true);
      setTimeout(() => this.next(), 300);
    } else {
      this.setStatus('Nothing playable in this playlist', true);
    }
  }

  /** Called when a clip finishes (or is about to): loop it or advance. */
  handleEnd() {
    if (performance.now() < this.suppressUntil) return;
    this.suppressUntil = performance.now() + 1500;
    if (this.state.loop) {
      this.player.seekTo(0, true);
      this.player.playVideo();
    } else {
      this.next();
    }
  }

  /** Per-frame: animate effects; catch the end of a clip slightly early so YouTube's end screen never shows. */
  tick(now) {
    this.effects.tick(now, this.state.fx);
    if (!this.ready || this.playerState !== PS.PLAYING || now < this.suppressUntil) return;
    if (now - this.lastPoll < 100) return;
    this.lastPoll = now;
    const d = this.player.getDuration();
    const t = this.player.getCurrentTime();
    if (d > 2 && t >= d - 0.35) this.handleEnd();
  }

  // ------------------------------------------------------------- transport

  load(i, autoplay = true) {
    const item = this.state.playlist[i];
    if (!item) return;
    this.state.index = i;
    this.suppressUntil = performance.now() + 1500;
    if (this.ready) {
      if (autoplay) this.player.loadVideoById(item.id);
      else this.player.cueVideoById(item.id);
      this.hasVideo = true;
      this.applyFx();
    }
    this.renderPlaylist();
    this.renderNowPlaying();
    this.onChange();
  }

  togglePlay() {
    if (!this.ready || !this.current) return;
    if (!this.hasVideo) return this.load(this.state.index);
    if (this.isPlaying) this.player.pauseVideo();
    else this.player.playVideo();
  }

  next() {
    const n = this.state.playlist.length;
    if (n) this.load((this.state.index + 1) % n);
  }

  prev() {
    const n = this.state.playlist.length;
    if (!n) return;
    // Like most players: first press restarts the clip, a quick second press goes back.
    if (this.hasVideo && this.ready && this.player.getCurrentTime() > 3) {
      this.player.seekTo(0, true);
      return;
    }
    this.load((this.state.index - 1 + n) % n);
  }

  stopPlayback() {
    if (this.ready && this.hasVideo) this.player.stopVideo();
    this.hasVideo = false;
    this.applyFx();
    this.renderNowPlaying();
  }

  toggleLoop() {
    this.state.loop = !this.state.loop;
    this.renderTransport();
    this.onChange();
  }

  toggleOn() {
    this.state.on = !this.state.on;
    this.applyFx();
    this.renderHeader();
    this.onChange();
  }

  applyAudio() {
    if (!this.ready) return;
    if (this.state.muted) this.player.mute();
    else this.player.unMute();
    this.player.setVolume(this.state.volume);
  }

  setRate(rate) {
    this.state.rate = rate;
    if (this.ready) this.player.setPlaybackRate(rate);
    this.onChange();
  }

  // -------------------------------------------------------------- playlist

  addItems(items, { replace = false } = {}) {
    const pl = this.state.playlist;
    const wasPlaying = this.isPlaying;
    if (replace) {
      pl.length = 0;
      this.state.index = 0;
    }
    const added = items.map(({ id, title }) => ({ id, title: title || null }));
    pl.push(...added);
    this.errorStreak = 0;

    if (replace) {
      if (wasPlaying) this.load(0);
      else this.stopPlayback();
    }
    this.renderAll();
    this.onChange();

    for (const item of added.filter((it) => !it.title)) {
      fetchTitle(item.id).then((title) => {
        if (!title) return;
        item.title = title;
        this.renderPlaylist();
        this.renderNowPlaying();
        this.onChange();
      });
    }
  }

  addFromText(text) {
    const tokens = text.split(/[\s,]+/).filter(Boolean);
    if (!tokens.length) return;
    const items = [];
    let bad = 0;
    for (const t of tokens) {
      const id = parseVideoId(t);
      if (id) items.push({ id });
      else bad++;
    }
    if (items.length) this.addItems(items);
    this.setStatus(
      `${items.length ? `Added ${items.length}` : 'Nothing added'}${bad ? ` · couldn't read ${bad} entr${bad === 1 ? 'y' : 'ies'}` : ''}`,
      !items.length,
    );
  }

  async generate(query, append) {
    query = query.trim();
    if (!query) return;
    const key = this.getApiKey();
    if (!key) {
      this.setStatus('Add a YouTube Data API key in the top bar to search.', true);
      return;
    }
    this.setStatus(`Searching “${query}”…`);
    try {
      const items = await searchVideos(query, key, 10);
      if (!items.length) {
        this.setStatus(`No embeddable results for “${query}”`, true);
        return;
      }
      this.addItems(items, { replace: !append });
      this.setStatus(`${append ? 'Added' : 'Loaded'} ${items.length} videos for “${query}”`);
    } catch (err) {
      this.setStatus(err.message, true);
    }
  }

  removeItem(i) {
    const pl = this.state.playlist;
    const wasCurrent = i === this.state.index;
    const wasPlaying = this.isPlaying;
    pl.splice(i, 1);
    if (i < this.state.index) this.state.index--;
    if (this.state.index >= pl.length) this.state.index = Math.max(0, pl.length - 1);
    if (wasCurrent) {
      if (pl.length && wasPlaying) this.load(this.state.index);
      else this.stopPlayback();
    }
    this.renderAll();
    this.onChange();
  }

  moveItem(i, dir) {
    const pl = this.state.playlist;
    const j = i + dir;
    if (j < 0 || j >= pl.length) return;
    [pl[i], pl[j]] = [pl[j], pl[i]];
    if (this.state.index === i) this.state.index = j;
    else if (this.state.index === j) this.state.index = i;
    this.renderPlaylist();
    this.onChange();
  }

  clearPlaylist() {
    this.state.playlist.length = 0;
    this.state.index = 0;
    this.stopPlayback();
    this.renderAll();
    this.onChange();
  }

  // ------------------------------------------------------------------- fx

  applyFx() {
    const fx = this.state.fx;
    const parts = [];
    const svgUrl = this.effects.sync(fx);
    if (svgUrl) parts.push(svgUrl);
    if (fx.hue) parts.push(`hue-rotate(${fx.hue}deg)`);
    if (fx.sat !== 100) parts.push(`saturate(${fx.sat}%)`);
    if (fx.contrast !== 100) parts.push(`contrast(${fx.contrast}%)`);
    if (fx.bright !== 100) parts.push(`brightness(${fx.bright}%)`);
    if (fx.invert) parts.push(`invert(${fx.invert}%)`);
    if (fx.blur) parts.push(`blur(${fx.blur}px)`);

    const s = this.layer.style;
    s.filter = parts.length ? parts.join(' ') : 'none';
    // Hidden until a clip is loaded, so idle players never show YouTube's placeholder UI.
    const visible = this.state.on && this.hasVideo;
    s.opacity = visible ? String(fx.opacity) : '0';
    s.visibility = visible ? 'visible' : 'hidden';
    s.mixBlendMode = fx.blend;
    s.transform = `scale(${fx.scale * (fx.flipX ? -1 : 1)}, ${fx.scale * (fx.flipY ? -1 : 1)}) rotate(${fx.rotate}deg)`;
  }

  setFx(key, value) {
    this.state.fx[key] = value;
    this.applyFx();
    this.onChange();
  }

  resetFx() {
    const { opacity, blend } = this.state.fx;
    Object.assign(this.state.fx, FX_DEFAULTS, { opacity, blend });
    this.applyFx();
    this.syncFxInputs();
    this.onChange();
  }

  // ------------------------------------------------------------------- UI

  buildUI(mount) {
    const i = this.index;
    const s = this.state;
    const ui = (this.ui = {});

    ui.onBtn = h('button', { class: 'on-toggle', type: 'button', title: `Layer on/off (key ${i + 1})`, onclick: () => this.toggleOn() }, String(i + 1));
    ui.fader = h('input', {
      type: 'range', min: 0, max: 1, step: 0.01, value: s.fx.opacity, title: 'Layer opacity',
      oninput: (e) => this.setFx('opacity', parseFloat(e.target.value)),
    });

    ui.now = h('div', { class: 'now' });

    ui.prev = h('button', { type: 'button', title: 'Previous / restart', onclick: () => this.prev() }, '⏮');
    ui.play = h('button', { type: 'button', title: 'Play / pause', onclick: () => this.togglePlay() }, '▶');
    ui.next = h('button', { type: 'button', title: 'Next clip', onclick: () => this.next() }, '⏭');
    ui.loop = h('button', { type: 'button', title: 'Loop current clip (off = advance to next clip when it ends)', onclick: () => this.toggleLoop() }, 'Loop');
    ui.mute = h('button', {
      type: 'button', title: 'Mute / unmute',
      onclick: () => { s.muted = !s.muted; this.applyAudio(); this.renderTransport(); this.onChange(); },
    }, 'Muted');
    ui.volume = h('input', {
      type: 'range', min: 0, max: 100, step: 1, value: s.volume, title: 'Volume',
      oninput: (e) => { s.volume = parseInt(e.target.value, 10); this.applyAudio(); this.onChange(); },
    });
    ui.rate = h('select', {
      title: 'Playback speed', value: String(s.rate),
      onchange: (e) => this.setRate(parseFloat(e.target.value)),
    }, RATES.map((r) => h('option', { value: String(r) }, `${r}×`)));

    ui.status = h('div', { class: 'status' });
    ui.list = h('ol', { class: 'playlist' });

    const addInput = h('input', { type: 'text', placeholder: 'YouTube URLs or IDs (paste several)', spellcheck: 'false' });
    const addForm = h('form', {
      class: 'row',
      onsubmit: (e) => { e.preventDefault(); this.addFromText(addInput.value); addInput.value = ''; },
    }, addInput, h('button', { type: 'submit' }, 'Add'));

    const searchInput = h('input', { type: 'text', placeholder: 'Search term → 10 videos', spellcheck: 'false' });
    const appendBox = h('input', { type: 'checkbox', title: 'Append instead of replacing the playlist' });
    const searchForm = h('form', {
      class: 'row',
      onsubmit: (e) => { e.preventDefault(); this.generate(searchInput.value, appendBox.checked); },
    },
    searchInput,
    h('button', { type: 'submit' }, 'Generate'),
    h('label', { class: 'checks', title: 'Append instead of replacing' }, appendBox, '+'));

    const clearBtn = h('button', {
      type: 'button',
      onclick: () => { if (s.playlist.length && confirm(`Clear deck ${i + 1}'s playlist?`)) this.clearPlaylist(); },
    }, 'Clear');

    this.card = h('section', { class: 'deck', style: `--accent:${ACCENTS[i % ACCENTS.length]}` },
      h('div', { class: 'deck-head' }, ui.onBtn, h('span', { class: 'deck-name' }, `Deck ${i + 1}`), ui.fader),
      ui.now,
      h('div', { class: 'row' }, ui.prev, ui.play, ui.next, ui.loop, ui.rate),
      h('div', { class: 'row' }, ui.mute, ui.volume, clearBtn),
      ui.list,
      addForm,
      searchForm,
      ui.status,
      this.buildFxUI(),
    );
    mount.appendChild(this.card);
  }

  buildFxUI() {
    const fx = this.state.fx;
    this.fxInputs = {};

    const blend = h('select', {
      value: fx.blend,
      onchange: (e) => this.setFx('blend', e.target.value),
    }, BLEND_MODES.map((m) => h('option', { value: m }, m === 'plus-lighter' ? 'add' : m)));
    this.fxInputs.blend = { input: blend };

    const groups = FX_GROUPS.map((g) => h('div', { class: 'fx-group' },
      h('h4', {}, g.title),
      g.sliders.map((sl) => {
        const out = h('output', {});
        const fmt = (v) => `${Number.isInteger(v) ? v : v.toFixed(2)}${sl.unit || ''}`;
        const input = h('input', {
          type: 'range', min: sl.min, max: sl.max, step: sl.step, value: fx[sl.key],
          title: 'Double-click to reset',
          oninput: (e) => { const v = parseFloat(e.target.value); out.textContent = fmt(v); this.setFx(sl.key, v); },
          ondblclick: (e) => { const v = FX_DEFAULTS[sl.key]; e.target.value = v; out.textContent = fmt(v); this.setFx(sl.key, v); },
        });
        out.textContent = fmt(fx[sl.key]);
        this.fxInputs[sl.key] = { input, out, fmt };
        return h('label', { class: 'slider' }, h('span', {}, sl.label), input, out);
      }),
      g.toggles && h('div', { class: 'checks' }, g.toggles.map((t) => {
        const input = h('input', { type: 'checkbox', checked: fx[t.key], onchange: (e) => this.setFx(t.key, e.target.checked) });
        this.fxInputs[t.key] = { input };
        return h('label', {}, input, t.label);
      })),
    ));

    return h('details', { class: 'fx' },
      h('summary', {}, 'Effects'),
      h('div', { class: 'row' }, h('span', {}, 'Blend'), blend, h('span', { class: 'spacer' }),
        h('button', { type: 'button', onclick: () => this.resetFx() }, 'Reset FX')),
      groups,
    );
  }

  syncFxInputs() {
    const fx = this.state.fx;
    for (const [key, { input, out, fmt }] of Object.entries(this.fxInputs)) {
      if (input.type === 'checkbox') input.checked = fx[key];
      else input.value = fx[key];
      if (out) out.textContent = fmt(fx[key]);
    }
  }

  setStatus(msg, isError = false) {
    this.ui.status.textContent = msg;
    this.ui.status.classList.toggle('err', isError);
  }

  renderAll() {
    this.renderHeader();
    this.renderNowPlaying();
    this.renderTransport();
    this.renderPlaylist();
  }

  renderHeader() {
    this.card.classList.toggle('off', !this.state.on);
    this.ui.onBtn.classList.toggle('active', this.state.on);
  }

  renderNowPlaying() {
    const item = this.current;
    const live = item && this.hasVideo;
    this.ui.now.classList.toggle('idle', !live);
    this.ui.now.textContent = live ? (item.title || item.id)
      : item ? `Ready: ${item.title || item.id}` : 'No clip';
  }

  renderTransport() {
    const ui = this.ui;
    ui.play.textContent = this.isPlaying ? '❚❚' : '▶';
    ui.loop.classList.toggle('active', this.state.loop);
    ui.mute.textContent = this.state.muted ? 'Muted' : 'Sound';
    ui.mute.classList.toggle('active', !this.state.muted);
  }

  renderPlaylist() {
    const { playlist, index } = this.state;
    this.ui.list.replaceChildren(...playlist.map((item, i) => h('li', {
      class: [i === index ? 'current' : '', item.error ? 'error' : ''].join(' ').trim() || null,
      title: item.error ? `Can't play (error ${item.error})` : (item.title || item.id),
    },
    h('span', { class: 'num' }, String(i + 1)),
    h('span', { class: 'title', onclick: () => this.load(i) }, item.title || item.id),
    h('button', { type: 'button', title: 'Move up', onclick: () => this.moveItem(i, -1) }, '↑'),
    h('button', { type: 'button', title: 'Move down', onclick: () => this.moveItem(i, 1) }, '↓'),
    h('button', { type: 'button', title: 'Remove', onclick: () => this.removeItem(i) }, '✕'),
    )));
  }
}
