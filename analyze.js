/**
 * Audio analysis + synthetic demos.
 * Features are coarse but stable: same buffer => same numbers.
 */
const SonicAnalyze = (() => {
  const { clamp } = SonicMath;

  function mixToMono(buffer) {
    const n = buffer.length;
    const ch = buffer.numberOfChannels;
    const out = new Float32Array(n);
    for (let c = 0; c < ch; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += data[i] / ch;
    }
    return out;
  }

  function downsample(samples, fromRate, toRate) {
    if (toRate >= fromRate) return samples;
    const ratio = fromRate / toRate;
    const len = Math.floor(samples.length / ratio);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
      let s = 0;
      for (let j = start; j < end; j++) s += samples[j];
      out[i] = s / Math.max(1, end - start);
    }
    return { samples: out, rate: toRate };
  }

  function rms(samples) {
    let s = 0;
    for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
    return Math.sqrt(s / Math.max(1, samples.length));
  }

  function peakAbs(samples) {
    let p = 0;
    for (let i = 0; i < samples.length; i++) {
      const a = Math.abs(samples[i]);
      if (a > p) p = a;
    }
    return p;
  }

  /** Downsampled amplitude envelope (512 points). */
  function envelope(samples, bins = 512) {
    const env = new Float32Array(bins);
    const step = samples.length / bins;
    for (let i = 0; i < bins; i++) {
      const a = Math.floor(i * step);
      const b = Math.floor((i + 1) * step);
      let m = 0;
      for (let j = a; j < b; j++) {
        const v = Math.abs(samples[j] || 0);
        if (v > m) m = v;
      }
      env[i] = m;
    }
    return env;
  }

  function mean(arr) {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / Math.max(1, arr.length);
  }

  /**
   * Average magnitude spectrum via successive DFT windows on a short grid.
   * Not a fast FFT, but windows are small and few — stable and dependency-free.
   */
  function averageSpectrum(samples, sampleRate, fftSize = 1024, hopWindows = 48) {
    const n = samples.length;
    if (n < fftSize) fftSize = 1 << Math.floor(Math.log2(Math.max(32, n)));
    const half = fftSize / 2;
    const acc = new Float32Array(half);
    const window = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
    }

    const maxStart = Math.max(1, n - fftSize);
    const hops = Math.min(hopWindows, Math.max(1, Math.floor(n / fftSize)));
    for (let h = 0; h < hops; h++) {
      const start = Math.floor((h / Math.max(1, hops - 1)) * maxStart);
      for (let k = 0; k < half; k++) {
        let re = 0, im = 0;
        const omega = (2 * Math.PI * k) / fftSize;
        for (let i = 0; i < fftSize; i++) {
          const v = (samples[start + i] || 0) * window[i];
          re += v * Math.cos(omega * i);
          im -= v * Math.sin(omega * i);
        }
        acc[k] += Math.hypot(re, im);
      }
    }
    for (let k = 0; k < half; k++) acc[k] /= hops;

    const nyquist = sampleRate / 2;
    const freqOf = (k) => (k / half) * nyquist;
    let bass = 0, mid = 0, high = 0, centroidNum = 0, centroidDen = 0;
    for (let k = 1; k < half; k++) {
      const f = freqOf(k);
      const m = acc[k];
      centroidNum += f * m;
      centroidDen += m;
      if (f < 200) bass += m;
      else if (f < 2000) mid += m;
      else high += m;
    }
    const total = bass + mid + high || 1;
    const centroid = centroidDen > 0 ? centroidNum / centroidDen : 1000;

    const bands = new Float32Array(32);
    for (let i = 0; i < 32; i++) {
      const t0 = i / 32;
      const t1 = (i + 1) / 32;
      const f0 = 30 * Math.pow(nyquist / 30, t0);
      const f1 = 30 * Math.pow(nyquist / 30, t1);
      let s = 0, c = 0;
      for (let k = 1; k < half; k++) {
        const f = freqOf(k);
        if (f >= f0 && f < f1) { s += acc[k]; c++; }
      }
      bands[i] = c ? s / c : 0;
    }
    let maxB = 0;
    for (let i = 0; i < 32; i++) if (bands[i] > maxB) maxB = bands[i];
    if (maxB > 0) for (let i = 0; i < 32; i++) bands[i] /= maxB;

    return {
      bass: bass / total,
      mid: mid / total,
      high: high / total,
      centroid,
      brightness: clamp((Math.log2(centroid / 200) / Math.log2(8000 / 200)), 0, 1),
      bands,
    };
  }

  function roughnessFromEnv(env) {
    let s = 0;
    for (let i = 1; i < env.length; i++) s += Math.abs(env[i] - env[i - 1]);
    return clamp(s / env.length * 4, 0, 1);
  }

  function mapMood(feat) {
    const energy = feat.energy;
    const bright = feat.brightness;
    const bass = feat.bass;
    const high = feat.high;
    const rough = feat.roughness;
    const mid = feat.mid;

    const metal = clamp(energy * (1.05 - bright) * (0.45 + bass) * (0.55 + rough) * 2.4, 0, 1);
    const pop = clamp(energy * (0.25 + bright) * (0.35 + mid + high * 0.4) * (1.1 - bass * 0.4) * 1.6, 0, 1);
    const ambient = clamp((1 - energy) * (0.25 + bright * 0.8) * (1.1 - rough) * 1.15, 0, 1);
    const melancholy = clamp((1 - energy * 0.65) * (1 - bright) * (0.35 + mid) * 1.35, 0, 1);
    const jazz = clamp((1 - Math.abs(energy - 0.42) * 1.2) * (0.3 + mid) * (0.4 + bright * 0.5) * 1.1, 0, 1);

    const scores = { metal, pop, ambient, melancholy, jazz };
    let best = "ambient", bestV = -1;
    for (const [k, v] of Object.entries(scores)) {
      if (v > bestV) { bestV = v; best = k; }
    }

    const labels = {
      metal: "Dunkel / druckvoll",
      pop: "Hell / farbig",
      ambient: "Ruhig / weit",
      melancholy: "Gedämpft / tief",
      jazz: "Warm / bewegt",
    };

    return { scores, key: best, label: labels[best] };
  }

  async function analyzeArrayBuffer(arrayBuffer, onStatus) {
    onStatus?.("Signatur berechnen…");
    const hashBytes = await SonicMath.sha256Bytes(arrayBuffer);
    const hashHex = SonicMath.hexFromBytes(hashBytes);

    onStatus?.("Audio dekodieren…");
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let decoded;
    try {
      decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      await ctx.close();
    }

    onStatus?.("Merkmale lesen…");
    const mono = mixToMono(decoded);
    const ds = downsample(mono, decoded.sampleRate, 11025);
    const samples = ds.samples;
    const rate = ds.rate;

    const maxN = rate * 180;
    const slice = samples.length > maxN ? samples.subarray(0, maxN) : samples;

    const energyRaw = rms(slice);
    const peak = peakAbs(slice);
    const env = envelope(slice, 512);
    const spec = averageSpectrum(slice, rate, 512, 24);

    const energy = clamp(energyRaw * 3.2, 0, 1);
    const feat = {
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      energy,
      peak,
      rms: energyRaw,
      roughness: roughnessFromEnv(env),
      envelope: env,
      ...spec,
      hashHex,
      hashBytes,
    };
    feat.mood = mapMood(feat);
    return feat;
  }

  function synthesizeDemo(kind) {
    const rate = 22050;
    const seconds = 6;
    const n = rate * seconds;
    const samples = new Float32Array(n);
    const TAU = Math.PI * 2;

    const voice = {
      metal: () => {
        for (let i = 0; i < n; i++) {
          const t = i / rate;
          const env = Math.min(1, t * 10) * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(TAU * t * 4), 3));
          const osc =
            0.7 * Math.sin(TAU * 62 * t) +
            0.45 * Math.sin(TAU * 93 * t) +
            0.28 * Math.sin(TAU * 124 * t);
          const grit = 0.08 * Math.sin(TAU * 40 * t * t);
          const chug = Math.sin(TAU * t * 5) > -0.15 ? 1 : 0.08;
          samples[i] = Math.tanh((osc + grit) * 2.4) * env * chug * 0.95;
        }
      },
      pop: () => {
        for (let i = 0; i < n; i++) {
          const t = i / rate;
          const beat = Math.pow(Math.max(0, Math.sin(TAU * t * 2.2)), 10);
          const melody = Math.sin(TAU * (523 + 160 * Math.sin(TAU * t * 0.6)) * t);
          const fifth = Math.sin(TAU * 784 * t) * 0.28;
          const spark = Math.sin(TAU * 1568 * t) * 0.16 * (0.5 + 0.5 * Math.sin(TAU * t * 4));
          samples[i] = Math.tanh(0.5 * beat * Math.sin(TAU * 98 * t) + 0.55 * melody + fifth + spark) * 0.72;
        }
      },
      ambient: () => {
        for (let i = 0; i < n; i++) {
          const t = i / rate;
          const a = Math.sin(TAU * 110 * t + Math.sin(t * 0.4));
          const b = Math.sin(TAU * 165.5 * t * 0.998);
          const c = Math.sin(TAU * 220 * t * 1.003) * 0.4;
          const pad = (0.5 + 0.5 * Math.sin(t * 0.35));
          samples[i] = (a + b + c) * 0.18 * pad;
        }
      },
      jazz: () => {
        const notes = [196, 247, 294, 349, 392, 440];
        for (let i = 0; i < n; i++) {
          const t = i / rate;
          const idx = Math.floor(t * 2.4) % notes.length;
          const f = notes[idx];
          const env = Math.exp(-((t * 2.4) % 1) * 3);
          const walk = Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t);
          const ride = Math.sin(TAU * t * 8) > 0.92 ? 0.2 : 0;
          samples[i] = (walk * env * 0.35 + ride) * 0.8;
        }
      },
    };
    (voice[kind] || voice.ambient)();

    const bytes = new Uint8Array(samples.buffer.slice(0));
    const prefix = new TextEncoder().encode(`sonic-demo:${kind}:`);
    const combined = new Uint8Array(prefix.length + bytes.length);
    combined.set(prefix, 0);
    combined.set(bytes, prefix.length);
    return { samples, rate, combined };
  }

  async function analyzeDemo(kind, onStatus) {
    onStatus?.("Demo-Klang formen…");
    const { samples, rate, combined } = synthesizeDemo(kind);
    const hashBytes = await SonicMath.sha256Bytes(combined.buffer);
    const hashHex = SonicMath.hexFromBytes(hashBytes);
    const energyRaw = rms(samples);
    const env = envelope(samples, 512);
    const spec = averageSpectrum(samples, rate, 512, 16);
    const feat = {
      duration: samples.length / rate,
      sampleRate: rate,
      channels: 1,
      energy: clamp(energyRaw * 3.2, 0, 1),
      peak: peakAbs(samples),
      rms: energyRaw,
      roughness: roughnessFromEnv(env),
      envelope: env,
      ...spec,
      hashHex,
      hashBytes,
      demo: kind,
    };
    feat.mood = mapMood(feat);
    return feat;
  }

  return { analyzeArrayBuffer, analyzeDemo };
})();
