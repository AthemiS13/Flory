
"use client";
import { useEffect, useState } from "react";

type StatusData = {
  soil_percent: number;
  water_percent: number;
  temperature: number;
  humidity: number;
  pump_on: boolean;
  // battery removed; no battery_percent
  pumpPwmDuty?: number;
};

export default function Home() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Settings and calibration state
  const [settings, setSettings] = useState<any | null>(null);
  const [calibration, setCalibration] = useState<any | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    async function fetchData() {
      try {
        const res = await fetch("/api/flory-status");
        if (!res.ok) throw new Error("Failed to fetch data");
        const json = await res.json();
        setData(json);
        setError(null);
        // fetch settings (contains calibration defaults and last raw values)
        try {
          const sres = await fetch('/api/flory-settings');
          if (sres.ok) {
            const sj = await sres.json();
            setSettings(sj);
            if (sj.soilDryRaw !== undefined) setSoilDryRaw(sj.soilDryRaw);
            if (sj.soilWetRaw !== undefined) setSoilWetRaw(sj.soilWetRaw);
            if (sj.wateringThreshold !== undefined) setWateringThreshold(sj.wateringThreshold);
            if (sj.pumpPwmDuty !== undefined) setPumpPwmDuty(sj.pumpPwmDuty);
            if (sj.last_soil_raw !== undefined) setLastSoilRaw(sj.last_soil_raw);
            if (sj.last_water_raw !== undefined) setLastWaterRaw(sj.last_water_raw);
          }
        } catch (e) {
          // ignore
        }
        // fetch calibration map + latest raw readings
        try {
          const cres = await fetch('/api/flory-calibration');
          if (cres.ok) {
            const cj = await cres.json();
            setCalibration(cj);
                    if (cj.last_soil_raw !== undefined) setLastSoilRaw(cj.last_soil_raw);
                    if (cj.last_water_raw !== undefined) setLastWaterRaw(cj.last_water_raw);
                    if (cj.pumpPwmDuty !== undefined) setPumpPwmDuty(cj.pumpPwmDuty);
            if (cj.water_map !== undefined && Array.isArray(cj.water_map)) setWaterMap(cj.water_map.map((m: any) => ({ raw: m.raw, percent: m.percent })));
          }
        } catch (e) {
          // ignore
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    interval = setInterval(fetchData, 5000); // fetch every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Control panel state
  const [pumpLoading, setPumpLoading] = useState(false);
  const [pumpError, setPumpError] = useState<string | null>(null);
  const [restartLoading, setRestartLoading] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [pumpDuration, setPumpDuration] = useState(3000);
  const [sensorInterval, setSensorInterval] = useState(1000);
  const [pumpPwmDuty, setPumpPwmDuty] = useState(255);

  // Calibration/settings fields
  const [soilDryRaw, setSoilDryRaw] = useState<number | undefined>(undefined);
  const [soilWetRaw, setSoilWetRaw] = useState<number | undefined>(undefined);
  const [wateringThreshold, setWateringThreshold] = useState<number | undefined>(undefined);
  const [lastSoilRaw, setLastSoilRaw] = useState<number | null>(null);
  const [lastWaterRaw, setLastWaterRaw] = useState<number | null>(null);
  const [waterMap, setWaterMap] = useState<Array<{ raw: number; percent: number }>>([]);

  // Pump control handlers
  async function handlePump(action: "start" | "stop") {
    setPumpLoading(true);
    setPumpError(null);
    try {
      const body = action === "start"
        ? JSON.stringify({ action: "start", durationMs: pumpDuration })
        : JSON.stringify({ action: "stop" });
      const res = await fetch("/api/flory-pump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) throw new Error("Pump control failed");
    } catch (err: any) {
      setPumpError(err.message);
    } finally {
      setPumpLoading(false);
    }
  }

  // Settings update handler
  async function handleSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const bodyObj: any = {
        pumpDurationMs: pumpDuration,
        sensorUpdateInterval: sensorInterval,
        pumpPwmDuty: pumpPwmDuty,
      };
      if (soilDryRaw !== undefined) bodyObj.soilDryRaw = soilDryRaw;
      if (soilWetRaw !== undefined) bodyObj.soilWetRaw = soilWetRaw;
      if (wateringThreshold !== undefined) bodyObj.wateringThreshold = wateringThreshold;
      const body = JSON.stringify(bodyObj);
      const res = await fetch("/api/flory-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) throw new Error("Settings update failed");
      // refresh settings/calibration after save
      try {
        const s = await fetch('/api/flory-settings');
        if (s.ok) setSettings(await s.json());
      } catch {}
      try {
        const c = await fetch('/api/flory-calibration');
        if (c.ok) setCalibration(await c.json());
      } catch {}
    } catch (err: any) {
      setSettingsError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  }

  // Capture current raw soil reading as dry or wet and save
  async function captureSoil(which: 'dry' | 'wet') {
    if (lastSoilRaw === null) return;
    if (which === 'dry') setSoilDryRaw(lastSoilRaw);
    else setSoilWetRaw(lastSoilRaw);
    // send immediate POST with the new calibration value
    const bodyObj: any = {};
    if (which === 'dry') bodyObj.soilDryRaw = lastSoilRaw;
    else bodyObj.soilWetRaw = lastSoilRaw;
    try {
      const res = await fetch('/api/flory-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });
      if (res.ok) {
        const s = await res.json();
        setSettings(s);
      }
    } catch (e) {
      // ignore
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black p-8">
      <h1 className="text-4xl font-extrabold mb-8 text-white tracking-tight drop-shadow-lg">🌿 Flory Sensor Dashboard</h1>
      {loading && <p className="text-white/80 animate-pulse">Loading data...</p>}
      {error && <p className="text-red-400 font-mono">Error: {error}</p>}
      {data && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl p-8 w-full max-w-md mb-8">
          <ul className="space-y-5">
            <li className="flex justify-between items-center text-lg text-white">
              <span className="font-semibold">Soil Moisture</span>
              <span className="font-mono text-green-400">{data.soil_percent}%</span>
            </li>
            <li className="flex justify-between items-center text-lg text-white">
              <span className="font-semibold">Water Level</span>
              <span className="font-mono text-blue-400">{data.water_percent}%</span>
            </li>
            <li className="flex justify-between items-center text-lg text-white">
              <span className="font-semibold">Temperature</span>
              <span className="font-mono text-yellow-400">{data.temperature !== null ? data.temperature + "°C" : "N/A"}</span>
            </li>
            <li className="flex justify-between items-center text-lg text-white">
              <span className="font-semibold">Humidity</span>
              <span className="font-mono text-cyan-400">{data.humidity !== null ? data.humidity + "%" : "N/A"}</span>
            </li>
            <li className="flex justify-between items-center text-lg text-white">
              <span className="font-semibold">Pump State</span>
              <span className={`font-mono ${data.pump_on ? "text-pink-400" : "text-gray-400"}`}>{data.pump_on ? "ON" : "OFF"}</span>
            </li>
            {/* Battery removed - device uses wall power */}
          </ul>
        </div>
      )}

      {/* Control Panel */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h2 className="text-xl font-bold text-white mb-4">Control Panel</h2>
        <div className="flex gap-4 mb-6">
          <button
            className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded transition disabled:opacity-50"
            onClick={() => handlePump("start")}
            disabled={pumpLoading}
          >
            Start Pump
          </button>
          <button
            className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded transition disabled:opacity-50"
            onClick={() => handlePump("stop")}
            disabled={pumpLoading}
          >
            Stop Pump
          </button>
          <button
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition disabled:opacity-50"
            onClick={async () => {
              if (!confirm('Restart the device? This will briefly disconnect it.')) return;
              setRestartLoading(true);
              setRestartMessage(null);
              try {
                const res = await fetch('/api/flory-restart', { method: 'POST' });
                if (!res.ok) throw new Error('Restart failed');
                const json = await res.json();
                setRestartMessage(JSON.stringify(json));
              } catch (e: any) {
                setRestartMessage(e.message ?? 'Restart error');
              } finally {
                setRestartLoading(false);
              }
            }}
            disabled={restartLoading}
          >
            Restart Device
          </button>
        </div>
        {pumpError && <p className="text-red-400 mb-4 font-mono">{pumpError}</p>}
  {restartMessage && <p className="text-yellow-300 mb-4 font-mono">{restartMessage}</p>}
        <form onSubmit={handleSettings} className="flex flex-col gap-4">
          <label className="flex flex-col text-white">
            <span className="mb-1">Pump Duration (ms)</span>
            <input
              type="number"
              className="bg-black border border-neutral-700 rounded px-2 py-1 text-white font-mono"
              value={pumpDuration}
              onChange={e => setPumpDuration(Number(e.target.value))}
              min={100}
              max={20000}
            />
          </label>
          <label className="flex flex-col text-white">
            <span className="mb-1">Pump PWM Duty (raw)</span>
            <input
              type="number"
              className="bg-black border border-neutral-700 rounded px-2 py-1 text-white font-mono"
              value={pumpPwmDuty}
              onChange={e => setPumpPwmDuty(Number(e.target.value))}
              min={0}
            />
          </label>
          <label className="flex flex-col text-white">
            <span className="mb-1">Sensor Update Interval (ms)</span>
            <input
              type="number"
              className="bg-black border border-neutral-700 rounded px-2 py-1 text-white font-mono"
              value={sensorInterval}
              onChange={e => setSensorInterval(Number(e.target.value))}
              min={100}
              max={60000}
            />
          </label>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition disabled:opacity-50"
            disabled={settingsLoading}
          >
            Update Settings
          </button>
        </form>
        {settingsError && <p className="text-red-400 mt-4 font-mono">{settingsError}</p>}
      </div>

      {/* Calibration / Settings Panel */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl p-8 w-full max-w-md mt-8">
        <h2 className="text-xl font-bold text-white mb-4">Calibration & Settings</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-white">
            <div className="text-sm text-neutral-400">Last soil raw</div>
            <div className="font-mono text-green-300">{lastSoilRaw ?? '–'}</div>
          </div>
          <div className="text-white">
            <div className="text-sm text-neutral-400">Last water raw</div>
            <div className="font-mono text-blue-300">{lastWaterRaw ?? '–'}</div>
          </div>
        </div>

        <form onSubmit={handleSettings} className="flex flex-col gap-4">
          <label className="flex flex-col text-white">
            <span className="mb-1">Soil Dry Raw (ADC)</span>
            <input
              type="number"
              className="bg-black border border-neutral-700 rounded px-2 py-1 text-white font-mono"
              value={soilDryRaw ?? ''}
              onChange={e => setSoilDryRaw(e.target.value === '' ? undefined : Number(e.target.value))}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" className="bg-yellow-600 text-black font-bold py-1 px-3 rounded" onClick={() => captureSoil('dry')}>Capture Dry</button>
            <div className="text-xs text-neutral-400 self-center">Click when sensor is dry to capture current raw value.</div>
          </div>

          <label className="flex flex-col text-white">
            <span className="mb-1">Soil Wet Raw (ADC)</span>
            <input
              type="number"
              className="bg-black border border-neutral-700 rounded px-2 py-1 text-white font-mono"
              value={soilWetRaw ?? ''}
              onChange={e => setSoilWetRaw(e.target.value === '' ? undefined : Number(e.target.value))}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" className="bg-cyan-600 text-black font-bold py-1 px-3 rounded" onClick={() => captureSoil('wet')}>Capture Wet</button>
            <div className="text-xs text-neutral-400 self-center">Click when sensor is submerged/very wet to capture current raw value.</div>
          </div>

          <label className="flex flex-col text-white">
            <span className="mb-1">Watering Threshold (%)</span>
            <input
              type="number"
              className="bg-black border border-neutral-700 rounded px-2 py-1 text-white font-mono"
              value={wateringThreshold ?? ''}
              onChange={e => setWateringThreshold(e.target.value === '' ? undefined : Number(e.target.value))}
              min={0}
              max={100}
            />
          </label>

          <div className="flex gap-4 mt-2">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition disabled:opacity-50"
              disabled={settingsLoading}
            >
              Save Calibration
            </button>
            <button
              type="button"
              className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded"
              onClick={async () => {
                // refresh calibration/settings
                try {
                  const s = await fetch('/api/flory-settings');
                  if (s.ok) {
                    const sj = await s.json();
                    setSettings(sj);
                    if (sj.soilDryRaw !== undefined) setSoilDryRaw(sj.soilDryRaw);
                    if (sj.soilWetRaw !== undefined) setSoilWetRaw(sj.soilWetRaw);
                    if (sj.wateringThreshold !== undefined) setWateringThreshold(sj.wateringThreshold);
                    if (sj.last_soil_raw !== undefined) setLastSoilRaw(sj.last_soil_raw);
                    if (sj.last_water_raw !== undefined) setLastWaterRaw(sj.last_water_raw);
                    if (sj.water_map !== undefined && Array.isArray(sj.water_map)) setWaterMap(sj.water_map.map((m: any) => ({ raw: m.raw, percent: m.percent })));
                  }
                } catch {}
                try {
                  const c = await fetch('/api/flory-calibration');
                  if (c.ok) {
                    const cj = await c.json();
                    setCalibration(cj);
                    if (cj.last_soil_raw !== undefined) setLastSoilRaw(cj.last_soil_raw);
                    if (cj.last_water_raw !== undefined) setLastWaterRaw(cj.last_water_raw);
                  }
                } catch {}
              }}
            >
              Refresh
            </button>
          </div>
        </form>
        {/* Water calibration map editor */}
        <div className="mt-6">
          <h3 className="text-sm text-neutral-300 mb-2">Water sensor calibration map</h3>
          <div className="bg-black border border-neutral-800 rounded p-3">
            <table className="w-full text-sm text-white">
              <thead>
                <tr className="text-neutral-400">
                  <th className="text-left">Raw</th>
                  <th className="text-left">Percent</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {waterMap.map((row, idx) => (
                  <tr key={idx} className="align-top">
                    <td className="py-1">
                      <input className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-28 text-white font-mono" value={row.raw}
                        onChange={e => {
                          const nw = [...waterMap]; nw[idx] = { ...nw[idx], raw: Number(e.target.value) }; setWaterMap(nw);
                        }}
                      />
                    </td>
                    <td className="py-1">
                      <input className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-24 text-white font-mono" value={row.percent}
                        onChange={e => {
                          const nw = [...waterMap]; nw[idx] = { ...nw[idx], percent: Number(e.target.value) }; setWaterMap(nw);
                        }}
                      />
                    </td>
                    <td className="py-1">
                      <button type="button" className="text-red-400" onClick={() => { const nw = waterMap.filter((_, i) => i !== idx); setWaterMap(nw); }}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 mt-2">
              <button type="button" className="bg-green-600 text-black font-bold py-1 px-3 rounded" onClick={() => setWaterMap([...waterMap, { raw: 0, percent: 0 }])}>Add Row</button>
              <button type="button" className="bg-blue-600 text-white font-bold py-1 px-3 rounded" onClick={async () => {
                // Save water_map via settings POST
                try {
                  const res = await fetch('/api/flory-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ water_map: waterMap }),
                  });
                  if (res.ok) {
                    const s = await res.json(); setSettings(s);
                  }
                } catch (e) { }
              }}>Save Map</button>
            </div>
          </div>
        </div>
        {settingsError && <p className="text-red-400 mt-4 font-mono">{settingsError}</p>}
      </div>

      <p className="mt-10 text-xs text-white/40 font-mono">Data fetched from Flory REST API</p>
    </div>
  );
}
