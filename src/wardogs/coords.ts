/**
 * Game-coordinate math for WARDOGS tactical maps.
 *
 * Adapted from apollyon-sys/wardogs-calculator (MIT):
 * https://github.com/apollyon-sys/wardogs-calculator
 * See LICENSES/THIRD_PARTY. Map images from that project are not used.
 *
 * On these maps one coordinate unit is 100 meters (0.01 unit = 1 meter).
 * Mark Coordinates values such as `x100.05, y109.14` are already in that
 * unit. Compass bearing is atan2(east, north), 0° = north, clockwise.
 */

export const METERS_PER_UNIT = 100;
export const UNITS_PER_KM = 1000 / METERS_PER_UNIT;
export const GRID_COLUMNS = 16;
export const GRID_ROWS = 16;
export const MAP_UNITS = GRID_COLUMNS * UNITS_PER_KM;

const NUMBER_PATTERN = String.raw`[+-]?\d+(?:[.,]\d+)?`;

export type XY = { x: number; y: number };

export type GridCell = { col: number; row: number };

export type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type PixelPoint = { px: number; py: number };

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function worldDistanceToMeters(distanceUnits: number): number {
  return distanceUnits * METERS_PER_UNIT;
}

export function metersToWorldDistance(meters: number): number {
  return meters / METERS_PER_UNIT;
}

/** Marker JSON in the reference project stores meters. Inputs do not. */
export function storedMetersToWorldCoordinate(meters: number): number {
  return meters / METERS_PER_UNIT;
}

export function formatGameCoordinate(value: number): string {
  return Number(value).toFixed(2);
}

/** 0° north, 90° east. dx is east, dy is north. */
export function bearingDegrees(dx: number, dy: number): number {
  let angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}

export function formatBearing(degrees: number): string {
  if (!Number.isFinite(degrees)) return "—";
  let rounded = Math.round(degrees) % 360;
  if (rounded < 0) rounded += 360;
  return String(rounded).padStart(3, "0");
}

export function compassLabel(degrees: number): string {
  if (!Number.isFinite(degrees)) return "—";
  const index = Math.round(degrees / 45) % 8;
  return COMPASS[(index + 8) % 8];
}

export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  return `${Math.round(meters).toLocaleString("en-US")} m`;
}

export function gridCellAt(x: number, y: number): GridCell {
  return {
    col: Math.floor(x / UNITS_PER_KM),
    row: Math.floor(y / UNITS_PER_KM),
  };
}

export function inSheet(cell: GridCell): boolean {
  return cell.col >= 0 && cell.col < GRID_COLUMNS && cell.row >= 0 && cell.row < GRID_ROWS;
}

export function formatGridCell(cell: GridCell): string {
  return `${cell.col}-${cell.row}`;
}

/** Center of the 1 km square whose south-west corner is grid line (col, row). */
export function gridCenter(col: number, row: number): XY {
  return {
    x: (col + 0.5) * UNITS_PER_KM,
    y: (row + 0.5) * UNITS_PER_KM,
  };
}

/**
 * 1 km squares a straight segment enters, in order.
 * Grid traversal in world units (Amanatides & Woo).
 */
export function squaresCrossed(x0: number, y0: number, x1: number, y1: number): GridCell[] {
  const scale = UNITS_PER_KM;
  let cx = Math.floor(x0 / scale);
  let cy = Math.floor(y0 / scale);
  const endX = Math.floor(x1 / scale);
  const endY = Math.floor(y1 / scale);
  const cells: GridCell[] = [{ col: cx, row: cy }];
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0 && dy === 0) return cells;

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(scale / dx);
  const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(scale / dy);

  let tMaxX =
    stepX > 0 ? ((cx + 1) * scale - x0) / dx : stepX < 0 ? (cx * scale - x0) / dx : Number.POSITIVE_INFINITY;
  let tMaxY =
    stepY > 0 ? ((cy + 1) * scale - y0) / dy : stepY < 0 ? (cy * scale - y0) / dy : Number.POSITIVE_INFINITY;

  for (let guard = 0; guard < 64 && (cx !== endX || cy !== endY); guard += 1) {
    if (Math.abs(tMaxX - tMaxY) < 1e-12) {
      cx += stepX;
      cy += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cy += stepY;
      tMaxY += tDeltaY;
    }
    cells.push({ col: cx, row: cy });
  }
  return cells;
}

export function formatSquareList(cells: GridCell[]): string {
  const labels: string[] = [];
  for (const cell of cells) {
    const label = formatGridCell(cell);
    if (labels[labels.length - 1] !== label) labels.push(label);
  }
  return labels.join(" → ");
}

function parseNumber(raw: string): number {
  return Number(String(raw).replace(",", "."));
}

/**
 * Accepts a Mark Coordinates paste (`x100.05, y109.14`), a typed pair,
 * or a grid reference `7-10` (column-row). That is the 1 km square east of
 * line 7 and north of line 10, the same numbers printed on the tactical map.
 * Values that are clearly raw meters (both beyond the map unit range)
 * are divided by 100, matching storedMetersToWorldCoordinate.
 */
export function parseCoordinateInput(value: string): XY | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const grid = text.match(/^(\d{1,2})\s*[-–—/]\s*(\d{1,2})$/);
  if (grid) {
    const col = Number(grid[1]);
    const row = Number(grid[2]);
    if (col < 0 || col >= GRID_COLUMNS || row < 0 || row >= GRID_ROWS) return null;
    return gridCenter(col, row);
  }

  const xMatch = text.match(new RegExp(`(?:^|[^a-z])x\\s*[:=]?\\s*(${NUMBER_PATTERN})`, "i"));
  const yMatch = text.match(new RegExp(`(?:^|[^a-z])y\\s*[:=]?\\s*(${NUMBER_PATTERN})`, "i"));

  let x: number;
  let y: number;
  if (xMatch && yMatch) {
    x = parseNumber(xMatch[1]);
    y = parseNumber(yMatch[1]);
  } else {
    const numbers = text.match(new RegExp(NUMBER_PATTERN, "g"));
    if (!numbers || numbers.length !== 2) return null;
    x = parseNumber(numbers[0]);
    y = parseNumber(numbers[1]);
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  if (Math.abs(x) > 400 && Math.abs(y) > 400) {
    x = storedMetersToWorldCoordinate(x);
    y = storedMetersToWorldCoordinate(y);
  }

  return { x, y };
}

export type CalibrationSample = PixelPoint & XY;

export function calibrateFromPoints(
  first: CalibrationSample,
  second: CalibrationSample,
  imageWidth: number,
  imageHeight: number,
): Bounds | { error: string } {
  const pxSpan = second.px - first.px;
  const pySpan = second.py - first.py;
  if (Math.abs(pxSpan) < 8 || Math.abs(pySpan) < 8) {
    return { error: "Pick two points farther apart, diagonally across the screenshot." };
  }
  if (!imageWidth || !imageHeight) {
    return { error: "The map image has not loaded yet." };
  }

  const scaleX = (second.x - first.x) / pxSpan;
  const scaleY = (second.y - first.y) / pySpan;
  if (!(scaleX > 0) || !(scaleY < 0)) {
    return {
      error:
        "Those points don't match a north-up screenshot. Larger game X should be to the right, and larger game Y toward the top of the image.",
    };
  }

  const originX = first.x - scaleX * first.px;
  const originY = first.y - scaleY * first.py;
  const minX = originX;
  const maxX = originX + imageWidth * scaleX;
  const maxY = originY;
  const minY = originY + imageHeight * scaleY;

  if (!(maxX > minX) || !(maxY > minY)) {
    return { error: "Could not compute a scale from those points." };
  }

  return { minX, maxX, minY, maxY };
}

export function latLngToPixel(
  x: number,
  y: number,
  bounds: Bounds,
  imageWidth: number,
  imageHeight: number,
): PixelPoint {
  const px = ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * imageWidth;
  const fromBottom = ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * imageHeight;
  return { px, py: imageHeight - fromBottom };
}

export type Leg = {
  from: string;
  to: string;
  meters: number;
  bearing: number;
  compass: string;
  squares: string;
};

export function measureLeg(from: XY & { name: string }, to: XY & { name: string }): Leg {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bearing = bearingDegrees(dx, dy);
  return {
    from: from.name,
    to: to.name,
    meters: worldDistanceToMeters(Math.hypot(dx, dy)),
    bearing,
    compass: compassLabel(bearing),
    squares: formatSquareList(squaresCrossed(from.x, from.y, to.x, to.y)),
  };
}
