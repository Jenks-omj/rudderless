let apiPromise;

/** Loads the YouTube IFrame Player API once; resolves with window.YT. */
export function loadYouTubeAPI() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('Could not load the YouTube player API'));
    document.head.appendChild(s);
  });
  return apiPromise;
}

const ID_RE = /^[\w-]{11}$/;

/** Accepts a bare 11-char ID or any common YouTube URL form; returns the ID or null. */
export function parseVideoId(input) {
  const s = String(input).trim();
  if (ID_RE.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1, 12);
      return ID_RE.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v && ID_RE.test(v)) return v;
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch { /* not a URL */ }
  return null;
}

/** Title lookup via oEmbed (no API key needed). Returns null on failure. */
export async function fetchTitle(id) {
  try {
    const watch = `https://www.youtube.com/watch?v=${id}`;
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`);
    if (!r.ok) return null;
    const data = await r.json();
    return typeof data.title === 'string' ? data.title : null;
  } catch {
    return null;
  }
}

function decodeEntities(s) {
  // Data API titles come HTML-escaped ("&#39;"). DOMParser decodes without executing anything.
  return new DOMParser().parseFromString(s, 'text/html').documentElement.textContent;
}

/** YouTube Data API v3 search, limited to videos that can be embedded. Costs 100 quota units. */
export async function searchVideos(query, apiKey, maxResults = 10) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    maxResults: String(maxResults),
    q: query,
    key: apiKey,
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  let data = null;
  try { data = await r.json(); } catch { /* non-JSON error */ }
  if (!r.ok) throw new Error(data?.error?.message || `Search failed (HTTP ${r.status})`);
  return (data.items || [])
    .filter((it) => it.id?.videoId)
    .map((it) => ({ id: it.id.videoId, title: decodeEntities(it.snippet?.title || '') || null }));
}
