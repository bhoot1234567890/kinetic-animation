# Repository Guidelines

## Project Overview

**Polygon Beat Slicer** — a browser-based audio-reactive animation tool. Polygons are sliced in sync with audio. Two trigger modes: **Cue Sheet** (every beat at 130 BPM) and **Beat Detection** (bass-energy threshold via Web Audio API analyser). A built-in synth engine generates a default electronic beat track so the app works immediately with no file drop.

Every 4 slices, the camera zooms into the single colored cut piece; that piece rescales to become the new polygon, creating a fluid infinite recursive slicing experience. The blade cuts through **all** pieces on screen simultaneously — not just the main polygon — turning the canvas into a persistent composition of fragmented shapes.

## Architecture & Data Flow

```
index.html
  └─ src/main.js            ← orchestrator (DOM wiring, rAF game loop, slice + zoom flow)
       ├─ src/renderer.js    ← SliceRenderer (PixiJS 8, paper aesthetic, GSAP 3 animations, zoom)
       ├─ src/audio.js       ← AudioEngine (Web Audio playback, cue sheet, bass beat detection)
       ├─ src/geometry.js    ← pure functions (polygon gen, split, edge dots, rescale, metrics)
       ├─ src/synth.js       ← pure function: offline Web Audio synth (kick, snare, hi-hat, bass, pad)
       └─ src/style.css      ← light warm theme, glassmorphism controls
```

**Startup:**
1. `SliceRenderer.init()` — PixiJS `Application` with warm off-white background, three containers: `shapesContainer` (main polygon), `piecesContainer` (cut fragments), `flashContainer` (blade lines)
2. `AudioEngine.init()` — `AudioContext` + `AnalyserNode` (FFT 256, smoothing 0.3)
3. `generateDemoTrack(audio.ctx)` → `audio.loadBuffer(buffer)` — offline-rendered synth beat; drop zone displays "Synth Beat (130 BPM)"
4. `spawnPolygon()` — random 6–8 sided polygon, drawn as grey stroke + edge dots (no fill)

**Frame loop (`requestAnimationFrame`):**
1. `audio.checkCues()` — fires `onCue` when playback time crosses a cue timestamp
2. `audio.checkBeat()` — fires `onBeat` when bass energy (FFT bins 0–12) exceeds threshold with 200 ms cooldown
3. On trigger → `doSlice()` → `generateCutLine()` + `splitPolygon()` → `renderer.animateSlice()`

**Slice + zoom loop:**
1. Random cut line splits the main polygon; smaller piece receives blade color fill and drifts perpendicular to the cut
2. The same blade line cuts through **all existing pieces** on screen (`_cutExistingPieces`); each piece splits, the bigger half survives, the smaller half drifts away and fades
3. Only one piece is colored at a time (`renderer.coloredPiece`); previous color is faded out before a new piece receives color
4. After 4 cuts → zoom into `renderer.coloredPiece`, rescale it, clear everything, draw it as the new polygon
5. If no colored piece exists → reset and spawn fresh polygon

## Key Directories

| Directory | Purpose |
|---|---|
| `src/` | All application source (vanilla JS, no framework) |
| `public/` | Static files (`favicon.svg`, `icons.svg`) |
| `dist/` | Vite build output (gitignored) |
| `.wrangler/` | Cloudflare Workers staging (no config file found; likely unused) |

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
- Private methods prefixed with `_` (e.g., `_setBuffer()`, `_getEdgeDots()`, `_drawPiece()`, `_uncolorPrevious()`, `_cutExistingPieces()`, `_clearAll()`, `_shake()`)

### PixiJS 8.x rendering patterns
- Three-container layer stack on stage: `shapesContainer` → `piecesContainer` → `flashContainer`
- `Graphics.poly()` takes flat `[x,y,x,y,...]` arrays via `points.flatMap(p => [p.x, p.y])`
- `Graphics.fill()` and `Graphics.stroke()` use v8 object-style params: `{ color: 0x999999, width: 2 }`
- `Application.init()` is async — setup uses `await this.app.init({...})`, not constructor options
- Cut pieces are `Container` objects, NOT bare `Graphics`:
  - Fill layer (`_fillGfx`): colored `Graphics` with alpha 0.3, attached as `container._fillGfx` for independent manipulation
  - Stroke layer: separate `Graphics` for stroke + edge dots
  - This split allows fading fill independently from stroke (used by `_uncolorPrevious()`)
- Zoom: `stage.scale` and `stage.position` tween simultaneously, then reset to identity in `tl.call()`

### GSAP 3.x animation patterns
- GSAP timelines (`gsap.timeline()`) chain animations in sequence
- Piece drift: uses perpendicular direction `sign * (-cutLine.dy) * driftDist` for x, `sign * cutLine.dx * driftDist` for y
- Screen shake: `gsap.to(this.stage, { x, y, yoyo: true, repeat: 3 })` with `onComplete` reset
- Zoom: simultaneous `stage.scale` and `stage.position` tween over 0.8s with `power2.inOut`
- Callbacks: `tl.call(fn)` for cleanup at timeline end; `gsap.to(fillGfx, { alpha: 0, onComplete: … })` for graceful removal
- **Important**: `gsap` is used in `main.js` (`gsap.delayedCall()`) without an explicit import. This works because GSAP attaches itself to `window` as a side effect when loaded, but a `ReferenceError` would occur in strict isolated module contexts. An explicit `import gsap from 'gsap'` in `main.js` is recommended.

### "Slash everything" mechanic (`_cutExistingPieces`)
- Every blade cut iterates `this.cutPieces[]` and applies `splitPolygon()` to each piece
- Pieces that don't intersect the line survive unchanged
- Split pieces: the bigger half becomes the updated piece (stays in place), the smaller half drifts perpendicular to the cut and fades to 0.3 alpha over 1.0s
- If the colored piece gets split, `this.coloredPiece` reference updates to the bigger half
- Old containers are removed from `piecesContainer` and destroyed

### Piece data structure
```js
{
  container: Container,   // PixiJS Container (fill layer + stroke layer)
  points: Array,          // polygon vertices [{x, y}, ...]
  color: number | null,   // hex color if this piece is colored, null otherwise
  cx: number,             // centroid x
  cy: number,             // centroid y
}
```

### Audio patterns (Web Audio API)
- `AudioEngine.init()` creates `AudioContext` + `AnalyserNode` once; reused across file loads
- `AudioEngine` stores `this.buffer` (decoded `AudioBuffer`), creates a fresh `BufferSource` on each `play()` call — enabling repeated playback
- `loadFile(file)` decodes from `File`; `loadBuffer(audioBuffer)` stores directly (for offline-rendered synth)
- FFT size 256, smoothing 0.3 — optimized for bass detection, not visualization
- Beat detection: average of frequency bins 0–12 (≈ 0–1 kHz), threshold slider (60–255, default 180), 200 ms cooldown, fires `onBeat(bassEnergy)`
- Cue sheet: 64 beats at 130 BPM (`i * (60/130)` for i=1..64), cues sorted by time, fires sequentially via `onCue`

### Polygon geometry patterns
- Polygon = `Array<{x: number, y: number}>`
- `splitPolygon` uses custom line-side test + edge intersection (NOT `polygon-clipping` library)
- Cut line = `{ px, py, dx, dy, angle }` (point + unit direction vector + angle in radians)
- Side test: `(p.x - px) * dy - (p.y - py) * dx` — positive = left, negative = right
- Intersection: parametric `t = sa / (sa - sb)` along edge `a→b`
- Splitting returns `null` if either piece has < 3 vertices or line doesn't cross the polygon
- `rescalePolygon(points, cx, cy, targetRadius)` — rescales around centroid to fit target radius; used to expand zoomed piece to fill screen
- `getEdgeDots(polygon, spacing)` — decorative dots along polygon edges (rendered in renderer, also exported for external use)

### Synth engine (`synth.js`)
- `OfflineAudioContext` for fast buffer generation (no real-time playback overhead)
- 130 BPM, 8 bars, 4/4 time (~14.8 seconds)
- Kick: sine 150 Hz → 30 Hz exponential ramp, 0.4s decay, gain 0.9
- Snare: noise burst (highpass 1500 Hz, 0.15s) + triangle body (200 Hz → 80 Hz, 0.08s)
- Hi-hat: noise burst (highpass 8000 Hz, 0.04s), alternating velocity 0.12 / 0.06
- Bass: sawtooth with lowpass sweep (600 Hz → 150 Hz), A1-ish groove pattern
- Pad: sine chord stabs (Am triad: 220, 277.18, 329.63 Hz) on every 2nd bar, slow attack/release

### State management
- Module-level `let` in `main.js`: `isRunning`, `polygon`, `cutCount`, `zooming`
- `zooming` flag prevents new slices during zoom animation
- `cutCount` resets to 0 after every 4 cuts (`maxCuts = 4`); zoom triggers on reset
- `renderer.coloredPiece` — exactly one colored piece at a time (null if none)
- `renderer.cutPieces[]` — all active pieces on screen, updated by `_cutExistingPieces()`

### Color conventions
| Role | Value |
|---|---|
| Background | `0xf5f0e8` (warm off-white) |
| Stroke | `0x999999` (medium grey) |
| Edge dots | `0x666666` (dark grey) |
| Blade colors (cycled) | `0xFF2D55` (red), `0x00C7FF` (blue), `0x34C759` (green), `0xFF9500` (orange), `0xAF52DE` (purple), `0xFFD60A` (yellow) |
| Fill alpha (colored) | `0.3` |
| Button active | `#FF2D55` |
| Slider accent | `#FF2D55` |

## Important Files

| File | Role |
|---|---|
| `index.html` | Entry HTML. Controls bar + canvas div. Loads `src/main.js` as module. |
| `src/main.js` | Orchestrator. DOM refs, engine wiring, rAF game loop, slice dispatch, 4-cut zoom logic. |
| `src/renderer.js` | `SliceRenderer` class. PixiJS setup, paper-style polygon rendering, "slash everything" mechanic, GSAP slice/zoom animations. |
| `src/audio.js` | `AudioEngine` class. Audio decode, buffer storage, cue/beat dispatch with cooldown. |
| `src/geometry.js` | Pure geometry functions. Polygon gen, line-side split, edge dots, rescale, centroid, area. |
| `src/synth.js` | `generateDemoTrack()` — offline Web Audio synth for default 130 BPM beat track. |
| `src/style.css` | All styles. Light warm theme (`#f5f0e8`), Space Grotesk font, glassmorphism controls bar. |
| `package.json` | Dependencies and scripts. Vite ^8, PixiJS ^8, GSAP ^3, polygon-clipping ^0.15. |

## Runtime/Tooling Preferences

- **Runtime**: Browser (Vite dev server requires Node.js; production is static HTML+JS)
- **Package manager**: npm
- **Bundler**: Vite ^8.0.10 (zero-config, vanilla JS)
- **Module system**: ES modules (`"type": "module"`)
- **No TypeScript**. No framework. Plain JS throughout.
- **Font**: Space Grotesk loaded from Google Fonts in `<head>`

## Testing & QA

No test framework, no test files, no coverage targets, no CI configuration. Manual testing in-browser via `npm run dev`. Production build previewable with `npm run preview`.

## Known Issues

- **Missing `gsap` import in `main.js`**: `src/main.js` calls `gsap.delayedCall()` on lines 112 and 121 without an explicit `import gsap from 'gsap'`. This works because GSAP attaches to `window` as a side effect, but will fail in strict isolated module environments. Add the import for correctness.
- **Unused dependency**: `polygon-clipping` (^0.15.7) is listed in `package.json` but never imported. All polygon splitting uses the custom `splitPolygon()` in `geometry.js`.
