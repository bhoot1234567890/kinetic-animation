// Renderer: PixiJS Graphics + GSAP animation system
import { Application, Graphics, Container } from 'pixi.js';
import gsap from 'gsap';

export class SliceRenderer {
  constructor(canvasEl) {
    this.app = null;
    this.canvasEl = canvasEl;
    this.mainContainer = null;
    this.piecesContainer = null;
    this.flashContainer = null;
    this.overlayContainer = null;
    this.activePolygon = null; // current Graphics object
    this.polygonPoints = null;
    this.colorPalette = ['#F2F0EB', '#FF2D6F', '#00F0FF', '#C8FF00', '#FF3D00'];
    this.currentColorIndex = 0;
    this.bgColor = 0x08080a;
    this.shakeIntensity = 0;
  }

  async init() {
    this.app = new Application();
    await this.app.init({
      resizeTo: this.canvasEl,
      backgroundColor: this.bgColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    this.canvasEl.appendChild(this.app.canvas);

    this.mainContainer = new Container();
    this.piecesContainer = new Container();
    this.flashContainer = new Container();
    this.overlayContainer = new Container();

    this.app.stage.addChild(this.mainContainer);
    this.app.stage.addChild(this.piecesContainer);
    this.app.stage.addChild(this.flashContainer);
    this.app.stage.addChild(this.overlayContainer);

    this._buildGrainOverlay();
  }

  _buildGrainOverlay() {
    const g = new Graphics();
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    for (let i = 0; i < 600; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.circle(x, y, 0.8 + Math.random() * 0.6);
      g.fill({ color: 0xffffff, alpha: 0.02 });
    }
    this.overlayContainer.addChild(g);
  }

  nextColor() {
    const c = this.colorPalette[this.currentColorIndex % this.colorPalette.length];
    this.currentColorIndex++;
    return c;
  }

  drawPolygon(points, color) {
    if (this.activePolygon) {
      this.mainContainer.removeChild(this.activePolygon);
      this.activePolygon.destroy();
    }

    const g = new Graphics();
    g.poly(points.flatMap(p => [p.x, p.y]));
    g.fill({ color: color });
    g.stroke({ color: 0xffffff, width: 1.5, alpha: 0.15 });

    this.mainContainer.addChild(g);
    this.activePolygon = g;
    this.polygonPoints = points;
  }

  // Animate the cut: flash line, split, piece flies away
  animateSlice(cutLine, piecePoints, remainingPoints, remainingColor) {
    const tl = gsap.timeline();
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // 1. Flash cut line
    const flashLine = new Graphics();
    const lineLen = Math.max(w, h) * 2;
    flashLine.moveTo(
      cutLine.px - cutLine.dx * lineLen / 2,
      cutLine.py - cutLine.dy * lineLen / 2
    );
    flashLine.lineTo(
      cutLine.px + cutLine.dx * lineLen / 2,
      cutLine.py + cutLine.dy * lineLen / 2
    );
    flashLine.stroke({ color: 0xffffff, width: 2.5 });
    flashLine.alpha = 1;
    this.flashContainer.addChild(flashLine);

    // 2. Full-screen flash
    const screenFlash = new Graphics();
    screenFlash.rect(0, 0, w, h);
    screenFlash.fill({ color: 0xffffff, alpha: 0.25 });
    this.flashContainer.addChild(screenFlash);

    tl.to(flashLine, { alpha: 0, duration: 0.2, ease: 'power2.out' });
    tl.to(screenFlash, { alpha: 0, duration: 0.12, ease: 'power2.out' }, '<');
    tl.call(() => {
      this.flashContainer.removeChild(flashLine);
      this.flashContainer.removeChild(screenFlash);
      flashLine.destroy();
      screenFlash.destroy();
    });

    // 3. Remove old polygon, draw two pieces
    if (this.activePolygon) {
      this.mainContainer.removeChild(this.activePolygon);
      this.activePolygon.destroy();
      this.activePolygon = null;
    }

    // Flying piece
    const pieceGfx = new Graphics();
    const pieceColor = this.polygonPoints ? this._getCurrentFillColor() : '#F2F0EB';
    pieceGfx.poly(piecePoints.flatMap(p => [p.x, p.y]));
    pieceGfx.fill({ color: pieceColor });
    pieceGfx.stroke({ color: 0xffffff, width: 1, alpha: 0.1 });
    this.piecesContainer.addChild(pieceGfx);

    // Centroid of flying piece for rotation origin
    const pcx = piecePoints.reduce((s, p) => s + p.x, 0) / piecePoints.length;
    const pcy = piecePoints.reduce((s, p) => s + p.y, 0) / piecePoints.length;
    pieceGfx.pivot.set(pcx, pcy);
    pieceGfx.x = pcx;
    pieceGfx.y = pcy;

    // Direction to fly: away from cut line normal
    const flyDx = cutLine.dx * (300 + Math.random() * 200);
    const flyDy = cutLine.dy * (300 + Math.random() * 200);
    // Determine which side the piece centroid is on
    const side = ((pcx - cutLine.px) * cutLine.dy - (pcy - cutLine.py) * cutLine.dx);
    const sign = side > 0 ? 1 : -1;

    const rotAngle = (8 + Math.random() * 17) * (Math.PI / 180) * sign;

    // 4. Screen shake
    this._shake();

    // 5. Animate piece
    tl.to(pieceGfx, {
      x: pcx + sign * flyDx,
      y: pcy + sign * flyDy,
      rotation: rotAngle,
      alpha: 0,
      duration: 0.6,
      ease: 'power2.out',
    }, 0.03);

    tl.call(() => {
      this.piecesContainer.removeChild(pieceGfx);
      pieceGfx.destroy();
    }, null, 0.7);

    // 6. Draw remaining polygon
    this.drawPolygon(remainingPoints, remainingColor);

    // Subtle scale punch on the new polygon
    if (this.activePolygon) {
      const rcx = remainingPoints.reduce((s, p) => s + p.x, 0) / remainingPoints.length;
      const rcy = remainingPoints.reduce((s, p) => s + p.y, 0) / remainingPoints.length;
      this.activePolygon.pivot.set(rcx, rcy);
      this.activePolygon.x = rcx;
      this.activePolygon.y = rcy;
      this.activePolygon.scale.set(1.04);
      tl.to(this.activePolygon.scale, { x: 1, y: 1, duration: 0.3, ease: 'power2.out' }, 0.02);
    }

    return tl;
  }

  _getCurrentFillColor() {
    return this.colorPalette[this.currentColorIndex % this.colorPalette.length];
  }

  _shake() {
    const stage = this.app.stage;
    const ox = 0, oy = 0;
    const intensity = 4 + Math.random() * 4;

    gsap.to(stage, {
      x: ox + (Math.random() - 0.5) * intensity,
      y: oy + (Math.random() - 0.5) * intensity,
      duration: 0.04,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        gsap.to(stage, { x: ox, y: oy, duration: 0.1 });
      }
    });
  }

  reset() {
    this.piecesContainer.removeChildren();
    this.flashContainer.removeChildren();
    if (this.activePolygon) {
      this.mainContainer.removeChild(this.activePolygon);
      this.activePolygon.destroy();
      this.activePolygon = null;
    }
    this.polygonPoints = null;
    this.currentColorIndex = 0;
  }

  get screen() {
    return this.app.screen;
  }

  destroy() {
    this.app.destroy(true);
  }
}
