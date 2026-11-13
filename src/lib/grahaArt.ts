/**
 * Draws the seven grahas (graha.ts) on a canvas: small, softly lit spheres,
 * recognisable at a glance. Index 0 is the Sun, as in GRAHAS. `phase` (0–1,
 * 0 new, 0.5 full) shapes the Moon.
 */

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function drawGraha(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, index: number, phase = 0.5): void {
  const light = -0.6; // lit from the upper left
  ctx.save();
  const glow = (rgb: string, alpha: number, reach: number) => {
    const g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * reach);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * reach, 0, Math.PI * 2);
    ctx.fill();
  };
  const disc = (stops: [number, string][]) => {
    const g = ctx.createRadialGradient(cx + light * r * 0.5, cy - r * 0.45, r * 0.1, cx, cy, r * 1.05);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const shade = (depth = 0.85) => {
    const g = ctx.createLinearGradient(cx + light * r, cy - r * 0.4, cx - light * r, cy + r * 0.4);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.15)');
    g.addColorStop(1, `rgba(0,0,0,${depth})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const clip = () => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
  };
  const spots = (seed: number, count: number, color: string, w: number, h: number) => {
    const next = seeded(seed);
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + (next() - 0.5) * r * 1.4, cy + (next() - 0.5) * r * 1.4, r * (w + next() * w), r * (h + next() * h), next() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  if (index === 0) {
    // Sūrya
    glow('255,190,90', 0.32, 3);
    glow('255,220,150', 0.5, 1.7);
    disc([[0, '#fff6dc'], [0.55, '#ffd27a'], [1, '#f39a2e']]);
  } else if (index === 1) {
    // Chandra, in today's phase
    glow('220,225,240', 0.1, 2.2);
    disc([[0, '#f3f1ea'], [1, '#bdb8ad']]);
    ctx.save();
    clip();
    spots(7, 8, 'rgba(120,115,105,0.28)', 0.1, 0.08);
    const waxing = phase < 0.5;
    const k = Math.cos(phase * 2 * Math.PI); // 1 new … -1 full
    ctx.fillStyle = 'rgba(0,0,0,0.93)';
    ctx.beginPath();
    // The dark half, then the terminator's ellipse closing it.
    ctx.arc(cx, cy, r + 0.5, -Math.PI / 2, Math.PI / 2, waxing);
    ctx.ellipse(cx, cy, Math.abs(k) * (r + 0.5), r + 0.5, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing);
    ctx.fill();
    ctx.restore();
  } else if (index === 2) {
    // Maṅgala
    glow('255,110,70', 0.12, 2);
    disc([[0, '#f0a070'], [0.6, '#c45a32'], [1, '#7e2e18']]);
    ctx.save();
    clip();
    spots(3, 6, 'rgba(90,30,15,0.3)', 0.18, 0.06);
    ctx.fillStyle = 'rgba(255,245,235,0.75)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.92, r * 0.34, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    shade();
  } else if (index === 3) {
    // Budha
    glow('210,200,190', 0.08, 1.8);
    disc([[0, '#d8d2ca'], [1, '#7d766e']]);
    ctx.save();
    clip();
    spots(11, 12, 'rgba(70,64,58,0.22)', 0.05, 0.05);
    ctx.restore();
    shade(0.9);
  } else if (index === 4) {
    // Bṛhaspati
    glow('240,210,170', 0.1, 2);
    disc([[0, '#f2e2c6'], [1, '#b08d64']]);
    ctx.save();
    clip();
    ctx.globalAlpha = 0.55;
    for (const [y, h, color] of [[-0.62, 0.1, '#a8774e'], [-0.3, 0.13, '#c99a6a'], [0.05, 0.08, '#9b6a44'], [0.32, 0.12, '#b98a5e'], [0.62, 0.09, '#a07450']] as const) {
      ctx.fillStyle = color;
      ctx.fillRect(cx - r, cy + y * r, r * 2, h * r * 1.4);
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#c0603e';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.3, cy + r * 0.38, r * 0.2, r * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    shade(0.8);
  } else if (index === 5) {
    // Śukra
    glow('255,248,225', 0.25, 2.6);
    disc([[0, '#fffaf0'], [0.6, '#f1e3bf'], [1, '#c9b07c']]);
    shade(0.75);
  } else {
    // Śani, with its rings: the far half behind, the near half in front
    const ring = (front: boolean) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.38);
      ctx.scale(1, 0.32);
      ctx.beginPath();
      ctx.rect(-r * 2.4, front ? 0 : -r * 2.4, r * 4.8, r * 2.4);
      ctx.clip();
      for (const [a, b, alpha] of [[1.25, 1.55, 0.55], [1.6, 2.05, 0.75], [2.1, 2.25, 0.35]]) {
        ctx.strokeStyle = `rgba(222,200,150,${alpha})`;
        ctx.lineWidth = (b - a) * r;
        ctx.beginPath();
        ctx.arc(0, 0, ((a + b) / 2) * r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    };
    glow('240,215,160', 0.08, 2.2);
    ring(false);
    disc([[0, '#f3e1b4'], [1, '#a98a52']]);
    ctx.save();
    clip();
    ctx.globalAlpha = 0.35;
    for (const [y, color] of [[-0.4, '#b08b55'], [0.1, '#9c7a48'], [0.45, '#b49460']] as const) {
      ctx.fillStyle = color;
      ctx.fillRect(cx - r, cy + y * r, r * 2, r * 0.18);
    }
    ctx.restore();
    shade(0.8);
    ring(true);
  }
  ctx.restore();
}
