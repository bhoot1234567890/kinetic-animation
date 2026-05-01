import './style.css';
import { SliceRenderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { generateDemoTrack } from './synth.js';
import {
  generateRandomPolygon,
  generateCutLine,
  splitPolygon,
  area,
} from './geometry.js';

// ── DOM ──
const canvasEl = document.getElementById('canvas');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const playBtn = document.getElementById('play-btn');
const resetBtn = document.getElementById('reset-btn');
const modeSelect = document.getElementById('mode-select');
const thresholdSlider = document.getElementById('threshold-slider');
const thresholdValue = document.getElementById('threshold-value');

// ── Engines ──
const renderer = new SliceRenderer(canvasEl);
const audio = new AudioEngine();

let isRunning = false;
let animFrameId = null;
let polygon = null;
let minArea = 800;
let usingDefaultTrack = false;

// ── Demo cue sheet (130 BPM, every beat ≈ 0.46s) ──
const bpm = 130;
const beatDur = 60 / bpm;
const demoCues = [];
for (let i = 1; i <= 32; i++) {
  demoCues.push({ time: i * beatDur });
}

// ── Init ──
async function init() {
  await renderer.init();
  spawnPolygon();

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', handleDrop);
  fileInput.addEventListener('change', e => { if (e.target.files[0]) loadAudio(e.target.files[0]); });
  playBtn.addEventListener('click', handlePlay);
  resetBtn.addEventListener('click', handleReset);
  modeSelect.addEventListener('change', handleModeChange);
  thresholdSlider.addEventListener('input', e => {
    audio.beatThreshold = parseInt(e.target.value);
    thresholdValue.textContent = e.target.value;
  });

  // Load default synth track immediately
  await loadDefaultTrack();
}

async function loadDefaultTrack() {
  await audio.init();
  const buffer = await generateDemoTrack(audio.ctx);
  audio.loadBuffer(buffer);
  usingDefaultTrack = true;
  dropZone.textContent = 'Synth Beat (130 BPM)';
  dropZone.classList.add('loaded', 'default');
  playBtn.disabled = false;
}

function spawnPolygon() {
  const w = renderer.screen.width;
  const h = renderer.screen.height;
  const avgRadius = Math.min(w, h) * 0.3;
  polygon = generateRandomPolygon(w / 2, h / 2, avgRadius, 6);
  renderer.drawPolygon(polygon, renderer.nextColor());
}

// ── Slice logic ──
function doSlice() {
  if (!polygon || area(polygon) < minArea) {
    spawnPolygon();
    return;
  }

  const cutLine = generateCutLine(polygon);
  const result = splitPolygon(polygon, cutLine);
  if (!result) return;

  const [left, right] = result;
  const [flying, remaining] = area(left) < area(right) ? [left, right] : [right, left];

  renderer.polygonPoints = polygon;
  renderer.animateSlice(cutLine, flying, remaining, renderer.nextColor());
  polygon = remaining;
}

// ── Audio handlers ──
async function handleDrop(e) {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadAudio(file);
}

async function loadAudio(file) {
  await audio.init();
  await audio.loadFile(file);
  usingDefaultTrack = false;
  dropZone.textContent = file.name;
  dropZone.classList.remove('default');
  dropZone.classList.add('loaded');
  playBtn.disabled = false;
}

function handlePlay() {
  if (isRunning) { stop(); return; }
  start();
}

function start() {
  isRunning = true;
  playBtn.textContent = '■ STOP';
  playBtn.classList.add('active');

  const mode = modeSelect.value;
  if (mode === 'cues') {
    audio.loadCues(demoCues);
    audio.nextCueIndex = 0;
    audio.play();
    audio.onCue = () => doSlice();
    audio.onBeat = null;
  } else {
    audio.play();
    audio.onBeat = () => doSlice();
    audio.onCue = null;
  }
  loop();
}

function stop() {
  isRunning = false;
  playBtn.textContent = '▶ PLAY';
  playBtn.classList.remove('active');
  if (animFrameId) cancelAnimationFrame(animFrameId);
  audio.onCue = null;
  audio.onBeat = null;
}

function loop() {
  if (!isRunning) return;
  audio.checkCues();
  audio.checkBeat();
  animFrameId = requestAnimationFrame(loop);
}

function handleReset() {
  stop();
  renderer.reset();
  spawnPolygon();
}

function handleModeChange() {
  thresholdSlider.parentElement.style.display = modeSelect.value === 'beat' ? 'flex' : 'none';
}

init();
