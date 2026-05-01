import './style.css';
import { SliceRenderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { generateDemoTrack } from './synth.js';
import {
  generateRandomPolygon,
  generateCutLine,
  splitPolygon,
  area,
  centroid,
  rescalePolygon,
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
let cutCount = 0;
const maxCuts = 4;
let zooming = false;

// ── Cue sheet (130 BPM) ──
const bpm = 130;
const beatDur = 60 / bpm;
const demoCues = [];
for (let i = 1; i <= 64; i++) {
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

  await loadDefaultTrack();
}

async function loadDefaultTrack() {
  await audio.init();
  const buffer = await generateDemoTrack(audio.ctx);
  audio.loadBuffer(buffer);
  dropZone.textContent = 'Synth Beat (130 BPM)';
  dropZone.classList.add('loaded', 'default');
  playBtn.disabled = false;
}

function spawnPolygon() {
  const w = renderer.screen.width;
  const h = renderer.screen.height;
  const avgRadius = Math.min(w, h) * 0.32;
  polygon = generateRandomPolygon(w / 2, h / 2, avgRadius, 6);
  renderer.drawPolygon(polygon);
}

// ── Core slice + zoom loop ──
function doSlice() {
  if (zooming) return;

  const cutLine = generateCutLine(polygon);
  const result = splitPolygon(polygon, cutLine);
  if (!result) return;

  const [left, right] = result;
  const [flying, remaining] = area(left) < area(right) ? [left, right] : [right, left];

  const bladeColor = renderer.nextBladeColor();

  renderer.animateSlice(cutLine, flying, remaining, bladeColor);
  polygon = remaining;
  cutCount++;

  // After 4 cuts, zoom into the colored piece
  if (cutCount >= maxCuts) {
    cutCount = 0;
    const target = renderer.coloredPiece;

    if (target) {
      zooming = true;

      // Rescale that piece's shape to fill the screen
      const w = renderer.screen.width;
      const h = renderer.screen.height;
      const newPoly = rescalePolygon(target.points, w / 2, h / 2, Math.min(w, h) * 0.32);

      // Delay zoom slightly so the last cut animation plays
      gsap.delayedCall(0.6, () => {
        const tl = renderer.animateZoom(target, newPoly);
        tl.call(() => {
          polygon = newPoly;
          zooming = false;
        });
      });
    } else {
      // No colored pieces — respawn fresh
      gsap.delayedCall(0.6, () => {
        renderer.reset();
        spawnPolygon();
      });
    }
  }
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
  cutCount = 0;
  zooming = false;
  spawnPolygon();
}

function handleModeChange() {
  thresholdSlider.parentElement.style.display = modeSelect.value === 'beat' ? 'flex' : 'none';
}

init();
