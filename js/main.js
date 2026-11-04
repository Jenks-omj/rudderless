import { loadYouTubeAPI } from './youtube.js';
import { Deck, hydrateDeckState } from './deck.js';
import { loadState, saveState, loadApiKey, saveApiKey } from './storage.js';

const DECK_COUNT = 4;

const stage = document.getElementById('stage');
const defs = document.querySelector('#fx-defs defs');
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

// ---- API key (kept only in this browser's localStorage)
apiKeyInput.value = loadApiKey();
apiKeyInput.addEventListener('change', () => saveApiKey(apiKeyInput.value.trim()));

// ---- Decks
const saved = loadState();
let saveTimer;
const scheduleSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState({ decks: decks.map((d) => d.serialize()) }), 300);
};

const decks = Array.from({ length: DECK_COUNT }, (_, i) => new Deck({
  index: i,
  state: hydrateDeckState(saved?.decks?.[i], i),
  stage,
  defs,
  mount: decksEl,
  onChange: scheduleSave,
  getApiKey: () => apiKeyInput.value.trim(),
}));

if (location.protocol === 'file:') {
  toast('YouTube needs this page served over http — see README', 8000);
}

loadYouTubeAPI()
  .then((YT) => decks.forEach((d) => d.attachPlayer(YT)))
  .catch((err) => toast(err.message, 6000));

// ---- Animation / clock
function frame(now) {
  for (const d of decks) d.tick(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- Global controls
function togglePanel() {
  const hidden = document.body.classList.toggle('panel-hidden');
  if (hidden) toast('Press H to show controls');
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => toast('Fullscreen was blocked'));
}
function toggleBlackout() {
  const on = stage.classList.toggle('blackout');
  document.getElementById('btnBlackout').classList.toggle('active', on);
}

document.getElementById('btnFullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('btnHide').addEventListener('click', togglePanel);
document.getElementById('btnBlackout').addEventListener('click', toggleBlackout);

const TYPING = 'input[type=text], input[type=password], input[type=search], textarea, select';
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof Element && e.target.matches(TYPING)) return;
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= String(DECK_COUNT)) decks[Number(k) - 1].toggleOn();
  else if (k === 'h') togglePanel();
  else if (k === 'f') toggleFullscreen();
  else if (k === 'b') toggleBlackout();
  else return;
  e.preventDefault();
});
