/* All brushes are generated locally with the Canvas 2D API. No images, APIs, or dependencies. */

export const BRUSHES = [
  { id: 'pen', label: 'Pen', icon: '✏️' },
  { id: 'moon', label: 'Moons', icon: '🌙' },
  { id: 'clover', label: 'Clovers', icon: '🍀' },
  { id: 'glow', label: 'Glow dots', icon: '🟣' },
  { id: 'sparkle', label: 'Sparkles', icon: '✨' },
  { id: 'rainbow', label: 'Rainbow', icon: '🌈' },
  { id: 'multicolor', label: 'Color mix', icon: '🎨' },
  { id: 'eraser', label: 'Eraser', icon: '🧽' }
];

export const COLORS = [
  { name: 'Black', value: '#29213d' },
  { name: 'Red', value: '#ed4264' },
  { name: 'Orange', value: '#fa8b34' },
  { name: 'Yellow', value: '#f3cc24' },
  { name: 'Green', value: '#2bbb70' },
  { name: 'Teal', value: '#1dbbb9' },
  { name: 'Blue', value: '#357af2' },
  { name: 'Purple', value: '#9a57d7' },
  { name: 'Pink', value: '#f066b8' },
  { name: 'White', value: '#ffffff' },
  { name: 'Rainbow spectrum', value: 'rainbow' }
];

const COLOR_MIX = COLORS.filter(c => !['#29213d', '#ffffff', 'rainbow'].includes(c.value)).map(c => c.value);
const TAU = Math.PI * 2;

function pseudoRandom(seed) {
  let n = (seed >>> 0) + 0x6d2b79f5;
  n = Math.imul(n ^ (n >>> 15), n | 1);
  n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}

function pointAt(p, width, height) {
  return { x: p.x * width, y: p.y * height };
}

function roundLine(ctx, x0, y0, x1, y1, thickness, color) {
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = thickness;
  ctx.strokeStyle = color;
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function solidLine(ctx, points, size, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, size / 2, 0, TAU);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + next.x) / 2, (prev.y + next.y) / 2);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function colorChangingLine(ctx, points, size, seed, isRainbow) {
  if (points.length === 1) {
    const color = isRainbow ? 'hsl(0 100% 50%)' : COLOR_MIX[Math.floor(pseudoRandom(seed) * COLOR_MIX.length)];
    solidLine(ctx, points, size, color);
    return;
  }
  let traveled = 0;
  const stepLength = Math.max(2, size * 0.22);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < .01) continue;
    const steps = Math.ceil(dist / stepLength);
    for (let step = 0; step < steps; step++) {
      const t0 = step / steps;
      const t1 = (step + 1) / steps;
      const lengthAtStart = traveled + dist * t0;
      const color = isRainbow
        ? `hsl(${(lengthAtStart * 1.25) % 360} 100% 50%)`
        : COLOR_MIX[Math.floor(pseudoRandom(seed + Math.floor(lengthAtStart / Math.max(16, size * 1.4))) * COLOR_MIX.length)];
      roundLine(ctx,
        a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0,
        a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1,
        size, color);
    }
    traveled += dist;
  }
}

function drawHalo(ctx, x, y, size, color) {
  const radius = size * 1.05;
  const glow = ctx.createRadialGradient(x, y, size * .15, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(.3, color);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.globalAlpha = .18;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawMoon(ctx, x, y, size, color) {
  const r = size * .58;
  drawHalo(ctx, x, y, size, color);
  ctx.save();
  ctx.translate(x, y);
  // Keep the emoji-like tilt fixed, regardless of the direction of the stroke.
  ctx.rotate(.65);
  ctx.translate(-r * .5, 0);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.bezierCurveTo(r * 1.55, -r * 1.15, r * 1.55, r * 1.15, 0, r);
  ctx.bezierCurveTo(r * .65, r * .36, r * .65, -r * .36, 0, -r);
  ctx.closePath();
  ctx.fill();
  ctx.clip();
  // Translucent crater shadows and rims preserve the selected base color.
  for (const [cx, cy, radius] of [[.82, -.34, .15], [.96, .13, .1], [.59, .62, .11]]) {
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    ctx.arc(cx * r, cy * r, radius * r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.lineWidth = Math.max(.5, size * .018);
    ctx.beginPath();
    ctx.arc(cx * r, cy * r, radius * r, .1 * Math.PI, .85 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}

function drawClover(ctx, x, y, size, color) {
  drawHalo(ctx, x, y, size, color);
  ctx.save();
  ctx.translate(x, y);
  // Paint the stem first so the leaflets cover its upper section.
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.1, size * .095);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, size * .09);
  ctx.quadraticCurveTo(size * .08, size * .57, size * .35, size * .78);
  ctx.stroke();
  // Four heart-shaped leaflets, with a notch and a fine vein in each leaf.
  for (let leaf = 0; leaf < 4; leaf++) {
    ctx.save();
    ctx.rotate(Math.PI / 4 + leaf * Math.PI / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * .18, -size * .12, -size * .48, -size * .44, -size * .27, -size * .61);
    ctx.bezierCurveTo(-size * .14, -size * .72, 0, -size * .61, 0, -size * .53);
    ctx.bezierCurveTo(0, -size * .61, size * .14, -size * .72, size * .27, -size * .61);
    ctx.bezierCurveTo(size * .48, -size * .44, size * .18, -size * .12, 0, 0);
    ctx.closePath();
    ctx.fill();
    // Light on the rounded lobes, shade at the fold: keep the selected hue underneath.
    const leafShading = ctx.createLinearGradient(-size * .2, -size * .65, size * .12, 0);
    leafShading.addColorStop(0, 'rgba(255,255,255,.46)');
    leafShading.addColorStop(.35, 'rgba(255,255,255,.16)');
    leafShading.addColorStop(.6, 'rgba(0,0,0,0)');
    leafShading.addColorStop(1, 'rgba(0,0,0,.4)');
    ctx.fillStyle = leafShading;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.16)';
    ctx.lineWidth = Math.max(.4, size * .015);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = Math.max(.6, size * .025);
    ctx.beginPath();
    ctx.moveTo(0, -size * .07);
    ctx.quadraticCurveTo(size * .02, -size * .25, 0, -size * .49);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawGlow(ctx, x, y, size, color) {
  const radius = size * .48;
  const glow = ctx.createRadialGradient(x, y, radius * .14, x, y, radius * 2.2);
  glow.addColorStop(0, color);
  glow.addColorStop(.36, color);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.globalAlpha = .26;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.2, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius * .72, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = .75;
  ctx.beginPath();
  ctx.arc(x - radius * .2, y - radius * .25, radius * .23, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function starPath(ctx, x, y, radius, tips = 4) {
  ctx.beginPath();
  for (let i = 0; i < tips * 2; i++) {
    const theta = i * Math.PI / tips - Math.PI / 2;
    const r = i % 2 ? radius * .22 : radius;
    const sx = x + Math.cos(theta) * r;
    const sy = y + Math.sin(theta) * r;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
}

function drawSparkle(ctx, x, y, size, seed, index, color) {
  const radius = size * (.36 + pseudoRandom(seed + index * 11) * .32);
  const xj = (pseudoRandom(seed + index * 17) - .5) * size * .75;
  const yj = (pseudoRandom(seed + index * 19) - .5) * size * .75;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.min(20, radius * 1.35);
  ctx.fillStyle = color;
  starPath(ctx, x + xj, y + yj, radius, 4);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  starPath(ctx, x + xj, y + yj, radius * .34, 4);
  ctx.fill();
  ctx.restore();
}

function stampsAlongPath(ctx, stroke, points) {
  const { brush, size, color, seed } = stroke;
  const spacing = Math.max(5, size * (brush === 'sparkle' ? .95 : brush === 'glow' ? 1.45 : 1.85));
  let index = 0;
  function stamp(x, y) {
    // Use the same distance-based hue cycle as the Rainbow pen.
    const stampColor = color === 'rainbow'
      ? `hsl(${(index * spacing * 1.25) % 360} 100% 50%)` : color;
    if (brush === 'moon') drawMoon(ctx, x, y, size, stampColor);
    else if (brush === 'clover') drawClover(ctx, x, y, size, stampColor);
    else if (brush === 'glow') drawGlow(ctx, x, y, size, stampColor);
    else if (brush === 'sparkle') drawSparkle(ctx, x, y, size, seed, index, stampColor);
    index++;
  }
  stamp(points[0].x, points[0].y);
  let untilNext = spacing;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist < .001) continue;
    let traveled = 0;
    while (dist - traveled >= untilNext - .00001) {
      traveled += untilNext;
      const fraction = Math.min(1, traveled / dist);
      stamp(a.x + dx * fraction, a.y + dy * fraction);
      untilNext = spacing;
    }
    untilNext -= dist - traveled;
  }
}

/** Render a stroke in CSS pixel coordinates. Its points are fractions of the canvas size. */
export function renderStroke(ctx, stroke, width, height) {
  if (!stroke?.points?.length || width <= 0 || height <= 0) return;
  const points = stroke.points.map(point => pointAt(point, width, height));
  ctx.save();
  if (stroke.brush === 'pen' || stroke.brush === 'eraser') {
    if (stroke.brush === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    if (stroke.brush === 'pen' && stroke.color === 'rainbow') colorChangingLine(ctx, points, stroke.size, stroke.seed, true);
    else solidLine(ctx, points, stroke.size, stroke.color === 'rainbow' ? '#000000' : stroke.color);
  } else if (stroke.brush === 'rainbow' || stroke.brush === 'multicolor') {
    colorChangingLine(ctx, points, stroke.size, stroke.seed, stroke.brush === 'rainbow');
  } else {
    stampsAlongPath(ctx, stroke, points);
  }
  ctx.restore();
}
