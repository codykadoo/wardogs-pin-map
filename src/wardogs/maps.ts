import type { Bounds } from "./coords";

export type MapId = "bakurani" | "ozeti" | "zestafona";

export type GameMap = {
  id: MapId;
  name: string;
  image: string;
  /**
   * World extent of a full tactical-map screenshot before you calibrate.
   * Numbers adapted from wardogs-calculator map JSON (MIT). Not an image.
   */
  tileBounds: Bounds;
  /** Measured alignment for the shipped screenshot, if one was supplied. */
  imageBounds?: Bounds;
};

export const MAPS: GameMap[] = [
  {
    id: "bakurani",
    name: "Bakurani",
    image: "/maps/bakurani.png",
    tileBounds: { minX: -0.03, maxX: 163.81, minY: -0.01, maxY: 163.83 },
  },
  {
    id: "ozeti",
    name: "Ozeti",
    image: "/maps/ozeti.png?v=3",
    tileBounds: { minX: -0.03, maxX: 163.81, minY: -0.01, maxY: 163.83 },
    // Terrain crop of the supplied Ozeti tactical screenshot, with the black
    // frame removed. Grid line N sits at coordinate N×10, matched to the
    // kilometer numbers printed beside that screenshot.
    imageBounds: { minX: 59.12, maxX: 143.0, minY: 22.56, maxY: 99.08 },
  },
  {
    id: "zestafona",
    name: "Zestafona",
    image: "/maps/zestafona.png",
    tileBounds: { minX: -0.03, maxX: 163.81, minY: -0.01, maxY: 163.83 },
  },
];

export function getMap(id: MapId): GameMap {
  return MAPS.find((map) => map.id === id) ?? MAPS[0];
}
