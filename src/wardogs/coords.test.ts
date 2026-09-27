import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calibrationBounds,
  firingSolution,
  formatDegrees,
  frameToGame,
  gameToFrame,
  gridCell,
  gridLabel,
  lookupElevation,
  measureLegs,
  parsePosition,
  solveCalibration,
} from "./coords.ts";

test("grid squares are numbered 1-16 from the south-west", () => {
  assert.deepEqual(gridCell(0, 0), { col: 1, row: 1 });
  assert.deepEqual(gridCell(6500, 11500), { col: 7, row: 12 });
  assert.equal(gridLabel(6500, 11500), "7-12");
  assert.deepEqual(gridCell(999.9, 0), { col: 1, row: 1 });
  assert.deepEqual(gridCell(1000, 0), { col: 2, row: 1 });
  assert.deepEqual(gridCell(16000, 16000), { col: 16, row: 16 });
  assert.equal(gridCell(-1, 0), null);
  assert.equal(gridCell(16000.1, 0), null);
});

test("grid reference 7-12 is the center of that square", () => {
  assert.deepEqual(parsePosition("7-12"), { x: 6500, y: 11500 });
  assert.deepEqual(parsePosition("1-1"), { x: 500, y: 500 });
  assert.deepEqual(parsePosition("16-16"), { x: 15500, y: 15500 });
  assert.equal(parsePosition("0-1"), null);
  assert.equal(parsePosition("17-12"), null);
  assert.equal(parsePosition("nope"), null);
});

test("plain pairs are meters and labeled game marks convert at 100 m per unit", () => {
  assert.deepEqual(parsePosition("8364 7285"), { x: 8364, y: 7285 });
  assert.deepEqual(parsePosition("6500, 11500"), { x: 6500, y: 11500 });
  assert.deepEqual(parsePosition("x100.05, y109.14"), { x: 10005, y: 10914 });
  assert.deepEqual(parsePosition("X: 23.5 Y: 40"), { x: 2350, y: 4000 });
  assert.deepEqual(parsePosition("x10005, y10914"), { x: 10005, y: 10914 });
});

test("bearing is north-clockwise and mils follow the selected circle", () => {
  const east = firingSolution({ x: 0, y: 0 }, { x: 1000, y: 0 }, 100, 1500, 6400);
  assert.equal(east.distance, 1000);
  assert.equal(east.bearing, 90);
  assert.equal(east.mils, 1600);
  assert.equal(east.range, "in");
  assert.equal(formatDegrees(east.bearing), "090");

  const eastNato = firingSolution({ x: 0, y: 0 }, { x: 1000, y: 0 }, 100, 1500, 6000);
  assert.equal(eastNato.mils, 1500);

  assert.equal(firingSolution({ x: 0, y: 0 }, { x: 0, y: 1000 }, 100, 1500, 6400).bearing, 0);
  assert.equal(firingSolution({ x: 0, y: 0 }, { x: 0, y: -1000 }, 100, 1500, 6400).bearing, 180);
  assert.equal(firingSolution({ x: 0, y: 0 }, { x: -1000, y: 0 }, 100, 1500, 6400).bearing, 270);
  assert.equal(firingSolution({ x: 0, y: 0 }, { x: 1000, y: 1000 }, 100, 1500, 6400).mils, 800);

  assert.equal(firingSolution({ x: 0, y: 0 }, { x: 50, y: 0 }, 100, 1500, 6400).range, "short");
  assert.equal(firingSolution({ x: 0, y: 0 }, { x: 2000, y: 0 }, 100, 1500, 6400).range, "long");
  assert.equal(firingSolution({ x: 0, y: 0 }, { x: 6500, y: 11500 }, 100, 1500, 6400).grid, "7-12");
});

test("measure legs report length and bearing", () => {
  const measured = measureLegs([
    { x: 0, y: 0 },
    { x: 300, y: 400 },
    { x: 300, y: 800 },
  ]);
  assert.deepEqual(measured.legs, [
    { meters: 500, bearing: 37 },
    { meters: 400, bearing: 0 },
  ]);
  assert.equal(measured.total, 900);
});

test("elevation is linear between entered rows and empty until the user types values", () => {
  assert.deepEqual(lookupElevation([], 500), { status: "empty" });
  assert.deepEqual(lookupElevation([{ distance: 100, elevation: 800 }], 100), { status: "short-table" });
  assert.deepEqual(
    lookupElevation(
      [
        { distance: 100, elevation: 800 },
        { distance: 500, elevation: 1200 },
      ],
      300,
    ),
    { status: "value", elevation: 1000 },
  );
  assert.equal(
    lookupElevation(
      [
        { distance: 500, elevation: 1200 },
        { distance: null, elevation: 1 },
        { distance: 100, elevation: 800 },
      ],
      300,
    ).status,
    "value",
  );
  assert.deepEqual(
    lookupElevation(
      [
        { distance: 100, elevation: 800 },
        { distance: 500, elevation: 1200 },
      ],
      50,
    ),
    { status: "outside" },
  );
});

test("two-point calibration stores scale and offset in meters", () => {
  const solved = solveCalibration(
    { frameX: 0, frameY: 0, x: 1000, y: 2000 },
    { frameX: 16000, frameY: 8000, x: 9000, y: 6000 },
  );
  assert.equal(solved.ok, true);
  if (!solved.ok) return;
  assert.ok(Math.abs(solved.calibration.scaleX - 0.5) < 1e-9);
  assert.ok(Math.abs(solved.calibration.scaleY - 0.5) < 1e-9);
  assert.ok(Math.abs(solved.calibration.offsetX - 1000) < 1e-6);
  assert.ok(Math.abs(solved.calibration.offsetY - 2000) < 1e-6);

  const frame = gameToFrame(5000, 4000, solved.calibration);
  assert.ok(Math.abs(frame.x - 8000) < 1e-6);
  assert.ok(Math.abs(frame.y - 4000) < 1e-6);
  const game = frameToGame(0, 0, solved.calibration);
  assert.deepEqual(game, { x: 1000, y: 2000 });

  const bounds = calibrationBounds(solved.calibration);
  assert.equal(bounds.west, 1000);
  assert.equal(bounds.south, 2000);

  const rejected = solveCalibration(
    { frameX: 0, frameY: 0, x: 0, y: 0 },
    { frameX: 10, frameY: 10, x: 100, y: 100 },
  );
  assert.equal(rejected.ok, false);
});
