import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "./app.css";
import {
  calibrateFromPoints,
  formatBearing,
  formatGameCoordinate,
  formatMeters,
  formatSquareList,
  measureLeg,
  parseCoordinateInput,
  squaresCrossed,
  type XY,
} from "./coords";
import { MAPS, getMap, type MapId } from "./maps";
import {
  loadState,
  saveState,
  uid,
  defaultState,
  type AppState,
  type MapSession,
  type PlaceMode,
} from "./storage";
import { TacticalMap } from "./TacticalMap";

type Pending = { px: number; py: number; x: number; y: number };

export function WardogsApp() {
  const [state, setState] = useState<AppState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [paste, setPaste] = useState("");
  const [xText, setXText] = useState("");
  const [yText, setYText] = useState("");
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState("Move over the map to read coordinates");
  const [routeName, setRouteName] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [calStep, setCalStep] = useState<0 | 1 | 2>(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [firstSample, setFirstSample] = useState<Pending | null>(null);
  const [calX, setCalX] = useState("");
  const [calY, setCalY] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const pasteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  const game = getMap(state.mapId);
  const session = state.byMap[state.mapId];
  const bounds = session.calibration ?? game.tileBounds;

  const sizeMismatch = Boolean(
    session.calibration &&
      imageSize.width > 0 &&
      (session.calibration.imageWidth !== imageSize.width ||
        session.calibration.imageHeight !== imageSize.height),
  );

  function patch(partial: Partial<AppState>) {
    setState((current) => ({ ...current, ...partial }));
  }

  function patchMap(partial: Partial<MapSession>) {
    setState((current) => ({
      ...current,
      byMap: {
        ...current.byMap,
        [current.mapId]: { ...current.byMap[current.mapId], ...partial },
      },
    }));
  }

  function dropPin(point: XY) {
    setError("");
    const mode = state.placeMode;
    if (mode === "me") patchMap({ me: point });
    else if (mode === "objective") patchMap({ objective: point });
    else if (mode === "base") patchMap({ base: point });
    else if (mode === "waypoint") {
      patchMap({
        waypoints: [...session.waypoints, { ...point, id: uid(), name: `WP ${session.waypoints.length + 1}` }],
      });
    } else {
      const name = state.customName.trim() || "Pin";
      patchMap({
        customs: [...session.customs, { ...point, id: uid(), name }],
      });
    }
  }

  function onMapClick(point: XY & { px: number; py: number }) {
    if (calStep) {
      setPending(point);
      setError("");
      return;
    }
    dropPin(point);
  }

  function onMovePin(id: string, point: XY) {
    if (id === "me") patchMap({ me: point });
    else if (id === "objective") patchMap({ objective: point });
    else if (id === "base") patchMap({ base: point });
    else if (session.waypoints.some((item) => item.id === id)) {
      patchMap({
        waypoints: session.waypoints.map((item) => (item.id === id ? { ...item, ...point } : item)),
      });
    } else {
      patchMap({
        customs: session.customs.map((item) => (item.id === id ? { ...item, ...point } : item)),
      });
    }
  }

  function applyText(raw: string) {
    const parsed = parseCoordinateInput(raw);
    if (!parsed) {
      setError("Use x100.05, y109.14 — two numbers — or a grid ref like 7-10.");
      return;
    }
    dropPin(parsed);
    setPaste("");
  }

  function applyXY() {
    applyText(`${xText} ${yText}`);
  }

  function updateMyPosition() {
    patch({ placeMode: "me" });
    setCalStep(0);
    pasteRef.current?.focus();
    pasteRef.current?.select();
  }

  function clearPins() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    patchMap({
      me: null,
      objective: null,
      base: null,
      customs: [],
      waypoints: [],
    });
    setConfirmClear(false);
  }

  function saveRoute() {
    const name = routeName.trim();
    if (!name) {
      setError("Name the route before saving.");
      return;
    }
    patchMap({
      routes: [
        {
          id: uid(),
          name,
          me: session.me,
          objective: session.objective,
          base: session.base,
          customs: session.customs,
          waypoints: session.waypoints,
        },
        ...session.routes,
      ],
    });
    setRouteName("");
    setError("");
  }

  function loadRoute(id: string) {
    const route = session.routes.find((item) => item.id === id);
    if (!route) return;
    patchMap({
      me: route.me,
      objective: route.objective,
      base: route.base,
      customs: route.customs,
      waypoints: route.waypoints,
    });
  }

  function removeRoute(id: string) {
    patchMap({ routes: session.routes.filter((item) => item.id !== id) });
  }

  function confirmCalibrationPoint() {
    if (!pending) {
      setError("Click the map first.");
      return;
    }
    const parsed = parseCoordinateInput(`${calX} ${calY}`);
    if (!parsed) {
      setError("Enter the game X and Y for that click.");
      return;
    }
    const sample = { ...pending, x: parsed.x, y: parsed.y };
    if (calStep === 1) {
      setFirstSample(sample);
      setPending(null);
      setCalX("");
      setCalY("");
      setCalStep(2);
      setError("");
      return;
    }
    if (!firstSample) return;
    const result = calibrateFromPoints(firstSample, sample, imageSize.width, imageSize.height);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    patchMap({
      calibration: {
        ...result,
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
      },
    });
    setCalStep(0);
    setPending(null);
    setFirstSample(null);
    setCalX("");
    setCalY("");
    setError("");
  }

  const direct = useMemo(() => {
    if (!session.me || !session.objective) return null;
    return measureLeg(
      { ...session.me, name: "Me" },
      { ...session.objective, name: "Objective" },
    );
  }, [session.me, session.objective]);

  const legs = useMemo(() => {
    const chain: { name: string; x: number; y: number }[] = [];
    if (session.me) chain.push({ ...session.me, name: "Me" });
    session.waypoints.forEach((point, index) => {
      chain.push({ ...point, name: point.name || `WP ${index + 1}` });
    });
    if (session.objective) chain.push({ ...session.objective, name: "Objective" });
    const next = [];
    for (let index = 0; index < chain.length - 1; index += 1) {
      next.push(measureLeg(chain[index], chain[index + 1]));
    }
    return next;
  }, [session.me, session.objective, session.waypoints]);

  const routeMeters = legs.reduce((sum, leg) => sum + leg.meters, 0);

  const modeHelp: Record<PlaceMode, string> = {
    me: "Next click sets you.",
    objective: "Next click sets the objective.",
    base: "Next click sets the base.",
    waypoint: "Next click adds a waypoint on the route.",
    custom: "Next click adds a named pin.",
  };

  return (
    <div className={state.compact ? "wd-app compact" : "wd-app"}>
      <header className="wd-header">
        <div className="wd-brand">
          <span className="wd-kicker">WARDOGS</span>
          <span className="wd-title">Pin Map</span>
        </div>
        <div className="wd-maps" role="tablist" aria-label="Map">
          {MAPS.map((map) => (
            <button
              key={map.id}
              type="button"
              role="tab"
              aria-selected={state.mapId === map.id}
              className={state.mapId === map.id ? "is-on" : ""}
              onClick={() => {
                patch({ mapId: map.id as MapId });
                setCalStep(0);
                setPending(null);
                setConfirmClear(false);
                setError("");
              }}
            >
              {map.name}
            </button>
          ))}
        </div>
        <div className="wd-tools">
          <button
            type="button"
            className="wd-full-tool"
            aria-pressed={state.showGrid}
            onClick={() => patch({ showGrid: !state.showGrid })}
          >
            1 km grid
          </button>
          <button
            type="button"
            className="wd-full-tool"
            aria-pressed={state.showSubgrid}
            onClick={() => patch({ showSubgrid: !state.showSubgrid })}
          >
            100 m
          </button>
          <button
            type="button"
            aria-pressed={state.compact}
            onClick={() => patch({ compact: !state.compact })}
          >
            {state.compact ? "Show map" : "Compact"}
          </button>
        </div>
      </header>

      <div className="wd-body">
        <TacticalMap
          imageUrl={game.image}
          bounds={bounds}
          showGrid={state.showGrid}
          showSubgrid={state.showSubgrid}
          me={session.me}
          objective={session.objective}
          base={session.base}
          customs={session.customs}
          waypoints={session.waypoints}
          ghost={calStep ? pending : null}
          banner={
            calStep === 1
              ? "Calibration: click a known point, then enter its X and Y."
              : calStep === 2
                ? "Calibration: click a second point far from the first."
                : undefined
          }
          cursorText={cursor}
          placing={calStep > 0 || !state.compact}
          onMapClick={onMapClick}
          onMovePin={onMovePin}
          onCursor={setCursor}
          onImageSize={setImageSize}
        />

        <aside className="wd-panel">
          <section className="wd-readout" aria-live="polite">
            <div className="wd-readout-label">{game.name} · me to objective</div>
            {direct ? (
              <>
                <div className="wd-bearing-row">
                  <div className="wd-bearing">{formatBearing(direct.bearing)}°</div>
                  <div className="wd-compass">{direct.compass}</div>
                </div>
                <div className="wd-distance">{formatMeters(direct.meters)}</div>
                <div className="wd-squares">{direct.squares}</div>
              </>
            ) : (
              <>
                <div className="wd-bearing">—</div>
                <p className="wd-hint">Set Me and the objective to get bearing and distance.</p>
              </>
            )}
            {session.waypoints.length > 0 && direct && (
              <p className="wd-sub">Route with waypoints {formatMeters(routeMeters)}</p>
            )}
          </section>

          <section className="wd-section">
            <h2>Position</h2>
            <div className="wd-row">
              <button type="button" className="is-on" onClick={updateMyPosition}>
                Update my position
              </button>
            </div>
            <label className="wd-field" style={{ marginTop: 8 }}>
              Paste or grid ref
              <input
                ref={pasteRef}
                type="text"
                value={paste}
                placeholder="x100.05, y109.14 or 7-10"
                onChange={(event) => setPaste(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyText(paste);
                }}
              />
            </label>
            <div className="wd-xy" style={{ marginTop: 8 }}>
              <label className="wd-field">
                X
                <input
                  type="text"
                  inputMode="decimal"
                  value={xText}
                  onChange={(event) => setXText(event.target.value)}
                />
              </label>
              <label className="wd-field">
                Y
                <input
                  type="text"
                  inputMode="decimal"
                  value={yText}
                  onChange={(event) => setYText(event.target.value)}
                />
              </label>
            </div>
            <div className="wd-row" style={{ marginTop: 8 }}>
              <button type="button" onClick={() => applyText(paste)} disabled={!paste.trim()}>
                Drop paste
              </button>
              <button type="button" onClick={applyXY} disabled={!xText.trim() || !yText.trim()}>
                Drop X / Y
              </button>
            </div>
            <p className="wd-hint">{modeHelp[state.placeMode]} Grid refs are column-row.</p>
            {error && <p className="wd-error">{error}</p>}
          </section>

          <section className="wd-section wd-only-full">
            <h2>Place</h2>
            <div className="wd-row wd-modes">
              {(
                [
                  ["me", "Me"],
                  ["objective", "Objective"],
                  ["base", "Base"],
                  ["waypoint", "Waypoint"],
                  ["custom", "Custom"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  data-mode={mode}
                  aria-pressed={state.placeMode === mode}
                  onClick={() => patch({ placeMode: mode })}
                >
                  {label}
                </button>
              ))}
            </div>
            {state.placeMode === "custom" && (
              <label className="wd-field" style={{ marginTop: 8 }}>
                Pin name
                <input
                  type="text"
                  value={state.customName}
                  onChange={(event) => patch({ customName: event.target.value })}
                />
              </label>
            )}
          </section>

          <section className="wd-section wd-only-full">
            <h2>Pins</h2>
            <ul className="wd-pin-list">
              <PinRow
                color="var(--me)"
                name="Me"
                point={session.me}
                onRemove={() => patchMap({ me: null })}
              />
              <PinRow
                color="var(--obj)"
                name="Objective"
                point={session.objective}
                onRemove={() => patchMap({ objective: null })}
              />
              <PinRow
                color="var(--base)"
                name="Base"
                point={session.base}
                onRemove={() => patchMap({ base: null })}
              />
              {session.waypoints.map((point, index) => (
                <PinRow
                  key={point.id}
                  color="var(--brass)"
                  name={point.name || `Waypoint ${index + 1}`}
                  point={point}
                  onRemove={() =>
                    patchMap({ waypoints: session.waypoints.filter((item) => item.id !== point.id) })
                  }
                />
              ))}
              {session.customs.map((point) => (
                <PinRow
                  key={point.id}
                  color="var(--brass)"
                  name={point.name}
                  point={point}
                  onRemove={() => patchMap({ customs: session.customs.filter((item) => item.id !== point.id) })}
                />
              ))}
            </ul>
            <div className="wd-row" style={{ marginTop: 8 }}>
              <button type="button" onClick={clearPins}>
                {confirmClear ? "Confirm clear" : "Clear pins"}
              </button>
              {confirmClear && (
                <button type="button" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              )}
            </div>
          </section>

          {legs.length > 0 && (
            <section className="wd-section wd-only-full">
              <h2>Legs</h2>
              <ul className="wd-leg-list">
                {legs.map((leg) => (
                  <li key={`${leg.from}-${leg.to}-${leg.bearing}`}>
                    <div className="wd-pin-main">
                      <strong>
                        {leg.from} → {leg.to}
                      </strong>
                      <span>
                        {formatBearing(leg.bearing)}° {leg.compass} · {formatMeters(leg.meters)}
                      </span>
                      <div className="wd-squares">{leg.squares}</div>
                    </div>
                  </li>
                ))}
              </ul>
              {session.me && session.objective && (
                <p className="wd-hint">
                  Straight line crosses{" "}
                  {formatSquareList(squaresCrossed(session.me.x, session.me.y, session.objective.x, session.objective.y))}
                </p>
              )}
            </section>
          )}

          <section className="wd-section wd-only-full">
            <h2>Saved routes</h2>
            <div className="wd-row">
              <input
                type="text"
                value={routeName}
                placeholder="Route name"
                onChange={(event) => setRouteName(event.target.value)}
              />
              <button type="button" onClick={saveRoute}>
                Save
              </button>
            </div>
            <ul className="wd-route-list" style={{ marginTop: 8 }}>
              {session.routes.map((route) => (
                <li key={route.id}>
                  <div className="wd-pin-main">
                    <strong>{route.name}</strong>
                  </div>
                  <button type="button" className="wd-icon-btn" onClick={() => loadRoute(route.id)}>
                    Load
                  </button>
                  <button type="button" className="wd-icon-btn" onClick={() => removeRoute(route.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            {session.routes.length === 0 && <p className="wd-hint">Saved per map, in this browser.</p>}
          </section>

          <section className="wd-section wd-only-full">
            <h2>Calibration</h2>
            <p className="wd-hint">
              Screenshot spans X {formatGameCoordinate(bounds.minX)}–{formatGameCoordinate(bounds.maxX)}, Y{" "}
              {formatGameCoordinate(bounds.minY)}–{formatGameCoordinate(bounds.maxY)}.
              {session.calibration ? " Custom alignment." : " Default full-map alignment."}
            </p>
            {sizeMismatch && (
              <p className="wd-error">Screenshot size changed. Recalibrate so the grid matches.</p>
            )}
            {calStep === 0 ? (
              <div className="wd-row">
                <button
                  type="button"
                  onClick={() => {
                    setCalStep(1);
                    setPending(null);
                    setFirstSample(null);
                    setError("");
                  }}
                >
                  Calibrate
                </button>
                {session.calibration && (
                  <button type="button" onClick={() => patchMap({ calibration: null })}>
                    Reset
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="wd-hint">
                  {calStep === 1
                    ? "Click a known point, then type its game X and Y."
                    : "Click a second point, far from the first, and type its X and Y."}
                </p>
                <div className="wd-xy">
                  <label className="wd-field">
                    X
                    <input type="text" inputMode="decimal" value={calX} onChange={(event) => setCalX(event.target.value)} />
                  </label>
                  <label className="wd-field">
                    Y
                    <input type="text" inputMode="decimal" value={calY} onChange={(event) => setCalY(event.target.value)} />
                  </label>
                </div>
                <div className="wd-row" style={{ marginTop: 8 }}>
                  <button type="button" onClick={confirmCalibrationPoint}>
                    Use this point
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCalStep(0);
                      setPending(null);
                      setFirstSample(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </section>

          <p className="wd-note">
            Manual pins only. This page does not read the game, its files, or the screen. 1 km squares are
            numbered 1–16 from coordinate 0: column left to right, row bottom to top. 7-10 is the center of
            that square.
          </p>
        </aside>
      </div>
    </div>
  );
}

function PinRow({
  color,
  name,
  point,
  onRemove,
}: {
  color: string;
  name: string;
  point: XY | null;
  onRemove: () => void;
}) {
  if (!point) return null;
  return (
    <li>
      <span className="wd-swatch" style={{ background: color }} />
      <div className="wd-pin-main">
        <strong>{name}</strong>
        <span>
          X {formatGameCoordinate(point.x)} · Y {formatGameCoordinate(point.y)}
        </span>
      </div>
      <button type="button" className="wd-icon-btn" onClick={onRemove}>
        Remove
      </button>
    </li>
  );
}
