import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRUSHES, COLORS, renderStroke } from '../brushes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class RecordingContext {
  operations = [];
  save() { this.operations.push('save'); }
  restore() { this.operations.push('restore'); }
  beginPath() { this.operations.push('beginPath'); }
  arc(...args) { this.operations.push(['arc', ...args]); }
  moveTo(...args) { this.operations.push(['moveTo', ...args]); }
  lineTo(...args) { this.operations.push(['lineTo', ...args]); }
  quadraticCurveTo(...args) { this.operations.push(['quadraticCurveTo', ...args]); }
  bezierCurveTo(...args) { this.operations.push(['bezierCurveTo', ...args]); }
  closePath() { this.operations.push('closePath'); }
  stroke() { this.operations.push('stroke'); }
  fill() { this.operations.push('fill'); }
  translate(...args) { this.operations.push(['translate', ...args]); }
  rotate(...args) { this.operations.push(['rotate', ...args]); }
  createRadialGradient() { return { addColorStop() {} }; }
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
