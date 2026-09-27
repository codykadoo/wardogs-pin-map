import { useEffect, useRef, useState } from "react";
import type { ImageOverlay, LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import {
  CELL_METERS,
  GRID_COUNT,
  MAP_METERS,
  calibrationBounds,
  gameToFrame,
  type Calibration,
  type XY,
} from "./coords";
import type { Pin } from "./storage";

export type MapClick = { game: XY; frame: XY };

type Props = {
  imageUrl: string;
  calibration: Calibration;
  showKmGrid: boolean;
  showSubGrid: boolean;
  mortar: XY | null;
  pins: Pin[];
  selectedId: string | null;
  minRange: number;
  maxRange: number;
  measure: XY[];
  ghosts: XY[];
  visible: boolean;
  layoutKey: string;
  onMapClick: (click: MapClick) => void;
  onCursor: (point: XY | null) => void;
  onMoveMortar: (point: XY) => void;
  onMovePin: (id: string, point: XY) => void;
  onSelectPin: (id: string) => void;
  onImageError: (missing: boolean) => void;
};

type LeafletModule = typeof import("leaflet");

async function loadLeaflet(): Promise<LeafletModule> {
  const mod = await import("leaflet");
  return (mod.default ?? mod) as LeafletModule;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function viewReady(map: LeafletMap): boolean {
  const sized = map.getSize();
  return sized.x >= 2 && sized.y >= 2 && (map as LeafletMap & { _loaded?: boolean })._loaded === true;
}

function metersAcross(map: LeafletMap, pixels: number): number {
  if (!viewReady(map)) return Number.POSITIVE_INFINITY;
  const size = map.getSize();
  const y = size.y / 2;
  const origin = map.containerPointToLatLng([0, y]);
  const shifted = map.containerPointToLatLng([pixels, y]);
  return Math.abs(shifted.lng - origin.lng);
}

function paintShade(
  map: LeafletMap,
  canvas: HTMLCanvasElement,
  mortar: XY | null,
  minRange: number,
  maxRange: number,
) {
  const size = map.getSize();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(size.x * dpr));
  canvas.height = Math.max(1, Math.floor(size.y * dpr));
  canvas.style.width = `${size.x}px`;
  canvas.style.height = `${size.y}px`;
  const origin = map.containerPointToLayerPoint([0, 0]);
  canvas.dataset.originX = String(origin.x);
  canvas.dataset.originY = String(origin.y);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.x, size.y);
  if (!viewReady(map) || !mortar || !(maxRange > 0)) return;

  const center = map.latLngToLayerPoint([mortar.y, mortar.x]);
  const edge = map.latLngToLayerPoint([mortar.y, mortar.x + maxRange]);
  const rMax = Math.hypot(edge.x - center.x, edge.y - center.y);
  const minEdge = map.latLngToLayerPoint([mortar.y, mortar.x + Math.max(0, minRange)]);
  const rMin = Math.hypot(minEdge.x - center.x, minEdge.y - center.y);
  const cx = center.x - origin.x;
  const cy = center.y - origin.y;

  ctx.fillStyle = "rgba(90, 16, 16, 0.55)";
  ctx.fillRect(0, 0, size.x, size.y);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, rMax), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  if (rMin > 0.5) {
    ctx.fillStyle = "rgba(70, 8, 8, 0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, rMin, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 96, 96, 0.95)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, rMax), 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(232, 163, 23, 0.95)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function TacticalMap(props: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const overlayRef = useRef<ImageOverlay | null>(null);
  const kmRef = useRef<LayerGroup | null>(null);
  const labelRef = useRef<LayerGroup | null>(null);
  const subRef = useRef<LayerGroup | null>(null);
  const vectorRef = useRef<LayerGroup | null>(null);
  const markerRef = useRef<LayerGroup | null>(null);
  const shadeRef = useRef<HTMLCanvasElement | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const swallowClick = useRef(false);
  const fittedKey = useRef("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    let observer: ResizeObserver | null = null;

    void (async () => {
      const L = await loadLeaflet();
      if (cancelled || !hostRef.current) return;
      leafletRef.current = L;
      map = L.map(hostRef.current, {
        crs: L.CRS.Simple,
        minZoom: -8,
        maxZoom: 2,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: false,
        zoomControl: false,
        keyboard: false,
      });
      map.setView([MAP_METERS / 2, MAP_METERS / 2], -5);
      L.control.zoom({ position: "topright" }).addTo(map);
      map.createPane("imagePane");
      map.createPane("shadePane");
      map.createPane("gridPane");
      const imagePane = map.getPane("imagePane");
      const shadePane = map.getPane("shadePane");
      const gridPane = map.getPane("gridPane");
      if (imagePane) imagePane.style.zIndex = "200";
      if (shadePane) {
        shadePane.style.zIndex = "250";
        shadePane.style.pointerEvents = "none";
      }
      if (gridPane) {
        gridPane.style.zIndex = "300";
        gridPane.style.pointerEvents = "none";
      }
      const canvas = L.DomUtil.create("canvas", "range-shade", shadePane) as HTMLCanvasElement;
      canvas.style.pointerEvents = "none";
      shadeRef.current = canvas;
      kmRef.current = L.layerGroup().addTo(map);
      labelRef.current = L.layerGroup().addTo(map);
      subRef.current = L.layerGroup().addTo(map);
      vectorRef.current = L.layerGroup().addTo(map);
      markerRef.current = L.layerGroup().addTo(map);

      map.on("click", (event) => {
        if (swallowClick.current) {
          swallowClick.current = false;
          return;
        }
        const game = { x: event.latlng.lng, y: event.latlng.lat };
        const frame = gameToFrame(game.x, game.y, propsRef.current.calibration);
        propsRef.current.onCursor(game);
        propsRef.current.onMapClick({ game, frame });
      });
      map.on("mousemove", (event) => {
        propsRef.current.onCursor({ x: event.latlng.lng, y: event.latlng.lat });
      });
      map.on("mouseout", () => {
        propsRef.current.onCursor(null);
      });
      map.on("zoomend moveend resize", () => {
        drawShade();
        drawLabels();
        drawSubgrid();
      });
      observer = new ResizeObserver(() => {
        map?.invalidateSize();
        drawShade();
        if ((map?.getSize().x ?? 0) > 20 && fittedKey.current === "") void paintImage();
      });
      observer.observe(hostRef.current);
      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      overlayRef.current = null;
      shadeRef.current = null;
      kmRef.current = null;
      labelRef.current = null;
      subRef.current = null;
      vectorRef.current = null;
      markerRef.current = null;
      leafletRef.current = null;
      fittedKey.current = "";
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !props.visible) return;
    const map = mapRef.current;
    map?.invalidateSize();
    drawShade();
    drawLabels();
    drawSubgrid();
  }, [ready, props.visible, props.layoutKey]);

  useEffect(() => {
    if (!ready) return;
    void paintImage();
  }, [ready, props.imageUrl, props.calibration]);

  useEffect(() => {
    if (!ready) return;
    drawKmGrid();
    drawLabels();
  }, [ready, props.showKmGrid]);

  useEffect(() => {
    if (!ready) return;
    drawSubgrid();
  }, [ready, props.showSubGrid]);

  useEffect(() => {
    if (!ready) return;
    drawShade();
    drawVectors();
  }, [ready, props.mortar, props.minRange, props.maxRange, props.measure, props.pins, props.selectedId]);

  useEffect(() => {
    if (!ready) return;
    drawMarkers();
  }, [ready, props.mortar, props.pins, props.selectedId, props.ghosts, props.measure]);

  function drawShade() {
    const map = mapRef.current;
    const canvas = shadeRef.current;
    const L = leafletRef.current;
    if (!map || !canvas || !L) return;
    const current = propsRef.current;
    paintShade(map, canvas, current.mortar, current.minRange, current.maxRange);
    const originX = Number(canvas.dataset.originX ?? 0);
    const originY = Number(canvas.dataset.originY ?? 0);
    L.DomUtil.setPosition(canvas, L.point(originX, originY));
  }

  async function paintImage() {
    const map = mapRef.current;
    const L = leafletRef.current ?? (await loadLeaflet());
    if (!map) return;
    const current = propsRef.current;
    const box = calibrationBounds(current.calibration);
    const rect = L.latLngBounds([box.south, box.west], [box.north, box.east]);
    if (overlayRef.current) {
      overlayRef.current.setUrl(current.imageUrl);
      overlayRef.current.setBounds(rect);
    } else {
      overlayRef.current = L.imageOverlay(current.imageUrl, rect, { pane: "imagePane", interactive: false }).addTo(map);
      overlayRef.current.on("load", () => propsRef.current.onImageError(false));
      overlayRef.current.on("error", () => propsRef.current.onImageError(true));
    }
    const fitKey = `${current.imageUrl}|${box.south}|${box.west}|${box.north}|${box.east}`;
    if (map.getSize().x < 20) {
      fittedKey.current = "";
      return;
    }
    if (fittedKey.current !== fitKey) {
      fittedKey.current = fitKey;
      map.fitBounds(rect, { padding: [28, 28], animate: false });
    }
  }

  function drawKmGrid() {
    const map = mapRef.current;
    const group = kmRef.current;
    const L = leafletRef.current;
    if (!map || !group || !L) return;
    group.clearLayers();
    if (!propsRef.current.showKmGrid) return;
    const line = () => ({ color: "rgba(255,255,255,0.55)", weight: 1, interactive: false, pane: "gridPane" });
    for (let v = 0; v <= MAP_METERS; v += CELL_METERS) {
      group.addLayer(L.polyline([[0, v], [MAP_METERS, v]], line()));
      group.addLayer(L.polyline([[v, 0], [v, MAP_METERS]], line()));
    }
  }

  function labelIcon(L: LeafletModule, text: string) {
    return L.divIcon({
      className: "grid-label",
      html: escapeHtml(text),
      iconSize: [32, 18],
      iconAnchor: [16, 9],
    });
  }

  function drawLabels() {
    const map = mapRef.current;
    const group = labelRef.current;
    const L = leafletRef.current;
    if (!map || !group || !L || !viewReady(map)) return;
    group.clearLayers();
    if (!propsRef.current.showKmGrid) return;
    const bounds = map.getBounds();
    const y = Math.min(MAP_METERS - 40, Math.max(40, bounds.getSouth() + metersAcross(map, 22)));
    const x = Math.min(MAP_METERS - 40, Math.max(40, bounds.getWest() + metersAcross(map, 22)));
    const cellPx = CELL_METERS / (metersAcross(map, 100) / 100);
    const labelStep = cellPx >= 36 ? 1 : cellPx >= 20 ? 2 : 4;
    for (let i = 1; i <= GRID_COUNT; i += 1) {
      if (i !== 1 && i !== GRID_COUNT && (i - 1) % labelStep !== 0) continue;
      const cx = (i - 0.5) * CELL_METERS;
      const cy = (i - 0.5) * CELL_METERS;
      if (cx >= bounds.getWest() - CELL_METERS && cx <= bounds.getEast() + CELL_METERS) {
        group.addLayer(L.marker([y, cx], { icon: labelIcon(L, String(i)), interactive: false, keyboard: false }));
      }
      if (cy >= bounds.getSouth() - CELL_METERS && cy <= bounds.getNorth() + CELL_METERS) {
        group.addLayer(L.marker([cy, x], { icon: labelIcon(L, String(i)), interactive: false, keyboard: false }));
      }
    }
  }

  function drawSubgrid() {
    const map = mapRef.current;
    const group = subRef.current;
    const L = leafletRef.current;
    if (!map || !group || !L || !viewReady(map)) return;
    group.clearLayers();
    if (!propsRef.current.showSubGrid) return;
    if (metersAcross(map, 80) > 1000) return;
    const bounds = map.getBounds().pad(0.15);
    const step = 100;
    const x0 = Math.max(0, Math.floor(bounds.getWest() / step) * step);
    const x1 = Math.min(MAP_METERS, Math.ceil(bounds.getEast() / step) * step);
    const y0 = Math.max(0, Math.floor(bounds.getSouth() / step) * step);
    const y1 = Math.min(MAP_METERS, Math.ceil(bounds.getNorth() / step) * step);
    const line = () => ({ color: "rgba(255,255,255,0.2)", weight: 1, interactive: false, pane: "gridPane" });
    for (let x = x0; x <= x1; x += step) {
      if (x % CELL_METERS === 0) continue;
      group.addLayer(L.polyline([[y0, x], [y1, x]], line()));
    }
    for (let y = y0; y <= y1; y += step) {
      if (y % CELL_METERS === 0) continue;
      group.addLayer(L.polyline([[y, x0], [y, x1]], line()));
    }
  }

  function drawVectors() {
    const group = vectorRef.current;
    const L = leafletRef.current;
    if (!group || !L) return;
    group.clearLayers();
    const current = propsRef.current;
    const line = { interactive: false, weight: 4, color: "#ffe08a" } as const;
    if (current.mortar && current.selectedId) {
      const pin = current.pins.find((item) => item.id === current.selectedId);
      if (pin) {
        group.addLayer(L.polyline([[current.mortar.y, current.mortar.x], [pin.y, pin.x]], line));
      }
    }
    if (current.measure.length >= 2) {
      group.addLayer(
        L.polyline(
          current.measure.map((point) => [point.y, point.x] as [number, number]),
          { interactive: false, weight: 3, color: "#8fd3ff" },
        ),
      );
    }
  }

  function dotIcon(color: string, selected: boolean) {
    const L = leafletRef.current;
    if (!L) return null;
    return L.divIcon({
      className: "pin-icon",
      html: `<span class="pin-dot${selected ? " is-selected" : ""}" style="background:${escapeHtml(color)}"></span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  function drawMarkers() {
    const group = markerRef.current;
    const L = leafletRef.current;
    if (!group || !L) return;
    group.clearLayers();
    const current = propsRef.current;

    const addDrag = (marker: Marker, onDrop: (point: XY) => void, onClick?: () => void) => {
      marker.on("click", (event) => {
        L.DomEvent.stop(event);
        swallowClick.current = true;
        window.setTimeout(() => {
          swallowClick.current = false;
        }, 0);
        onClick?.();
      });
      marker.on("dragend", () => {
        const at = marker.getLatLng();
        onDrop({ x: at.lng, y: at.lat });
      });
    };

    if (current.mortar) {
      const icon = L.divIcon({
        className: "mortar-icon",
        html: `<span class="mortar-dot">M</span>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      const marker = L.marker([current.mortar.y, current.mortar.x], { icon, draggable: true, keyboard: false, zIndexOffset: 800 });
      marker.bindTooltip("Mortar", { direction: "top", offset: [0, -16] });
      addDrag(marker, (point) => propsRef.current.onMoveMortar(point));
      group.addLayer(marker);
    }

    for (const pin of current.pins) {
      const icon = dotIcon(pin.color, pin.id === current.selectedId);
      if (!icon) continue;
      const marker = L.marker([pin.y, pin.x], {
        icon,
        draggable: true,
        keyboard: false,
        zIndexOffset: pin.id === current.selectedId ? 700 : 400,
      });
      marker.bindTooltip(escapeHtml(pin.name), { direction: "top", offset: [0, -14] });
      addDrag(
        marker,
        (point) => propsRef.current.onMovePin(pin.id, point),
        () => propsRef.current.onSelectPin(pin.id),
      );
      group.addLayer(marker);
    }

    current.measure.forEach((point, index) => {
      const icon = L.divIcon({
        className: "measure-icon",
        html: `<span class="measure-dot">${index + 1}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      group.addLayer(L.marker([point.y, point.x], { icon, interactive: false, keyboard: false, zIndexOffset: 300 }));
    });

    current.ghosts.forEach((point, index) => {
      const icon = L.divIcon({
        className: "measure-icon",
        html: `<span class="cal-dot">${index + 1}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      group.addLayer(L.marker([point.y, point.x], { icon, interactive: false, keyboard: false, zIndexOffset: 900 }));
    });
  }

  return <div ref={hostRef} className="map-host" />;
}
