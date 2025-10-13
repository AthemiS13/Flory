# Flory / Smart-Pot

This repository contains firmware for the Flory Smart-Pot — an ESP32-based automated plant watering device. The firmware exposes a small HTTP API, performs sensor reads, controls a pump, logs to an SD card, and supports OTA.

This README is a compact reference for webapp developers and maintainers.

---

## Quick start

1. Build & flash the firmware to an ESP32 (use Arduino IDE or PlatformIO).
2. Insert SD card (optional but required for static web UI and logs).
3. On first boot, the device runs a WiFiManager AP if no saved credentials are present.
4. After connecting to WiFi, the device configures NTP for Europe/Prague time, starts OTA, and serves the HTTP API on port 80.

---

## Important files
- `00_globals.ino` — global settings and defaults
- `01_prefs.ino` — persistence helpers (save/load settings)
- `03_sensors.ino` — sensor task, auto-watering logic, SD logging
- `04_pump.ino` — pump control task (LEDC PWM), manual/auto control
- `05_network.ino` — WiFiManager, NTP config, HTTP routes
- `06_sd.ino` — SD helpers: read/write, upload, log truncation
- `globals.h` — public symbols and prototypes

---

## HTTP API Summary
All endpoints run on port 80. The README includes examples for common interactions.

- `GET /api/status` — runtime snapshot (soil_percent, water_percent, temperature, humidity, pump_on)
- `GET /api/calibration` — detailed settings, calibration map, OTA info
- `GET /api/settings` — small settings payload for UI
- `POST /api/settings` — update persisted settings (JSON body; partial updates allowed)
- `POST /api/pump` — manual control: `{"action":"start","durationMs":3000}` or `{"action":"stop"}`
- `POST /api/restart` — restart the ESP32
- `POST /api/logs/rollover` — truncate `/log/log.txt` (useful for testing)
- `GET /sd/list?path=/log` — list SD contents
- `POST /sd/upload` — multipart upload to `/app` (emergency uploader)
- `POST /sd/wipe?force=1` — wipe `/app` (dangerous; requires force=1)

See `API.md` or the full `README` in the repo for details and JSON examples.

---

## Logs
- Single file: `/log/log.txt`
- CSV format per line: `timestamp,soilPercent,soilRaw,waterPercent,waterRaw,temp,hum,pumpOn,timeSynced`
- Device truncates `log.txt` at month rollover (and provides `POST /api/logs/rollover` to test truncation immediately)

---

## Persistence
- Settings are stored in Preferences under `smartpot_v1` as a JSON string (see `01_prefs.ino`)
- `saveCalibrationToPrefs()` is called after settings POSTs to persist changes

---

## Safety
- Automated watering is fail-closed: it will not trigger until device has valid local time (Prague). This prevents accidental watering during unknown-time windows.
- Manual pump control is always available via `/api/pump`.

---

## Next steps
If you want, I can:
- Add `API.md` with full endpoint docs (complete JSON schemas and examples)
- Implement a small React component library (settings form, pump control, log viewer)
- Add time-set API (`POST /api/time`) for provisioning

---

For full API details and integration examples see `API.md` (I can add it if you want).