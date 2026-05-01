// Polygon geometry: representation, cutting line generation, splitting

export function generateRandomPolygon(cx, cy, avgRadius, sides) {
  const points = [];
  const numSides = sides || (5 + Math.floor(Math.random() * 4)); // 5-8 sides
  for (let i = 0; i < numSides; i++) {
    const angle = (Math.PI * 2 * i) / numSides + (Math.random() - 0.5) * 0.6;
    const r = avgRadius * (0.6 + Math.random() * 0.8);
    points.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  }
  return points;
}

export function generateCutLine(polygon) {
  // Bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Random angle for the cut
  const angle = Math.random() * Math.PI;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  // Point on the cut line: near center with slight random offset
  const offset = (Math.random() - 0.5) * 0.3;
  const px = cx + offset * (-dy) * (maxX - minX) * 0.5;
  const py = cy + offset * dx * (maxY - minY) * 0.5;

  return { px, py, dx, dy, angle };
}

// Split a convex/concave polygon by an infinite line defined by point (px,py) + direction (dx,dy)
// Returns [leftPiece, rightPiece] or null if line doesn't intersect
export function splitPolygon(polygon, cutLine) {
  const { px, py, dx, dy } = cutLine;

  // Side test: which side of the line is a point on?
  // positive = left, negative = right
  function side(p) {
    return (p.x - px) * dy - (p.y - py) * dx;
  }

  // Find intersection of edge (a->b) with the cut line
  function intersect(a, b) {
    const sa = side(a);
    const sb = side(b);
    const t = sa / (sa - sb);
    return {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
    };
  }

  const left = [];
  const right = [];
  const n = polygon.length;
  let hasLeft = false, hasRight = false;

  for (let i = 0; i < n; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    const sc = side(curr);
    const sn = side(next);

    if (sc > 0) {
      left.push(curr);
      hasLeft = true;
    } else {
      right.push(curr);
      hasRight = true;
    }

    // Edge crosses the line
    if ((sc > 0 && sn <= 0) || (sc <= 0 && sn > 0)) {
      const ip = intersect(curr, next);
      left.push({ ...ip });
      right.push({ ...ip });
    }
  }

  if (!hasLeft || !hasRight || left.length < 3 || right.length < 3) return null;

  return [left, right];
}

// Compute centroid of polygon
export function centroid(polygon) {
  let cx = 0, cy = 0;
  for (const p of polygon) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / polygon.length, y: cy / polygon.length };
}

// Compute area (signed) of polygon
export function area(polygon) {
  let a = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += polygon[i].x * polygon[j].y;
    a -= polygon[j].x * polygon[i].y;
  }
  return Math.abs(a) / 2;
}
