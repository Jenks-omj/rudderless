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

/**
 * Returns a playlist ID for playlist links (youtube.com/playlist?list=…, or a list
 * link with no video), or a bare playlist ID. A watch link that also carries
 * list= is treated as a single video, so copying one clip out of a mix adds one clip.
 */
export function parsePlaylistId(input) {
  const s = String(input).trim();
  if (/^(PL|OL|UU|FL)[\w-]{10,}$/.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host !== 'youtube.com') return null;
    const list = u.searchParams.get('list');
    if (list && /^[\w-]{10,}$/.test(list) && !u.searchParams.get('v')) return list;
  } catch { /* not a URL */ }
  return null;
}

/**
 * Lists a playlist's video IDs without an API key: a hidden YouTube player loads the
 * playlist and reports its contents (up to 200 videos).
 */
export function fetchPlaylistIds(YT, listId, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;pointer-events:none';
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    let done = false;
    let poll;
    let player;
    const finish = (err, ids) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      try { player?.destroy(); } catch { /* ignore */ }
      host.remove();
      if (err) reject(err);
      else resolve(ids);
    };
    const timer = setTimeout(
      () => finish(new Error('Playlist took too long to load — is it public?')),
      timeoutMs,
    );
    const current = () => {
      const ids = player?.getPlaylist?.();
      return Array.isArray(ids) && ids.length ? ids : null;
    };

    player = new YT.Player(target, {
      width: 320,
      height: 180,
      playerVars: { listType: 'playlist', list: listId, autoplay: 0, mute: 1, origin: location.origin },
      events: {
        onReady: () => {
          poll = setInterval(() => { const ids = current(); if (ids) finish(null, ids); }, 250);
        },
        // The first video failing doesn't mean the list failed.
        onError: () => {
          const ids = current();
          if (ids) finish(null, ids);
          else finish(new Error('Could not load that playlist (private or unavailable)'));
        },
      },
    });
  });
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
