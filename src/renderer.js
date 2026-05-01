// Renderer v2: Paper aesthetic, unfilled shapes with grey stroke + dots, colored blades
import { Application, Graphics, Container } from 'pixi.js';
import gsap from 'gsap';
import { splitPolygon, area } from './geometry.js';

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
        duration: 0.3,
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

  // The blade line cuts through ALL existing pieces on screen
  _cutExistingPieces(cutLine, bladeColor) {
    const surviving = [];
    for (const piece of this.cutPieces) {
      const result = splitPolygon(piece.points, cutLine);
      if (!result) {
        surviving.push(piece);
        continue;
      }

      const [left, right] = result;
      const [smaller, bigger] = area(left) < area(right) ? [left, right] : [right, left];

      // Remove the old piece container
      this.piecesContainer.removeChild(piece.container);
      piece.container.destroy();

      // Animate the smaller half drifting away
      const halfContainer = this._drawPiece(smaller, null);
      this.piecesContainer.addChild(halfContainer);
      const scx = smaller.reduce((s, p) => s + p.x, 0) / smaller.length;
      const scy = smaller.reduce((s, p) => s + p.y, 0) / smaller.length;
      halfContainer.pivot.set(scx, scy);
      halfContainer.x = scx;
      halfContainer.y = scy;

      const side = ((scx - cutLine.px) * cutLine.dy - (scy - cutLine.py) * cutLine.dx);
      const sign = side > 0 ? 1 : -1;
      const driftDist = 40 + Math.random() * 40;
      const rotAngle = (1 + Math.random() * 3) * (Math.PI / 180) * sign;

      gsap.to(halfContainer, {
        x: scx + sign * (-cutLine.dy) * driftDist,
        y: scy + sign * cutLine.dx * driftDist,
        rotation: rotAngle,
        alpha: 0.3,
        duration: 1.0,
        ease: 'power1.out',
      });

      // Replace piece with the bigger half (stays roughly in place)
      const biggerContainer = this._drawPiece(bigger, piece.color);
      this.piecesContainer.addChild(biggerContainer);
      const bcx = bigger.reduce((s, p) => s + p.x, 0) / bigger.length;
      const bcy = bigger.reduce((s, p) => s + p.y, 0) / bigger.length;
      biggerContainer.pivot.set(bcx, bcy);
      biggerContainer.x = bcx;
      biggerContainer.y = bcy;

      const updatedPiece = {
        container: biggerContainer,
        points: bigger,
        color: piece.color,
        cx: bcx,
        cy: bcy,
      };
      surviving.push(updatedPiece);

      // If this was the colored piece, update reference
      if (this.coloredPiece === piece) {
        this.coloredPiece = updatedPiece;
      }
    }
    this.cutPieces = surviving;
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
    flashLine.stroke({ color: bladeColor, width: 1.5, cap: 'round' });
    flashLine.alpha = 0.7;
    this.flashContainer.addChild(flashLine);

    tl.to(flashLine, { alpha: 0, duration: 0.4, ease: 'power2.out' });
    tl.call(() => {
      this.flashContainer.removeChild(flashLine);
      flashLine.destroy();
    });

    // 1b. Blade cuts through existing pieces
    this._cutExistingPieces(cutLine, bladeColor);

    // 2. Draw flying piece — ALWAYS colored with blade color
    const pieceContainer = this._drawPiece(flyingPoints, bladeColor);
    this.piecesContainer.addChild(pieceContainer);

    const pcx = flyingPoints.reduce((s, p) => s + p.x, 0) / flyingPoints.length;
    const pcy = flyingPoints.reduce((s, p) => s + p.y, 0) / flyingPoints.length;
    pieceContainer.pivot.set(pcx, pcy);
    pieceContainer.x = pcx;
    pieceContainer.y = pcy;

    // Drift direction: perpendicular away from cut line
    const side = ((pcx - cutLine.px) * cutLine.dy - (pcy - cutLine.py) * cutLine.dx);
    const sign = side > 0 ? 1 : -1;
    const driftDist = 80 + Math.random() * 60;
    const rotAngle = (2 + Math.random() * 4) * (Math.PI / 180) * sign;

    // 3. Animate piece drifting away smoothly
    tl.to(pieceContainer, {
      x: pcx + sign * (-cutLine.dy) * driftDist,
      y: pcy + sign * cutLine.dx * driftDist,
      rotation: rotAngle,
      alpha: 0.7,
      duration: 1.2,
      ease: 'power1.out',
    }, 0.1);

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

  get screen() {
    return this.app.screen;
  }

  destroy() {
    this.app.destroy(true);
  }
}
