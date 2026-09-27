import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bearingDegrees,
  calibrateFromPoints,
  compassLabel,
  formatBearing,
  gridCellAt,
  measureLeg,
  parseCoordinateInput,
  squaresCrossed,
  worldDistanceToMeters,
} from "./coords.ts";

test("100 coordinate units is 10 km", () => {
  assert.equal(worldDistanceToMeters(10), 1000);
  assert.equal(worldDistanceToMeters(Math.hypot(3, 4)), 500);
});

test("bearing is north-clockwise", () => {
  assert.equal(Math.round(bearingDegrees(0, 10)), 0);
  assert.equal(Math.round(bearingDegrees(10, 0)), 90);
  assert.equal(Math.round(bearingDegrees(0, -10)), 180);
  assert.equal(Math.round(bearingDegrees(-10, 0)), 270);
  assert.equal(compassLabel(0), "N");
  assert.equal(compassLabel(44), "NE");
  assert.equal(compassLabel(90), "E");
  assert.equal(formatBearing(359.6), "000");
  assert.equal(formatBearing(22), "022");
});

test("parses mark coordinates, pairs, meters, and grid refs", () => {
  assert.deepEqual(parseCoordinateInput("x100.05, y109.14"), { x: 100.05, y: 109.14 });
  assert.deepEqual(parseCoordinateInput("X: 23.5 Y: 40"), { x: 23.5, y: 40 });
  assert.deepEqual(parseCoordinateInput("83,64 72,85"), { x: 83.64, y: 72.85 });
  assert.deepEqual(parseCoordinateInput("8364 7285"), { x: 83.64, y: 72.85 });
  assert.deepEqual(parseCoordinateInput("7-10"), { x: 65, y: 95 });
  assert.equal(parseCoordinateInput("0-1"), null);
  assert.equal(parseCoordinateInput("nope"), null);
});

test("grid squares and traversal", () => {
  assert.deepEqual(gridCellAt(65, 95), { col: 7, row: 10 });
  assert.deepEqual(gridCellAt(0, 0), { col: 1, row: 1 });
  assert.deepEqual(squaresCrossed(5, 5, 25, 5), [
    { col: 1, row: 1 },
    { col: 2, row: 1 },
    { col: 3, row: 1 },
  ]);
  const leg = measureLeg({ name: "Me", x: 5, y: 5 }, { name: "Objective", x: 15, y: 5 });
  assert.equal(leg.meters, 1000);
  assert.equal(leg.compass, "E");
  assert.equal(leg.squares, "1-1 → 2-1");
});

test("two-point calibration matches a north-up image", () => {
  const bounds = calibrateFromPoints(
    { px: 0, py: 0, x: 0, y: 160 },
    { px: 1600, py: 1600, x: 160, y: 0 },
    1600,
    1600,
  );
  assert.ok(!("error" in bounds));
  if ("error" in bounds) return;
  assert.ok(Math.abs(bounds.minX - 0) < 1e-9);
  assert.ok(Math.abs(bounds.maxX - 160) < 1e-9);
  assert.ok(Math.abs(bounds.minY - 0) < 1e-9);
  assert.ok(Math.abs(bounds.maxY - 160) < 1e-9);
});
