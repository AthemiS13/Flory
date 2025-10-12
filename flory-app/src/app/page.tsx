
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
            if (sj.otaHostname !== undefined) setOtaHostname(sj.otaHostname);
            if (sj.otaPassword !== undefined) setOtaPassword(sj.otaPassword);
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
                    if (cj.otaHostname !== undefined) setOtaHostname(cj.otaHostname);
                    if (cj.otaPassword !== undefined) setOtaPassword(cj.otaPassword);
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
  const [wipeLoading, setWipeLoading] = useState(false);
  const [wipeMessage, setWipeMessage] = useState<string | null>(null);
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
  // OTA / mDNS persisted settings
  const [otaHostname, setOtaHostname] = useState<string | undefined>(undefined);
  const [otaPassword, setOtaPassword] = useState<string | undefined>(undefined);

  // File manager upload queue state
  type UploadItem = {
    file: File;
    remotePath: string;
    status: 'ready' | 'uploading' | 'done' | 'error';
    progress: number;
    error: string | null;
  };
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [emergencyUploading, setEmergencyUploading] = useState(false);
  const [emergencyProgress, setEmergencyProgress] = useState<number | null>(null);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);

  async function uploadFile(idx: number) {
    const item = uploadQueue[idx];
    if (!item) return;
    const q = [...uploadQueue];
    q[idx] = { ...q[idx], status: 'uploading', progress: 0, error: null };
    setUploadQueue(q);
    try {
      const fd = new FormData();
      // include filename parameter per firmware expectations
      fd.append('file', item.file, item.remotePath);
      // Some implementations expect the filename as part of the content-disposition;
      // using the third param to append sets the filename. Additionally set a field
      // `filename` so servers that read form fields can see it.
      fd.append('filename', item.remotePath);

      const res = await fetch('/api/flory-sd-upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        q[idx] = { ...q[idx], status: 'error', error: `Upload failed: ${text}` };
        setUploadQueue(q);
        return;
      }
      const json = await res.json().catch(() => ({ ok: true }));
      if (json && json.ok) {
        q[idx] = { ...q[idx], status: 'done', progress: 100 };
      } else {
        q[idx] = { ...q[idx], status: 'error', error: JSON.stringify(json) };
      }
      setUploadQueue(q);
    } catch (e: any) {
      q[idx] = { ...q[idx], status: 'error', error: e.message };
      setUploadQueue(q);
    }
  }

  function uploadAll() {
    // sequential upload to avoid hammering the device
    (async function sequential() {
      for (let i = 0; i < uploadQueue.length; i++) {
        if (uploadQueue[i].status === 'ready' || uploadQueue[i].status === 'error') {
          // eslint-disable-next-line no-await-in-loop
          // refresh local index because uploadFile mutates state
          // ensure we await before proceeding
          // eslint-disable-next-line no-await-in-loop
          await uploadFile(i);
        }
      }
    })();
  }

  // Emergency single-request upload: sends all files in one multipart POST.
  // This is destructive on the device (first received file triggers wiping /app).
  async function emergencyUploadAll() {
    if (uploadQueue.length === 0) return;
    if (!confirm('EMERGENCY: this will erase all files under /app on the device SD. Continue?')) return;
    setEmergencyError(null);
    setEmergencyUploading(true);
    setEmergencyProgress(0);
    // Snapshot items to upload
    const items = [...uploadQueue];
    // Mark all as uploading
    setUploadQueue(q => q.map(it => ({ ...it, status: 'uploading', progress: 0, error: null })));

    try {
      const fd = new FormData();
      for (const it of items) {
        // append each file and set the filename to the remote path so the firmware
        // recreates folder structure on the SD.
        fd.append('file', it.file, it.remotePath);
        // also include filename field for servers that read a separate field
        fd.append('filename', it.remotePath);
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/flory-sd-upload');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setEmergencyProgress(pct);
          }
        };
        xhr.onload = () => {
          setEmergencyUploading(false);
          setEmergencyProgress(100);
          if (xhr.status >= 200 && xhr.status < 300) {
            // try to parse response JSON
            let json: any = null;
            try { json = JSON.parse(xhr.responseText || 'null'); } catch (e) { json = null; }
            // mark all items done if response ok-like, otherwise surface the response
            if (!json || json.ok || json._raw || xhr.status === 200) {
              setUploadQueue(q => q.map(it => ({ ...it, status: 'done', progress: 100 })));
              resolve();
            } else {
              const err = JSON.stringify(json);
              setUploadQueue(q => q.map(it => ({ ...it, status: 'error', error: err })));
              setEmergencyError('Device responded with error: ' + err);
              reject(new Error(err));
            }
          } else {
            const msg = `Upload failed: ${xhr.status} ${xhr.statusText}`;
            setUploadQueue(q => q.map(it => ({ ...it, status: 'error', error: msg })));
            setEmergencyError(msg);
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => {
          setEmergencyUploading(false);
          const msg = 'Network or CORS error during upload';
          setUploadQueue(q => q.map(it => ({ ...it, status: 'error', error: msg })));
          setEmergencyError(msg);
          reject(new Error(msg));
        };
        xhr.send(fd);
      });
    } catch (e: any) {
      // already handled above
    } finally {
      setEmergencyUploading(false);
      // leave emergencyProgress at final value
    }
  }

  // Helper: convert DataTransferItemList to UploadItem[] recursively (supports folders)
  async function itemsToUploadItems(items: DataTransferItemList | DataTransferItem[]) {
    const results: UploadItem[] = [];

    async function walk(entry: any, pathPrefix: string) {
      if (!entry) return;
      if (entry.isFile) {
        const file: File = await new Promise((resolve, reject) => entry.file((f: File) => resolve(f), (err: any) => reject(err)));
        const remotePath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
        results.push({ file, remotePath, status: 'ready', progress: 0, error: null });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        // readEntries may return entries in batches; loop until empty
        let entries: any[] = [];
        do {
          entries = await new Promise<any[]>(resolve => reader.readEntries(resolve));
          for (const e of entries) {
            await walk(e, pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name);
          }
        } while (entries.length > 0);
      }
    }

    const list = Array.from(items as any);
    for (const it of list) {
      const item = it as any;
      // Prefer webkitGetAsEntry (Chrome/Safari) to get directories
      const entry = (item.webkitGetAsEntry && item.webkitGetAsEntry()) || (item.getAsEntry && item.getAsEntry && item.getAsEntry());
      if (entry) {
        // walk the entry recursively
        // root path starts empty
        await walk(entry, '');
      } else {
        // fallback for plain file items
        try {
          const f = item.getAsFile ? item.getAsFile() : (item as any) as File;
          if (f) results.push({ file: f, remotePath: (f as any).webkitRelativePath || f.name, status: 'ready', progress: 0, error: null });
        } catch (e) {
          // ignore non-file entries
        }
      }
    }

    return results;
  }

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
      // include OTA/mDNS persisted settings when provided
      if (otaHostname !== undefined) bodyObj.otaHostname = otaHostname;
      if (otaPassword !== undefined) bodyObj.otaPassword = otaPassword;
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
          <button
            className="bg-red-900 hover:bg-red-800 text-white font-bold py-2 px-4 rounded transition disabled:opacity-50"
            onClick={async () => {
              if (!confirm('DANGER: This will WIPE everything under /app on the device SD. Are you sure?')) return;
              setWipeLoading(true);
              setWipeMessage(null);
              try {
                // The device is reachable at `flory.local` in many setups (mDNS).
                // Calling it directly matches what you said works when visiting
                // `http://flory.local/sd/wipe?force=1` in the browser.
                // Use GET to match a simple browser navigation; firmware accepts this.
                const url = 'http://flory.local/sd/wipe?force=1';
                const res = await fetch(url, { method: 'POST' });
                if (!res.ok) throw new Error(`Wipe request failed: ${res.status} ${res.statusText}`);
                // firmware may return JSON or plain text; try JSON first
                const json = await res.json().catch(async () => ({ _raw: await res.text().catch(() => '') }));
                setWipeMessage(JSON.stringify(json));
              } catch (e: any) {
                setWipeMessage(e.message ?? 'Wipe error');
              } finally {
                setWipeLoading(false);
              }
            }}
            disabled={wipeLoading}
          >
            WIPE /app
          </button>
        </div>
        {pumpError && <p className="text-red-400 mb-4 font-mono">{pumpError}</p>}
  {restartMessage && <p className="text-yellow-300 mb-4 font-mono">{restartMessage}</p>}
    {wipeMessage && <p className="text-red-300 mb-4 font-mono">{wipeMessage}</p>}
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
          <label className="flex flex-col text-white">
            <span className="mb-1">OTA Hostname (mDNS)</span>
            <input
              type="text"
              className="bg-black border border-neutral-700 rounded px-2 py-1 text-white font-mono"
              value={otaHostname ?? ''}
              onChange={e => setOtaHostname(e.target.value === '' ? undefined : e.target.value)}
            />
          </label>
          <label className="flex flex-col text-white">
            <span className="mb-1">OTA Password</span>
            <input
              type="text"
              className="bg-black border border-neutral-700 rounded px-2 py-1 text-white font-mono"
              value={otaPassword ?? ''}
              onChange={e => setOtaPassword(e.target.value === '' ? undefined : e.target.value)}
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
                    if (sj.otaHostname !== undefined) setOtaHostname(sj.otaHostname);
                    if (sj.otaPassword !== undefined) setOtaPassword(sj.otaPassword);
                  }
                } catch {}
                try {
                  const c = await fetch('/api/flory-calibration');
                  if (c.ok) {
                    const cj = await c.json();
                    setCalibration(cj);
                    if (cj.last_soil_raw !== undefined) setLastSoilRaw(cj.last_soil_raw);
                    if (cj.last_water_raw !== undefined) setLastWaterRaw(cj.last_water_raw);
                    if (cj.otaHostname !== undefined) setOtaHostname(cj.otaHostname);
                    if (cj.otaPassword !== undefined) setOtaPassword(cj.otaPassword);
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

      {/* File Manager (SD upload) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl p-8 w-full max-w-md mt-8">
        <h2 className="text-xl font-bold text-white mb-4">File Manager — Upload to SD</h2>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={async e => {
              e.preventDefault();
              try {
                const items = e.dataTransfer?.items;
                if (items && items.length > 0) {
                  const list = await itemsToUploadItems(items);
                  setUploadQueue(q => [...q, ...list]);
                } else {
                  const files = Array.from(e.dataTransfer?.files || []);
                  const list: UploadItem[] = files.map(f => ({ file: f, remotePath: f.name, status: 'ready', progress: 0, error: null }));
                  setUploadQueue(q => [...q, ...list]);
                }
              } catch (err) {
                // fallback to plain files
                const files = Array.from(e.dataTransfer?.files || []);
                const list: UploadItem[] = files.map(f => ({ file: f, remotePath: f.name, status: 'ready', progress: 0, error: null }));
                setUploadQueue(q => [...q, ...list]);
              }
            }}
          className="border-2 border-dashed border-neutral-700 rounded p-6 text-center text-neutral-400 mb-4"
        >
          Drag & drop files here to upload to the device SD card
        </div>

        <div className="flex flex-col gap-2">
          {uploadQueue.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <div className="font-mono text-sm text-white">{item.file.name}</div>
                <input className="bg-black border border-neutral-700 rounded px-2 py-1 mt-1 w-full text-white" value={item.remotePath}
                  onChange={e => { const q = [...uploadQueue]; q[idx].remotePath = e.target.value; setUploadQueue(q); }}
                />
                {item.error && <div className="text-red-400 text-xs mt-1">{item.error}</div>}
              </div>
              <div className="w-36 text-right">
                {item.status === 'ready' && <button className="bg-blue-600 text-white px-2 py-1 rounded" onClick={() => uploadFile(idx)}>Upload</button>}
                {item.status === 'uploading' && <span className="text-sm text-neutral-400">{item.progress}%</span>}
                {item.status === 'done' && <span className="text-green-400">Done</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-4">
          <button className="bg-green-600 text-black font-bold py-2 px-4 rounded" onClick={() => uploadAll()}>Upload All</button>
          <button className="bg-gray-700 text-white font-bold py-2 px-4 rounded" onClick={() => setUploadQueue([])}>Clear</button>
        </div>
        {/* Emergency single-request uploader */}
        <div className="mt-4 border-t border-neutral-800 pt-4">
          <div className="text-sm text-yellow-300 font-mono mb-2">EMERGENCY: Single-request upload (destructive)</div>
          <div className="text-xs text-neutral-400 mb-2">This will attempt to send all files in a single POST. The device will wipe /app on the first file received. Only use when necessary.</div>
          <div className="flex gap-2">
            <button
              className="bg-red-700 hover:bg-red-800 text-white font-bold py-2 px-4 rounded"
              onClick={() => emergencyUploadAll()}
              disabled={emergencyUploading || uploadQueue.length === 0}
            >
              Emergency Upload All
            </button>
            <div className="flex-1 self-center text-right text-sm text-neutral-400">
              {emergencyUploading && emergencyProgress !== null && <span>Progress: {emergencyProgress}%</span>}
              {emergencyError && <div className="text-red-400 mt-1 font-mono">{emergencyError}</div>}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-10 text-xs text-white/40 font-mono">Data fetched from Flory REST API</p>
    </div>
  );
}
