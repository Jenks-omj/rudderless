const STATE_KEY = 'rudderless:v1';
const API_KEY = 'rudderless:ytApiKey';

// localStorage can throw (private windows, blocked storage) — never let that break the app.
export function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)); } catch { return null; }
}
export function saveState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}
export function loadApiKey() {
  try { return localStorage.getItem(API_KEY) || ''; } catch { return ''; }
}
export function saveApiKey(key) {
  try { key ? localStorage.setItem(API_KEY, key) : localStorage.removeItem(API_KEY); } catch { /* ignore */ }
}
