
"use client";
import { useEffect, useState } from "react";

type StatusData = {
  soil_percent: number;
  water_percent: number;
  temperature: number;
  humidity: number;
  pump_on: boolean;
  battery_v: number;
};

export default function Home() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    async function fetchData() {
      try {
        const res = await fetch("/api/flory-status");
        if (!res.ok) throw new Error("Failed to fetch data");
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    interval = setInterval(fetchData, 100); // fetch every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Control panel state
  const [pumpLoading, setPumpLoading] = useState(false);
  const [pumpError, setPumpError] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [pumpDuration, setPumpDuration] = useState(3000);
  const [sensorInterval, setSensorInterval] = useState(1000);

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
      const body = JSON.stringify({ pumpDurationMs: pumpDuration, sensorUpdateInterval: sensorInterval });
      const res = await fetch("/api/flory-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) throw new Error("Settings update failed");
    } catch (err: any) {
      setSettingsError(err.message);
    } finally {
      setSettingsLoading(false);
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
            <li className="flex justify-between items-center text-lg text-white">
              <span className="font-semibold">Battery Voltage</span>
              <span className="font-mono text-purple-400">{typeof data.battery_v === "number" ? data.battery_v + " V" : "N/A"}</span>
            </li>
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
        </div>
        {pumpError && <p className="text-red-400 mb-4 font-mono">{pumpError}</p>}
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

      <p className="mt-10 text-xs text-white/40 font-mono">Data fetched from Flory REST API</p>
    </div>
  );
}
