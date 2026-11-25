import { BRUSHES, COLORS, renderStroke } from './brushes.js';

const STORAGE_KEY = 'doodle-pad-drawing-v1';
const CANVAS_COLOR_KEY = 'doodle-pad-canvas-color-v1';
const TOOL_PANELS = ['brush', 'size', 'color', 'eraser', 'canvas'];
// These limits are enforced both while drawing/saving and when restoring,
// so anything that was backed up can always be restored.
export const MAX_STROKE_POINTS = 20000;
export const MAX_STORED_STROKES = 50000;
export const MAX_STORED_POINTS = 500000;
const MAX_STORED_CHARS = 16000000;
const $ = (id) => document.getElementById(id);

const drawingSurface = $('drawing-surface');
const artCanvas = $('art-canvas');
const activeCanvas = $('active-canvas');
const artCtx = artCanvas.getContext('2d');
const activeCtx = activeCanvas.getContext('2d');
const brushList = $('brush-list');
const colorList = $('color-list');
const brushSizeInput = $('brush-size');
const clearModal = $('clear-modal');
const saveModal = $('save-modal');
const savePreview = $('save-preview');
const toast = $('toast');

let strokes = [];
let undoStack = [];
let redoStack = [];
let currentStroke = null;
let currentPointerId = null;
let selectedBrush = 'pen';
let selectedColor = '#9a57d7';
let canvasColor = '#ffffff';
let openTool = null;
let brushSize = Number(brushSizeInput.value);
let surfaceWidth = 0;
let surfaceHeight = 0;
let framePending = false;
let toastTimer;
let previewUrl = null;
let previewBlob = null;
let lastFocusedElement = null;

function isValidStroke(stroke) {
  return Boolean(stroke && BRUSHES.some(b => b.id === stroke.brush) &&
    (/^#[\da-fA-F]{6}$/.test(stroke.color) || stroke.color === 'rainbow') &&
    Number.isFinite(stroke.size) && stroke.size >= 2 && stroke.size <= 100 &&
    Number.isInteger(stroke.seed) && stroke.seed >= 0 && stroke.seed <= 4294967295 &&
    Array.isArray(stroke.points) && stroke.points.length > 0 && stroke.points.length <= MAX_STROKE_POINTS &&
    stroke.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) &&
      p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
}

function restoreDrawing() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (_) {
    return; // Storage may be unavailable in private browsing; drawing still works.
  }
  if (!raw) return;
  let parsed = null;
  try {
    if (raw.length <= MAX_STORED_CHARS) parsed = JSON.parse(raw);
  } catch (_) { /* reported below */ }
  if (!Array.isArray(parsed)) {
    showToast('Your saved drawing could not be restored.');
    return;
  }
  // Keep every valid stroke that fits, in drawing order, rather than discarding the whole drawing.
  let pointCount = 0;
  for (const stroke of parsed) {
    if (strokes.length === MAX_STORED_STROKES) break;
    if (!isValidStroke(stroke) || pointCount + stroke.points.length > MAX_STORED_POINTS) continue;
    strokes.push(stroke);
    pointCount += stroke.points.length;
  }
  undoStack = strokes.map(stroke => ({ type: 'add', stroke }));
  if (strokes.length < parsed.length) showToast('Part of your saved drawing could not be restored.');
}

function persistDrawing() {
  const pointCount = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
  const json = JSON.stringify(strokes);
  if (strokes.length > MAX_STORED_STROKES || pointCount > MAX_STORED_POINTS || json.length > MAX_STORED_CHARS) {
    // Keep the last backup that can be restored instead of writing one that can't.
    showToast('This drawing is too big to back up. Please save it as a PNG.');
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch (_) {
    showToast('Could not save a local backup. Please save your drawing as a PNG.');
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3600);
}

function fitCanvas(canvas, ctx) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.max(1, Math.round(surfaceWidth * dpr));
  canvas.height = Math.max(1, Math.round(surfaceHeight * dpr));
  ctx.setTransform(canvas.width / surfaceWidth, 0, 0, canvas.height / surfaceHeight, 0, 0);
}

function resizeCanvases() {
  const bounds = drawingSurface.getBoundingClientRect();
  const nextWidth = Math.max(1, bounds.width);
  const nextHeight = Math.max(1, bounds.height);
  if (Math.abs(nextWidth - surfaceWidth) < .5 && Math.abs(nextHeight - surfaceHeight) < .5) return;
  surfaceWidth = nextWidth;
  surfaceHeight = nextHeight;
  fitCanvas(artCanvas, artCtx);
  fitCanvas(activeCanvas, activeCtx);
  redrawArtwork();
  redrawActive();
}

function redrawArtwork() {
  if (!surfaceWidth || !surfaceHeight) return;
  artCtx.clearRect(0, 0, surfaceWidth, surfaceHeight);
  for (const stroke of strokes) renderStroke(artCtx, stroke, surfaceWidth, surfaceHeight);
  updateButtons();
}

function redrawActive() {
  if (!surfaceWidth || !surfaceHeight) return;
  activeCtx.clearRect(0, 0, surfaceWidth, surfaceHeight);
  if (currentStroke?.brush === 'eraser') {
    // Erase the artwork layer while dragging so the canvas background shows through.
    redrawArtwork();
    renderStroke(artCtx, currentStroke, surfaceWidth, surfaceHeight);
  } else if (currentStroke) renderStroke(activeCtx, currentStroke, surfaceWidth, surfaceHeight);
}

function queueActiveRedraw() {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame(() => {
    framePending = false;
    redrawActive();
  });
}

function updateButtons() {
  $('undo-btn').disabled = undoStack.length === 0;
  $('redo-btn').disabled = redoStack.length === 0;
  $('clear-btn').disabled = strokes.length === 0;
  $('empty-hint').hidden = strokes.length !== 0 || currentStroke !== null;
}

function selectBrush(brush) {
  selectedBrush = brush;
  $('brush-name').textContent = BRUSHES.find(b => b.id === brush)?.label || 'Pen';
  for (const button of brushList.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.brush === selectedBrush));
  }
  $('eraser-btn').setAttribute('aria-pressed', String(brush === 'eraser'));
  $('eraser-toggle').dataset.active = String(brush === 'eraser');
  $('brush-toggle').dataset.active = String(brush !== 'eraser');
  if (brush !== 'eraser') $('brush-tool-icon').textContent = BRUSHES.find(b => b.id === brush)?.icon;
  updateSizePreview();
}

function selectColor(color) {
  selectedColor = color;
  for (const button of colorList.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.color === selectedColor));
  }
  if (selectedBrush === 'eraser') selectBrush('pen');
  updateSizePreview();
}

function updateSizePreview() {
  const preview = $('size-preview');
  preview.style.setProperty('--dot-size', `${Math.max(5, Math.min(20, brushSize * .58))}px`);
  const colorPreview = selectedColor === 'rainbow' ? 'conic-gradient(#ed4264, #f3cc24, #2bbb70, #357af2, #9a57d7, #ed4264)' : selectedColor;
  preview.style.setProperty('--dot-color', selectedBrush === 'eraser' ? '#aaaaaa' : colorPreview);
  $('size-value').textContent = `${brushSize} px`;
  $('color-indicator').style.setProperty('--selected-color', colorPreview);
}

function closeToolPanel(restoreFocus = false) {
  const previous = openTool;
  for (const tool of TOOL_PANELS) {
    $(`${tool}-panel`).hidden = true;
    $(`${tool}-toggle`).setAttribute('aria-expanded', 'false');
  }
  openTool = null;
  if (restoreFocus && previous) $(`${previous}-toggle`).focus();
}

function selectCanvasColor(color, persist = true) {
  canvasColor = color;
  document.documentElement.dataset.theme = color === '#000000' ? 'dark' : 'light';
  $('theme-color').setAttribute('content', color === '#000000' ? '#27292d' : '#fbf8ff');
  drawingSurface.style.backgroundColor = color;
  $('canvas-white').setAttribute('aria-pressed', String(color === '#ffffff'));
  $('canvas-black').setAttribute('aria-pressed', String(color === '#000000'));
  if (persist) {
    try { localStorage.setItem(CANVAS_COLOR_KEY, color); }
    catch (_) { showToast('Could not save your canvas color on this device.'); }
  }
}

function setupControls() {
  for (const tool of TOOL_PANELS) {
    $(`${tool}-toggle`).addEventListener('click', () => {
      const wasOpen = openTool === tool;
      closeToolPanel();
      if (!wasOpen) {
        openTool = tool;
        $(`${tool}-panel`).hidden = false;
        $(`${tool}-toggle`).setAttribute('aria-expanded', 'true');
      }
    });
  }
  document.addEventListener('pointerdown', event => {
    if (openTool && !$('tool-panel').contains(event.target)) closeToolPanel();
  });
  document.addEventListener('focusin', event => {
    if (openTool && !$('tool-panel').contains(event.target)) closeToolPanel();
  });
  for (const brush of BRUSHES.filter(brush => brush.id !== 'eraser')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'brush-button';
    button.dataset.brush = brush.id;
    button.setAttribute('aria-label', `${brush.label} brush`);
    button.setAttribute('aria-pressed', 'false');
    const icon = document.createElement('span');
    icon.className = 'brush-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = brush.icon;
    const label = document.createElement('span');
    label.className = 'brush-label';
    label.textContent = brush.label;
    button.append(icon, label);
    button.addEventListener('click', () => { selectBrush(brush.id); closeToolPanel(true); });
    brushList.append(button);
  }
  for (const color of COLORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-button';
    button.dataset.color = color.value;
    button.dataset.light = String(color.value === '#ffffff' || color.value === '#f3cc24');
    button.setAttribute('aria-label', color.name);
    button.setAttribute('aria-pressed', 'false');
    button.style.setProperty('--swatch', color.value === 'rainbow' ? 'conic-gradient(#ed4264, #f3cc24, #2bbb70, #357af2, #9a57d7, #ed4264)' : color.value);
    button.addEventListener('click', () => { selectColor(color.value); closeToolPanel(true); });
    colorList.append(button);
  }
  selectBrush(selectedBrush);
  selectColor(selectedColor);
  let savedColor;
  try { savedColor = localStorage.getItem(CANVAS_COLOR_KEY); } catch (_) { /* storage unavailable */ }
  selectCanvasColor(savedColor === '#000000' ? '#000000' : '#ffffff', false);
  for (const [name, color] of [['white', '#ffffff'], ['black', '#000000']]) {
    $(`canvas-${name}`).addEventListener('click', () => { selectCanvasColor(color); closeToolPanel(true); });
  }
  $('eraser-btn').addEventListener('click', () => { selectBrush('eraser'); closeToolPanel(true); });
  brushSizeInput.addEventListener('input', () => {
    brushSize = Number(brushSizeInput.value);
    updateSizePreview();
  });
  $('undo-btn').addEventListener('click', undo);
  $('redo-btn').addEventListener('click', redo);
  $('clear-btn').addEventListener('click', () => openModal(clearModal, $('cancel-clear')));
  $('cancel-clear').addEventListener('click', () => closeModal(clearModal));
  $('confirm-clear').addEventListener('click', () => {
    if (strokes.length) {
      // Clearing is one undoable action; the prior strokes remain in the undo history.
      undoStack.push({ type: 'clear', strokes: strokes.slice() });
      redoStack = [];
      strokes = [];
      persistDrawing();
      redrawArtwork();
    }
    selectBrush('pen');
    closeModal(clearModal);
  });
  $('save-btn').addEventListener('click', openSaveDialog);
  $('close-save').addEventListener('click', closeSaveDialog);
  $('download-save').addEventListener('click', downloadPng);
  $('share-save').addEventListener('click', sharePng);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!saveModal.hidden) closeSaveDialog();
      else if (!clearModal.hidden) closeModal(clearModal);
      else closeToolPanel(true);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && saveModal.hidden && clearModal.hidden) {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    }
  });
}

function pointFromEvent(event) {
  const rect = activeCanvas.getBoundingClientRect();
  return {
    x: Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))) * 100000) / 100000,
    y: Math.round(Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height))) * 100000) / 100000
  };
}

function addPoint(event, force = false) {
  if (!currentStroke) return;
  const point = pointFromEvent(event);
  const last = currentStroke.points[currentStroke.points.length - 1];
  const distance = Math.hypot((point.x - last.x) * surfaceWidth, (point.y - last.y) * surfaceHeight);
  if (force ? distance > .1 : distance > 1.35) {
    if (currentStroke.points.length >= MAX_STROKE_POINTS) continueInNewStroke();
    currentStroke.points.push(point);
    queueActiveRedraw();
  }
}

function newStroke(firstPoint, { brush, color, size }) {
  return { brush, color, size, seed: Math.floor(Math.random() * 4294967296), points: [firstPoint] };
}

/** Keep very long strokes restorable: commit the full one and carry on seamlessly in a new stroke. */
function continueInNewStroke() {
  const full = currentStroke;
  commitStroke(full);
  currentStroke = newStroke(full.points[full.points.length - 1], full);
}

function commitStroke(stroke) {
  strokes.push(stroke);
  undoStack.push({ type: 'add', stroke });
  redoStack = [];
  renderStroke(artCtx, stroke, surfaceWidth, surfaceHeight);
  persistDrawing();
  updateButtons();
}

function beginDrawing(event) {
  if (currentStroke || (event.pointerType === 'mouse' && event.button !== 0) || !clearModal.hidden || !saveModal.hidden) return;
  event.preventDefault();
  closeToolPanel();
  currentPointerId = event.pointerId;
  currentStroke = newStroke(pointFromEvent(event), { brush: selectedBrush, color: selectedColor, size: brushSize });
  try { activeCanvas.setPointerCapture(event.pointerId); } catch (_) { /* unsupported */ }
  $('empty-hint').hidden = true;
  queueActiveRedraw();
}

function moveDrawing(event) {
  if (!currentStroke || event.pointerId !== currentPointerId) return;
  event.preventDefault();
  const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
  if (events.length) for (const sample of events) addPoint(sample);
  else addPoint(event);
}

function finishDrawing(event) {
  if (!currentStroke || event.pointerId !== currentPointerId) return;
  if (event.type !== 'pointercancel') addPoint(event, true);
  const finished = currentStroke;
  currentStroke = null;
  currentPointerId = null;
  try { activeCanvas.releasePointerCapture(event.pointerId); } catch (_) { /* already released */ }
  commitStroke(finished);
  redrawActive();
}

function undo() {
  if (currentStroke || !undoStack.length) return;
  const action = undoStack.pop();
  if (action.type === 'add') strokes.pop();
  else if (action.type === 'clear') strokes = action.strokes.slice();
  redoStack.push(action);
  persistDrawing();
  redrawArtwork();
}

function redo() {
  if (currentStroke || !redoStack.length) return;
  const action = redoStack.pop();
  if (action.type === 'add') strokes.push(action.stroke);
  else if (action.type === 'clear') strokes = [];
  undoStack.push(action);
  persistDrawing();
  redrawArtwork();
}

function openModal(modal, focusTarget) {
  closeToolPanel(true);
  lastFocusedElement = document.activeElement;
  modal.hidden = false;
  focusTarget?.focus();
}
function closeModal(modal) {
  modal.hidden = true;
  lastFocusedElement?.focus?.();
}

function makePngBlob() {
  // Export exactly what is visible, with the selected opaque canvas background.
  const canvas = document.createElement('canvas');
  canvas.width = artCanvas.width;
  canvas.height = artCanvas.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = canvasColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(artCanvas, 0, 0);
  ctx.drawImage(activeCanvas, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Could not create PNG')),
    'image/png'
  ));
}

async function openSaveDialog() {
  try {
    previewBlob = await makePngBlob();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(previewBlob);
    savePreview.src = previewUrl;
    const file = new File([previewBlob], 'doodle-pad.png', { type: 'image/png' });
    $('share-save').hidden = !(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
    openModal(saveModal, $('close-save'));
  } catch (_) {
    showToast('Could not create the picture. Please try again.');
  }
}

function closeSaveDialog() {
  closeModal(saveModal);
  savePreview.removeAttribute('src');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  previewBlob = null;
}

function downloadPng() {
  if (!previewUrl) return;
  const anchor = document.createElement('a');
  anchor.href = previewUrl;
  const date = new Date().toISOString().slice(0, 10);
  anchor.download = `doodle-${date}.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function sharePng() {
  if (!previewBlob || !navigator.share) return;
  try {
    const file = new File([previewBlob], 'doodle-pad.png', { type: 'image/png' });
    await navigator.share({ files: [file], title: 'Doodle Pad drawing' });
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('Could not open Share. You can download or long-press the picture.');
  }
}

function init() {
  restoreDrawing();
  setupControls();
  resizeCanvases();
  updateButtons();
  activeCanvas.addEventListener('pointerdown', beginDrawing);
  activeCanvas.addEventListener('pointermove', moveDrawing);
  activeCanvas.addEventListener('pointerup', finishDrawing);
  activeCanvas.addEventListener('pointercancel', finishDrawing);
  new ResizeObserver(resizeCanvases).observe(drawingSurface);
  window.addEventListener('orientationchange', () => requestAnimationFrame(resizeCanvases));

  // Register a same-origin offline cache. Browser updates are the only automatic requests.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' }).then(() => {
        // This page was served from the offline cache, and all of its files have loaded by now:
        // ask the worker to download any newer version of the app for the next launch.
        navigator.serviceWorker.controller?.postMessage('refresh-shell');
      }).catch(() => {
        // Drawing still works without an offline installation.
      });
    });
  }
}

init();
