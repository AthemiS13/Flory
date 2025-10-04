
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
    interval = setInterval(fetchData, 1000); // fetch every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black p-8">
      <h1 className="text-4xl font-extrabold mb-8 text-white tracking-tight drop-shadow-lg">🌿 Flory Sensor Dashboard</h1>
      {loading && <p className="text-white/80 animate-pulse">Loading data...</p>}
      {error && <p className="text-red-400 font-mono">Error: {error}</p>}
      {data && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl p-8 w-full max-w-md">
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
      <p className="mt-10 text-xs text-white/40 font-mono">Data fetched from Flory REST API</p>
    </div>
  );
}
