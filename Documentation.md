## Flory (Smart-Pot) Device — API & Integration Reference

Summary
- Device HTTP server runs on port 80.
- Key capabilities:
  - Read sensors and runtime state (`/api/status`)
  - Configure calibration, pump and automation settings (`/api/settings`, `/api/calibration`)
  - Manual pump control (`/api/pump`)
  - Restart device (`/api/restart`)
  - SD card file handling (`/sd/...`, `/api/logs/rollover`)
  - OTA available (hosted on device) — hostname/pw persisted
- Device uses Prague timezone (Europe/Prague via POSIX TZ string). Automated watering is blocked until device has valid local time (fail-closed).

Top-level contract (2–3 bullets)
- Inputs: HTTP requests to endpoints below carrying JSON bodies or multipart form-data for uploads.
- Outputs: JSON responses with `200` or error status (400/405/500).
- Error modes: invalid JSON, missing body, SD errors (500), NTP/time unavailable (prevents auto-watering).

---

## HTTP Endpoints (complete)

All examples use `DEVICE_IP` placeholder.

GET /api/status
- Purpose: Lightweight runtime snapshot for UI dashboards.
- Method: GET
- Response (200 application/json):
  {
    "soil_percent": float,      // 0..100
    "water_percent": float,     // 0..100
    "temperature": float,       // degrees C
    "humidity": float,          // %
    "pump_on": bool
  }
- Notes: Good for polling UI (e.g., every 5–10s). Does not include internal settings.

GET /api/calibration
- Purpose: Returns calibration, last raw readings, OTA info and automation settings.
- Method: GET
- Response (200 application/json) (keys):
  {
    "soilBaseline": float,
    "soilDryRaw": int,
    "soilWetRaw": int,
    "wateringThreshold": float,
    "pumpDurationMs": int,
    "pumpPwmDuty": int,
    "autoWaterEnabled": bool,
    "deadzoneEnabled": bool,
    "deadzoneStartHour": int,  // 0-23 (inclusive start)
    "deadzoneEndHour": int,    // 0-23 (exclusive end)
    "loggingIntervalMs": int,
    "sensorUpdateInterval": int,
    "water_map": [ { "raw": int, "percent": float }, ... ],
    "last_water_raw": int,
    "last_soil_raw": int,
    "otaHostname": string,
    "otaPassword": string
  }
- Notes: `water_map` is the calibration mapping for the touch water sensor.

GET /api/settings
- Purpose: Short settings read (for populating UI form).
- Method: GET
- Response (200 application/json): similar subset to `/api/calibration` (soilBaseline, soilDryRaw, soilWetRaw, wateringThreshold, pumpDurationMs, pumpPwmDuty, sensorUpdateInterval, last raw readings, plus `autoWaterEnabled`, `deadzoneEnabled`, `deadzoneStartHour`, `deadzoneEndHour`, `loggingIntervalMs`).

POST /api/settings
- Purpose: Change persistent settings (partial updates allowed).
- Method: POST
- Content-Type: application/json
- Body: JSON — any subset of the settings below. Example:
  {
    "autoWaterEnabled": true,
    "wateringThreshold": 28.0,
    "pumpDurationMs": 6000,
    "deadzoneEnabled": true,
    "deadzoneStartHour": 22,
    "deadzoneEndHour": 6,
    "loggingIntervalMs": 60000
  }
- Response:
  - 200 {"ok":true} on success
  - 400 invalid json or missing body
- Behavior:
  - Applies and persists changes via Preferences.
  - `pumpPwmDuty` is clamped to device resolution.
  - Partial updates permitted — send only the keys to change.
- Important keys:
  - `autoWaterEnabled` (bool) — enable automated watering (still blocked until device has local time).
  - `wateringThreshold` (float) — soil percent threshold to trigger auto-watering.
  - `pumpDurationMs` (int) — duration to run pump when auto-triggered.
  - `deadzoneEnabled`, `deadzoneStartHour`, `deadzoneEndHour` — deadzone config (hour range, wrap allowed).
  - `loggingIntervalMs` — how often to append a line to the SD log.

POST /api/pump
- Purpose: Manual pump control.
- Method: POST
- Content-Type: application/json
- Body examples:
  - Start (with optional duration): {"action":"start", "durationMs": 3000}
  - Stop: {"action":"stop"}
- Response:
  - 200 {"ok":true} on success
  - 400 unknown action or missing action
- Note: Manual commands set `pumpManualUntil` so manual actions take precedence while active.

POST /api/restart
- Purpose: Restart the device.
- Method: POST
- Response: 200 {"ok":true} then device restarts.

POST /api/logs/rollover
- Purpose: Force truncate/rollover of the main log file `/log/log.txt` (for testing).
- Method: POST
- Response: 200 {"ok":true}
- Use to test truncation without waiting for month change.

GET /sd/list
- Purpose: List files on SD (path optional via query `?path=/log`).
- Method: GET
- Response: JSON array of file metadata (name, isDir, size).
- Use: discover `/log/log.txt` and static files in `/app` or `/out`.

POST /sd/upload
- Purpose: Upload files to SD (emergency uploader).
- Behavior: The server accepts file uploads in the standard Arduino `HTTPUpload` streaming callback. The handler:
  - Normalizes filename to ensure it writes under `/app/`.
  - The first incoming file triggers wiping `/app` contents (`sdWipeApp()`), then files are written streaming to SD.
- Integration notes:
  - Use multipart/form-data upload in the webapp. The device will stream the content to SD; large uploads are supported stepwise.

POST /sd/wipe?force=1
- Purpose: Explicitly wipe `/app` (requires `force=1` to prevent accidental runs).
- Response: {"ok":true}

Static file serving
- If a request doesn't match an API route, the server will try to serve a static file from `/app` or `/out` on SD (fallback to root) — good for hosting the embedded web UI.

---

## SD log behavior and format

Path: `/log/log.txt` (single file strategy)
- Each log entry is a single CSV line appended at the interval `loggingIntervalMs` (default 60000 ms).
Line format:
  timestamp,soilPercent,waterPercent,temp,hum,pumpOn,timeSynced
Note: the firmware writes a CSV header row to `/log/log.txt` whenever the file is created or truncated. Parsers should skip the first line if present.
Field meanings:
  - timestamp: "YYYY-MM-DD HH:MM:SS" when NTP/time available, otherwise "ms:<millis>"
  - soilPercent: float 0..100 (computed from calibrated mapping; no raw ADC value is logged)
  - waterPercent: float 0..100 (mapped from touch sensor; raw touch values are not logged)
  - temp: float temperature in °C (if available)
  - hum: float humidity % (if available)
  - pumpOn: 1 if pump currently on, 0 otherwise
  - timeSynced: 1 if exact NTP/local time was available when writing, else 0
- Rollover behavior:
  - When the device detects a month change (based on local time) it truncates `/log/log.txt` so the new month starts with an empty `log.txt`.
  - You can force truncation with `POST /api/logs/rollover`.
  - Logs persist across device restarts and power cycles. The firmware will not delete or rotate existing `/log` files on boot; truncation happens only on month rollover (when accurate time is available) or when `/api/logs/rollover` is invoked.

Notes on reliability & wear:
- Default `loggingIntervalMs` is 60s to reduce SD wear.
- If you want further wear-reduction, consider buffering lines in RAM and flushing fewer times per minute.

---

## SD upload protocol (emergency uploader)
- Uploads are streamed to SD via the `HTTPUpload` callbacks.
- Filenames are normalized to `/app/...` (leading slash optional).
- The first file in an upload session triggers wiping `/app` contents.
- Use multipart form data in the web app. The device writes to SD incrementally (memory efficient).

---

## Persistence: preferences JSON
- Persisted in `Preferences` under key `"cal"` as JSON.
- Structure (the device writes/reads):
  {
    "map": [ { "r": raw, "p": percent }, ... ],
    "soilBaseline": float,
    "pumpDurationMs": int,
    "soilDryRaw": int,
    "soilWetRaw": int,
    "wateringThreshold": float,
    "pumpPwmDuty": int,
    "otaHostname": string,
    "otaPassword": string,
    "sensorUpdateInterval": unsigned long,
    "autoWaterEnabled": bool,
    "deadzoneEnabled": bool,
    "deadzoneStartHour": int,
    "deadzoneEndHour": int,
    "loggingIntervalMs": unsigned long
  }

- `loadCalibrationFromPrefs()` reads and applies these values on boot. `saveCalibrationToPrefs()` writes them when settings are changed.

---

## Time & Deadzone behavior (important safety rules)
- Device configures NTP with Prague timezone (POSIX TZ string for CET/CEST).
- Automated watering (autoWaterEnabled) will NOT trigger unless device has a valid local time (getLocalTime succeeds). This is fail-closed — prevents the pump from running during a deadzone when the device is time-unknown.
- Deadzone semantics:
  - Deadzone window is [deadzoneStartHour .. deadzoneEndHour) in hours (0..23).
  - Wrap-around supported (e.g., start=22, end=6 => hours 22..23 and 0..5 are in the deadzone).
- If you prefer an alternative behavior (approximate time fallback from last successful sync), the firmware can be changed to:
  - persist last epoch+millis at sync, then use approximate time within threshold (e.g., 24h) — ask if you want me to implement.

---

## Automated watering algorithm (in code)
- Sensor loop collects `lastSoilPercent`.
- If `autoWaterEnabled`:
  - The task calls `getLocalTime()` and requires success (fail-closed).
  - Checks `deadzoneEnabled` + current hour; if in deadzone => no auto-watering.
  - If not in deadzone and `lastSoilPercent < wateringThreshold` and pump not already auto-on:
    - Set `pumpAutoUntil = millis() + pumpDurationMs`.
    - Pump task reads `pumpAutoUntil` under lock and turns LEDC/pump on until expiry.
- Manual pump actions set `pumpManualUntil`, which the pump task also honors.

---

## Key functions (for app devs & maintainers)

From the firmware:
- pumpTask(void*): manages PWM/LEDC writes, checks `pumpManualUntil` and `pumpAutoUntil`.
- sensorTask(void*): reads sensors, updates shared state variables, runs auto-watering logic and writes logs.
- networkTask(void*): WiFiManager connect, NTP config (Europe/Prague), SD init, OTA start, mDNS, and starts web routes.
- sdHandleUpload(HTTPUpload &upload): streams multipart uploads to SD under `/app`.
- sdWipeApp(): removes `/app` contents.
- sdWipeLogs(): removes files under `/log` (keeps `/log/log.txt` intentionally).
- sdTruncateLogFile(): truncates or recreates `/log/log.txt`.
- sdWriteText(path, content): append a line to `path` on SD (used for logging).
- sdReadText(path), sdListDir(dirname): SD helpers.

---

## Error & status codes
- 200 JSON success responses for normal operations.
- 400 for invalid JSON or missing body (e.g., POST without body).
- 405 for wrong HTTP method.
- 500 for SD or internal errors (server may return text/JSON).
- Device logs serial output for debugging: NTP status, SD init, rollover actions, auto-watering triggers, and when auto-watering is skipped due to missing time.

---

## Integration checklist for webapp developers

UI on load:
1. GET `/api/settings` (populate UI form)
2. GET `/api/status` for initial state display (sensors & pump)
3. Optionally GET `/api/calibration` for calibration editor.

Settings form:
- Allow editing these fields:
  - `autoWaterEnabled` (bool)
  - `wateringThreshold` (number 0..100)
  - `pumpDurationMs` (ms)
  - `deadzoneEnabled` (bool)
  - `deadzoneStartHour`, `deadzoneEndHour` (0..23)
  - `loggingIntervalMs`
  - calibration `water_map` edit (advanced)
- On save, POST `/api/settings` with changed keys only.

Pump controls:
- "Start" button => POST `/api/pump` {"action":"start","durationMs":...}
- "Stop" button => POST `/api/pump` {"action":"stop"}

Logs viewer:
- Call `/sd/list?path=/log` to list files (or directly download `/log/log.txt`).
- Show or download `/log/log.txt` contents. Note: file may be large — stream or download.

File upload (UI host):
- Use `multipart/form-data` POST to `/sd/upload`.
- The device will stream files to SD; the first file triggers wiping `/app`.

Debug & testing:
- Force log rollover for immediate testing: POST `/api/logs/rollover`.
- Restart device for fresh boot: POST `/api/restart`.
- Check `/api/status` for real time and pump state.

Security considerations
- OTA password: stored in prefs (`otaPassword`). Keep it secure.
- The device uses a simple HTTP server (no auth). If deployed on a network, consider restricting access to LAN or adding authentication in front (reverse proxy / local mesh).
- Be careful with `/sd/upload` or `/sd/wipe` endpoints — protect them if exposing device to untrusted networks.

---

## Example curl calls

Get status
```bash
curl http://DEVICE_IP/api/status
```

Get settings
```bash
curl http://DEVICE_IP/api/settings
```

Update settings (enable auto-watering)
```bash
curl -X POST http://DEVICE_IP/api/settings \
  -H "Content-Type: application/json" \
  -d '{"autoWaterEnabled":true, "wateringThreshold":30.0, "deadzoneStartHour":22, "deadzoneEndHour":6}'
```

Start pump for 3s
```bash
curl -X POST http://DEVICE_IP/api/pump \
  -H "Content-Type: application/json" \
  -d '{"action":"start","durationMs":3000}'
```

Force log rollover
```bash
curl -X POST http://DEVICE_IP/api/logs/rollover
```

List SD /log
```bash
curl 'http://DEVICE_IP/sd/list?path=/log'
```

Upload a file (example using curl multipart)
```bash
curl -X POST -F "file=@app/index.html" http://DEVICE_IP/sd/upload
```
(Note: the device expects streaming upload via `HTTPUpload` callbacks. The uploader on the webapp should use standard multipart upload; the firmware will stream the file to SD.)

---

## Best practices & recommendations
- Poll `/api/status` at modest intervals (e.g., 5–10s). Avoid aggressive polling.
- For logs, implement a streaming view or chunked download to handle larger `log.txt`.
- Display `timeSynced` flag from log lines for debugging; show a “Device time not available” indicator in UI when API log lines indicate time not synced.
- Keep webapp and device on same LAN while testing for reliable NTP resolution and uploads.

---

## Next optional enhancements I can implement
- Add `/api/time` POST so the webapp can set device time (useful for provisioning).
- Implement last-successful-time persistence + approximate fallback (allow auto-watering if approximate time is sufficiently recent).
- Implement archive mode (move previous `log.txt` to `/log/archive/YYYY-MM.txt` rather than truncating).
- Add authentication for settings/pump endpoints or a simple token header.
- Add `/api/logs` paged HTTP endpoint instead of serving raw SD file.