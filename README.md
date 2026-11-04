# rudderless

A browser VJ tool that layers YouTube videos and mangles them with live effects.

**Live:** https://jenks-omj.github.io/rudderless/ (once GitHub Pages is enabled)

## Run locally

YouTube's player won't run from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000 in Chrome
```

## How it works

- **The preview box** at the top is the output. **Fullscreen** (F) blows it up to fill the screen.
- **4 decks**, each one layer, stacked in order (deck 1 at the bottom). Each deck has an opacity fader and an on/off switch.
- **Each deck has its own playlist.** To fill one:
  - **Drag videos** from a YouTube tab or window onto a deck.
  - **Paste links**: video links, IDs or **playlist links**. A playlist link imports the whole playlist, up to 200 videos.
  - **Search**: opens YouTube search in a popup to drag videos from. If you add an API key (see below), Search instead loads the top 10 results straight into the deck.
- **Loop** on: repeats the current clip. Loop off: moves to the next clip when this one ends, wrapping at the end of the playlist.
- Clips that can't be embedded are skipped automatically and struck through.
- **Share** copies a link that opens the app with every deck's playlist, loop setting and effects already loaded. The set is stored in the link itself, so no server is needed.
- Your decks are also saved in this browser between visits.

### Effects

Per deck:
- **Blend mode** and opacity.
- **Color**: hue, saturate, contrast, brightness, invert, blur.
- **Tint**: a color overlay with its own blend mode. *Difference* gives psychedelic results.
- **Transform**: zoom, rotate, mirror.
- **Glitch**:
  - **Hue cycle**: auto-rotating color.
  - **Shake**: jitter plus skew kicks.
  - **Tear**: random bands ripped out, revealing the decks below.
  - **Blinds**: scrolling stripes.
  - **Strobe**.

Master (over everything): **Bars** (random inverted and color-shifted strips) and **Scanlines**.

Double-click any slider to reset it.

### Keys

| Key | Action |
| --- | --- |
| 1–4 | Toggle deck on/off |
| F | Fullscreen output |
| B | Blackout |

## Optional: one-click search

The app can search YouTube directly with a free YouTube Data API v3 key:

1. In Google Cloud Console, enable **YouTube Data API v3** and create an API key.
2. Restrict the key to your sites, for example `http://localhost:8000/*` and `https://jenks-omj.github.io/*`.
3. Paste the key into the top bar. It's stored only in your browser and never included in share links.

Each search uses 100 of the default 10,000 daily quota units.

## Limits

YouTube videos run in cross-origin iframes, so the page can't read their pixels or audio. Every effect is compositing done by the browser: CSS filters, transforms, clip-paths, masks, blend-mode overlays and backdrop filters. Chrome won't run SVG pixel filters (displacement, true RGB split) on embedded players, and feedback, pixel sorting and real datamoshing are out of reach too.
