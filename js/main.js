import { loadYouTubeAPI } from './youtube.js';
import { Deck, hydrateDeckState } from './deck.js';
import { MasterFx } from './effects.js';
import { AudioReactor } from './audio.js';
import { loadState, saveState, loadApiKey, saveApiKey } from './storage.js';
import { buildShareUrl, readSharedSet, clearSharedSetFromUrl } from './share.js';

const DECK_COUNT = 4;

const stage = document.getElementById('stage');
const decksEl = document.getElementById('decks');
const apiKeyInput = document.getElementById('apiKey');
const toastEl = document.getElementById('toast');

let toastTimer;
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ---- API key (optional; kept only in this browser's localStorage)
apiKeyInput.value = loadApiKey();
apiKeyInput.addEventListener('change', () => saveApiKey(apiKeyInput.value.trim()));

// ---- State: a shared link wins over what this browser had saved
const shared = await readSharedSet();
const saved = shared || loadState();
if (shared) {
  clearSharedSetFromUrl();
  setTimeout(() => toast('Loaded a shared set — press ▶ on a deck to start', 4000), 300);
}
const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : def);
const masterState = {
  bars: num(saved?.master?.bars, 0),
  kick: num(saved?.master?.kick, 0),
  scan: num(saved?.master?.scan, 0),
  sens: num(saved?.master?.sens, 50),
};
const audio = new AudioReactor();
audio.sensitivity = masterState.sens;

let saveTimer;
const scheduleSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState({ decks: decks.map((d) => d.serialize()), master: masterState }), 300);
};

// ---- Decks (layers are appended to the stage first, master FX on top of them)
const decks = Array.from({ length: DECK_COUNT }, (_, i) => new Deck({
  index: i,
  state: hydrateDeckState(saved?.decks?.[i], i),
  stage,
  mount: decksEl,
  onChange: scheduleSave,
  getApiKey: () => apiKeyInput.value.trim(),
  audio,
}));
const master = new MasterFx(stage, masterState);
if (shared) scheduleSave();   // keep the shared set locally, so a reload doesn't lose it

document.getElementById('btnShare').addEventListener('click', async () => {
  const url = await buildShareUrl(decks.map((d) => d.state), masterState);
  try {
    await navigator.clipboard.writeText(url);
    toast('Share link copied — anyone who opens it gets these decks');
  } catch {
    prompt('Copy this share link:', url);
  }
});

for (const [id, key] of [['masterBars', 'bars'], ['masterKick', 'kick'], ['masterScan', 'scan'], ['audioSens', 'sens']]) {
  const input = document.getElementById(id);
  input.value = masterState[key];
  input.addEventListener('input', () => {
    masterState[key] = parseFloat(input.value);
    audio.sensitivity = masterState.sens;
    master.apply();
    scheduleSave();
  });
}

// ---- Audio source (not saved: the browser asks for permission each time)
const audioButtons = [...document.querySelectorAll('[data-audio]')];
const showAudio = (kind) => audioButtons.forEach((b) => b.classList.toggle('active', b.dataset.audio === kind));
audio.onEnded = () => { showAudio('off'); toast('Audio input stopped'); };
for (const btn of audioButtons) {
  btn.addEventListener('click', async () => {
    const kind = btn.dataset.audio;
    if (kind === 'off') { audio.stop(); showAudio('off'); return; }
    try {
      await audio.start(kind);
      showAudio(kind);
      if (kind === 'tab' && decks.every((d) => d.state.muted)) {
        toast('Listening to this tab — unmute a deck so there is sound to react to', 4500);
      } else {
        toast(kind === 'tab' ? 'Listening to this tab' : 'Listening to the microphone');
      }
    } catch (err) {
      audio.stop();
      showAudio('off');
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') toast(err.message, 5000);
    }
  });
}

const meter = document.getElementById('meter');
const meterCtx = meter.getContext('2d');
function drawMeter() {
  const { width: w, height: hgt } = meter;
  meterCtx.clearRect(0, 0, w, hgt);
  const bands = [['bass', '#ff3d7f'], ['mid', '#3dd6ff'], ['high', '#b6ff3d']];
  const bw = (w - 18) / bands.length;
  bands.forEach(([band, color], i) => {
    const v = audio.value(band);
    meterCtx.fillStyle = color;
    meterCtx.fillRect(2 + i * bw, hgt - 2 - v * (hgt - 4), bw - 2, v * (hgt - 4));
  });
  meterCtx.fillStyle = `rgba(255,255,255,${audio.value('beat').toFixed(2)})`;
  meterCtx.fillRect(w - 14, 3, 11, hgt - 6);
}

if (location.protocol === 'file:') {
  toast('YouTube needs this page served over http — see README', 8000);
}

loadYouTubeAPI()
  .then((YT) => decks.forEach((d) => d.attachPlayer(YT)))
  .catch((err) => toast(err.message, 6000));

// ---- Animation clock
function frame(now) {
  audio.update(now);
  for (const d of decks) d.tick(now);
  master.tick(now, audio);
  drawMeter();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- Global controls
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen().catch(() => toast('Fullscreen was blocked'));
}
function toggleBlackout() {
  const on = stage.classList.toggle('blackout');
  document.getElementById('btnBlackout').classList.toggle('active', on);
}

document.getElementById('btnFullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('btnBlackout').addEventListener('click', toggleBlackout);

const TYPING = 'input[type=text], input[type=password], input[type=search], textarea, select';
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof Element && e.target.matches(TYPING)) return;
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= String(DECK_COUNT)) decks[Number(k) - 1].toggleOn();
  else if (k === 'f') toggleFullscreen();
  else if (k === 'b') toggleBlackout();
  else return;
  e.preventDefault();
});
