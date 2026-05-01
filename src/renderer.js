// Renderer v2: Paper aesthetic, unfilled shapes with grey stroke + dots, colored blades
import { Application, Graphics, Container } from 'pixi.js';
import gsap from 'gsap';

export class SliceRenderer {
  constructor(canvasEl) {
    this.app = null;
    this.canvasEl = canvasEl;
    this.stage = null;
    this.shapesContainer = null;
    this.piecesContainer = null;
    this.flashContainer = null;
    this.activeGfx = null;
    this.polygonPoints = null;
    this.cutPieces = []; // track pieces for zoom target
    this.coloredPiece = null; // only 1 colored piece at a time

    // Colors
    this.bgColor = 0xf5f0e8;
    this.strokeColor = 0x999999;
    this.dotColor = 0x666666;
    this.bladeColors = [
      0xFF2D55, // red
      0x00C7FF, // blue
      0x34C759, // green
      0xFF9500, // orange
      0xAF52DE, // purple
      0xFFD60A, // yellow
    ];
    this.currentBladeIndex = 0;
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

    this.stage = this.app.stage;
    this.shapesContainer = new Container();
    this.piecesContainer = new Container();
    this.flashContainer = new Container();

    this.stage.addChild(this.shapesContainer);
    this.stage.addChild(this.piecesContainer);
    this.stage.addChild(this.flashContainer);
  }

  nextBladeColor() {
    const c = this.bladeColors[this.currentBladeIndex % this.bladeColors.length];
    this.currentBladeIndex++;
    return c;
  }

  // Draw main polygon: grey stroke + dots, no fill
  drawPolygon(points) {
    if (this.activeGfx) {
      this.shapesContainer.removeChild(this.activeGfx);
      this.activeGfx.destroy();
    }

    const g = new Graphics();
    const flat = points.flatMap(p => [p.x, p.y]);

    // Stroke
    g.poly(flat);
    g.stroke({ color: this.strokeColor, width: 2 });

    // Edge dots
    const dots = this._getEdgeDots(points);
    for (const d of dots) {
      g.circle(d.x, d.y, 2.5);
      g.fill({ color: this.dotColor });
    }

    this.shapesContainer.addChild(g);
    this.activeGfx = g;
    this.polygonPoints = points;
  }

  _getEdgeDots(polygon, spacing = 18) {
    const dots = [];
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.floor(len / spacing));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        dots.push({ x: a.x + dx * t, y: a.y + dy * t });
      }
    }
    return dots;
  }

  // Draw a cut piece as Container: fill layer + stroke+dot layer
  _drawPiece(points, fillColor) {
    const container = new Container();
    const flat = points.flatMap(p => [p.x, p.y]);

    // Fill layer (separate so we can fade/remove it independently)
    if (fillColor !== null) {
      const fillGfx = new Graphics();
      fillGfx.poly(flat);
      fillGfx.fill({ color: fillColor, alpha: 0.3 });
      container.addChild(fillGfx);
      container._fillGfx = fillGfx;
    }

    // Stroke + dots layer
    const strokeGfx = new Graphics();
    strokeGfx.poly(flat);
    strokeGfx.stroke({ color: this.strokeColor, width: 1.5 });
    const dots = this._getEdgeDots(points);
    for (const d of dots) {
      strokeGfx.circle(d.x, d.y, 2);
      strokeGfx.fill({ color: this.dotColor });
    }
    container.addChild(strokeGfx);

    return container;
  }

  // Strip color from the previously colored piece
  _uncolorPrevious() {
    if (!this.coloredPiece) return;
    const fillGfx = this.coloredPiece.container._fillGfx;
    if (fillGfx) {
      gsap.to(fillGfx, {
        alpha: 0,
        duration: 0.2,
        ease: 'power2.out',
        onComplete: () => {
          if (fillGfx.parent) fillGfx.parent.removeChild(fillGfx);
          fillGfx.destroy();
        }
      });
    }
    this.coloredPiece.color = null;
    this.coloredPiece = null;
  }

  // Main animation: cut the polygon
  animateSlice(cutLine, flyingPoints, remainingPoints, bladeColor) {
    const tl = gsap.timeline();
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Strip color from previous colored piece
    this._uncolorPrevious();

    // Remove current polygon
    if (this.activeGfx) {
      this.shapesContainer.removeChild(this.activeGfx);
      this.activeGfx.destroy();
      this.activeGfx = null;
    }

    // 1. Flash blade line
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
    flashLine.stroke({ color: bladeColor, width: 3, cap: 'round' });
    this.flashContainer.addChild(flashLine);

    tl.to(flashLine, { alpha: 0, duration: 0.25, ease: 'power2.out' });
    tl.call(() => {
      this.flashContainer.removeChild(flashLine);
      flashLine.destroy();
    });

    // 2. Draw flying piece — ALWAYS colored with blade color
    const pieceContainer = this._drawPiece(flyingPoints, bladeColor);
    this.piecesContainer.addChild(pieceContainer);

    const pcx = flyingPoints.reduce((s, p) => s + p.x, 0) / flyingPoints.length;
    const pcy = flyingPoints.reduce((s, p) => s + p.y, 0) / flyingPoints.length;
    pieceContainer.pivot.set(pcx, pcy);
    pieceContainer.x = pcx;
    pieceContainer.y = pcy;

    // Fly direction: away from cut line
    const side = ((pcx - cutLine.px) * cutLine.dy - (pcy - cutLine.py) * cutLine.dx);
    const sign = side > 0 ? 1 : -1;
    const flyDist = 200 + Math.random() * 250;
    const rotAngle = (6 + Math.random() * 14) * (Math.PI / 180) * sign;

    // 3. Screen shake
    this._shake();

    // 4. Animate piece flying
    tl.to(pieceContainer, {
      x: pcx + sign * cutLine.dx * flyDist - sign * cutLine.dy * flyDist * 0.3,
      y: pcy + sign * cutLine.dy * flyDist + sign * cutLine.dx * flyDist * 0.3,
      rotation: rotAngle,
      alpha: 0.7,
      duration: 0.7,
      ease: 'power3.out',
    }, 0.03);

    // Store piece data — mark as colored
    const pieceData = {
      container: pieceContainer,
      points: flyingPoints,
      color: bladeColor,
      cx: pcx,
      cy: pcy,
    };
    this.cutPieces.push(pieceData);
    this.coloredPiece = pieceData;

    // 5. Draw remaining polygon (the main shape)
    this.drawPolygon(remainingPoints);

    // Scale punch
    if (this.activeGfx) {
      const rcx = remainingPoints.reduce((s, p) => s + p.x, 0) / remainingPoints.length;
      const rcy = remainingPoints.reduce((s, p) => s + p.y, 0) / remainingPoints.length;
      this.activeGfx.pivot.set(rcx, rcy);
      this.activeGfx.x = rcx;
      this.activeGfx.y = rcy;
      this.activeGfx.scale.set(1.03);
      tl.to(this.activeGfx.scale, { x: 1, y: 1, duration: 0.3, ease: 'power2.out' }, 0.02);
    }

    return tl;
  }

  // Zoom into a piece and make it the new polygon
  animateZoom(pieceData, newPolygonPoints) {
    const tl = gsap.timeline();

    // Fade all other pieces
    for (const p of this.cutPieces) {
      if (p !== pieceData) {
        tl.to(p.container, { alpha: 0, duration: 0.3 }, 0);
      }
    }

    // Fade main polygon
    if (this.activeGfx) {
      tl.to(this.activeGfx, { alpha: 0, duration: 0.3 }, 0);
    }

    // Zoom stage into the piece
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const targetScale = 3 + Math.random();

    tl.to(this.stage.scale, {
      x: targetScale,
      y: targetScale,
      duration: 0.8,
      ease: 'power2.inOut',
    }, 0.2);
    tl.to(this.stage, {
      x: w / 2 - pieceData.cx * targetScale,
      y: h / 2 - pieceData.cy * targetScale,
      duration: 0.8,
      ease: 'power2.inOut',
    }, 0.2);

    // After zoom: clear everything, reset, draw new polygon
    tl.call(() => {
      this._clearAll();
      this.stage.scale.set(1);
      this.stage.x = 0;
      this.stage.y = 0;
      this.drawPolygon(newPolygonPoints);
    });

    // Fade in new polygon
    if (this.activeGfx) {
      this.activeGfx.alpha = 0;
      tl.to(this.activeGfx, { alpha: 1, duration: 0.4, ease: 'power2.out' });
    }

    return tl;
  }

  _clearAll() {
    this.piecesContainer.removeChildren();
    this.flashContainer.removeChildren();
    this.shapesContainer.removeChildren();
    // Destroy all children
    for (const c of [...this.piecesContainer.children]) c.destroy();
    for (const c of [...this.flashContainer.children]) c.destroy();
    for (const c of [...this.shapesContainer.children]) c.destroy();
    this.activeGfx = null;
    this.cutPieces = [];
    this.coloredPiece = null;
  }

  reset() {
    this._clearAll();
    this.polygonPoints = null;
    this.cutCount = 0;
    this.currentBladeIndex = 0;
    this.stage.scale.set(1);
    this.stage.x = 0;
    this.stage.y = 0;
  }

  _shake() {
    const intensity = 3 + Math.random() * 3;
    const ox = this.stage.x;
    const oy = this.stage.y;
    gsap.to(this.stage, {
      x: ox + (Math.random() - 0.5) * intensity,
      y: oy + (Math.random() - 0.5) * intensity,
      duration: 0.035,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        gsap.to(this.stage, { x: ox, y: oy, duration: 0.08 });
      }
    });
  }

  get screen() {
    return this.app.screen;
  }

  destroy() {
    this.app.destroy(true);
  }
}
