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

SD file manager (bash-like):
- `POST /sd/cd` — change directory, body: {"path":".."} or {"path":"/log"}
- `GET /sd/list` — list contents of the current directory (CWD) when `path` is omitted
- `GET /sd/open?path=...&offset=0&max=16384` — open a slice of a file as text/plain (headers expose size/offset/truncated)
- `POST /sd/rm` — remove file or directory; body: {"path":"...","recursive":true}

See `API.md` or the full `README` in the repo for details and JSON examples.

---

## Logs
- Single file: `/log/log.txt`
CSV format per line: `timestamp,soilPercent,waterPercent,temp,hum,pumpOn,timeSynced`
The firmware writes a CSV header row to `/log/log.txt` when the file is created or truncated, so parsers can rely on column order.
Device truncates `log.txt` at month rollover (and provides `POST /api/logs/rollover` to test truncation immediately)
Logs persist across device restarts and power cycles; the firmware will not delete or rotate existing log files on boot. Truncation happens only on month rollover (when time is known) or when `/api/logs/rollover` is called.

---

## Uploader app (folder-based)

There is a separate Next.js uploader at `uploader-app/` for pushing the exported web UI (`out/` folder) to the device.

Highlights:
- Drag-and-drop the `out/` folder or select it; no ZIP required
- Uploads files sequentially to `/sd/upload`, waits for per-file 200 (basic ACK)
- Automatically disables SD logging during upload (reduces SD contention), wipes `/app`, uploads, restores logging, and restarts device
- Device URL is fixed to `http://flory.local`

Run it:
```bash
cd uploader-app
npm install
npm run dev
```
Then open the printed URL and drop your `out/` folder.

---

## Files page — Terminal UI

The web app’s Files page provides a terminal-like interface for SD navigation using these commands:
- `ls [path]` — list directory (defaults to your CWD)
- `cd [path]` — change directory (`..` supported)
- `open <path> [--max N]` — open file contents (first 16KB by default)
- `rm [-r] <path>` — remove file or directory (use `-r` for directories)

Two auxiliary buttons are available above the terminal:
- Force month rollover (POST `/api/logs/rollover`)
- Wipe `/app` (POST `/sd/wipe?force=1`)

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

---

## Hardware: SD card wiring

The firmware uses the Arduino `SD` library in SPI mode with `SD_CS_PIN = 4`.

Recommended wiring for an ESP32 DevKit (VSPI / default SPI pins):

- `3V3` (ESP32)  -> `VCC` (SD module 3.3V)
- `GND`         -> `GND`
- `GPIO18`      -> `SCK` (CLK)
- `GPIO23`      -> `MOSI` (DI)
- `GPIO19`      -> `MISO` (DO)
- `GPIO4`       -> `CS` (chip select)

Notes:
- Use 3.3V power for the SD card/module. Supplying 5V to a plain micro-SD socket can damage it.
- Many SD breakout boards include a 3.3V regulator and level shifters. If yours does not, wire only 3.3V signals or add level shifting.
- Keep wiring short and solid. If the SD module exposes `CD`/`CARD_DETECT` or `WP`, you can leave them disconnected unless you implement logic for them.

How to test:
1. Insert a micro-SD card and power the device.
2. Open serial monitor at 115200 baud.
3. On boot you should see either `SD initialized.` or `SD init failed!`.

If you see `SD init failed!` verify VCC/GND, CS pin (GPIO4), and SPI wiring; try another card or shorter wires.

---

## Resetting / wiping saved Wi‑Fi credentials

The device uses `WiFiManager` and the ESP32 WiFi stack (NVS) to store network credentials. There are two convenient ways to wipe the saved Wi‑Fi credentials so the device re-enters the setup AP (`Flory-Setup`) on next boot.

1) Quick USB flash (recommended when you have physical access)

Flash this small sketch (Arduino IDE / PlatformIO / arduino-cli). It erases Wi‑Fi data and restarts:

```cpp
#include <WiFi.h>
#include <WiFiManager.h>

void setup() {
	Serial.begin(115200);
	delay(500);
	Serial.println("Wiping stored Wi-Fi credentials...");

	WiFiManager wm;
	wm.resetSettings();          // clears WiFiManager data in NVS

	WiFi.disconnect(true, true); // erase WiFi credentials from WiFi stack

	delay(500);
	Serial.println("Done. Restarting...");
	ESP.restart();
}

void loop() {}
```

After flashing and reboot the device will start the AP `Flory-Setup` (password `flory123`) so you can reconfigure Wi‑Fi.

2) Remote wipe via HTTP endpoint (add to firmware)

If you prefer to trigger a wipe remotely, add an authenticated endpoint to the firmware that calls `WiFiManager::resetSettings()` and `WiFi.disconnect(true,true)` and then restarts. Example handler to register in `startWebRoutes()` or where routes are created:

```cpp
server.on("/wifi/reset", HTTP_POST, []() {
	Serial.println("[HTTP] POST /wifi/reset received - wiping Wi-Fi settings");
	WiFiManager wm;
	wm.resetSettings();
	WiFi.disconnect(true, true);
	sendCors(200, "application/json", "{\"ok\":true, \"restarting\":true}");
	delay(200);
	ESP.restart();
});
```

Important: protect this endpoint (e.g., require a token or restrict to local network) before exposing it on untrusted networks.

---

## AP credentials (factory/setup)

If no Wi‑Fi is configured, the device runs a setup AP:

- SSID: `Flory-Setup`
- Password: `flory123`

You can change those values by modifying the `wifiManager.autoConnect("Flory-Setup", "flory123")` call in `05_network.ino` and reflashing.