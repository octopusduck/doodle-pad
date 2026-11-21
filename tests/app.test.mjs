import test from 'node:test';
import assert from 'node:assert/strict';

const STORAGE_KEY = 'doodle-pad-drawing-v1';

function fakeContext() {
  const ctx = {};
  for (const name of ['save', 'restore', 'beginPath', 'arc', 'moveTo', 'lineTo', 'quadraticCurveTo',
    'bezierCurveTo', 'closePath', 'stroke', 'fill', 'translate', 'rotate', 'clearRect',
    'setTransform', 'fillRect', 'drawImage', 'clip']) ctx[name] = () => {};
  ctx.createRadialGradient = () => ({ addColorStop() {} });
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  return ctx;
}
class FakeElement {
  constructor(tag = 'div') {
    this.tag = tag;
    this.hidden = false;
    this.disabled = false;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attributes = {};
    this.style = { setProperty() {} };
    this.value = '18';
    this.width = 300;
    this.height = 400;
  }
  append(...children) { this.children.push(...children); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  fire(name, event = {}) { for (const callback of (this.listeners[name] || [])) callback({ type: name, ...event }); }
  click() { this.fire('click'); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  toBlob(callback) { callback(new Blob(['fake png data'], { type: 'image/png' })); }
  getAttribute(name) { return this.attributes[name]; }
  querySelectorAll(tag) { return this.children.filter(c => c.tag === tag); }
  focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 400 }; }
  getContext() { return this.context ||= fakeContext(); }
  setPointerCapture() {}
  releasePointerCapture() {}
}

let instance = 0;
/** Start a fresh copy of the app with a fake DOM, optionally with a saved drawing in localStorage. */
async function loadApp(saved, background) {
  const ids = ['drawing-surface','art-canvas','active-canvas','brush-list','color-list','brush-size',
    'clear-modal','save-modal','save-preview','toast','undo-btn','redo-btn','clear-btn',
    'save-btn','brush-name','size-preview','empty-hint','cancel-clear','confirm-clear',
    'close-save','download-save','share-save','tool-panel','brush-tool-icon','color-indicator',
    'size-value','eraser-btn','canvas-white','canvas-black','theme-color',
    ...['brush','size','color','eraser','canvas'].flatMap(tool => [`${tool}-toggle`, `${tool}-panel`])];
  const elements = new Map(ids.map(id => [id, new FakeElement()]));
  for (const tool of ['brush','size','color','eraser','canvas']) elements.get(`${tool}-panel`).hidden = true;
  for (const id of ['clear-modal', 'save-modal', 'toast']) elements.get(id).hidden = true;
  const backing = new Map();
  if (saved !== undefined) backing.set(STORAGE_KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
  if (background) backing.set('doodle-pad-canvas-color-v1', background);
  globalThis.localStorage = {
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => backing.set(key, value)
  };
  const documentListeners = {};
  globalThis.document = {
    documentElement: new FakeElement(),
    getElementById: id => elements.get(id),
    createElement: tag => new FakeElement(tag),
    addEventListener(name, callback) { (documentListeners[name] ||= []).push(callback); },
    activeElement: new FakeElement()
  };
  globalThis.window = { devicePixelRatio: 2, isSecureContext: false, addEventListener() {} };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.requestAnimationFrame = fn => fn();
  // A distinct URL gives a fresh module instance, like reloading the page.
  const app = await import(`../app.js?instance=${++instance}`);
  const get = id => elements.get(id);
  const pointer = (type, clientX, clientY) => get('active-canvas').fire(type,
    { pointerId: 1, pointerType: 'touch', clientX, clientY, preventDefault() {} });
  return { app, get, pointer, backing,
    key: key => documentListeners.keydown.forEach(fn => fn({ key })),
    read: () => JSON.parse(backing.get(STORAGE_KEY)) };
}

test('drawing, undo, redo, and undoing a clear works end-to-end without a server', async () => {
  const { get, pointer, read } = await loadApp();
  assert.equal(get('brush-list').children.length, 7);
  assert.equal(get('color-list').children.length, 11);
  assert(get('undo-btn').disabled);
  get('brush-list').children.find(c => c.dataset.brush === 'moon').click();
  assert.equal(get('brush-name').textContent, 'Moons');
  pointer('pointerdown', 50, 60);
  pointer('pointermove', 180, 110);
  pointer('pointerup', 190, 130);
  assert.equal(read().length, 1);
  assert.equal(read()[0].brush, 'moon');
  assert.equal(get('undo-btn').disabled, false);
  get('undo-btn').click();
  assert.equal(read().length, 0);
  assert.equal(get('redo-btn').disabled, false);
  get('redo-btn').click();
  assert.equal(read().length, 1);
  get('clear-btn').click();
  assert.equal(get('clear-modal').hidden, false);
  get('confirm-clear').click();
  assert.equal(read().length, 0);
  assert.equal(get('undo-btn').disabled, false, 'cleared drawing remains undoable');
  get('undo-btn').click();
  assert.equal(read().length, 1);
  get('redo-btn').click();
  assert.equal(read().length, 0);
  get('save-btn').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get('save-modal').hidden, false, 'save dialog opens');
  assert(get('save-preview').src.startsWith('blob:'), 'an image blob is previewed');
  get('close-save').click();
  assert.equal(get('save-modal').hidden, true);
});

test('tool options collapse when switching tools, choosing options, drawing, or pressing Escape', async () => {
  const { get, pointer, key } = await loadApp();
  get('brush-toggle').click();
  assert.equal(get('brush-panel').hidden, false);
  get('size-toggle').click();
  assert.equal(get('brush-panel').hidden, true);
  assert.equal(get('size-panel').hidden, false);
  get('brush-size').value = '32';
  get('brush-size').fire('input');
  assert.equal(get('size-value').textContent, '32 px');
  key('Escape');
  assert.equal(get('size-panel').hidden, true);
  get('color-toggle').click();
  get('color-list').children[0].click();
  assert.equal(get('color-panel').hidden, true);
  get('eraser-toggle').click();
  get('eraser-btn').click();
  assert.equal(get('eraser-panel').hidden, true);
  assert.equal(get('eraser-btn').getAttribute('aria-pressed'), 'true');
  get('canvas-toggle').click();
  pointer('pointerdown', 50, 50);
  assert.equal(get('canvas-panel').hidden, true);
  pointer('pointerup', 50, 50);
});

test('canvas color survives reload and does not change strokes; erasing is undoable', async () => {
  const { get, pointer, read, backing } = await loadApp();
  pointer('pointerdown', 10, 20);
  pointer('pointerup', 180, 20);
  const drawing = read();
  get('canvas-black').click();
  assert.equal(get('drawing-surface').style.backgroundColor, '#000000');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(get('theme-color').getAttribute('content'), '#27292d');
  assert.deepEqual(read(), drawing);
  assert.equal(backing.get('doodle-pad-canvas-color-v1'), '#000000');
  get('eraser-btn').click();
  pointer('pointerdown', 60, 10);
  pointer('pointermove', 60, 100);
  pointer('pointerup', 60, 100);
  assert.equal(read()[1].brush, 'eraser');
  assert.equal(get('art-canvas').context.globalCompositeOperation, 'destination-out');
  get('undo-btn').click();
  assert.deepEqual(read(), drawing);
  get('redo-btn').click();
  assert.equal(read()[1].brush, 'eraser');
  const reload = await loadApp(read(), backing.get('doodle-pad-canvas-color-v1'));
  assert.equal(reload.get('drawing-surface').style.backgroundColor, '#000000');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  reload.get('canvas-white').click();
  assert.equal(reload.get('drawing-surface').style.backgroundColor, '#ffffff');
  assert.equal(document.documentElement.dataset.theme, 'light');
});

test('rainbow spectrum pattern colors survive backup, undo, redo, and reload', async () => {
  const { get, pointer, read } = await loadApp();
  get('brush-list').children.find(c => c.dataset.brush === 'moon').click();
  get('color-list').children.find(c => c.dataset.color === 'rainbow').click();
  pointer('pointerdown', 20, 20);
  pointer('pointermove', 200, 200);
  pointer('pointerup', 200, 200);
  const saved = read();
  assert.equal(saved[0].color, 'rainbow');
  get('undo-btn').click();
  assert.equal(read().length, 0);
  get('redo-btn').click();
  assert.deepEqual(read(), saved);
  const reload = await loadApp(saved);
  assert.equal(reload.get('toast').hidden, true);
  assert.equal(reload.get('undo-btn').disabled, false);
});

test('a very long stroke is split so the whole drawing restores after a reload', async () => {
  const first = await loadApp();
  const { MAX_STROKE_POINTS } = first.app;
  globalThis.requestAnimationFrame = () => {}; // skip per-frame redraws to keep the test fast
  first.pointer('pointerdown', 10, 10);
  for (let i = 0; i < MAX_STROKE_POINTS + 500; i++) first.pointer('pointermove', i % 2 ? 290 : 10, 10 + (i % 380));
  first.pointer('pointerup', 150, 200);
  const saved = first.read();
  assert.equal(saved.length, 2, 'the scribble was stored as two strokes');
  assert(saved.every(stroke => stroke.points.length <= MAX_STROKE_POINTS));
  assert.deepEqual(saved[1].points[0], saved[0].points.at(-1), 'the second part continues where the first ended');

  const reloaded = await loadApp(saved);
  assert.equal(reloaded.get('clear-btn').disabled, false, 'the drawing was restored');
  assert.equal(reloaded.get('toast').hidden, true, 'without any warning');
  reloaded.get('undo-btn').click();
  assert.equal(reloaded.read().length, 1);
});

test('one corrupt stroke does not discard the rest of a saved drawing', async () => {
  const good = { brush: 'pen', color: '#29213d', size: 10, seed: 1, points: [{ x: .1, y: .1 }, { x: .5, y: .5 }] };
  const corrupt = { brush: 'pen', color: 'not a color', size: 10, seed: 1, points: [] };
  const { get } = await loadApp([good, corrupt, good]);
  assert.equal(get('clear-btn').disabled, false, 'the valid strokes were restored');
  get('undo-btn').click();
  get('undo-btn').click();
  assert.equal(get('undo-btn').disabled, true, 'exactly the two valid strokes were restored');
  assert.equal(get('toast').hidden, false, 'the user is told part of the drawing was lost');
});

test('unreadable backups warn instead of failing silently', async () => {
  const { get } = await loadApp('{not json');
  assert.equal(get('clear-btn').disabled, true);
  assert.match(get('toast').textContent, /could not be restored/);
});

test('a drawing too big to back up keeps its last restorable backup and warns', async () => {
  const { MAX_STORED_STROKES } = (await loadApp()).app;
  const dot = { brush: 'sparkle', color: '#f066b8', size: 10, seed: 7, points: [{ x: .5, y: .5 }] };
  const { get, pointer, read } = await loadApp(Array.from({ length: MAX_STORED_STROKES }, () => dot));
  assert.equal(get('toast').hidden, true, 'a full backup restores completely');
  pointer('pointerdown', 20, 20);
  pointer('pointerup', 20, 20);
  assert.equal(read().length, MAX_STORED_STROKES, 'the over-limit drawing was not written');
  assert.match(get('toast').textContent, /too big to back up/);
});
