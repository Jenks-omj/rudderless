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
- **In / Out**: mark a section of the clip to repeat. **Out** starts the loop; if no In is set, the loop is the last half second. **A-B** switches it on and off. **÷2 / ×2** halve or double the section while it plays, so pressing ÷2 repeatedly gives a stutter roll. YouTube takes a moment to jump back, so loops under about 0.25s get ragged. The section resets when the clip changes.
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

- **Crop**:
  - **Window** shows only the part of the video inside a box.
  - **Tile** shrinks the whole video into the box, for small squares anywhere on screen.
  - Width, height and X/Y position sliders. **Square** locks the height to the width.
- **Wipe**:
  - Shapes: Linear, Split (barn door), Box, Diamond, Circle, Triangle.
  - **Angle** rotates any shape. The H, V, ↘ and ↗ buttons set horizontal, vertical and the two diagonals.
  - **Amount** sets how much of the deck shows. **Invert** shows the outside of the shape instead.
  - **Sweep** animates the wipe back and forth; **Spin** rotates the shape continuously.
  - Stack different wipes and crops across the 4 decks to build geometric compositions.

Master (over everything): **Bars** (random inverted and color-shifted strips), **Kick** (bars burst on each detected kick) and **Scanlines**.

### Sound-reactive effects

Pick an **Audio** source in the top bar:
- **Tab**: listens to this tab's own sound, which means the YouTube decks. In Chrome's picker, choose this tab and keep **Share tab audio** on. At least one deck must be unmuted.
- **Mic**: listens to a microphone or line input. This works with every deck muted, for example when the music comes from a DJ mixer.

The meter shows bass, mid and high levels and flashes on each kick. **Sens** sets how easily things trigger.

Each deck's **Audio react** section (under Effects) chooses what it follows (bass, mid, high, level, or kicks) and how hard each effect responds:
- **Pump**: opacity follows the sound.
- **Zoom**, **Flash**, **Hue push**, **Shake**, **Tear**, **Invert**, **Wipe** and **Crop size**.

Shake and tear also fire immediately on every kick.

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
