/* Sound for the film of the size page: a heavy, soft "boooofff" whenever an ice cube lands (think of a giant block of ice settling on the meadows next to Bern).
   A classic script (size.html is not bundled): window.DropSound = { wanted(), make(hits, total) }.
   Synthesised with Web Audio (no files, no licences), rendered offline into one mono buffer of the film's length and encoded as AAC for muxMp4.
   hits: [{t, speed, e}] = second of the landing, speed of the fall in m/s (scene units), edge of the cube in m. Browsers that cannot encode AAC, and any failure, give a silent film. */
(function () {
  const RATE = 48000;

  let noiseCache = null;
  const noiseBuf = c => { if (!noiseCache || noiseCache.sampleRate !== c.sampleRate) { const n = c.sampleRate * 3, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let s = 12345; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; } noiseCache = b; } return noiseCache; };      // the same noise every time

  /* One landing at second t. amp 0..1 from the speed, size 0..1 from the edge (a bigger block is lower and lasts longer) */
  function boof(c, out, t, amp, size) {
    const len = 1.0 + 0.9 * size, f0 = 1.18 - 0.5 * size;      // pitch factor: the smallest block about 1.2x, the biggest 0.7x
    const tone = (f1, f2, sweep, dur, gain, delay = 0) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(f1 * f0, t + delay); o.frequency.exponentialRampToValueAtTime(f2 * f0, t + delay + sweep);
      g.gain.setValueAtTime(0.0001, t + delay); g.gain.linearRampToValueAtTime(gain * amp, t + delay + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g); g.connect(out); o.start(t + delay); o.stop(t + delay + dur + 0.05);
    };
    const noise = (type, f1, f2, sweep, q, dur, gain, attack, delay = 0) => {
      const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noiseBuf(c); s.loop = true; fl.type = type; fl.Q.value = q;
      fl.frequency.setValueAtTime(f1, t + delay); fl.frequency.exponentialRampToValueAtTime(f2, t + delay + sweep);
      g.gain.setValueAtTime(0.0001, t + delay); g.gain.linearRampToValueAtTime(gain * amp, t + delay + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      s.connect(fl); fl.connect(g); g.connect(out); s.start(t + delay); s.stop(t + delay + dur + 0.05);
    };
    tone(115, 40, 0.30, 0.55 * len, 0.9);            // the thud: a low note that drops
    tone(62, 27, 0.60, 1.30 * len, 0.8, 0.012);       // the weight underneath, a little later and longer
    tone(210, 85, 0.18, 0.22 * len, 0.35);            // a bit of body that small speakers can play
    noise('lowpass', 520, 90, 0.35, 0.7, 0.75 * len, 1.1, 0.004);      // the whump of air and ground
    noise('bandpass', 750, 260, 0.9, 0.6, 1.0 * len, 0.30, 0.05, 0.02);      // the soft "fff" of the air pushed out, after the thud
    noise('lowpass', 1500, 400, 0.05, 0.7, 0.05, 0.5, 0.0015);      // a short dull knock at the very first instant
  }

  /* Soft clipping gives the low notes harmonics (a phone speaker cannot play 30 Hz but plays the 90 Hz above it) */
  const squash = c => { const n = 1024, curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(1.8 * x) / Math.tanh(1.8); } const w = c.createWaveShaper(); w.curve = curve; return w; };

  const hitSet = hits => hits.filter(h => h && h.speed > 0).map(h => ({ t: h.t, amp: Math.min(1, 0.2 + 0.8 * Math.pow(Math.min(1, h.speed / 700), 0.55)), size: Math.max(0, Math.min(1, (h.e - 250) / 2200)) }));

  window.DropSound = {
    boof,
    wanted() { const e = document.getElementById('vSound'); return !!(e && e.checked) && typeof AudioEncoder !== 'undefined' && typeof OfflineAudioContext !== 'undefined' && typeof AudioData !== 'undefined'; },
    /** Renders the landings into one mono buffer (Float32Array) of `total` seconds, not encoded: the same buffer is used for the AAC track and for the tests. */
    async render(hits, total) {
      const hs = hitSet(hits); if (!hs.length) return null;
      const frames = Math.ceil(total * RATE), oc = new OfflineAudioContext(1, frames, RATE);
      const bus = oc.createGain(), sh = squash(oc), comp = oc.createDynamicsCompressor(), master = oc.createGain();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25; master.gain.value = 0.7;
      bus.gain.value = 0.55; bus.connect(sh); sh.connect(comp); comp.connect(master); master.connect(oc.destination);
      hs.forEach(h => { if (h.t < total) boof(oc, bus, Math.max(0, h.t - 2112 / RATE), h.amp, h.size); });      // (the AAC encoder delays the sound by 2112 samples: the sound starts that much earlier, so that it sits on the landing)
      return (await oc.startRendering()).getChannelData(0);
    },
    /** Resolves to the audio object muxMp4 takes, or null (silent film). */
    async make(hits, total) {
      if (!this.wanted()) return null;
      try {
        const cfg = { codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 1, bitrate: 96000 };
        if (!(await AudioEncoder.isConfigSupported(cfg)).supported) return null;
        const pcm = await this.render(hits, total); if (!pcm) return null;
        const frames = pcm.length, samples = []; let asc = null, err = null;
        const enc = new AudioEncoder({
          output: (chunk, meta) => { if (!asc && meta && meta.decoderConfig && meta.decoderConfig.description) asc = new Uint8Array(meta.decoderConfig.description); const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); samples.push({ data: d }); },
          error: e => { err = e; }
        });
        enc.configure(cfg);
        for (let i = 0; i < frames; i += 4096) {
          const part = pcm.slice(i, Math.min(frames, i + 4096));
          enc.encode(new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: part.length, numberOfChannels: 1, timestamp: Math.round(i * 1e6 / RATE), data: part }));
        }
        await enc.flush(); enc.close();
        if (err || !asc || !samples.length) return null;
        return { sampleRate: RATE, channels: 1, asc, samples };
      } catch (e) { console.warn('Sound skipped:', e); return null; }
    }
  };
})();
