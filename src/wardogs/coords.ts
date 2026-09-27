/**
 * Coordinate math for a hand-entered WARDOGS map.
 *
 * Positions in this app are meters. East is +X and north is +Y.
 * Bearing is atan2(east, north): 0° is north and the angle grows clockwise.
 * A Mark Coordinates paste such as `x100.05, y109.14` uses the game's own
 * unit, where 1 unit is 100 meters. That scale and the north-clockwise
 * bearing are the coordinate conventions documented by
 * apollyon-sys/wardogs-calculator (MIT). See LICENSES/THIRD_PARTY.
 * This file does not copy that project's tables, tiles, or markers.
 */

export const METERS_PER_GAME_UNIT = 100;
export const MAP_METERS = 16000;
export const CELL_METERS = 1000;
export const GRID_COUNT = 16;

/** Labeled game marks at or above this are already meters. The sheet is ~164 units. */
const GAME_UNIT_LIMIT = 500;

export type XY = { x: number; y: number };

export type GridCell = { col: number; row: number };

export type Calibration = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

export const IDENTITY_CALIBRATION: Calibration = {
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
};

export type MilsPerCircle = 6400 | 6000;

export type RangeState = "in" | "short" | "long";

export type FiringSolution = {
  distance: number;
  bearing: number;
  mils: number;
  range: RangeState;
  grid: string;
};

export type ElevationRow = { distance: number | null; elevation: number | null };

export type ElevationLookup =
  | { status: "empty" }
  | { status: "short-table" }
  | { status: "outside" }
  | { status: "value"; elevation: number };

export type CalSample = { frameX: number; frameY: number; x: number; y: number };

export type CalResult = { ok: true; calibration: Calibration } | { ok: false; error: string };

const LABELED_NUMBER = String.raw`[+-]?\d+(?:[.,]\d+)?`;

/** 0° north, 90° east. dx is east, dy is north. */
export function bearingDegrees(dx: number, dy: number): number {
  let angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  if (angle >= 360) angle -= 360;
  return angle;
}

export function formatDegrees(degrees: number): string {
  if (!Number.isFinite(degrees)) return "—";
  let rounded = Math.round(degrees) % 360;
  if (rounded < 0) rounded += 360;
  return String(rounded).padStart(3, "0");
}

export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  return Math.round(meters).toLocaleString("en-US");
}

export function formatMils(mils: number): string {
  if (!Number.isFinite(mils)) return "—";
  return Math.round(mils).toLocaleString("en-US");
}

export function formatElevation(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Column and row are 1–16. Column 1 is the westernmost kilometer,
 * row 1 is the southernmost. A point on the outer north or east edge
 * stays in square 16.
 */
export function gridCell(x: number, y: number): GridCell | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > MAP_METERS || y > MAP_METERS) return null;
  const col = x >= MAP_METERS ? GRID_COUNT : Math.floor(x / CELL_METERS) + 1;
  const row = y >= MAP_METERS ? GRID_COUNT : Math.floor(y / CELL_METERS) + 1;
  if (col < 1 || col > GRID_COUNT || row < 1 || row > GRID_COUNT) return null;
  return { col, row };
}

export function formatGrid(cell: GridCell): string {
  return `${cell.col}-${cell.row}`;
}

/** Center of the 1 km square named by a 1-based column and row. */
export function gridCenter(col: number, row: number): XY {
  return {
    x: (col - 0.5) * CELL_METERS,
    y: (row - 0.5) * CELL_METERS,
  };
}

export function gridLabel(x: number, y: number): string {
  const cell = gridCell(x, y);
  return cell ? formatGrid(cell) : "outside";
}

function parseLooseNumber(token: string): number {
  return Number(token.trim().replace(/,$/, "").replace(",", "."));
}

function parseLabeled(text: string): XY | null {
  const xMatch = text.match(new RegExp(`(?:^|[^a-z])x\\s*[:=]?\\s*(${LABELED_NUMBER})`, "i"));
  const yMatch = text.match(new RegExp(`(?:^|[^a-z])y\\s*[:=]?\\s*(${LABELED_NUMBER})`, "i"));
  if (!xMatch || !yMatch) return null;
  const x = parseLooseNumber(xMatch[1]);
  const y = parseLooseNumber(yMatch[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function parseMeterPair(text: string): XY | null {
  const trimmed = text.trim();
  const euro = trimmed.match(/^([+-]?\d+),(\d+)\s+([+-]?\d+),(\d+)$/);
  if (euro) {
    return {
      x: Number(`${euro[1]}.${euro[2]}`),
      y: Number(`${euro[3]}.${euro[4]}`),
    };
  }
  const chunks = trimmed.split(/\s+/).filter(Boolean);
  if (chunks.length === 2) {
    const x = parseLooseNumber(chunks[0]);
    const y = parseLooseNumber(chunks[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  if (chunks.length === 1) {
    const bits = chunks[0].split(/[,;/]+/).filter(Boolean);
    if (bits.length === 2) {
      const x = Number(bits[0]);
      const y = Number(bits[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
  }
  return null;
}

/**
 * Grid reference `7-12`, a Mark Coordinates paste, or a plain meter pair.
 * Plain pairs are meters. Labeled values inside the game-unit range are
 * converted with METERS_PER_GAME_UNIT.
 */
export function parsePosition(value: string): XY | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const grid = text.match(/^(\d{1,2})\s*[-–—/]\s*(\d{1,2})$/);
  if (grid) {
    const col = Number(grid[1]);
    const row = Number(grid[2]);
    if (col < 1 || col > GRID_COUNT || row < 1 || row > GRID_COUNT) return null;
    return gridCenter(col, row);
  }

  const labeled = parseLabeled(text);
  if (labeled) {
    if (Math.abs(labeled.x) < GAME_UNIT_LIMIT && Math.abs(labeled.y) < GAME_UNIT_LIMIT) {
      return {
        x: labeled.x * METERS_PER_GAME_UNIT,
        y: labeled.y * METERS_PER_GAME_UNIT,
      };
    }
    return labeled;
  }

  return parseMeterPair(text);
}

export function firingSolution(
  from: XY,
  to: XY,
  minRange: number,
  maxRange: number,
  milsPerCircle: number,
): FiringSolution {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.round(Math.hypot(dx, dy));
  const bearing = Math.round(bearingDegrees(dx, dy)) % 360;
  const mils = Math.round((bearing / 360) * milsPerCircle) % milsPerCircle;
  let range: RangeState = "in";
  if (distance < minRange) range = "short";
  else if (distance > maxRange) range = "long";
  return { distance, bearing, mils, range, grid: gridLabel(to.x, to.y) };
}

export function measureLegs(points: XY[]): { legs: { meters: number; bearing: number }[]; total: number } {
  const legs: { meters: number; bearing: number }[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const exact = Math.hypot(dx, dy);
    total += exact;
    legs.push({
      meters: Math.round(exact),
      bearing: Math.round(bearingDegrees(dx, dy)) % 360,
    });
  }
  return { legs, total: Math.round(total) };
}

export function lookupElevation(table: ElevationRow[], distance: number): ElevationLookup {
  const rows = table
    .filter(
      (row): row is { distance: number; elevation: number } =>
        row.distance !== null &&
        row.elevation !== null &&
        Number.isFinite(row.distance) &&
        Number.isFinite(row.elevation),
    )
    .sort((a, b) => a.distance - b.distance);
  if (rows.length === 0) return { status: "empty" };
  if (rows.length < 2) return { status: "short-table" };
  if (distance < rows[0].distance || distance > rows[rows.length - 1].distance) return { status: "outside" };
  for (let i = 0; i < rows.length - 1; i += 1) {
    const a = rows[i];
    const b = rows[i + 1];
    if (distance < a.distance || distance > b.distance) continue;
    const span = b.distance - a.distance;
    const elevation = span === 0 ? a.elevation : a.elevation + ((distance - a.distance) / span) * (b.elevation - a.elevation);
    return { status: "value", elevation };
  }
  return { status: "outside" };
}

/** Image frame: x 0 at the left edge, y 0 at the bottom, both spanning MAP_METERS before calibration. */
export function gameToFrame(x: number, y: number, cal: Calibration): XY {
  return {
    x: (x - cal.offsetX) / cal.scaleX,
    y: (y - cal.offsetY) / cal.scaleY,
  };
}

export function frameToGame(frameX: number, frameY: number, cal: Calibration): XY {
  return {
    x: frameX * cal.scaleX + cal.offsetX,
    y: frameY * cal.scaleY + cal.offsetY,
  };
}

export function calibrationBounds(cal: Calibration): { south: number; west: number; north: number; east: number } {
  const west = cal.offsetX;
  const south = cal.offsetY;
  const east = MAP_METERS * cal.scaleX + cal.offsetX;
  const north = MAP_METERS * cal.scaleY + cal.offsetY;
  return { south, west, north, east };
}

export function isIdentityCalibration(cal: Calibration): boolean {
  return (
    Math.abs(cal.scaleX - 1) < 1e-9 &&
    Math.abs(cal.scaleY - 1) < 1e-9 &&
    Math.abs(cal.offsetX) < 1e-6 &&
    Math.abs(cal.offsetY) < 1e-6
  );
}

export function solveCalibration(first: CalSample, second: CalSample): CalResult {
  const dfx = second.frameX - first.frameX;
  const dfy = second.frameY - first.frameY;
  if (Math.abs(dfx) < 100 || Math.abs(dfy) < 100) {
    return {
      ok: false,
      error: "Pick two points farther apart, with space between them both across and up the image.",
    };
  }
  const scaleX = (second.x - first.x) / dfx;
  const scaleY = (second.y - first.y) / dfy;
  if (!(scaleX > 0) || !(scaleY > 0)) {
    return {
      ok: false,
      error: "Larger X should sit to the right, and larger Y toward the top of the image.",
    };
  }
  if (scaleX > 20 || scaleY > 20 || scaleX < 0.05 || scaleY < 0.05) {
    return {
      ok: false,
      error: "That scale is far from the 16 km frame. Check that both points are meters.",
    };
  }
  return {
    ok: true,
    calibration: {
      scaleX,
      scaleY,
      offsetX: first.x - first.frameX * scaleX,
      offsetY: first.y - first.frameY * scaleY,
    },
  };
}
