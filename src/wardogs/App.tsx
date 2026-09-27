import { useEffect, useState, type ReactNode } from "react";
import {
  IDENTITY_CALIBRATION,
  firingSolution,
  formatDegrees,
  formatElevation,
  formatMeters,
  formatMils,
  gridLabel,
  isIdentityCalibration,
  lookupElevation,
  measureLegs,
  parsePosition,
  solveCalibration,
  type ElevationRow,
  type MilsPerCircle,
  type XY,
} from "./coords";
import { MAPS, getMap, type MapId } from "./maps";
import { RangeFields, SettingsPanel } from "./SettingsPanel";
import { TacticalMap } from "./TacticalMap";
import {
  PIN_COLOR,
  PIN_LABEL,
  PIN_TYPES,
  loadState,
  nextPinName,
  saveState,
  sortPins,
  uid,
  withSession,
  type AppState,
  type Pin,
  type PinType,
} from "./storage";

type Tool = "target" | "mortar" | "measure" | "calibrate";

type CalPoint = {
  frameX: number;
  frameY: number;
  x: number;
  y: number;
  clickX: number;
  clickY: number;
};

type CalPending = { frameX: number; frameY: number; gameX: number; gameY: number };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function readNumbers(xText: string, yText: string): XY | null {
  if (!xText.trim() || !yText.trim()) return null;
  const x = Number(xText);
  const y = Number(yText);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function WardogsApp() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tool, setTool] = useState<Tool>("target");
  const [measure, setMeasure] = useState<XY[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newType, setNewType] = useState<PinType>("target");
  const [placeX, setPlaceX] = useState("");
  const [placeY, setPlaceY] = useState("");
  const [placePaste, setPlacePaste] = useState("");
  const [placeError, setPlaceError] = useState("");
  const [calFirst, setCalFirst] = useState<CalPoint | null>(null);
  const [calPending, setCalPending] = useState<CalPending | null>(null);
  const [calX, setCalX] = useState("");
  const [calY, setCalY] = useState("");
  const [calPaste, setCalPaste] = useState("");
  const [calError, setCalError] = useState("");
  const [imageMissing, setImageMissing] = useState(false);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    setImageMissing(false);
  }, [state.mapId]);

  const map = getMap(state.mapId);
  const session = state.byMap[state.mapId];
  const selected = session.pins.find((pin) => pin.id === session.selectedId) ?? null;
  const sorted = sortPins(session.pins, session.mortar);
  const measured = measureLegs(measure);

  function chooseTool(next: Tool) {
    const resolved = tool === next && next !== "target" ? "target" : next;
    setTool(resolved);
    if (resolved !== "measure") setMeasure([]);
    if (resolved !== "calibrate") {
      setCalFirst(null);
      setCalPending(null);
      setCalError("");
      setCalX("");
      setCalY("");
      setCalPaste("");
    }
  }

  function changeMap(mapId: MapId) {
    setState((prev) => ({ ...prev, mapId }));
    setMeasure([]);
    setTool("target");
    setCalFirst(null);
    setCalPending(null);
    setCalError("");
    setPlaceError("");
  }

  function placeMortar(at: XY) {
    setState((prev) => {
      const current = prev.byMap[prev.mapId];
      return withSession(prev, prev.mapId, { ...current, mortar: { x: at.x, y: at.y } });
    });
  }

  function addPin(at: XY, type: PinType = newType) {
    setState((prev) => {
      const current = prev.byMap[prev.mapId];
      const pin: Pin = {
        id: uid(),
        name: nextPinName(current.pins, type),
        type,
        color: PIN_COLOR[type],
        x: at.x,
        y: at.y,
      };
      return withSession(prev, prev.mapId, { ...current, pins: [...current.pins, pin], selectedId: pin.id });
    });
  }

  function editPin(id: string, patch: Partial<Pin>) {
    setState((prev) => {
      const current = prev.byMap[prev.mapId];
      return withSession(prev, prev.mapId, {
        ...current,
        pins: current.pins.map((pin) => (pin.id === id ? { ...pin, ...patch } : pin)),
      });
    });
  }

  function selectPin(id: string) {
    setState((prev) => {
      const current = prev.byMap[prev.mapId];
      return withSession(prev, prev.mapId, { ...current, selectedId: id });
    });
  }

  function cycle(step: number) {
    setState((prev) => {
      const current = prev.byMap[prev.mapId];
      const order = sortPins(current.pins, current.mortar);
      if (order.length === 0) return prev;
      const index = order.findIndex((pin) => pin.id === current.selectedId);
      const nextIndex = index < 0 ? (step > 0 ? 0 : order.length - 1) : (index + step + order.length) % order.length;
      return withSession(prev, prev.mapId, { ...current, selectedId: order[nextIndex].id });
    });
  }

  function removeSelected() {
    setState((prev) => {
      const current = prev.byMap[prev.mapId];
      if (!current.selectedId) return prev;
      const order = sortPins(current.pins, current.mortar);
      const index = order.findIndex((pin) => pin.id === current.selectedId);
      const neighbor = order[index + 1] ?? order[index - 1];
      const selectedId = neighbor && neighbor.id !== current.selectedId ? neighbor.id : null;
      return withSession(prev, prev.mapId, {
        ...current,
        pins: current.pins.filter((pin) => pin.id !== current.selectedId),
        selectedId,
      });
    });
  }

  function clearPins() {
    if (session.pins.length === 0) return;
    if (!window.confirm("Remove every pin on this map?")) return;
    setState((prev) => {
      const current = prev.byMap[prev.mapId];
      return withSession(prev, prev.mapId, { ...current, pins: [], selectedId: null });
    });
  }

  function readPlaceForm(): XY | null {
    if (placeX.trim() || placeY.trim()) {
      const typed = readNumbers(placeX, placeY);
      if (!typed) {
        setPlaceError("Enter both X and Y in meters.");
        return null;
      }
      setPlaceError("");
      return typed;
    }
    if (placePaste.trim()) {
      const parsed = parsePosition(placePaste);
      if (!parsed) {
        setPlaceError("Use a grid like 7-12, meters like 6500 11500, or a game mark like x65.00, y115.00.");
        return null;
      }
      setPlaceError("");
      return parsed;
    }
    setPlaceError("Type X and Y, or a grid reference.");
    return null;
  }

  function handleMapClick(click: { game: XY; frame: XY }) {
    if (tool === "mortar") {
      placeMortar(click.game);
      setTool("target");
      return;
    }
    if (tool === "measure") {
      setMeasure((points) => [...points, click.game]);
      return;
    }
    if (tool === "calibrate") {
      setCalPending({
        frameX: click.frame.x,
        frameY: click.frame.y,
        gameX: click.game.x,
        gameY: click.game.y,
      });
      setCalX("");
      setCalY("");
      setCalPaste("");
      setCalError("");
      return;
    }
    addPin(click.game);
  }

  function readCalNumbers(): XY | null {
    if (calPaste.trim()) return parsePosition(calPaste);
    return readNumbers(calX, calY);
  }

  function saveCalPoint() {
    if (!calPending) {
      setCalError("Click a point on the map first.");
      return;
    }
    const parsed = readCalNumbers();
    if (!parsed) {
      setCalError("Enter X and Y in meters, or paste a game mark or grid reference.");
      return;
    }
    if (!calFirst) {
      setCalFirst({
        frameX: calPending.frameX,
        frameY: calPending.frameY,
        x: parsed.x,
        y: parsed.y,
        clickX: calPending.gameX,
        clickY: calPending.gameY,
      });
      setCalPending(null);
      setCalX("");
      setCalY("");
      setCalPaste("");
      setCalError("");
      return;
    }
    const solved = solveCalibration(calFirst, {
      frameX: calPending.frameX,
      frameY: calPending.frameY,
      x: parsed.x,
      y: parsed.y,
    });
    if (!solved.ok) {
      setCalError(solved.error);
      return;
    }
    setState((prev) => {
      const current = prev.byMap[prev.mapId];
      return withSession(prev, prev.mapId, { ...current, calibration: solved.calibration });
    });
    setCalFirst(null);
    setCalPending(null);
    setCalError("");
    setTool("target");
  }

  function resetCalibration() {
    if (!isIdentityCalibration(session.calibration) && !window.confirm("Reset this map's image to the plain 16 km frame?")) {
      return;
    }
    setState((prev) => {
      const current = prev.byMap[prev.mapId];
      return withSession(prev, prev.mapId, { ...current, calibration: { ...IDENTITY_CALIBRATION } });
    });
    setCalFirst(null);
    setCalPending(null);
    setCalError("");
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (event.key === "Escape") {
        setMeasure([]);
        setTool("target");
        setCalFirst(null);
        setCalPending(null);
        setCalError("");
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        cycle(event.shiftKey ? -1 : 1);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (event.repeat) return;
        event.preventDefault();
        removeSelected();
        return;
      }
      if (event.repeat) return;
      if (event.key === "m" || event.key === "M") chooseTool("mortar");
      if (event.key === "t" || event.key === "T") chooseTool("target");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ghosts: XY[] = [];
  if (calFirst) ghosts.push({ x: calFirst.clickX, y: calFirst.clickY });
  if (calPending) ghosts.push({ x: calPending.gameX, y: calPending.gameY });

  let banner = "";
  if (tool === "mortar") banner = "Click the map to place the mortar";
  if (tool === "measure") banner = "Click points to measure. Esc clears.";
  if (tool === "calibrate" && !calFirst && !calPending) banner = "Click the first known point";
  if (tool === "calibrate" && !calFirst && calPending) banner = "Enter that point's real coordinates";
  if (tool === "calibrate" && calFirst && !calPending) banner = "Click a second point, far from the first";
  if (tool === "calibrate" && calFirst && calPending) banner = "Enter the second point's real coordinates";

  const readout = (
    <Readout
      pin={selected}
      mortar={session.mortar}
      minRange={state.minRange}
      maxRange={state.maxRange}
      milsPerCircle={state.milsPerCircle}
      elevation={state.elevation}
      onMils={(mils) => setState((prev) => ({ ...prev, milsPerCircle: mils }))}
    />
  );

  return (
    <div className={state.compact ? "shell compact" : "shell"}>
      <header className="topbar">
        <div className="brand">Wardogs Pin Map</div>
        <div className="map-picker" role="group" aria-label="Map">
          {MAPS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === state.mapId ? "active" : ""}
              aria-pressed={item.id === state.mapId}
              onClick={() => changeMap(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="tools">
          <button type="button" className={state.showKmGrid ? "active" : ""} aria-pressed={state.showKmGrid} onClick={() => setState((prev) => ({ ...prev, showKmGrid: !prev.showKmGrid }))}>
            1 km grid
          </button>
          <button type="button" className={state.showSubGrid ? "active" : ""} aria-pressed={state.showSubGrid} title="100 m lines appear when you zoom in" onClick={() => setState((prev) => ({ ...prev, showSubGrid: !prev.showSubGrid }))}>
            100 m grid
          </button>
          <button type="button" className={tool === "mortar" ? "active" : ""} onClick={() => chooseTool("mortar")}>
            Set Mortar
          </button>
          <button type="button" className={tool === "target" ? "active" : ""} onClick={() => chooseTool("target")}>
            Target
          </button>
          <button type="button" className={tool === "measure" ? "active" : ""} onClick={() => chooseTool("measure")}>
            Measure
          </button>
          <button type="button" className={tool === "calibrate" ? "active" : ""} onClick={() => chooseTool("calibrate")}>
            Calibrate
          </button>
          <button type="button" className={state.compact ? "active" : ""} aria-pressed={state.compact} onClick={() => setState((prev) => ({ ...prev, compact: !prev.compact }))}>
            Compact
          </button>
          <button type="button" className={settingsOpen ? "active" : ""} onClick={() => setSettingsOpen((open) => !open)}>
            Settings
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <SettingsPanel
          minRange={state.minRange}
          maxRange={state.maxRange}
          milsPerCircle={state.milsPerCircle}
          elevation={state.elevation}
          onRange={(minRange, maxRange) => setState((prev) => ({ ...prev, minRange, maxRange }))}
          onMils={(milsPerCircle) => setState((prev) => ({ ...prev, milsPerCircle }))}
          onElevation={(elevation: ElevationRow[]) => setState((prev) => ({ ...prev, elevation }))}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      <div className={settingsOpen ? "workspace is-hidden" : "workspace"}>
        <MapStage
          imageUrl={map.image}
          calibration={session.calibration}
          showKmGrid={state.showKmGrid}
          showSubGrid={state.showSubGrid}
          mortar={session.mortar}
          pins={session.pins}
          selectedId={session.selectedId}
          minRange={state.minRange}
          maxRange={state.maxRange}
          measure={measure}
          ghosts={ghosts}
          visible={!settingsOpen}
          layoutKey={`${state.compact}-${settingsOpen}-${state.mapId}`}
          banner={banner}
          imageMissing={imageMissing}
          onImageError={setImageMissing}
          onMapClick={handleMapClick}
          onMoveMortar={placeMortar}
          onMovePin={(id, point) => editPin(id, point)}
          onSelectPin={selectPin}
          compact={state.compact}
          readout={readout}
        />

        <aside className="sidebar">
          {tool === "calibrate" ? (
            <section className="card">
              <h2>Calibrate {map.name}</h2>
              <p className="hint">
                Click two points on the image and type their real coordinates in meters. The image keeps its shape; scale and offset are saved for this map.
              </p>
              <p className="scale-readout">
                Scale {session.calibration.scaleX.toFixed(4)} × {session.calibration.scaleY.toFixed(4)}, offset {formatMeters(session.calibration.offsetX)} m, {formatMeters(session.calibration.offsetY)} m
              </p>
              {calFirst ? (
                <p>Point 1 saved at {formatMeters(calFirst.x)} m, {formatMeters(calFirst.y)} m.</p>
              ) : null}
              {calPending ? (
                <p className="hint">
                  This click currently reads X {formatMeters(calPending.gameX)} m, Y {formatMeters(calPending.gameY)} m. Type the real position.
                </p>
              ) : (
                <p className="hint">{calFirst ? "Click the second point." : "Click the first point."}</p>
              )}
              <div className="coord-grid">
                <label>
                  X meters
                  <input inputMode="decimal" value={calX} onChange={(event) => setCalX(event.target.value)} />
                </label>
                <label>
                  Y meters
                  <input inputMode="decimal" value={calY} onChange={(event) => setCalY(event.target.value)} />
                </label>
              </div>
              <label className="stack">
                Or paste
                <input
                  value={calPaste}
                  placeholder="x100.05, y109.14 or 7-12"
                  onChange={(event) => setCalPaste(event.target.value)}
                />
              </label>
              {calError ? <p className="form-error">{calError}</p> : null}
              <div className="row-actions">
                <button type="button" className="primary" onClick={saveCalPoint}>
                  {calFirst ? "Save calibration" : "Save point 1"}
                </button>
                <button type="button" onClick={resetCalibration}>Reset to 16 km</button>
              </div>
            </section>
          ) : null}

          {readout}

          {tool === "measure" || measure.length > 0 ? (
            <section className="card">
              <h2>Measure</h2>
              {measured.legs.length === 0 ? <p className="hint">Click two or more points. Esc clears the line.</p> : null}
              {measured.legs.map((leg, index) => (
                <div className="leg" key={index}>
                  <span>Leg {index + 1}</span>
                  <strong>{formatMeters(leg.meters)} m</strong>
                  <span>{formatDegrees(leg.bearing)}°</span>
                </div>
              ))}
              {measured.legs.length > 0 ? (
                <div className="leg total">
                  <span>Total</span>
                  <strong>{formatMeters(measured.total)} m</strong>
                  <span />
                </div>
              ) : null}
              <button type="button" onClick={() => setMeasure([])}>Clear measure</button>
            </section>
          ) : null}

          <section className="card">
            <h2>Mortar</h2>
            {session.mortar ? (
              <p>
                X {formatMeters(session.mortar.x)} m · Y {formatMeters(session.mortar.y)} m · {gridLabel(session.mortar.x, session.mortar.y)}
              </p>
            ) : (
              <p className="hint">No mortar on {map.name}. Press M, then click the map, or type a position below.</p>
            )}
            <p className="hint">Drag the M marker to adjust it.</p>
            <RangeFields
              minRange={state.minRange}
              maxRange={state.maxRange}
              onChange={(minRange, maxRange) => setState((prev) => ({ ...prev, minRange, maxRange }))}
            />
            {session.mortar ? (
              <button
                type="button"
                onClick={() => {
                  setState((prev) => {
                    const current = prev.byMap[prev.mapId];
                    return withSession(prev, prev.mapId, { ...current, mortar: null });
                  });
                }}
              >
                Clear mortar
              </button>
            ) : null}
          </section>

          <section className="card">
            <h2>Type a position</h2>
            <div className="coord-grid">
              <label>
                X meters
                <input inputMode="decimal" value={placeX} onChange={(event) => setPlaceX(event.target.value)} />
              </label>
              <label>
                Y meters
                <input inputMode="decimal" value={placeY} onChange={(event) => setPlaceY(event.target.value)} />
              </label>
            </div>
            <label className="stack">
              Grid or paste
              <input
                value={placePaste}
                placeholder="7-12 or x65.00, y115.00"
                onChange={(event) => setPlacePaste(event.target.value)}
              />
            </label>
            <p className="hint">X and Y are meters and win if both are filled. A game mark like x100.05, y109.14 is 100 m per unit. Grid 7-12 drops in the center of that square.</p>
            <label className="stack">
              New pin type
              <select value={newType} onChange={(event) => setNewType(event.target.value as PinType)}>
                {PIN_TYPES.map((type) => (
                  <option key={type} value={type}>{PIN_LABEL[type]}</option>
                ))}
              </select>
            </label>
            {placeError ? <p className="form-error">{placeError}</p> : null}
            <div className="row-actions">
              <button
                type="button"
                onClick={() => {
                  const at = readPlaceForm();
                  if (!at) return;
                  placeMortar(at);
                }}
              >
                Set mortar here
              </button>
              <button
                type="button"
                onClick={() => {
                  const at = readPlaceForm();
                  if (!at) return;
                  addPin(at);
                }}
              >
                Add pin here
              </button>
            </div>
          </section>

          {selected ? (
            <section className="card">
              <h2>Selected pin</h2>
              <label className="stack">
                Name
                <input value={selected.name} onChange={(event) => editPin(selected.id, { name: event.target.value })} />
              </label>
              <label className="stack">
                Type
                <select value={selected.type} onChange={(event) => editPin(selected.id, { type: event.target.value as PinType })}>
                  {PIN_TYPES.map((type) => (
                    <option key={type} value={type}>{PIN_LABEL[type]}</option>
                  ))}
                </select>
              </label>
              <label className="stack">
                Color
                <input type="color" value={selected.color} onChange={(event) => editPin(selected.id, { color: event.target.value })} />
              </label>
              <button type="button" className="danger" onClick={removeSelected}>Delete pin</button>
            </section>
          ) : null}

          <section className="card">
            <div className="section-title">
              <h2>Pins</h2>
              <button type="button" className="danger" onClick={clearPins} disabled={session.pins.length === 0}>
                Clear all
              </button>
            </div>
            {sorted.length === 0 ? <p className="hint">Click the map to drop a pin. T returns to target mode.</p> : null}
            <ul className="pin-list">
              {sorted.map((pin) => {
                const distance = session.mortar
                  ? Math.round(Math.hypot(pin.x - session.mortar.x, pin.y - session.mortar.y))
                  : null;
                const inRange = distance !== null && distance >= state.minRange && distance <= state.maxRange;
                return (
                  <li key={pin.id}>
                    <button
                      type="button"
                      className={pin.id === session.selectedId ? "pin-row selected" : "pin-row"}
                      onClick={() => selectPin(pin.id)}
                    >
                      <i style={{ background: pin.color }} />
                      <span className="pin-name">{pin.name}</span>
                      <span className="pin-type">{PIN_LABEL[pin.type]}</span>
                      <span className={distance === null ? "pin-dist" : inRange ? "pin-dist ok" : "pin-dist bad"}>
                        {distance === null ? gridLabel(pin.x, pin.y) : `${formatMeters(distance)} m · ${inRange ? "in" : "out"}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="keys">M mortar · T target · Tab pins · Del remove · Esc clears measure</p>
            <p className="hint">Hand entry only. This page does not read the game, overlay it, or send input.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Readout({
  pin,
  mortar,
  minRange,
  maxRange,
  milsPerCircle,
  elevation,
  onMils,
}: {
  pin: Pin | null;
  mortar: XY | null;
  minRange: number;
  maxRange: number;
  milsPerCircle: MilsPerCircle;
  elevation: ElevationRow[];
  onMils: (mils: MilsPerCircle) => void;
}) {
  if (!pin || !mortar) {
    return (
      <section className="card readout">
        <h2>Distance</h2>
        <p className="distance muted">—</p>
        <p className="hint">{pin ? "Set a mortar to read distance and bearing." : "Click the map to add a target, then select it."}</p>
      </section>
    );
  }
  const solution = firingSolution(mortar, pin, minRange, maxRange, milsPerCircle);
  const elevationLookup = lookupElevation(elevation, solution.distance);
  const elevationNote =
    elevationLookup.status === "value"
      ? ""
      : elevationLookup.status === "outside"
        ? "Outside the table"
        : elevationLookup.status === "short-table"
          ? "Add at least two rows in Settings"
          : "Enter values from the game";
  return (
    <section className="card readout" aria-live="polite">
      <div className="readout-head">
        <h2>{pin.name}</h2>
        <span className="grid-chip">{solution.grid}</span>
      </div>
      <p className="distance">{formatMeters(solution.distance)}<span> m</span></p>
      <p className="elevation">
        Elevation {elevationLookup.status === "value" ? formatElevation(elevationLookup.elevation) : "—"}
      </p>
      {elevationNote ? <p className="hint">{elevationNote}</p> : null}
      <p className={solution.range === "in" ? "range-flag in" : "range-flag out"}>
        {solution.range === "in" ? "IN RANGE" : "OUT OF RANGE"}
      </p>
      {solution.range === "short" ? <p className="range-reason">Too close</p> : null}
      {solution.range === "long" ? <p className="range-reason">Too far</p> : null}
      <div className="solution-grid">
        <div>
          <span>Bearing</span>
          <strong>{formatDegrees(solution.bearing)}°</strong>
        </div>
        <div>
          <span>Mils</span>
          <strong>{formatMils(solution.mils)}</strong>
          <div className="segment" role="group" aria-label="Mils in a full circle">
            <button type="button" className={milsPerCircle === 6400 ? "active" : ""} aria-pressed={milsPerCircle === 6400} onClick={() => onMils(6400)}>
              6400
            </button>
            <button type="button" className={milsPerCircle === 6000 ? "active" : ""} aria-pressed={milsPerCircle === 6000} onClick={() => onMils(6000)}>
              6000
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MapStage(props: {
  imageUrl: string;
  calibration: AppState["byMap"][MapId]["calibration"];
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
  banner: string;
  imageMissing: boolean;
  compact: boolean;
  readout: ReactNode;
  onImageError: (missing: boolean) => void;
  onMapClick: (click: { game: XY; frame: XY }) => void;
  onMoveMortar: (point: XY) => void;
  onMovePin: (id: string, point: XY) => void;
  onSelectPin: (id: string) => void;
}) {
  const [cursor, setCursor] = useState<XY | null>(null);
  return (
    <div className="map-wrap">
      <TacticalMap
        imageUrl={props.imageUrl}
        calibration={props.calibration}
        showKmGrid={props.showKmGrid}
        showSubGrid={props.showSubGrid}
        mortar={props.mortar}
        pins={props.pins}
        selectedId={props.selectedId}
        minRange={props.minRange}
        maxRange={props.maxRange}
        measure={props.measure}
        ghosts={props.ghosts}
        visible={props.visible}
        layoutKey={props.layoutKey}
        onMapClick={props.onMapClick}
        onCursor={setCursor}
        onMoveMortar={props.onMoveMortar}
        onMovePin={props.onMovePin}
        onSelectPin={props.onSelectPin}
        onImageError={props.onImageError}
      />
      <CursorHud cursor={cursor} />
      {props.banner ? <div className="map-banner">{props.banner}</div> : null}
      {props.imageMissing ? <div className="map-banner warn">Map image failed to load. Check the file in public/maps.</div> : null}
      {props.compact ? <div className="readout-float">{props.readout}</div> : null}
    </div>
  );
}

function CursorHud({ cursor }: { cursor: XY | null }) {
  if (!cursor) return null;
  return (
    <div className="cursor-hud">
      <div>X {formatMeters(cursor.x)} m</div>
      <div>Y {formatMeters(cursor.y)} m</div>
      <div className="cursor-grid">{gridLabel(cursor.x, cursor.y)}</div>
    </div>
  );
}
