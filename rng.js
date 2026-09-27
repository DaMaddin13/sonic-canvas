/**
 * Deterministic helpers: hash, PRNG, value noise.
 * Same seed + same calls => identical numbers.
 */
const SonicMath = (() => {
  async function sha256Bytes(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return new Uint8Array(digest);
  }

  function hexFromBytes(bytes) {
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function seedFromHash(hashBytes) {
    const view = new DataView(hashBytes.buffer, hashBytes.byteOffset, 16);
    return [
      view.getUint32(0),
      view.getUint32(4),
      view.getUint32(8),
      view.getUint32(12),
    ];
  }

  /** sfc32 */
  function makeRng(seeds) {
    let [a, b, c, d] = seeds;
    return function rng() {
      a |= 0; b |= 0; c |= 0; d |= 0;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  function hashStringToSeeds(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(t) { return t * t * (3 - 2 * t); }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  function rgbToHex([r, g, b]) {
    const c = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
  }

  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex([
      lerp(A[0], B[0], t),
      lerp(A[1], B[1], t),
      lerp(A[2], B[2], t),
    ]);
  }

  function withAlpha(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  /** Value noise 2D, seeded lattice */
  function makeNoise(rng) {
    const table = new Float32Array(256);
    const perm = new Uint8Array(512);
    for (let i = 0; i < 256; i++) table[i] = rng();
    const p = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

    function val(ix, iy) {
      return table[perm[(perm[ix & 255] + iy) & 255]];
    }

    function noise2(x, y) {
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = smooth(x - x0), fy = smooth(y - y0);
      const n00 = val(x0, y0);
      const n10 = val(x0 + 1, y0);
      const n01 = val(x0, y0 + 1);
      const n11 = val(x0 + 1, y0 + 1);
      return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
    }

    function fbm(x, y, oct = 4) {
      let amp = 0.5, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < oct; i++) {
        sum += amp * noise2(x * freq, y * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      return sum / norm;
    }

    return { noise2, fbm };
  }

  return {
    sha256Bytes,
    hexFromBytes,
    seedFromHash,
    makeRng,
    hashStringToSeeds,
    lerp,
    clamp,
    mixHex,
    withAlpha,
    hexToRgb,
    rgbToHex,
    makeNoise,
  };
})();
