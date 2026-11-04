// Share links: the whole set (playlists, loop/on, effects, master FX) is packed into
// the URL hash, so a link works on any static host with no server. Titles are left
// out to keep links short; the receiving page looks them up again.
//
//   https://…/rudderless/#set=<base64url(deflate(JSON))>

const PARAM = 'set';

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Builds a share URL for the given decks + master state. */
export async function buildShareUrl(decks, master) {
  const payload = {
    v: 1,
    master,
    decks: decks.map((s) => ({
      playlist: s.playlist.map((it) => it.id),
      index: s.index,
      loop: s.loop,
      on: s.on,
      rate: s.rate,
      fx: s.fx,
    })),
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  const url = new URL(location.href);
  url.hash = `${PARAM}=${toBase64Url(packed)}`;
  return url.toString();
}

/**
 * Reads a shared set from the current URL hash, if there is one.
 * Returns state shaped like localStorage state ({ decks, master }) or null.
 * The result is untrusted input; callers still run it through hydrateDeckState.
 */
export async function readSharedSet() {
  const hash = new URLSearchParams(location.hash.slice(1)).get(PARAM);
  if (!hash) return null;
  try {
    const bytes = await pipe(fromBase64Url(hash), new DecompressionStream('deflate-raw'));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || data.v !== 1 || !Array.isArray(data.decks)) return null;
    return {
      master: data.master,
      decks: data.decks.map((d) => ({
        ...d,
        playlist: Array.isArray(d?.playlist) ? d.playlist.map((id) => ({ id, title: null })) : [],
      })),
    };
  } catch {
    return null;
  }
}

/** Removes the set from the address bar so a reload uses the (now saved) local copy. */
export function clearSharedSetFromUrl() {
  history.replaceState(null, '', location.pathname + location.search);
}
