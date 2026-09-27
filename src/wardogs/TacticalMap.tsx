import { useEffect, useRef, useState } from "react";
import type { ImageOverlay, LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import {
  GRID_COLUMNS,
  GRID_ROWS,
  MAP_UNITS,
  UNITS_PER_KM,
  formatGameCoordinate,
  formatGridCell,
  gridCellAt,
  inSheet,
  type Bounds,
  type XY,
} from "./coords";
import type { NamedPoint } from "./storage";

type Props = {
  imageUrl: string;
  bounds: Bounds;
  showGrid: boolean;
  showSubgrid: boolean;
  me: XY | null;
  objective: XY | null;
  base: XY | null;
  customs: NamedPoint[];
  waypoints: NamedPoint[];
  ghost: XY | null;
  banner?: string;
  cursorText: string;
  placing: boolean;
  onMapClick: (point: XY & { px: number; py: number }) => void;
  onMovePin: (id: string, point: XY) => void;
  onCursor: (text: string) => void;
  onImageSize: (size: { width: number; height: number }) => void;
};

async function loadLeaflet() {
  const mod = await import("leaflet");
  return mod.default ?? mod;
}

function raise(layer: object | null) {
  const candidate = layer as { bringToFront?: () => void } | null;
  candidate?.bringToFront?.();
}

export function TacticalMap(props: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const overlayRef = useRef<ImageOverlay | null>(null);
  const gridRef = useRef<LayerGroup | null>(null);
  const pinRef = useRef<LayerGroup | null>(null);
  const sizeRef = useRef({ width: 1600, height: 1600 });
  const urlRef = useRef(props.imageUrl);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [ready, setReady] = useState(false);
  const [imageTick, setImageTick] = useState(0);
  const fittedKey = useRef("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    let observer: ResizeObserver | null = null;

    void (async () => {
      const L = await loadLeaflet();
      if (cancelled || !hostRef.current) return;
      const initial = propsRef.current.bounds;
      map = L.map(hostRef.current, {
        crs: L.CRS.Simple,
        minZoom: -3,
        maxZoom: 5,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: false,
        zoomControl: true,
      });
      map.fitBounds(L.latLngBounds([initial.minY, initial.minX], [initial.maxY, initial.maxX]), {
        padding: [24, 24],
        animate: false,
      });
      mapRef.current = map;
      gridRef.current = L.layerGroup().addTo(map);
      pinRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => {
        const size = sizeRef.current;
        const box = overlayRef.current?.getBounds();
        if (!box) return;
        const west = box.getWest();
        const east = box.getEast();
        const south = box.getSouth();
        const north = box.getNorth();
        const px = ((event.latlng.lng - west) / (east - west)) * size.width;
        const fromBottom = ((event.latlng.lat - south) / (north - south)) * size.height;
        propsRef.current.onMapClick({
          x: event.latlng.lng,
          y: event.latlng.lat,
          px,
          py: size.height - fromBottom,
        });
      });
      map.on("mousemove", (event) => {
        const cell = gridCellAt(event.latlng.lng, event.latlng.lat);
        const grid = inSheet(cell) ? formatGridCell(cell) : "off sheet";
        propsRef.current.onCursor(
          `X ${formatGameCoordinate(event.latlng.lng)}   Y ${formatGameCoordinate(event.latlng.lat)}   ${grid}`,
        );
      });
      map.on("zoomend moveend", () => {
        void paintGrid();
      });
      const nextObserver = new ResizeObserver(() => {
        map?.invalidateSize();
      });
      observer = nextObserver;
      nextObserver.observe(hostRef.current);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      map?.remove();
      observer?.disconnect();
      mapRef.current = null;
      overlayRef.current = null;
      gridRef.current = null;
      pinRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      urlRef.current = props.imageUrl;
      sizeRef.current = { width: image.naturalWidth, height: image.naturalHeight };
      propsRef.current.onImageSize(sizeRef.current);
      setImageTick((n) => n + 1);
    };
    image.onerror = () => {
      if (cancelled) return;
      const fallback = drawFallback(props.imageUrl);
      urlRef.current = fallback.url;
      sizeRef.current = { width: fallback.width, height: fallback.height };
      propsRef.current.onImageSize(sizeRef.current);
      setImageTick((n) => n + 1);
    };
    image.src = props.imageUrl;
    return () => {
      cancelled = true;
    };
  }, [ready, props.imageUrl]);

  useEffect(() => {
    if (!ready || imageTick === 0) return;
    void paintOverlay();
  }, [ready, imageTick, props.bounds]);

  useEffect(() => {
    if (!ready) return;
    void paintGrid();
  }, [ready, imageTick, props.showGrid, props.showSubgrid, props.bounds]);

  useEffect(() => {
    if (!ready) return;
    void paintPins();
  }, [
    ready,
    imageTick,
    props.me,
    props.objective,
    props.base,
    props.customs,
    props.waypoints,
    props.ghost,
  ]);

  async function paintOverlay() {
    const map = mapRef.current;
    if (!map) return;
    const L = await loadLeaflet();
    const { bounds } = propsRef.current;
    const imageUrl = urlRef.current;
    const rect = L.latLngBounds([bounds.minY, bounds.minX], [bounds.maxY, bounds.maxX]);
    if (overlayRef.current) {
      overlayRef.current.setUrl(imageUrl);
      overlayRef.current.setBounds(rect);
    } else {
      overlayRef.current = L.imageOverlay(imageUrl, rect).addTo(map);
    }
    overlayRef.current.bringToBack();
    raise(gridRef.current);
    raise(pinRef.current);
    const key = `${bounds.minX}|${bounds.minY}|${bounds.maxX}|${bounds.maxY}|${imageUrl}`;
    if (fittedKey.current !== key) {
      fittedKey.current = key;
      map.fitBounds(rect, { padding: [24, 24], animate: false });
    }
    await paintGrid();
    await paintPins();
  }

  async function paintGrid() {
    const map = mapRef.current;
    const group = gridRef.current;
    if (!map || !group) return;
    const L = await loadLeaflet();
    const { showGrid, showSubgrid } = propsRef.current;
    group.clearLayers();
    if (!showGrid && !showSubgrid) return;

    const zoomPoint = map.latLngToContainerPoint(L.latLng(0, 0));
    const zoomNext = map.latLngToContainerPoint(L.latLng(0, 1));
    const pxPerUnit = Math.abs(zoomNext.x - zoomPoint.x);
    const subOn = showSubgrid && pxPerUnit >= 8;

    if (showGrid) {
      for (let index = 0; index <= GRID_COLUMNS; index += 1) {
        const x = index * UNITS_PER_KM;
        L.polyline(
          [
            [0, x],
            [MAP_UNITS, x],
          ],
          { color: "#e7d7a8", weight: 1.25, opacity: 0.7, interactive: false },
        ).addTo(group);
      }
      for (let index = 0; index <= GRID_ROWS; index += 1) {
        const y = index * UNITS_PER_KM;
        L.polyline(
          [
            [y, 0],
            [y, MAP_UNITS],
          ],
          { color: "#e7d7a8", weight: 1.25, opacity: 0.7, interactive: false },
        ).addTo(group);
      }
      const view = map.getBounds();
      const south = view.getSouth();
      const north = view.getNorth();
      const west = view.getWest();
      const east = view.getEast();
      const yLabel = south + (north - south) * 0.035;
      const xLabel = west + (east - west) * 0.028;
      for (let index = 0; index <= GRID_COLUMNS; index += 1) {
        const x = index * UNITS_PER_KM;
        if (x < west || x > east) continue;
        L.marker([yLabel, x], {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: "grid-label",
            html: String(index),
            iconSize: [28, 18],
            iconAnchor: [14, 9],
          }),
        }).addTo(group);
      }
      for (let index = 0; index <= GRID_ROWS; index += 1) {
        const y = index * UNITS_PER_KM;
        if (y < south || y > north) continue;
        L.marker([y, xLabel], {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: "grid-label",
            html: String(index),
            iconSize: [28, 18],
            iconAnchor: [14, 9],
          }),
        }).addTo(group);
      }
    }

    if (subOn) {
      const view = map.getBounds().pad(0.15);
      const minX = Math.max(0, Math.floor(view.getWest()));
      const maxX = Math.min(MAP_UNITS, Math.ceil(view.getEast()));
      const minY = Math.max(0, Math.floor(view.getSouth()));
      const maxY = Math.min(MAP_UNITS, Math.ceil(view.getNorth()));
      for (let x = minX; x <= maxX; x += 1) {
        if (x % UNITS_PER_KM === 0) continue;
        L.polyline(
          [
            [minY, x],
            [maxY, x],
          ],
          { color: "#b7c4b4", weight: 1, opacity: 0.28, interactive: false },
        ).addTo(group);
      }
      for (let y = minY; y <= maxY; y += 1) {
        if (y % UNITS_PER_KM === 0) continue;
        L.polyline(
          [
            [y, minX],
            [y, maxX],
          ],
          { color: "#b7c4b4", weight: 1, opacity: 0.28, interactive: false },
        ).addTo(group);
      }
    }
    raise(group);
    raise(pinRef.current);
  }

  async function paintPins() {
    const group = pinRef.current;
    if (!group || !mapRef.current) return;
    const L = await loadLeaflet();
    const { me, objective, base, customs, waypoints, ghost } = propsRef.current;
    group.clearLayers();

    if (me && objective) {
      L.polyline(
        [
          [me.y, me.x],
          [objective.y, objective.x],
        ],
        { color: "#efe7d2", weight: 2, opacity: 0.85, dashArray: "7 8", interactive: false },
      ).addTo(group);
    }

    const route: [number, number][] = [];
    if (me) route.push([me.y, me.x]);
    for (const point of waypoints) route.push([point.y, point.x]);
    if (objective) route.push([objective.y, objective.x]);
    if (waypoints.length && route.length >= 2) {
      L.polyline(route, { color: "#d2ae62", weight: 3, opacity: 0.95, interactive: false }).addTo(group);
    }

    const pins: { id: string; name: string; point: XY; className: string; size: number }[] = [];
    if (me) pins.push({ id: "me", name: "ME", point: me, className: "pin-me", size: 30 });
    if (objective) pins.push({ id: "objective", name: "OBJ", point: objective, className: "pin-objective", size: 30 });
    if (base) pins.push({ id: "base", name: "BASE", point: base, className: "pin-base", size: 28 });
    waypoints.forEach((point, index) => {
      pins.push({ id: point.id, name: String(index + 1), point, className: "pin-way", size: 24 });
    });
    for (const point of customs) {
      pins.push({
        id: point.id,
        name: point.name.slice(0, 3).toUpperCase(),
        point,
        className: "pin-custom",
        size: 26,
      });
    }
    if (ghost) pins.push({ id: "ghost", name: "+", point: ghost, className: "pin-ghost", size: 22 });

    for (const pin of pins) {
      const marker: Marker = L.marker([pin.point.y, pin.point.x], {
        draggable: pin.id !== "ghost",
        autoPan: true,
        keyboard: false,
        zIndexOffset: pin.id === "ghost" ? 0 : 400,
        icon: L.divIcon({
          className: "pin-wrap",
          html: `<div class="pin-icon ${pin.className}" style="width:${pin.size}px;height:${pin.size}px;font-size:11px">${pin.name}</div>`,
          iconSize: [pin.size, pin.size],
          iconAnchor: [pin.size / 2, pin.size / 2],
        }),
      }).addTo(group);
      if (pin.id !== "ghost") {
        marker.on("dragend", () => {
          const latlng = marker.getLatLng();
          propsRef.current.onMovePin(pin.id, { x: latlng.lng, y: latlng.lat });
        });
      }
    }
    raise(group);
  }

  return (
    <div className={props.placing ? "wd-map-wrap placing" : "wd-map-wrap"}>
      <div ref={hostRef} className="wd-map" role="application" aria-label="Tactical map" />
      {props.banner && <div className="wd-banner">{props.banner}</div>}
      <div className="wd-cursor">{props.cursorText}</div>
    </div>
  );
}

const fallbackUrls = new Map<string, string>();

function drawFallback(label: string): { url: string; width: number; height: number } {
  const cached = fallbackUrls.get(label);
  const width = 1600;
  const height = 1600;
  if (cached) return { url: cached, width, height };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { url: "", width, height };
  ctx.fillStyle = "#17211c";
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 16; i += 1) {
    ctx.beginPath();
    ctx.strokeStyle = i % 2 ? "rgba(210,174,98,0.2)" : "rgba(90,120,100,0.4)";
    ctx.lineWidth = 2;
    ctx.ellipse(800, 120 + i * 90, 460 - i * 10, 34, 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#d2ae62";
  ctx.font = "600 36px sans-serif";
  const name = label.includes("ozeti") ? "OZETI" : label.includes("zestafona") ? "ZESTAFONA" : "BAKURANI";
  ctx.fillText(`${name} — add your screenshot`, 48, 1548);
  const url = canvas.toDataURL("image/png");
  fallbackUrls.set(label, url);
  return { url, width, height };
}
