import { loadYouTubeAPI } from './youtube.js';
import { Deck, hydrateDeckState } from './deck.js';
import { MasterFx } from './effects.js';
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
const masterState = { bars: num(saved?.master?.bars, 0), scan: num(saved?.master?.scan, 0) };

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

for (const [id, key] of [['masterBars', 'bars'], ['masterScan', 'scan']]) {
  const input = document.getElementById(id);
  input.value = masterState[key];
  input.addEventListener('input', () => {
    masterState[key] = parseFloat(input.value);
    master.apply();
    scheduleSave();
  });
}

if (location.protocol === 'file:') {
  toast('YouTube needs this page served over http — see README', 8000);
}

loadYouTubeAPI()
  .then((YT) => decks.forEach((d) => d.attachPlayer(YT)))
  .catch((err) => toast(err.message, 6000));

// ---- Animation clock
function frame(now) {
  for (const d of decks) d.tick(now);
  master.tick(now);
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
