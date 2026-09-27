export type MapId = "bakurani" | "ozeti" | "zestafona";

export type GameMap = {
  id: MapId;
  name: string;
  image: string;
};

export const MAPS: GameMap[] = [
  { id: "bakurani", name: "Bakurani", image: "/maps/bakurani.png" },
  { id: "ozeti", name: "Ozeti", image: "/maps/ozeti.png" },
  { id: "zestafona", name: "Zestafona", image: "/maps/zestafona.png" },
];

export function getMap(id: MapId): GameMap {
  return MAPS.find((map) => map.id === id) ?? MAPS[0];
}
