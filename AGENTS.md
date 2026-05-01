# Repository Guidelines

## Project Overview

**Polygon Beat Slicer** — a browser-based audio-reactive animation tool. Polygons are sliced in sync with audio. Two trigger modes: **Cue Sheet** (every beat at 130 BPM) and **Beat Detection** (bass-energy threshold via Web Audio API analyser). A built-in synth engine generates a default electronic beat track so the app works immediately with no file drop.

Every 4 slices, the camera zooms into a randomly-chosen colored cut piece; that piece rescales to become the new polygon. This loop creates a fluid, infinite recursive slicing experience.

## Architecture & Data Flow

```
index.html
  └─ src/main.js            ← orchestrator (DOM wiring, rAF game loop, slice + zoom flow)
       ├─ src/renderer.js    ← SliceRenderer (PixiJS 8, paper aesthetic, GSAP 3 animations, zoom)
       ├─ src/audio.js       ← AudioEngine (Web Audio playback, cue sheet, bass beat detection)
       ├─ src/geometry.js    ← pure functions (polygon gen, split, edge dots, rescale, metrics)
       ├─ src/synth.js       ← pure function: offline Web Audio synth (kick, snare, hi-hat, bass, pad)
       └─ src/style.css      ← light theme, glassmorphism controls
```

**Startup:**
1. `SliceRenderer.init()` — PixiJS `Application` with light background, three containers: `shapesContainer`, `piecesContainer`, `flashContainer`
2. `AudioEngine.init()` — `AudioContext` + `AnalyserNode` (FFT 256)
3. `generateDemoTrack(audio.ctx)` → `audio.loadBuffer(buffer)` — offline-rendered synth beat, drop zone shows "Synth Beat (130 BPM)"
4. `spawnPolygon()` — random 6–8 sided polygon, drawn as grey stroke + edge dots (no fill)

**Frame loop (`requestAnimationFrame`):**
1. `audio.checkCues()` — fires `onCue` when playback time crosses a cue timestamp
2. `audio.checkBeat()` — fires `onBeat` when bass energy (FFT bins 0–12) exceeds threshold with 200 ms cooldown
3. On trigger → `doSlice()` → `generateCutLine()` + `splitPolygon()` → `renderer.animateSlice()`

**Slice + zoom loop:**
1. Random cut line splits polygon; smaller piece flies away (with or without blade-color fill)
2. Flying piece data stored in `renderer.cutPieces[]`
3. After 4 cuts → zoom into a random colored piece, clear everything, draw rescaled piece as new polygon
4. If no colored pieces exist → reset and spawn fresh polygon

## Key Directories

| Directory | Purpose |
|---|---|
| `src/` | All application source (vanilla JS, no framework) |
| `public/` | Static files (`favicon.svg`, `icons.svg`) |
| `dist/` | Vite build output (gitignored) |
| `.wrangler/` | Cloudflare Workers staging directory (no config file found) |

## Development Commands

| Command | Action |
|---|---|
| `npm run dev` | Start Vite dev server (HMR) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |

No test suite, linter, or formatter is configured.

## Code Conventions & Common Patterns

### Module structure
- **Classes** for stateful engines (`AudioEngine`, `SliceRenderer`). Instantiated once in `main.js`.
- **Pure functions** for geometry and audio synthesis. No side effects, no classes. Exported individually.
- ES module imports/exports throughout. File extension `.js` always explicit.

### Naming
- `camelCase` for variables and functions
- `PascalCase` for classes
- Private methods prefixed with `_` (e.g., `_setBuffer()`, `_getEdgeDots()`, `_drawPiece()`, `_shake()`, `_clearAll()`)

### PixiJS 8.x rendering patterns
- `SliceRenderer` manages three containers stacked on stage: `shapesContainer` (main polygon) → `piecesContainer` (flying cut pieces) → `flashContainer` (blade line)
- `Graphics.poly()` takes flat `[x,y,x,y,...]` arrays via `points.flatMap(p => [p.x, p.y])`
- `Graphics.fill()` and `Graphics.stroke()` use PixiJS v8 object-style params: `{ color: 0x999999, width: 2 }`
- `Application.init()` is async — setup uses `await this.app.init({...})`, not constructor options
- Animations use `this.stage.scale`/`this.stage.x`/`this.stage.y` for zoom effects, then reset to identity after

### GSAP 3.x animation patterns
- GSAP timelines (`gsap.timeline()`) chain animations in sequence
- Piece flyout: centroid used as `pivot`, then `x`/`y` translated with sign derived from line-side test, plus rotation
- Screen shake: `gsap.to(this.stage, { x, y, yoyo: true, repeat: 3 })` with `onComplete` reset to stage origin
- Zoom: simultaneous `stage.scale` and `stage.position` tween over 0.8s with `power2.inOut`
- Callbacks use `tl.call(fn)` at timeline end for cleanup
- `gsap.delayedCall(0.6, fn)` used in `main.js` to delay zoom after last cut animation

### Audio patterns (Web Audio API)
- `AudioEngine.init()` creates `AudioContext` + `AnalyserNode` once; reused across file loads
- `AudioEngine` stores `this.buffer` (decoded `AudioBuffer`), creates a fresh `BufferSource` on each `play()` call — enabling repeated playback
- `loadFile(file)` decodes and stores; `loadBuffer(audioBuffer)` stores directly (for offline-rendered synth)
- FFT size 256, smoothing 0.3 — optimized for bass detection, not visualization
- Beat detection: average of frequency bins 0–12 (≈ 0–1 kHz), threshold slider (60–255, default 180), 200 ms cooldown
- Cue sheet: 64 beats at 130 BPM (`i * beatDur` for i=1..64), cues sorted by time on load, fires sequentially

### Polygon geometry patterns
- Polygon = `Array<{x: number, y: number}>`
- `splitPolygon` uses custom line-side test + edge intersection (NOT `polygon-clipping` library)
- Cut line = `{ px, py, dx, dy, angle }` (point + direction vector + angle)
- Side test: `(p.x - px) * dy - (p.y - py) * dx` — positive = left, negative = right
- Intersection: parametric `t = sa / (sa - sb)` along edge `a→b`
- Splitting returns `null` if either piece has fewer than 3 vertices
- `rescalePolygon(points, cx, cy, targetRadius)` — rescales around centroid to fit target area

### Synth engine patterns (`synth.js`)
- Uses `OfflineAudioContext` for fast buffer generation (no real-time playback during render)
- 130 BPM, 8 bars, 4/4 time
- Kick: sine wave, 150 Hz → 30 Hz exponential ramp, 0.4s decay
- Snare: noise burst (highpass 1500 Hz) + triangle body tone (200 Hz → 80 Hz)
- Hi-hat: noise burst (highpass 8000 Hz), alternating velocity (0.12 / 0.06)
- Bass: sawtooth with lowpass filter sweep (600 Hz → 150 Hz), A1-ish groove
- Pad: sine chord stabs (Am triad) on every 2nd bar with slow attack/release

### State management patterns
- Module-level `let` variables in `main.js` for app state: `isRunning`, `polygon`, `cutCount`, `zooming`
- `zooming` flag prevents new slices during zoom animation
- `cutCount` resets to 0 after every 4 cuts; zoom triggers on reset
- `renderer.cutPieces[]` tracks active flying pieces for zoom target selection

### Color conventions
| Role | Value |
|---|---|
| Background | `0xf5f0e8` (warm off-white) |
| Stroke | `0x999999` (medium grey) |
| Edge dots | `0x666666` (dark grey) |
| Blade colors | `0xFF2D55` (red), `0x00C7FF` (blue), `0x34C759` (green), `0xFF9500` (orange), `0xAF52DE` (purple), `0xFFD60A` (yellow) |
| Fill alpha | `0.25` when colored, `null` when uncolored |
| Button active | `#FF2D55` |
| Slider accent | `#FF2D55` |

## Important Files

| File | Role |
|---|---|
| `index.html` | Entry HTML. Controls bar + canvas div. Loads `src/main.js` as module. |
| `src/main.js` | Orchestrator. DOM refs, engine wiring, rAF game loop, slice dispatch, zoom logic. |
| `src/renderer.js` | `SliceRenderer` class. PixiJS setup, layer stack, paper-style polygon rendering, GSAP slice/zoom animations. |
| `src/audio.js` | `AudioEngine` class. Audio decode, buffer storage, cue/beat dispatch. |
| `src/geometry.js` | Pure geometry functions. Polygon gen, line-side split, edge dots, rescale, centroid, area. |
| `src/synth.js` | `generateDemoTrack()` — offline Web Audio synth for default beat track. |
| `src/style.css` | All styles. Light warm theme, Space Grotesk, glassmorphism controls bar. |
| `package.json` | Dependencies and scripts. Vite ^8, PixiJS ^8, GSAP ^3, polygon-clipping ^0.15. |

## Runtime/Tooling Preferences

- **Runtime**: Browser (no Node.js server needed; Vite dev server is Node)
- **Package manager**: npm (no lockfile for alternatives present)
- **Bundler**: Vite ^8.0.10 (zero-config, vanilla JS)
- **Module system**: ES modules (`"type": "module"`)
- **No TypeScript**. No framework. Plain JS.
- **Font**: Space Grotesk loaded from Google Fonts in `<head>`

## Testing & QA

No test framework is configured. There are no test files, no coverage targets, and no CI configuration. Manual testing is done in-browser via `npm run dev`. The `dist/` build can be previewed with `npm run preview`.

## Dependencies Note

`polygon-clipping` (^0.15.7) is listed in `package.json` but is **not imported or used anywhere** in the source. The custom `splitPolygon()` in `src/geometry.js` handles all polygon splitting. The dependency can be safely removed unless planned for future use.
