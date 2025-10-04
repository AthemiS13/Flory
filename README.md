# 🌿 Flory ESP32 REST API Documentation

This document provides a complete technical reference for the **Flory** device's built-in REST API, which runs directly on the ESP32's web server.

  - **Version:** 1.0
  - **Device firmware:** Flory ESP32 WebServer Edition

-----

## 🔧 Overview

The Flory API offers a simple HTTP-based interface for **monitoring, configuring, and controlling** your Flory device.

It provides functionality for:

  * Real-time sensor data (**soil moisture**, **tank level**, **temperature**, **humidity**, **battery voltage**).
  * **Pump control** (manual trigger/stop).
  * Device configuration (calibration map, timing, intervals).
  * **OTA firmware updates** (via Arduino IDE).
  * Auto Wi-Fi connection with a fallback **Access Point** for initial setup.

All endpoints are served over plain HTTP on port **80**.

-----

## 📡 Base URL and Connectivity

The base URL changes depending on the device's connection status.

### Normal Wi-Fi Mode

When the device is successfully connected to your Wi-Fi network:

```
http://<DEVICE_IP>/api/...
```

### Access Point (AP) Mode - Fallback

If the Wi-Fi connection fails, the device enters Access Point mode for initial setup or troubleshooting:
| Property | Value |
| :--- | :--- |
| **SSID** | `Flory-Setup` |
| **Password** | `smartpot123` |
| **IP Address** | `192.168.4.1` |

In AP mode, the base URL is:

```
http://192.168.4.1/api/...
```

-----

## 🔐 Authentication

No authentication is currently required for accessing or controlling the device.

-----

## 📘 API Endpoints Reference

### 1\. `GET /api/status`

**Description:** Returns the current live sensor data and pump state.

| Key | Type | Description |
| :--- | :--- | :--- |
| **`soil_percent`** | `float` | Estimated soil moisture (0–100%). |
| **`water_percent`** | `float` | Tank water level based on the calibrated map (0–100%). |
| **`temperature`** | `float` | Ambient temperature ($\text{°C}$, from DHT sensor). |
| **`humidity`** | `float` | Relative humidity (%). |
| **`pump_on`** | `boolean` | Whether the water pump is currently active. |
| **`battery_v`** | `float` | Battery voltage in volts (V). |

**Response Example:**

```json
{
  "soil_percent": 46.3,
  "water_percent": 78.2,
  "temperature": 23.1,
  "humidity": 52.4,
  "pump_on": false,
  "battery_v": 4.12
}
```

-----

### 2\. `GET /api/calibration`

**Description:** Returns the full current calibration and configuration data, including the latest raw sensor readings used for live calibration visualization.

| Key | Type | Description |
| :--- | :--- | :--- |
| **`soilBaseline`** | `float` | Reference raw analog value for dry soil (used for soil moisture normalization). |
| **`pumpDurationMs`** | `int` | Default pump run time for automatic watering (milliseconds). |
| **`sensorUpdateInterval`** | `int` | Interval between sensor readings (milliseconds). |
| **`water_map`** | `array` | Calibration table mapping raw touch readings to tank fill percentages. |
| **`last_water_raw`** | `int` | Latest raw touch sensor value (for manual calibration visualization). |

**Response Example:**

```json
{
  "soilBaseline": 2330.0,
  "pumpDurationMs": 5000,
  "sensorUpdateInterval": 1000,
  "water_map": [
    { "raw": 45, "percent": 0.0 },
    { "raw": 19, "percent": 20.0 },
    { "raw": 11, "percent": 40.0 },
    { "raw": 7, "percent": 60.0 },
    { "raw": 5, "percent": 80.0 },
    { "raw": 1, "percent": 100.0 }
  ],
  "last_water_raw": 7
}
```

-----

### 3\. `POST /api/settings`

**Description:** Update calibration and system settings. These settings are saved to **NVS (Non-Volatile Storage)** and persist after a reboot.

**Modifiable Fields:**

  * The 6-point water map (`water_map`).
  * The soil baseline (`soilBaseline`).
  * Pump duration (`pumpDurationMs`).
  * Sensor update interval (`sensorUpdateInterval`).

**Notes:**

  * All parameters are **optional**—only send the values you wish to change.
  * The new settings take effect immediately and are persisted automatically in flash.

**Request Body Example:**

```json
{
  "soilBaseline": 2300,
  "pumpDurationMs": 4000,
  "sensorUpdateInterval": 2000,
  "water_map": [
    { "raw": 45, "percent": 0.0 },
    { "raw": 19, "percent": 20.0 },
    { "raw": 11, "percent": 40.0 },
    { "raw": 7, "percent": 60.0 },
    { "raw": 5, "percent": 80.0 },
    { "raw": 1, "percent": 100.0 }
  ]
}
```

**Response:**

```json
{ "ok": true }
```

-----

### 4\. `POST /api/pump`

**Description:** Manually control the water pump.

**Supported Actions:**

  * **`"start"`**: Starts the pump.
      * *Default duration:* Uses the value set in `pumpDurationMs`.
      * *Custom duration:* Can be specified via `durationMs`.
  * **`"stop"`**: Stops the pump immediately.

**Notes:**

  * Manual actions **override** the automatic control logic until the action is completed.
  * The automatic logic will run the pump if the tank level is $\ge 60\%$.

**Request Examples:**

| Action | Request Body | Description |
| :--- | :--- | :--- |
| Start (default) | `{"action": "start"}` | Start for the duration set in settings. |
| Start (custom) | `{"action": "start", "durationMs": 3000}` | Start for 3 seconds. |
| Stop | `{"action": "stop"}` | Stop immediately. |

**Response:**

```json
{ "ok": true }
```

-----

### 5\. `POST /api/restart`

**Description:** Safely restarts the ESP32 device.

**Request:** No body required.

**Response:**

```json
{ "ok": true }
```

*The device restarts shortly after responding.*

-----

## 💧 Automatic Pump Logic

The firmware includes built-in logic to automatically trigger the pump based on the water tank level:

```cpp
if (waterPct >= 60.0f) {
  pumpAutoUntil = millis() + pumpDurationMs;
  pumpOn();
}
```

This means the device will water itself whenever the tank is $\ge 60\%$ full, using the configured `pumpDurationMs`. This behavior can be customized by modifying the firmware (e.g., to respond to soil moisture instead).

-----

## 🔄 Persistent Storage (NVS)

All adjustable parameters are saved in the ESP32's **NVS Preferences** under the namespace `"smartpot_v1"`.

| Key | Storage Type | Content |
| :--- | :--- | :--- |
| **`cal`** | JSON string | Contains all calibration and settings. |

These values are persistent across reboots and OTA updates.

-----

## ⚙️ Over-The-Air (OTA) Updates

OTA firmware updates are enabled for convenience.

  * The device appears as a network port in the Arduino IDE once connected to the same network.
  * **Default OTA Hostname:** `flory-ota`
  * No password is required by default.

-----

## 🧠 Internal Thread Model

The firmware utilizes FreeRTOS to manage tasks across the ESP32's two cores:

| Core | Task | Purpose |
| :--- | :--- | :--- |
| **Core 0** | `NetworkTask` | Handles Wi-Fi, OTA, and the HTTP server. |
| **Core 1** | `SensorTask` | Manages sensor polling and automatic pump logic. |

Communication between tasks uses a FreeRTOS **mutex** for thread-safe data sharing.

-----

## 🧩 Example Usage

### Get Sensor Data (cURL)

```bash
curl http://192.168.1.42/api/status
```

### Update Settings (cURL)

This example updates the pump duration and sensor interval.

```bash
curl -X POST http://192.168.1.42/api/settings \
  -H "Content-Type: application/json" \
  -d '{"pumpDurationMs":7000,"sensorUpdateInterval":2000}'
```

### Manually Run Pump for 3s (cURL)

```bash
curl -X POST http://192.168.1.42/api/pump \
  -H "Content-Type: application/json" \
  -d '{"action":"start","durationMs":3000}'
```

-----

## 📄 HTTP Status Codes

| Code | Meaning |
| :--- | :--- |
| **200** | Success |
| **400** | Invalid request or malformed JSON |
| **404** | Endpoint not found |
| **405** | Wrong method (e.g., GET instead of POST) |
| **500** | Internal error (rare) |
