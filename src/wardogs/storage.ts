import type { Bounds, XY } from "./coords";
import { MAPS, type MapId } from "./maps";

export type PlaceMode = "me" | "objective" | "base" | "waypoint" | "custom";

export type NamedPoint = XY & { id: string; name: string };

export type SavedRoute = {
  id: string;
  name: string;
  me: XY | null;
  objective: XY | null;
  base: XY | null;
  customs: NamedPoint[];
  waypoints: NamedPoint[];
};

export type MapSession = {
  calibration: (Bounds & { imageWidth: number; imageHeight: number }) | null;
  me: XY | null;
  objective: XY | null;
  base: XY | null;
  customs: NamedPoint[];
  waypoints: NamedPoint[];
  routes: SavedRoute[];
};

export type AppState = {
  version: 1;
  mapId: MapId;
  compact: boolean;
  showGrid: boolean;
  showSubgrid: boolean;
  placeMode: PlaceMode;
  customName: string;
  byMap: Record<MapId, MapSession>;
};

const KEY = "wardogs-pin-map.v1";

export function emptySession(): MapSession {
  return {
    calibration: null,
    me: null,
    objective: null,
    base: null,
    customs: [],
    waypoints: [],
    routes: [],
  };
}

export function defaultState(): AppState {
  const byMap = {} as Record<MapId, MapSession>;
  for (const map of MAPS) byMap[map.id] = emptySession();
  return {
    version: 1,
    mapId: "bakurani",
    compact: false,
    showGrid: true,
    showSubgrid: false,
    placeMode: "me",
    customName: "Pin",
    byMap,
  };
}

function isXY(value: unknown): value is XY {
  if (!value || typeof value !== "object") return false;
  const point = value as XY;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isNamed(value: unknown): value is NamedPoint {
  if (!isXY(value)) return false;
  const point = value as NamedPoint;
  return typeof point.id === "string" && typeof point.name === "string";
}

function sanitizeSession(value: unknown): MapSession {
  const blank = emptySession();
  if (!value || typeof value !== "object") return blank;
  const raw = value as Partial<MapSession>;
  const calibration = raw.calibration;
  let nextCal: MapSession["calibration"] = null;
  if (calibration && typeof calibration === "object") {
    const box = calibration as Bounds & { imageWidth: number; imageHeight: number };
    if (
      [box.minX, box.maxX, box.minY, box.maxY, box.imageWidth, box.imageHeight].every((n) =>
        Number.isFinite(n),
      ) &&
      box.maxX > box.minX &&
      box.maxY > box.minY
    ) {
      nextCal = {
        minX: box.minX,
        maxX: box.maxX,
        minY: box.minY,
        maxY: box.maxY,
        imageWidth: box.imageWidth,
        imageHeight: box.imageHeight,
      };
    }
  }
  return {
    calibration: nextCal,
    me: isXY(raw.me) ? { x: raw.me.x, y: raw.me.y } : null,
    objective: isXY(raw.objective) ? { x: raw.objective.x, y: raw.objective.y } : null,
    base: isXY(raw.base) ? { x: raw.base.x, y: raw.base.y } : null,
    customs: Array.isArray(raw.customs) ? raw.customs.filter(isNamed) : [],
    waypoints: Array.isArray(raw.waypoints) ? raw.waypoints.filter(isNamed) : [],
    routes: Array.isArray(raw.routes)
      ? raw.routes.flatMap((route) => {
          if (!route || typeof route !== "object") return [];
          const item = route as SavedRoute;
          if (typeof item.id !== "string" || typeof item.name !== "string") return [];
          return [
            {
              id: item.id,
              name: item.name,
              me: isXY(item.me) ? { x: item.me.x, y: item.me.y } : null,
              objective: isXY(item.objective) ? { x: item.objective.x, y: item.objective.y } : null,
              base: isXY(item.base) ? { x: item.base.x, y: item.base.y } : null,
              customs: Array.isArray(item.customs) ? item.customs.filter(isNamed) : [],
              waypoints: Array.isArray(item.waypoints) ? item.waypoints.filter(isNamed) : [],
            },
          ];
        })
      : [],
  };
}

export function loadState(): AppState {
  const base = defaultState();
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (parsed.version !== 1 || !parsed.byMap) return base;
    const mapId = MAPS.some((map) => map.id === parsed.mapId) ? (parsed.mapId as MapId) : base.mapId;
    const byMap = { ...base.byMap };
    for (const map of MAPS) {
      byMap[map.id] = sanitizeSession(parsed.byMap[map.id]);
    }
    const placeMode: PlaceMode =
      parsed.placeMode === "objective" ||
      parsed.placeMode === "base" ||
      parsed.placeMode === "waypoint" ||
      parsed.placeMode === "custom" ||
      parsed.placeMode === "me"
        ? parsed.placeMode
        : "me";
    return {
      version: 1,
      mapId,
      compact: Boolean(parsed.compact),
      showGrid: parsed.showGrid !== false,
      showSubgrid: Boolean(parsed.showSubgrid),
      placeMode,
      customName: typeof parsed.customName === "string" && parsed.customName.trim() ? parsed.customName : "Pin",
      byMap,
    };
  } catch {
    return base;
  }
}

export function saveState(state: AppState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
