import { useEffect, useState } from "react";
import type { ElevationRow, MilsPerCircle } from "./coords";

type RangeProps = {
  minRange: number;
  maxRange: number;
  onChange: (min: number, max: number) => void;
};

export function RangeFields({ minRange, maxRange, onChange }: RangeProps) {
  const [minText, setMinText] = useState(String(minRange));
  const [maxText, setMaxText] = useState(String(maxRange));
  const [error, setError] = useState("");

  useEffect(() => {
    setMinText(String(minRange));
  }, [minRange]);

  useEffect(() => {
    setMaxText(String(maxRange));
  }, [maxRange]);

  function apply(nextMin: string, nextMax: string) {
    const min = Number(nextMin);
    const max = Number(nextMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min || max > 100000) {
      setError("Minimum must be at least 0 and less than maximum.");
      return;
    }
    setError("");
    if (min !== minRange || max !== maxRange) onChange(min, max);
  }

  return (
    <div className="range-fields">
      <label>
        Minimum (m)
        <input
          inputMode="decimal"
          aria-label="Minimum range in meters"
          value={minText}
          onChange={(event) => {
            setMinText(event.target.value);
            apply(event.target.value, maxText);
          }}
        />
      </label>
      <label>
        Maximum (m)
        <input
          inputMode="decimal"
          aria-label="Maximum range in meters"
          value={maxText}
          onChange={(event) => {
            setMaxText(event.target.value);
            apply(minText, event.target.value);
          }}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : <p className="hint">Shaded map areas are inside the minimum or outside the maximum.</p>}
    </div>
  );
}

type Props = {
  minRange: number;
  maxRange: number;
  milsPerCircle: MilsPerCircle;
  elevation: ElevationRow[];
  onRange: (min: number, max: number) => void;
  onMils: (mils: MilsPerCircle) => void;
  onElevation: (rows: ElevationRow[]) => void;
  onClose: () => void;
};

function asNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function SettingsPanel({ minRange, maxRange, milsPerCircle, elevation, onRange, onMils, onElevation, onClose }: Props) {
  function updateRow(index: number, patch: Partial<ElevationRow>) {
    onElevation(elevation.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <section className="settings">
      <div className="settings-head">
        <h1>Settings</h1>
        <button type="button" onClick={onClose}>Back to map</button>
      </div>
      <p className="hint">Saved in this browser only. Nothing here is read from the game.</p>

      <h2>Mortar range</h2>
      <RangeFields minRange={minRange} maxRange={maxRange} onChange={onRange} />

      <h2>Mils in a full circle</h2>
      <div className="segment" role="group" aria-label="Mils in a full circle">
        <button type="button" aria-pressed={milsPerCircle === 6400} className={milsPerCircle === 6400 ? "active" : ""} onClick={() => onMils(6400)}>
          6400
        </button>
        <button type="button" aria-pressed={milsPerCircle === 6000} className={milsPerCircle === 6000 ? "active" : ""} onClick={() => onMils(6000)}>
          6000
        </button>
      </div>

      <h2>Range table</h2>
      <p className="hint">Enter values from the game. This table starts empty. When a target is selected, elevation is filled in by linear interpolation between the rows you type.</p>
      {elevation.length === 0 ? <p className="empty-note">No rows yet.</p> : null}
      <div className="table">
        {elevation.length > 0 ? (
          <div className="table-head">
            <span>Distance (m)</span>
            <span>Elevation</span>
            <span />
          </div>
        ) : null}
        {elevation.map((row, index) => (
          <div className="table-row" key={index}>
            <input
              inputMode="decimal"
              aria-label={`Range table distance ${index + 1}`}
              value={row.distance ?? ""}
              onChange={(event) => updateRow(index, { distance: asNumber(event.target.value) })}
            />
            <input
              inputMode="decimal"
              aria-label={`Range table elevation ${index + 1}`}
              value={row.elevation ?? ""}
              onChange={(event) => updateRow(index, { elevation: asNumber(event.target.value) })}
            />
            <button type="button" onClick={() => onElevation(elevation.filter((_, i) => i !== index))}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onElevation([...elevation, { distance: null, elevation: null }])}>
        Add row
      </button>
    </section>
  );
}
