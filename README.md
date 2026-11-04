# rudderless

A browser VJ tool that layers YouTube videos and mangles them with CSS and SVG filters.

## Run it

YouTube's player won't run from `file://`, so serve the folder:

```sh
cd rudderless
python3 -m http.server 8000
# open http://localhost:8000 in Chrome
```

## How it works

- **4 decks**, each one a fullscreen layer, stacked in order (deck 1 at the bottom).
- Each deck has its **own playlist**:
  - Paste YouTube URLs or IDs (several at once is fine).
  - **Generate**: search YouTube and load 10 embeddable videos. Tick **+** to append instead of replacing.
- **Loop** on: repeats the current clip. Loop off: moves to the next clip when this one ends, wrapping at the end of the playlist.
- Clips that can't be embedded are skipped automatically and struck through.
- **Effects** (per deck): blend mode, opacity, hue/saturate/contrast/brightness/invert/blur, zoom/rotate/mirror, plus SVG glitch filters (warp, RGB split with jitter, posterize, edge detection). Double-click any slider to reset it.
- Playlists, effects and the API key are saved in your browser's localStorage.

### Keys

| Key | Action |
| --- | --- |
| 1–4 | Toggle deck on/off |
| H | Hide/show the control panel |
| F | Fullscreen |
| B | Blackout |

## Search setup

Search uses the YouTube Data API v3, which needs a free API key:

1. In Google Cloud Console, create a project and enable **YouTube Data API v3**.
2. Create an API key. Restrict it to *HTTP referrers* such as `http://localhost:8000/*`.
3. Paste it into the top bar.

Each search uses 100 of the default 10,000 daily quota units, so about 100 searches a day.

## Limits

YouTube videos run in cross-origin iframes, so the page can't read their pixels or audio. Everything here is compositing done by the browser. There is no feedback, pixel sorting or true datamoshing. Heavy SVG filters (especially Warp) on several full-screen layers can drop frames.
