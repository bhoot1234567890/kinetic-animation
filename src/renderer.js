// Renderer v2: paper aesthetic, visible-piece slicing, colored blades.
import { Application, Graphics, Container } from 'pixi.js';
import gsap from 'gsap';
import { splitPolygon, area } from './geometry.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
    this.cutPieces = [];
    this.coloredPiece = null;
    this.lastTimeScale = 1.0;
    this._activeTimeline = null;
    this.isZooming = false;

    this.bgColor = 0xf5f0e8;
    this.strokeColor = 0x999999;
    this.dotColor = 0x666666;
    this.fillAlpha = 0.3;
    this.bladeColors = [
      0x8F00FF, // Violet
      0x4B0082, // Indigo
      0x0000FF, // Blue
      0x00FF00, // Green
      0xFFFF00, // Yellow
      0xFFA500, // Orange
      0xFF0000, // Red
    ];
    this.currentBladeIndex = Math.floor(Math.random() * this.bladeColors.length);
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

    this.app.ticker.add(this._update, this);
  }

  _update(ticker) {
    if (this.isZooming) return;
    const dt = ticker.deltaTime;
    if (this.cutPieces.length === 0) return;

    const forceMultiplier = 4.5;
    const friction = 0.88;
    const springBack = 0.03;
    const padding = 20;

    for (let i = 0; i < this.cutPieces.length; i++) {
      const a = this.cutPieces[i].container;
      if (a.alpha <= 0.3) continue;

      a.vx -= a.repulsionX * springBack;
      a.vy -= a.repulsionY * springBack;

      const ax = a.baseX + a.repulsionX;
      const ay = a.baseY + a.repulsionY;

      // Repel from other pieces
      for (let j = i + 1; j < this.cutPieces.length; j++) {
        const b = this.cutPieces[j].container;
        if (b.alpha <= 0.3) continue;

        const bx = b.baseX + b.repulsionX;
        const by = b.baseY + b.repulsionY;

        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const proxThreshold = a.radius + b.radius + padding;

        if (dist > 0.01 && dist < proxThreshold) {
          const strength = (1 - dist / proxThreshold) * forceMultiplier;
          const fx = (dx / dist) * strength;
          const fy = (dy / dist) * strength;

          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    for (const p of this.cutPieces) {
      const c = p.container;
      c.vx *= friction;
      c.vy *= friction;
      c.repulsionX += c.vx * dt;
      c.repulsionY += c.vy * dt;

      c.x = c.baseX + c.repulsionX;
      c.y = c.baseY + c.repulsionY;
    }
  }

  nextBladeColor() {
    const c = this.bladeColors[this.currentBladeIndex % this.bladeColors.length];
    this.currentBladeIndex++;
    return c;
  }

  drawPolygon(points, color = null) {
    if (this.activeGfx) {
      this.shapesContainer.removeChild(this.activeGfx);
      this._destroyDisplayObject(this.activeGfx);
    }

    const container = new Container();

    if (color !== null) {
      const fillGfx = new Graphics();
      const flat = points.flatMap(p => [p.x, p.y]);
      fillGfx.poly(flat, true);
      fillGfx.fill({ color: color, alpha: this.fillAlpha });
      container.addChild(fillGfx);
      container._fillGfx = fillGfx;
    }

    this._drawStrokeAndDots(container, points, 6, 3);
    this.shapesContainer.addChild(container);
    this.activeGfx = container;
    this.polygonPoints = points;
    this.activeGfx.color = color;

    const c = this._centroid(points);
    let rSum = 0;
    for (const p of points) {
      rSum += Math.sqrt((p.x - c.x)**2 + (p.y - c.y)**2);
    }
    this.activeGfx.cx = c.x;
    this.activeGfx.cy = c.y;
    this.activeGfx.radius = rSum / points.length;
  }

  get targetPiece() {
    if (this.coloredPiece) return this.coloredPiece;
    if (this.activeGfx && this.activeGfx.color) {
      return { isMain: true, color: this.activeGfx.color, points: this.polygonPoints };
    }
    return null;
  }

  getVisiblePiecePoints(pieceData) {
    if (!pieceData) return null;
    if (pieceData.isMain) return this.polygonPoints;
    return this._getWorldPoints(pieceData);
  }

  _drawPiece(points, fillColor) {
    const container = new Container();
    const flat = points.flatMap(p => [p.x, p.y]);

    if (fillColor !== null) {
      const fillGfx = new Graphics();
      fillGfx.poly(flat, true);
      fillGfx.fill({ color: fillColor, alpha: this.fillAlpha });
      container.addChild(fillGfx);
      container._fillGfx = fillGfx;
    }

    this._drawStrokeAndDots(container, points, 6, 3);
    return container;
  }

  _drawStrokeAndDots(container, points, strokeWidth, dotRadius) {
    const flat = points.flatMap(p => [p.x, p.y]);
    const strokeGfx = new Graphics();
    strokeGfx.poly(flat, true);
    strokeGfx.stroke({ color: this.strokeColor, width: strokeWidth, cap: 'round', join: 'round' });
    container.addChild(strokeGfx);

    const dotGfx = new Graphics();
    for (const d of this._getEdgeDots(points)) {
      dotGfx.circle(d.x, d.y, dotRadius);
      dotGfx.fill({ color: this.dotColor });
    }
    container.addChild(dotGfx);

    // Store for zoom-time inverse rescaling
    container._strokeGfx = strokeGfx;
    container._dotGfx = dotGfx;
    container._strokePoints = points;
    container._strokeWidth = strokeWidth;
    container._dotRadius = dotRadius;
  }

  _redrawStrokeAndDots(container, strokeWidth, dotRadius, points, dotSpacing) {
    const strokeGfx = container._strokeGfx;
    const dotGfx = container._dotGfx;
    if (!strokeGfx && !dotGfx) return;

    if (dotGfx && dotGfx.destroyed) return;
    if (strokeGfx && strokeGfx.destroyed) return;

    const pts = points || container._strokePoints;
    const sw = strokeWidth ?? container._strokeWidth;
    const dr = dotRadius ?? container._dotRadius;

    if (strokeGfx) {
      strokeGfx.clear();
      strokeGfx.poly(pts.flatMap(p => [p.x, p.y]), true);
      strokeGfx.stroke({ color: this.strokeColor, width: sw, cap: 'round', join: 'round' });
    }

    if (dotGfx) {
      dotGfx.clear();
      for (const d of this._getEdgeDots(pts, dotSpacing ?? 18)) {
        dotGfx.circle(d.x, d.y, dr);
        dotGfx.fill({ color: this.dotColor });
      }
    }
  }

  _wobbleVertices(piece) {
    const orig = piece.points.map(p => ({ x: p.x, y: p.y }));
    const container = piece.container;
    const wobbleObj = { t: 0 };

    gsap.to(wobbleObj, {
      t: 1,
      duration: 0.5,
      ease: 'elastic.out(1, 0.35)',
      onUpdate: () => {
        const decay = 1 - wobbleObj.t * wobbleObj.t;
        const maxDisp = 5 * decay;
        if (maxDisp < 0.25) return;
        const disp = orig.map(p => ({
          x: p.x + (Math.random() - 0.5) * maxDisp,
          y: p.y + (Math.random() - 0.5) * maxDisp,
        }));
        container._strokePoints = disp;
        this._redrawStrokeAndDots(
          container,
          container._strokeWidth,
          container._dotRadius,
          disp
        );
      },
      onComplete: () => {
        container._strokePoints = orig;
        this._redrawStrokeAndDots(
          container,
          container._strokeWidth,
          container._dotRadius,
          orig
        );
      },
    });
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

  _centroid(points) {
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    };
  }

  _makePiece(points, fillColor, alpha = 1) {
    const clonedPoints = points.map(p => ({ x: p.x, y: p.y }));
    const container = this._drawPiece(clonedPoints, fillColor);
    const c = this._centroid(clonedPoints);

    let rSum = 0;
    for (const p of clonedPoints) {
      rSum += Math.sqrt((p.x - c.x)**2 + (p.y - c.y)**2);
    }
    container.radius = rSum / clonedPoints.length;

    container.pivot.set(c.x, c.y);
    container.x = c.x;
    container.y = c.y;
    container.baseX = c.x;
    container.baseY = c.y;
    container.repulsionX = 0;
    container.repulsionY = 0;
    container.vx = 0;
    container.vy = 0;
    container.alpha = alpha;

    return {
      container,
      points: clonedPoints,
      color: fillColor,
      cx: c.x,
      cy: c.y,
    };
  }

  _getWorldPoints(piece) {
    const { container } = piece;
    const cos = Math.cos(container.rotation);
    const sin = Math.sin(container.rotation);
    const sx = container.scale.x;
    const sy = container.scale.y;
    const px = container.pivot.x;
    const py = container.pivot.y;

    return piece.points.map(point => {
      const lx = (point.x - px) * sx;
      const ly = (point.y - py) * sy;
      return {
        x: container.x + lx * cos - ly * sin,
        y: container.y + lx * sin + ly * cos,
      };
    });
  }

  _replacePieceWithWorldPose(piece, worldPoints = this._getWorldPoints(piece)) {
    const wasColored = this.coloredPiece === piece;
    const replacement = this._makePiece(worldPoints, piece.color, piece.container.alpha);
    const parent = piece.container.parent;

    if (parent) {
      const index = parent.getChildIndex(piece.container);
      parent.removeChild(piece.container);
      this._destroyDisplayObject(piece.container);
      parent.addChildAt(replacement.container, Math.min(index, parent.children.length));
    }

    if (wasColored) this.coloredPiece = replacement;
    return replacement;
  }

  _freezePieces() {
    const frozen = [];
    const coloredIndex = this.cutPieces.indexOf(this.coloredPiece);

    for (const piece of this.cutPieces) {
      gsap.killTweensOf(piece.container);
      frozen.push(this._replacePieceWithWorldPose(piece));
    }

    this.cutPieces = frozen;
    this.coloredPiece = coloredIndex >= 0 ? frozen[coloredIndex] : null;
  }

  _sideOfPoint(point, cutLine) {
    return (point.x - cutLine.px) * cutLine.dy - (point.y - cutLine.py) * cutLine.dx;
  }

  _driftPiece(piece, cutLine, options = {}) {
    const {
      baseDistance = 80,
      targetAlpha = piece.container.alpha,
      duration = 0.45,
      delay = 0,
      timeline = null,
      at = 0,
    } = options;
    const center = { x: piece.container.baseX, y: piece.container.baseY };
    const sign = this._sideOfPoint(center, cutLine) > 0 ? -1 : 1;
    const distance = baseDistance * (0.85 + Math.random() * 0.3);
    const vars = {
      baseX: center.x + sign * (-cutLine.dy) * distance,
      baseY: center.y + sign * cutLine.dx * distance,
      alpha: targetAlpha,
      duration,
      delay,
      ease: 'power2.out',
      overwrite: 'auto',
    };

    if (timeline) return timeline.to(piece.container, vars, at);
    return gsap.to(piece.container, vars);
  }

  _cutExistingPieces(cutLine, ts = 1.0, bladeColor = null) {
    const surviving = [];
    let newColoredPiece = null;

    for (const piece of this.cutPieces) {
      const worldPoints = this._getWorldPoints(piece);
      const result = splitPolygon(worldPoints, cutLine);
      if (!result) {
        surviving.push(piece);
        if (this.coloredPiece === piece) newColoredPiece = piece;
        continue;
      }

      const [left, right] = result;
      const [smaller, bigger] = area(left) < area(right) ? [left, right] : [right, left];
      if (area(smaller) < 24 || area(bigger) < 24) {
        surviving.push(piece);
        if (this.coloredPiece === piece) newColoredPiece = piece;
        continue;
      }

      const originalAlpha = piece.container.alpha;
      const wasColored = this.coloredPiece === piece;
      gsap.killTweensOf(piece.container);
      this.piecesContainer.removeChild(piece.container);
      this._destroyDisplayObject(piece.container);

      let bColor = null;
      if (wasColored) {
        bColor = bladeColor !== null ? bladeColor : piece.color;
      }

      const biggerPiece = this._makePiece(bigger, bColor, originalAlpha);
      const smallerPiece = this._makePiece(smaller, null, Math.min(originalAlpha, 0.86));
      this.piecesContainer.addChild(biggerPiece.container);
      this.piecesContainer.addChild(smallerPiece.container);

      this._wobbleVertices(biggerPiece);

      this._driftPiece(smallerPiece, cutLine, {
        baseDistance: (38 + Math.random() * 22) * ts,
        targetAlpha: Math.max(0.28, originalAlpha * 0.55),
        duration: Math.max(0.22, 0.9 * ts),
      });

      surviving.push(biggerPiece, smallerPiece);
      
      if (bColor) newColoredPiece = biggerPiece;
    }

    this.cutPieces = surviving;
    if (newColoredPiece) this.coloredPiece = newColoredPiece;
  }

  animateSlice(cutLine, flyingPoints, remainingPoints, bladeColor, maxDuration = 1.3) {
    const baseDuration = 1.3;
    const ts = clamp(maxDuration / baseDuration, 0.3, 1.2);
    this.lastTimeScale = ts;

    const tl = gsap.timeline({
      onComplete: () => {
        if (this._activeTimeline === tl) this._activeTimeline = null;
      },
    });
    this._activeTimeline = tl;

    const w = this.app.screen.width;
    const h = this.app.screen.height;

    let existingColor = null;
    let colorSource = null;

    if (this.activeGfx && this.activeGfx.color) {
      existingColor = this.activeGfx.color;
      colorSource = 'main';
    } else if (this.coloredPiece) {
      existingColor = this.coloredPiece.color;
      colorSource = 'flying';
    }

    const flashColor = existingColor || bladeColor;

    if (this.activeGfx) {
      this.shapesContainer.removeChild(this.activeGfx);
      this._destroyDisplayObject(this.activeGfx);
      this.activeGfx = null;
    }

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
    flashLine.stroke({ color: flashColor, width: 1.8, cap: 'round' });
    flashLine.alpha = 0.85;
    this.flashContainer.addChild(flashLine);

    const centerDot = new Graphics();
    centerDot.circle(0, 0, 4);
    centerDot.fill({ color: 0xFF2D55 });
    centerDot.stroke({ color: 0xFFFFFF, width: 1 });
    centerDot.x = cutLine.px;
    centerDot.y = cutLine.py;
    centerDot.alpha = 1;
    this.flashContainer.addChild(centerDot);

    tl.to(flashLine, {
      alpha: 0,
      duration: Math.max(0.08, 0.32 * ts),
      ease: 'power2.out',
    });
    tl.to(centerDot, {
      alpha: 0,
      duration: Math.max(0.08, 0.42 * ts),
      ease: 'power2.out',
    }, 0);
    tl.call(() => {
      if (flashLine.parent) flashLine.parent.removeChild(flashLine);
      flashLine.destroy();
      if (centerDot.parent) centerDot.parent.removeChild(centerDot);
      centerDot.destroy();
    });

    this._cutExistingPieces(cutLine, ts, bladeColor);

    // Subtle stage wobble on blade hit
    const shakeAmt = 3 * ts;
    tl.to(this.stage, {
      x: this.stage.x - shakeAmt,
      y: this.stage.y,
      duration: 0.03,
      ease: 'power2.out',
      yoyo: true,
      repeat: 2,
    }, 0.02);
    tl.to(this.stage, {
      x: this.stage.x,
      y: this.stage.y,
      duration: 0.01,
    }, 0.09);

    let flyingColor = null;
    let remainingColor = null;

    if (colorSource === 'main') {
      remainingColor = bladeColor;
    } else if (colorSource === null) {
      remainingColor = bladeColor;
    }

    const pieceData = this._makePiece(flyingPoints, flyingColor);
    this.piecesContainer.addChild(pieceData.container);
    this.cutPieces.push(pieceData);
    
    if (flyingColor) {
      this.coloredPiece = pieceData;
    } else if (colorSource !== 'flying') {
      this.coloredPiece = null;
    }

    this._driftPiece(pieceData, cutLine, {
      baseDistance: (82 + Math.random() * 42) * ts,
      targetAlpha: 1,
      duration: Math.max(0.24, 1.05 * ts),
      timeline: tl,
      at: 0.04 * ts,
    });

    this.drawPolygon(remainingPoints, remainingColor);
    return tl;
  }

  animateZoom(targetArg, newPolygonPoints) {
    this.isZooming = true;
    this._freezePieces();

    const target = targetArg && targetArg.isMain ? targetArg : this.coloredPiece;

    if (!target) {
      const tl = gsap.timeline();
      tl.call(() => {
        this.isZooming = false;
        this._clearAll();
        this.drawPolygon(newPolygonPoints);
      });
      return tl;
    }

    const targetColor = target.color;

    const tl = gsap.timeline();
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const targetPoints = target.points;
    const targetCenter = this._centroid(targetPoints);
    const newCenter = this._centroid(newPolygonPoints);
    const d1 = Math.sqrt((targetPoints[0].x - targetCenter.x) ** 2 + (targetPoints[0].y - targetCenter.y) ** 2);
    const d2 = Math.sqrt((newPolygonPoints[0].x - newCenter.x) ** 2 + (newPolygonPoints[0].y - newCenter.y) ** 2);
    const targetScale = d1 > 0.01 ? d2 / d1 : 1;

    for (const p of this.cutPieces) {
      if (p !== target) {
        tl.to(p.container, { alpha: 0, duration: 0.24, ease: 'power2.out' }, 0);
      }
    }

    if (this.activeGfx) {
      if (!target.isMain) {
        tl.to(this.activeGfx, { alpha: 0, duration: 0.24, ease: 'power2.out' }, 0);
      }
    }

    tl.to(this.stage.scale, {
      x: targetScale,
      y: targetScale,
      duration: 0.72,
      ease: 'power2.inOut',
      onUpdate: () => {
        const invScale = 1 / this.stage.scale.x;
        for (const p of this.cutPieces) {
          this._redrawStrokeAndDots(p.container, 6 * invScale, 3 * invScale, null, 18 * invScale);
        }
        if (this.activeGfx) {
          this._redrawStrokeAndDots(this.activeGfx, 6 * invScale, 3 * invScale, null, 18 * invScale);
        }
      }
    }, 0.12);
    tl.to(this.stage, {
      x: w / 2 - targetCenter.x * targetScale,
      y: h / 2 - targetCenter.y * targetScale,
      duration: 0.72,
      ease: 'power2.inOut',
    }, 0.12);

    tl.call(() => {
      this.isZooming = false;
      this._clearAll();
      this.stage.scale.set(1);
      this.stage.position.set(0, 0);
      this.drawPolygon(newPolygonPoints, targetColor);
      if (this.activeGfx) {
        this.activeGfx.alpha = 0;
        gsap.to(this.activeGfx, {
          alpha: 1,
          duration: 0.22,
          ease: 'elastic.out(1, 0.3)',
        });
      }
    });

    return tl;
  }

  _clearContainer(container) {
    const children = container.removeChildren();
    for (const child of children) {
      this._destroyDisplayObject(child);
    }
  }

  _clearAll() {
    this._clearContainer(this.piecesContainer);
    this._clearContainer(this.flashContainer);
    this._clearContainer(this.shapesContainer);
    this.activeGfx = null;
    this.cutPieces = [];
    this.coloredPiece = null;
  }

  _destroyDisplayObject(displayObject) {
    this._killTweensDeep(displayObject);
    if (!displayObject.destroyed) {
      displayObject.destroy({ children: true });
    }
  }

  _killTweensDeep(displayObject) {
    gsap.killTweensOf(displayObject);
    if (displayObject.children) {
      for (const child of displayObject.children) {
        this._killTweensDeep(child);
      }
    }
  }

  reset() {
    this.isZooming = false;
    if (this._activeTimeline) {
      this._activeTimeline.kill();
      this._activeTimeline = null;
    }
    gsap.killTweensOf(this.stage);
    gsap.killTweensOf(this.stage.scale);
    this._clearAll();
    this.polygonPoints = null;
    this.lastTimeScale = 1;
    this.stage.scale.set(1);
    this.stage.position.set(0, 0);
  }

  get screen() {
    return this.app.screen;
  }

  destroy() {
    this.reset();
    this.app.destroy(true);
  }
}
