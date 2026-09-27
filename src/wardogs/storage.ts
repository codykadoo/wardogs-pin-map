import {
  IDENTITY_CALIBRATION,
  type Calibration,
  type ElevationRow,
  type MilsPerCircle,
  type XY,
} from "./coords";
import { MAPS, type MapId } from "./maps";

export const PIN_TYPES = ["target", "enemy", "objective", "friendly", "other"] as const;
export type PinType = (typeof PIN_TYPES)[number];

export const PIN_LABEL: Record<PinType, string> = {
  target: "Target",
  enemy: "Enemy",
  objective: "Objective",
  friendly: "Friendly",
  other: "Other",
};

export const PIN_COLOR: Record<PinType, string> = {
  target: "#ffb020",
  enemy: "#ff4d4d",
  objective: "#ffe14a",
  friendly: "#3ddc97",
  other: "#9eb0c2",
};

export type Pin = {
  id: string;
  name: string;
  type: PinType;
  color: string;
  x: number;
  y: number;
};

export type MapSession = {
  calibration: Calibration;
  mortar: XY | null;
  pins: Pin[];
  selectedId: string | null;
};

export type AppState = {
  version: 3;
  mapId: MapId;
  compact: boolean;
  showKmGrid: boolean;
  showSubGrid: boolean;
  milsPerCircle: MilsPerCircle;
  minRange: number;
  maxRange: number;
  elevation: ElevationRow[];
  byMap: Record<MapId, MapSession>;
};

const KEY = "wardogs-pin-map.v3";

export function emptySession(): MapSession {
  return {
    calibration: { ...IDENTITY_CALIBRATION },
    mortar: null,
    pins: [],
    selectedId: null,
  };
}

export function defaultState(): AppState {
  const byMap = {} as Record<MapId, MapSession>;
  for (const map of MAPS) byMap[map.id] = emptySession();
  return {
    version: 3,
    mapId: "bakurani",
    compact: false,
    showKmGrid: true,
    showSubGrid: true,
    milsPerCircle: 6400,
    minRange: 100,
    maxRange: 1500,
    elevation: [],
    byMap,
  };
}

function isXY(value: unknown): value is XY {
  if (!value || typeof value !== "object") return false;
  const point = value as XY;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isPinType(value: unknown): value is PinType {
  return typeof value === "string" && (PIN_TYPES as readonly string[]).includes(value);
}

function cleanColor(color: unknown, type: PinType): string {
  if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return PIN_COLOR[type];
}

function sanitizeCalibration(value: unknown): Calibration {
  if (!value || typeof value !== "object") return { ...IDENTITY_CALIBRATION };
  const raw = value as Partial<Calibration>;
  const scaleX = Number(raw.scaleX);
  const scaleY = Number(raw.scaleY);
  const offsetX = Number(raw.offsetX);
  const offsetY = Number(raw.offsetY);
  if (![scaleX, scaleY, offsetX, offsetY].every((n) => Number.isFinite(n))) return { ...IDENTITY_CALIBRATION };
  if (scaleX <= 0 || scaleY <= 0) return { ...IDENTITY_CALIBRATION };
  return { scaleX, scaleY, offsetX, offsetY };
}

function sanitizePin(value: unknown): Pin | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Pin>;
  if (!isPinType(raw.type) || typeof raw.id !== "string" || !raw.id) return null;
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name : PIN_LABEL[raw.type];
  return {
    id: raw.id,
    name,
    type: raw.type,
    color: cleanColor(raw.color, raw.type),
    x: Number(raw.x),
    y: Number(raw.y),
  };
}

function sanitizeSession(value: unknown): MapSession {
  const blank = emptySession();
  if (!value || typeof value !== "object") return blank;
  const raw = value as Partial<MapSession>;
  const pins = Array.isArray(raw.pins) ? raw.pins.flatMap((pin) => {
    const clean = sanitizePin(pin);
    return clean ? [clean] : [];
  }) : [];
  const selectedId = typeof raw.selectedId === "string" && pins.some((pin) => pin.id === raw.selectedId)
    ? raw.selectedId
    : null;
  return {
    calibration: sanitizeCalibration(raw.calibration),
    mortar: isXY(raw.mortar) ? { x: raw.mortar.x, y: raw.mortar.y } : null,
    pins,
    selectedId,
  };
}

function sanitizeElevation(value: unknown): ElevationRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const raw = row as Partial<ElevationRow>;
    const distance = raw.distance === null ? null : Number(raw.distance);
    const elevation = raw.elevation === null ? null : Number(raw.elevation);
    return [
      {
        distance: distance !== null && Number.isFinite(distance) ? distance : null,
        elevation: elevation !== null && Number.isFinite(elevation) ? elevation : null,
      },
    ];
  });
}

export function loadState(): AppState {
  const base = defaultState();
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (parsed.version !== 3 || !parsed.byMap) return base;
    const mapId = MAPS.some((map) => map.id === parsed.mapId) ? (parsed.mapId as MapId) : base.mapId;
    const byMap = { ...base.byMap };
    for (const map of MAPS) byMap[map.id] = sanitizeSession(parsed.byMap[map.id]);
    const minRange = Number(parsed.minRange);
    const maxRange = Number(parsed.maxRange);
    const rangeOk = Number.isFinite(minRange) && Number.isFinite(maxRange) && minRange >= 0 && minRange < maxRange && maxRange <= 100000;
    return {
      version: 3,
      mapId,
      compact: Boolean(parsed.compact),
      showKmGrid: parsed.showKmGrid !== false,
      showSubGrid: parsed.showSubGrid !== false,
      milsPerCircle: parsed.milsPerCircle === 6000 ? 6000 : 6400,
      minRange: rangeOk ? minRange : base.minRange,
      maxRange: rangeOk ? maxRange : base.maxRange,
      elevation: sanitizeElevation(parsed.elevation),
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

export function nextPinName(pins: Pin[], type: PinType): string {
  const label = PIN_LABEL[type];
  const used = new Set(pins.map((pin) => pin.name));
  let n = 1;
  while (used.has(`${label} ${n}`)) n += 1;
  return `${label} ${n}`;
}

export function sortPins(pins: Pin[], mortar: XY | null): Pin[] {
  const copy = [...pins];
  if (!mortar) return copy;
  copy.sort((a, b) => {
    const da = Math.hypot(a.x - mortar.x, a.y - mortar.y);
    const db = Math.hypot(b.x - mortar.x, b.y - mortar.y);
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  return copy;
}

export function withSession(prev: AppState, mapId: MapId, session: MapSession): AppState {
  return { ...prev, byMap: { ...prev.byMap, [mapId]: session } };
}
