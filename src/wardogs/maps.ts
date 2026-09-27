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
    image: "/maps/ozeti.png?v=2",
    tileBounds: { minX: -0.03, maxX: 163.81, minY: -0.01, maxY: 163.83 },
    // Crop of the supplied Ozeti tactical screenshot. Grid line N sits at
    // coordinate N×10, matched to the numbers printed beside that screenshot.
    imageBounds: { minX: 55.06, maxX: 148.48, minY: 13.04, maxY: 106.46 },
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
