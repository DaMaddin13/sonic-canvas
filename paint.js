/**
 * Deterministic painter.
 * One current, one material: wash, orbit and grain are the same stroke family.
 */
const SonicPaint = (() => {
  const { makeRng, seedFromHash, makeNoise, lerp, clamp, mixHex, withAlpha } = SonicMath;

  const PALETTES = {
    metal: ["#070304", "#1a0808", "#2b0d0d", "#5a1212", "#8f1d1d", "#c43c2b", "#e8a17a", "#6e6a68", "#2a2a2c"],
    pop: ["#1b1030", "#ff6b9d", "#ffc857", "#7afcff", "#c3f584", "#ff8a5b", "#b388ff", "#fff4d6"],
    ambient: ["#0b1020", "#141c32", "#2a3b5c", "#6b8cae", "#c9b37a", "#e7dcc8", "#8ea7c3"],
    melancholy: ["#0c1018", "#172033", "#2d3a55", "#4d5e7a", "#8b9bb4", "#c5b8a5", "#6a4a5a"],
    jazz: ["#160e08", "#3a2314", "#8a4b1f", "#d4a35a", "#f0d3a0", "#4e6b5a", "#b5523a"],
  };

  function blendPalettes(scores) {
    const keys = Object.keys(PALETTES);
    const weights = keys.map((k) => Math.pow(scores[k] ?? 0.05, 1.4));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const n = 8;
    const out = [];
    for (let i = 0; i < n; i++) {
      let r = 0, g = 0, b = 0;
      keys.forEach((k, ki) => {
        const pal = PALETTES[k];
        const idx = Math.min(pal.length - 1, Math.round(i * (pal.length - 1) / (n - 1)));
        const rgb = SonicMath.hexToRgb(pal[idx]);
        const w = weights[ki] / sum;
        r += rgb[0] * w; g += rgb[1] * w; b += rgb[2] * w;
      });
      out.push(SonicMath.rgbToHex([r, g, b]));
    }
    return out;
  }

  function colorAt(pal, t) {
    const x = clamp(t, 0, 0.999) * (pal.length - 1);
    const i = Math.floor(x);
    return mixHex(pal[i], pal[Math.min(pal.length - 1, i + 1)], x - i);
  }

  function envAt(env, angle) {
    let t = angle / (Math.PI * 2);
    t = t - Math.floor(t);
    const i = t * (env.length - 1);
    const a = Math.floor(i);
    const b = Math.min(env.length - 1, a + 1);
    return lerp(env[a], env[b], i - a);
  }

  function paint(canvas, feat) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const rng = makeRng(seedFromHash(feat.hashBytes));
    const noise = makeNoise(makeRng(seedFromHash(feat.hashBytes)));

    const pal = blendPalettes(feat.mood.scores);
    const dark = pal[0];
    const energy = feat.energy;
    const bright = feat.brightness;
    const rough = feat.roughness;
    const env = feat.envelope;
    const bands = feat.bands;

    const formRng = rng();
    const scores = {
      vortex: energy * 0.55 + rough * 0.35 + formRng * 0.15,
      wave: feat.mid * 0.45 + (1 - feat.bass) * 0.2 + formRng * 0.25,
      ribbon: bright * 0.35 + feat.high * 0.35 + formRng * 0.2,
      twin: feat.bass * 0.4 + energy * 0.25 + formRng * 0.25,
      bloom: (1 - energy) * 0.5 + (1 - rough) * 0.25 + formRng * 0.2,
    };
    let form = "vortex";
    let best = -1;
    for (const [k, v] of Object.entries(scores)) {
      if (v > best) { best = v; form = k; }
    }

    const cx = W * (0.42 + rng() * 0.16);
    const cy = H * (0.42 + rng() * 0.16);
    const cx2 = clamp(W - cx + (rng() - 0.5) * W * 0.1, W * 0.28, W * 0.72);
    const cy2 = clamp(H - cy + (rng() - 0.5) * H * 0.1, H * 0.28, H * 0.72);
    const ringR = W * (0.24 + feat.bass * 0.05 + energy * 0.03);
    const ecc = 0.72 + feat.mid * 0.28 + rng() * 0.08;
    const swirl = (rng() > 0.5 ? 1 : -1) * (0.7 + energy * 0.7);
    const turb = 0.45 + rough * 1.0;
    const heading = rng() * Math.PI * 2;

    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, W, H);

    const ground = ctx.createRadialGradient(cx, cy, W * 0.02, cx, cy, W * 0.72);
    ground.addColorStop(0, withAlpha(colorAt(pal, 0.35 + bright * 0.2), 0.55));
    ground.addColorStop(0.55, withAlpha(colorAt(pal, 0.18), 0.4));
    ground.addColorStop(1, withAlpha(dark, 1));
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, W, H);

    const grain = ctx.getImageData(0, 0, W, H);
    const px = grain.data;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const n = noise.fbm(x * 0.013, y * 0.013, 3);
        const v = (n - 0.5) * (12 + rough * 14);
        for (let oy = 0; oy < 2; oy++) {
          for (let ox = 0; ox < 2; ox++) {
            const xx = x + ox, yy = y + oy;
            if (xx >= W || yy >= H) continue;
            const i = (yy * W + xx) * 4;
            px[i] = clamp(px[i] + v, 0, 255);
            px[i + 1] = clamp(px[i + 1] + v * 0.92, 0, 255);
            px[i + 2] = clamp(px[i + 2] + v * 0.86, 0, 255);
          }
        }
      }
    }
    ctx.putImageData(grain, 0, 0);

    function field(x, y) {
      const nx = noise.fbm(x * 0.0021, y * 0.0021, 4) - 0.5;
      const ny = noise.fbm(x * 0.0021 + 8.1, y * 0.0021, 4) - 0.5;
      const around = (ox, oy, radius, spin) => {
        const dx = x - ox;
        const dy = (y - oy) / ecc;
        const dist = Math.hypot(dx, dy) + 0.0001;
        const ang = Math.atan2(dy, dx);
        const e = envAt(env, ang);
        const target = radius * (0.82 + e * 0.36);
        const pull = clamp((target - dist) / radius, -1, 1);
        return [
          (-dy / dist) * spin + (dx / dist) * pull,
          (dx / dist) * spin + (dy / dist) * pull,
        ];
      };

      let vx = 0, vy = 0;
      if (form === "vortex") {
        const a = around(cx, cy, ringR, swirl);
        vx = a[0]; vy = a[1];
      } else if (form === "wave") {
        const e = envAt(env, (x / W) * Math.PI * 2);
        vx = Math.cos(heading) * (0.9 + e * 0.5);
        vy = Math.sin(heading) * 0.25 + (e - 0.35) * 1.4 + Math.sin(x * 0.008 + heading) * 0.45;
      } else if (form === "ribbon") {
        const e = envAt(env, (x / W + y / H) * Math.PI);
        const spine = Math.sin((x * Math.cos(heading) + y * Math.sin(heading)) * 0.006);
        vx = Math.cos(heading + spine * 0.6) * (0.8 + e);
        vy = Math.sin(heading + spine * 0.6) * (0.8 + e);
      } else if (form === "twin") {
        const a = around(cx, cy, ringR * 0.72, swirl);
        const b = around(cx2, cy2, ringR * 0.62, -swirl * 0.85);
        const w1 = 1 / (Math.hypot(x - cx, y - cy) + 80);
        const w2 = 1 / (Math.hypot(x - cx2, y - cy2) + 80);
        vx = (a[0] * w1 + b[0] * w2) / (w1 + w2);
        vy = (a[1] * w1 + b[1] * w2) / (w1 + w2);
      } else {
        const a = around(cx, cy, ringR * 1.15, swirl * 0.35);
        vx = a[0] * 0.45 + nx * 0.8;
        vy = a[1] * 0.45 + ny * 0.8;
      }
      return [vx + nx * turb, vy + ny * turb];
    }

    function strokeRun(count, steps, width0, width1, alpha0, alpha1, spawn) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 0; i < count; i++) {
        const p0 = spawn(i);
        let x = p0.x;
        let y = p0.y;
        const tint = p0.tint;
        ctx.beginPath();
        ctx.moveTo(x, y);
        let alive = true;
        for (let s = 0; s < steps && alive; s++) {
          const [vx, vy] = field(x, y);
          const len = Math.hypot(vx, vy) || 1;
          x += (vx / len) * p0.step;
          y += (vy / len) * p0.step;
          if (x < -40 || y < -40 || x > W + 40 || y > H + 40) alive = false;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = withAlpha(colorAt(pal, tint), lerp(alpha0, alpha1, clamp(p0.tint, 0, 1)));
        ctx.lineWidth = lerp(width0, width1, p0.press);
        ctx.stroke();
      }
    }

    const spawnDisk = (spread) => () => {
      let x, y, a, e;
      if (form === "wave" || form === "ribbon") {
        x = rng() * W;
        y = H * (0.22 + rng() * 0.56);
        a = Math.atan2(y - cy, x - cx);
        e = envAt(env, (x / W) * Math.PI * 2);
      } else if (form === "twin" && rng() > 0.5) {
        a = rng() * Math.PI * 2;
        const r = Math.pow(rng(), 0.55) * spread;
        x = cx2 + Math.cos(a) * r;
        y = cy2 + Math.sin(a) * r * ecc;
        e = envAt(env, a);
      } else {
        a = rng() * Math.PI * 2;
        const r = Math.pow(rng(), 0.55) * spread;
        x = cx + Math.cos(a) * r;
        y = cy + Math.sin(a) * r * ecc;
        e = envAt(env, a);
      }
      return {
        x, y,
        step: 4 + energy * 6 + rng() * 4,
        press: 0.25 + e * 0.6 + rng() * 0.2,
        tint: clamp(0.15 + e * 0.45 + rng() * 0.2 + bands[Math.floor(rng() * 32)] * 0.12, 0, 1),
      };
    };

    const spawnOrbit = () => {
      const a = rng() * Math.PI * 2;
      const e = envAt(env, a);
      if (form === "wave" || form === "ribbon") {
        const t = rng();
        const x = W * (0.08 + t * 0.84);
        const y = cy + Math.sin(t * Math.PI * 2 + heading) * H * (0.08 + e * 0.12);
        return {
          x, y,
          step: 5 + energy * 7,
          press: 0.4 + e * 0.55,
          tint: clamp(0.35 + e * 0.4 + bright * 0.15, 0, 1),
        };
      }
      const focusX = form === "twin" && rng() > 0.5 ? cx2 : cx;
      const focusY = focusX === cx2 ? cy2 : cy;
      const r = ringR * (0.78 + e * 0.34 + (rng() - 0.5) * 0.08);
      return {
        x: focusX + Math.cos(a) * r,
        y: focusY + Math.sin(a) * r * ecc,
        step: 5 + energy * 7,
        press: 0.45 + e * 0.55,
        tint: clamp(0.35 + e * 0.4 + bright * 0.15, 0, 1),
      };
    };

    strokeRun(90 + Math.floor(energy * 40), 28, 28 + energy * 36, 70 + energy * 50, 0.035, 0.09, spawnDisk(W * 0.42));
    strokeRun(160 + Math.floor(energy * 90), 46, 4 + energy * 5, 16 + energy * 10, 0.08, 0.2, spawnDisk(W * 0.38));
    strokeRun(120 + Math.floor(energy * 70), 38, 2.2 + energy * 3, 8 + energy * 6, 0.14, 0.32, spawnOrbit);
    strokeRun(70 + Math.floor(feat.high * 80 + energy * 30), 32, 0.6, 2.2, 0.1, 0.22, spawnDisk(W * 0.34));

    const dots = Math.floor(220 + feat.high * 500 + energy * 200);
    for (let i = 0; i < dots; i++) {
      const a = rng() * Math.PI * 2;
      const e = envAt(env, a);
      const r = ringR * (0.15 + rng() * 1.15) * (0.85 + e * 0.25);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * ecc;
      ctx.fillStyle = withAlpha(colorAt(pal, 0.3 + e * 0.4), 0.05 + e * 0.12);
      ctx.beginPath();
      ctx.arc(x, y, 0.5 + rng() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    const vig = ctx.createRadialGradient(cx, cy, W * 0.2, cx, cy, W * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, withAlpha(dark, 0.38 + (1 - bright) * 0.16));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.fillStyle = withAlpha(colorAt(pal, 0.85), 0.4);
    ctx.font = "22px 'Cormorant Garamond', serif";
    ctx.textAlign = "right";
    ctx.fillText("Sonic Canvas", W - 48, H - 56);
    ctx.font = "12px Outfit, sans-serif";
    ctx.fillStyle = withAlpha(colorAt(pal, 0.8), 0.28);
    ctx.fillText(feat.hashHex.slice(0, 12), W - 48, H - 36);
    ctx.restore();

    const formLabels = {
      vortex: "Wirbel",
      wave: "Welle",
      ribbon: "Band",
      twin: "Zwillingsfeld",
      bloom: "Blüte",
    };
    feat.form = form;
    feat.formLabel = formLabels[form] || form;

    return { signature: feat.hashHex.slice(0, 12), palette: pal, form };
  }

  return { paint };
})();
