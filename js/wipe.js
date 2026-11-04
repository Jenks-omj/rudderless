// Geometric wipes, drawn as clip-path polygons (crisp edges, and clip-path works on
// YouTube iframes). Every shape is built in a rotated (u, v) frame centred on the
// layer, so the Angle control rotates any shape: Linear at 0° is a horizontal wipe,
// 90° vertical, 45°/135° diagonal.
//
// `p` (0–1) is how much of the layer shows: 0 = nothing, 1 = the whole frame
// (each shape is sized so that at 1 it just covers the frame at any angle).

export const WIPE_SHAPES = ['off', 'linear', 'split', 'box', 'diamond', 'circle', 'triangle'];

export const WIPE_LABELS = {
  off: 'Off',
  linear: 'Linear',
  split: 'Split (barn door)',
  box: 'Box',
  diamond: 'Diamond',
  circle: 'Circle',
  triangle: 'Triangle',
};

const BIG = 10000; // px, "off to infinity" for half-planes and the inverted outer frame

export function wipeClipPath(shape, p, angleDeg, invert, w, h) {
  if (shape === 'off' || !w || !h) return 'none';
  p = Math.min(1, Math.max(0, p));

  const th = (angleDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const cx = w / 2;
  const cy = h / 2;

  // Frame corners in the rotated frame, used to size shapes so p = 1 just covers the frame.
  const corners = [[-cx, -cy], [cx, -cy], [cx, cy], [-cx, cy]].map(([x, y]) => [x * c + y * s, -x * s + y * c]);
  const maxU = Math.max(...corners.map(([u]) => Math.abs(u)));
  const maxV = Math.max(...corners.map(([, v]) => Math.abs(v)));

  let pts;
  switch (shape) {
    case 'linear': {
      const d = -maxU + 2 * maxU * p;
      pts = [[-BIG, -BIG], [d, -BIG], [d, BIG], [-BIG, BIG]];
      break;
    }
    case 'split': {
      const d = maxU * p;
      pts = [[-d, -BIG], [d, -BIG], [d, BIG], [-d, BIG]];
      break;
    }
    case 'box': {
      const k = Math.max(maxU / cx, maxV / cy) * p;
      const a = cx * k;
      const b = cy * k;
      pts = [[-a, -b], [a, -b], [a, b], [-a, b]];
      break;
    }
    case 'diamond': {
      const r = Math.max(...corners.map(([u, v]) => Math.abs(u) + Math.abs(v))) * p;
      pts = [[0, -r], [r, 0], [0, r], [-r, 0]];
      break;
    }
    case 'circle': {
      const r = Math.hypot(cx, cy) * p;
      pts = Array.from({ length: 64 }, (_, i) => {
        const a = (i / 64) * 2 * Math.PI;
        return [r * Math.cos(a), r * Math.sin(a)];
      });
      break;
    }
    case 'triangle': {
      // Equilateral, pointing up at 0°. Its incircle covers the frame when the
      // circumradius is twice the frame's half-diagonal.
      const r = Math.hypot(cx, cy) * 2 * p;
      pts = [-90, 30, 150].map((a) => [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)]);
      break;
    }
    default:
      return 'none';
  }

  const xy = pts.map(([u, v]) => [cx + u * c - v * s, cy + u * s + v * c]);
  const fmt = ([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`;
  if (!invert) return `polygon(${xy.map(fmt).join(',')})`;

  // Inverted: a huge outer frame minus the shape (even-odd). The path goes out to the
  // shape and back along the same line, so the joining edges cancel out.
  const outer = [[-BIG, -BIG], [BIG, -BIG], [BIG, BIG], [-BIG, BIG], [-BIG, -BIG]];
  return `polygon(evenodd, ${[...outer, ...xy, xy[0]].map(fmt).join(',')})`;
}
