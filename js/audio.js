// Audio analysis for sound-reactive effects.
//
// The YouTube iframes' audio can't be tapped directly (cross-origin), so we listen to either:
//   - 'tab': this browser tab's own output, via screen-share of the current tab with audio
//            (Chrome; at least one deck must be unmuted), or
//   - 'mic': a microphone / line-in / loopback device.
//
// Each frame produces 0–1 values for bass, mid, high, level, and a decaying 'beat'
// envelope that jumps to 1 on detected kicks. Levels are auto-normalized against a
// slowly-decaying peak so quiet mics and hot line signals both use the full range.

export const REACT_BANDS = ['bass', 'mid', 'high', 'level', 'beat'];

const BANDS_HZ = { bass: [20, 150], mid: [150, 2000], high: [2000, 10000], level: [20, 10000] };

export class AudioReactor {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.stream = null;
    this.src = null;
    this.kind = 'off';
    this.sensitivity = 50;       // 0–100, set by the UI
    this.onEnded = null;         // called when the user stops sharing from Chrome's UI

    this.values = { bass: 0, mid: 0, high: 0, level: 0, beat: 0 };
    this.peaks = { bass: 0.2, mid: 0.2, high: 0.2, level: 0.2 };
    this.onset = false;          // true only on the frame a kick is detected
    this.bassAvg = 0;
    this.lastBeat = 0;
    this.lastNow = 0;
  }

  get active() { return !!this.analyser; }

  value(band) { return this.values[band] ?? 0; }

  async start(kind) {
    this.stop();
    let stream;
    if (kind === 'mic') {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } else if (kind === 'tab') {
      if (!navigator.mediaDevices.getDisplayMedia) throw new Error('Tab audio capture needs desktop Chrome or Edge');
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,                                 // required by the API; dropped below
        audio: { suppressLocalAudioPlayback: false },
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        systemAudio: 'include',
      });
      stream.getVideoTracks().forEach((t) => t.stop());
      if (!stream.getAudioTracks().length) {
        throw new Error('No audio was shared. Pick this tab and turn on “Share tab audio”.');
      }
    } else {
      return;
    }

    this.ctx ||= new AudioContext();
    await this.ctx.resume();
    this.src = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.5;
    this.src.connect(this.analyser);               // analysis only; never routed to the speakers
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.stream = stream;
    this.kind = kind;

    stream.getAudioTracks()[0].addEventListener('ended', () => {
      this.stop();
      this.onEnded?.();
    });
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    try { this.src?.disconnect(); } catch { /* ignore */ }
    this.stream = this.src = this.analyser = null;
    this.kind = 'off';
  }

  bandEnergy(lo, hi) {
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const a = Math.max(1, Math.floor(lo / binHz));
    const b = Math.min(this.data.length - 1, Math.ceil(hi / binHz));
    let sum = 0;
    for (let i = a; i <= b; i++) sum += this.data[i];
    return sum / ((b - a + 1) * 255);
  }

  /** Call once per animation frame. */
  update(now) {
    const dt = Math.min(100, now - (this.lastNow || now));
    this.lastNow = now;
    this.onset = false;
    const v = this.values;

    if (!this.analyser) {
      for (const k of Object.keys(v)) v[k] *= 0.9;
      return;
    }

    this.analyser.getByteFrequencyData(this.data);
    // Sensitivity sets the noise floor: 0 → only loud peaks register, 100 → almost everything does.
    const floor = 0.55 - this.sensitivity * 0.005;

    for (const [band, [lo, hi]] of Object.entries(BANDS_HZ)) {
      const raw = this.bandEnergy(lo, hi);
      this.peaks[band] = Math.max(raw, this.peaks[band] * 0.997, 0.04);
      const norm = Math.min(1, Math.max(0, (raw / this.peaks[band] - floor) / (1 - floor)));
      // Fast attack, slower release.
      v[band] = norm > v[band] ? norm : v[band] * 0.82 + norm * 0.18;

      if (band === 'bass') {
        // Kick detection: bass jumps well above its recent average.
        this.bassAvg = this.bassAvg * 0.94 + raw * 0.06;
        if (raw > this.bassAvg * 1.3 && raw > 0.12 && norm > 0.3 && now - this.lastBeat > 180) {
          this.lastBeat = now;
          this.onset = true;
        }
      }
    }

    v.beat = this.onset ? 1 : v.beat * Math.exp(-dt / 140);
  }
}
