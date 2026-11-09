/* Sound for the timelapse exports: one very soft clock-like tick whenever the year changes (picked in scripts/tools/sound-demo.html, level "barely there").
   Synthesised with Web Audio (no files, no licences), rendered offline into one mono buffer of exactly the video's length and encoded as AAC for muxMp4.
   Videos without year changes (slider, orbit) and browsers that cannot encode AAC get no audio track; any failure also gives a silent video. */

const RATE = 48000, VOL = 0.035;

let noiseCache = null;
const noiseBuf = c => { if (!noiseCache || noiseCache.sampleRate !== c.sampleRate) { const n = c.sampleRate * 3, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; noiseCache = b; } return noiseCache; };
function tick(c, out, t){            // a dry knock of about 14 ms with a little wood under it, identical every time
  const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), osc = c.createOscillator(), og = c.createGain();
  s.buffer = noiseBuf(c); s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 3100; bp.Q.value = 5;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(VOL, t + 0.0008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
  s.connect(bp); bp.connect(g); g.connect(out); s.start(t); s.stop(t + 0.03);
  osc.type = 'sine'; osc.frequency.setValueAtTime(680, t); osc.frequency.exponentialRampToValueAtTime(300, t + 0.023);
  og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(VOL * 0.5, t + 0.0008); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.023);
  osc.connect(og); og.connect(out); osc.start(t); osc.stop(t + 0.05);
}

/** The moments (seconds) of the ticks of a timelapse: every change of year after the first picture. */
export const tickTimes = (steps, per) => Array.from({ length: Math.max(0, steps - 1) }, (_, i) => (i + 1) * per);

export const soundWanted = () => { const e = document.getElementById('vSound'); return !!(e && /** @type {HTMLInputElement} */ (e).checked) && typeof AudioEncoder !== 'undefined' && typeof OfflineAudioContext !== 'undefined' && typeof AudioData !== 'undefined'; };

/** Renders and encodes the ticks; resolves to the audio object muxMp4 takes, or null (silent video). */
export async function makeAudio(times, total){
  if (!times.length || !soundWanted()) return null;
  try {
    const cfg = { codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 1, bitrate: 64000 };
    if (!(await AudioEncoder.isConfigSupported(cfg)).supported) return null;
    const frames = Math.ceil(total * RATE), oc = new OfflineAudioContext(1, frames, RATE);
    times.forEach(t => { if (t < total) tick(oc, oc.destination, Math.max(0, t - 2112 / RATE)); });      // (the AAC encoder delays the sound by 2112 samples: the ticks start that much earlier, so that they sit on the change of picture)
    const pcm = (await oc.startRendering()).getChannelData(0);
    const samples = []; let asc = null, err = null;
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

/* The preview plays the same tick live, at every change of year (same synthesis, a real-time AudioContext made on first use, which is inside the click that starts the preview). */
let liveCtx = null;
export function previewTick(){
  const e = document.getElementById('vSound'); if (!e || !(/** @type {HTMLInputElement} */ (e).checked)) return;
  try {
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext; if (!AC) return;
    if (!liveCtx) liveCtx = new AC();
    if (liveCtx.state === 'suspended') liveCtx.resume();
    tick(liveCtx, liveCtx.destination, liveCtx.currentTime + 0.005);
  } catch (err) { /* no sound in the preview */ }
}
