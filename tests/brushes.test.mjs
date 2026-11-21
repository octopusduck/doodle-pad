import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRUSHES, COLORS, renderStroke } from '../brushes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class RecordingContext {
  operations = [];
  set fillStyle(value) { this.operations.push(['fillStyle', typeof value === 'string' ? value : 'gradient']); }
  save() { this.operations.push('save'); }
  restore() { this.operations.push('restore'); }
  beginPath() { this.operations.push('beginPath'); }
  arc(...args) { this.operations.push(['arc', ...args]); }
  moveTo(...args) { this.operations.push(['moveTo', ...args]); }
  lineTo(...args) { this.operations.push(['lineTo', ...args]); }
  quadraticCurveTo(...args) { this.operations.push(['quadraticCurveTo', ...args]); }
  bezierCurveTo(...args) { this.operations.push(['bezierCurveTo', ...args]); }
  closePath() { this.operations.push('closePath'); }
  clip() { this.operations.push('clip'); }
  stroke() { this.operations.push('stroke'); }
  fill() { this.operations.push('fill'); }
  translate(...args) { this.operations.push(['translate', ...args]); }
  rotate(...args) { this.operations.push(['rotate', ...args]); }
  createRadialGradient(...args) {
    this.operations.push(['gradient', ...args]);
    return { addColorStop: (...stop) => this.operations.push(['colorStop', ...stop]) };
  }
  createLinearGradient(...args) {
    this.operations.push(['linearGradient', ...args]);
    return { addColorStop: (...stop) => this.operations.push(['colorStop', ...stop]) };
  }
}

for (const { id, label } of BRUSHES) {
  for (const sample of ['single tap', 'drag']) {
    test(`${label} (${id}) draws a ${sample} without errors`, () => {
      const ctx = new RecordingContext();
      const stroke = {
        brush: id,
        size: 20,
        color: '#fa8b34',
        seed: 1234,
        points: sample === 'single tap'
          ? [{ x: .5, y: .5 }]
          : [{ x: .1, y: .3 }, { x: .3, y: .35 }, { x: .6, y: .55 }, { x: .8, y: .65 }]
      };
      renderStroke(ctx, stroke, 320, 600);
      assert(ctx.operations.includes('save'));
      assert(ctx.operations.includes('restore'));
      assert(ctx.operations.includes('fill') || ctx.operations.includes('stroke'));
    });
  }
}

test('all brushes and swatches have unique IDs and values', () => {
  assert.equal(new Set(BRUSHES.map(b => b.id)).size, BRUSHES.length);
  assert.equal(new Set(COLORS.map(c => c.value)).size, COLORS.length);
});

test('moons keep a fixed tilt along turns and moons and clovers have a soft halo', () => {
  for (const brush of ['moon', 'clover']) {
    const ctx = new RecordingContext();
    renderStroke(ctx, { brush, size: 24, color: '#f3cc24', seed: 5,
      points: [{ x: .2, y: .2 }, { x: .8, y: .2 }, { x: .8, y: .8 }] }, 320, 600);
    assert(ctx.operations.some(op => op[0] === 'gradient'), `${brush} renders a halo`);
    assert(ctx.operations.some(op => op[0] === 'colorStop' && op[1] === 1 && op[2] === 'rgba(255,255,255,0)'));
    if (brush === 'moon') {
      const angles = ctx.operations.filter(op => op[0] === 'rotate').map(op => op[1]);
      assert(angles.length > 1);
      assert.equal(new Set(angles).size, 1, 'all moons have the same tilt regardless of path direction');
      assert.notEqual(angles[0], 0);
      assert(ctx.operations.includes('clip'), 'crater details are clipped to the crescent');
    }
  }
});

test('moons and clovers leave space between stamps', () => {
  for (const brush of ['moon', 'clover']) {
    const ctx = new RecordingContext();
    renderStroke(ctx, { brush, size: 20, color: '#2bbb70', seed: 5,
      points: [{ x: 0, y: .5 }, { x: 1, y: .5 }] }, 300, 100);
    const centers = ctx.operations.filter(op => op[0] === 'translate' && op[1] >= 0 && op[2] === 50);
    assert(centers.length >= 2);
    for (let i = 1; i < centers.length; i++) {
      assert(centers[i][1] - centers[i - 1][1] >= 20 * 1.8, 'stamps are spaced well beyond their width');
    }
  }
});

test('the spectrum color option follows the same hues as the Rainbow pen', () => {
  const first = new RecordingContext();
  const second = new RecordingContext();
  const stroke = { brush: 'pen', size: 20, color: 'rainbow', seed: 5,
    points: [{ x: .1, y: .1 }, { x: .9, y: .9 }] };
  renderStroke(first, stroke, 300, 400);
  renderStroke(second, { ...stroke, brush: 'rainbow' }, 300, 400);
  assert.deepEqual(first.operations, second.operations);
});

test('sparkles use the chosen solid color for every star while retaining white highlights', () => {
  const ctx = new RecordingContext();
  renderStroke(ctx, { brush: 'sparkle', size: 24, color: '#f066b8', seed: 1234,
    points: [{ x: .1, y: .2 }, { x: .9, y: .8 }] }, 320, 600);
  const fills = ctx.operations.filter(op => op[0] === 'fillStyle').map(op => op[1]);
  assert(fills.filter(color => color === '#f066b8').length > 1);
  assert(fills.includes('#ffffff'));
  assert(fills.every(color => color === '#f066b8' || color === '#ffffff'));
});

for (const brush of ['moon', 'clover', 'glow', 'sparkle']) {
  test(`${brush} rainbow spectrum varies per stamp and renders identically each time`, () => {
    const stroke = { brush, size: 24, color: 'rainbow', seed: 1234,
      points: [{ x: .1, y: .2 }, { x: .9, y: .8 }] };
    const first = new RecordingContext();
    const second = new RecordingContext();
    renderStroke(first, stroke, 320, 600);
    renderStroke(second, stroke, 320, 600);
    assert.deepEqual(first.operations, second.operations);
    const colors = first.operations.filter(op => op[0] === 'fillStyle' && /^hsl\(/.test(op[1])).map(op => op[1]);
    assert(new Set(colors).size > 1, 'the pattern contains multiple colors');
    assert.equal(colors[0], 'hsl(0 100% 50%)');
    assert(!first.operations.some(op => op[0] === 'fillStyle' && op[1] === 'rainbow'), 'the color option is resolved before painting');
  });
}

test('all installable app-shell resources exist locally', () => {
  const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const shell = sw.match(/const SHELL_FILES = \[([\s\S]*?)\]/)?.[1];
  assert(shell, 'service worker defines its shell');
  const resources = [...shell.matchAll(/'([^']+)'/g)].map(x => x[1]);
  assert(resources.length >= 8);
  for (const resource of resources) {
    assert(resource.startsWith('./'));
    const local = resource === './' ? './index.html' : resource;
    assert(fs.existsSync(path.join(root, local)), `missing offline resource: ${resource}`);
  }
});

test('app does not load third-party scripts or use telemetry endpoints', () => {
  const names = ['index.html', 'app.js', 'brushes.js', 'service-worker.js', 'styles.css'];
  const source = names.map(n => fs.readFileSync(path.join(root, n), 'utf8')).join('\n');
  assert.doesNotMatch(source, /<script[^>]+https?:\/\//i);
  assert.doesNotMatch(source, /<link[^>]+https?:\/\//i);
  assert.doesNotMatch(source, /\b(?:XMLHttpRequest|sendBeacon|WebSocket|EventSource)\s*\(/);
  assert.match(source, /connect-src 'none'/);
});
