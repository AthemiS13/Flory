/*
  SmartPot - ESP32 (WebServer edition)
  - Sensor & pump logic on Core 1
  - Networking/OTA/API on Core 0
  - Uses WebServer to avoid ESPAsyncWebServer mbedtls issues
  - Persist settings in NVS (Preferences)
*/

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <WiFiManager.h>
#include <esp32-hal-ledc.h>
#include "DHT.h"

// Use esp32-hal-ledc pin-based API exposed by the ESP32 Arduino core

// -------------------- Pins (change to your wiring) --------------------
#define PUMP_PIN 14
#define SOIL_PIN 35        // analog input (0-4095)
#define WATER_TOUCH_PIN 15  // touchRead
#define DHT_PIN 32
#define DHT_TYPE DHT11
#define PUMP_LEDC_CHANNEL 0

DHT dht(DHT_PIN, DHT_TYPE);

// -------------------- Defaults / settings --------------------
struct CalPoint {
  uint16_t raw;
  float percent;
};

// default map: 6 points 0,20,40,60,80,100
std::vector<CalPoint> waterMap = {
  { 45, 0.0 }, { 19, 20.0 }, { 11, 40.0 }, { 7, 60.0 }, { 5, 80.0 }, { 1, 100.0 }
};

float soilBaseline = 0.0f;
int pumpDurationMs = 5000;
unsigned long sensorUpdateInterval = 1000;  // ms

// -------------------- Runtime state (shared) --------------------
SemaphoreHandle_t stateMutex;
volatile bool pumpState = false;
unsigned long pumpManualUntil = 0;
unsigned long pumpAutoUntil = 0;

// Pump task
TaskHandle_t pumpTaskHandle = NULL;
int lastAppliedDuty = -1;

float lastSoilPercent = 0.0;
uint16_t lastWaterRaw = 0;
float lastWaterPercent = 0.0;
float lastTemp = 0.0;
float lastHum = 0.0;
// PWM settings for pump (persisted)
int pumpPwmFreq = 5000;           // Hz
int pumpPwmResolution = 8;        // bits (0..(2^bits -1))
int pumpPwmDuty = 255;            // duty (0..(2^bits -1))

// -------------------- Persistence --------------------
Preferences prefs;
const char* PREF_NAMESPACE = "smartpot_v1";

// -------------------- Server --------------------
WebServer server(80);

// -------------------- Helpers --------------------
#define LOCK_STATE() xSemaphoreTake(stateMutex, portMAX_DELAY)
#define UNLOCK_STATE() xSemaphoreGive(stateMutex)

// linear interpolation over waterMap
float mapWaterTouch(uint16_t raw) {
  if (waterMap.size() == 0) return 0.0;
  if (raw >= waterMap.front().raw) return waterMap.front().percent;
  if (raw <= waterMap.back().raw) return waterMap.back().percent;
  for (size_t i = 0; i + 1 < waterMap.size(); ++i) {
    CalPoint a = waterMap[i];
    CalPoint b = waterMap[i + 1];
    if (raw <= a.raw && raw >= b.raw) {
      float slope = (b.percent - a.percent) / float(b.raw - a.raw);
      return a.percent + slope * float(raw - a.raw);
    }
  }
  return 0.0;
}

// -------------------- Soil sensor --------------------
float readSoilRaw() {
  const int samples = 5;
  uint32_t sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(SOIL_PIN);
    delay(5);
  }
  return float(sum) / samples;
}

float readSoilPercent() {
  float raw = readSoilRaw();
  if (soilBaseline <= 1.0f) return 0.0f;  // prevent divide by zero
  float pct = 100.0f - (raw / soilBaseline) * 100.0f;
  return constrain(pct, 0.0f, 100.0f);
}

// -------------------- Water sensor --------------------
uint16_t readWaterRaw() {
  const int samples = 5;
  uint32_t sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += touchRead(WATER_TOUCH_PIN);
    delay(5);
  }
  return uint16_t(sum / samples);
}

float readWaterPercent(uint16_t raw) {
  return constrain(mapWaterTouch(raw), 0.0f, 100.0f);
}

// -------------------- Battery --------------------
// battery measurement removed - device now uses wall power
// -------------------- Pump --------------------
void pumpOn() {
  // start pump for default duration (set timeout)
  LOCK_STATE();
  pumpManualUntil = millis() + (unsigned long)pumpDurationMs;
  UNLOCK_STATE();
}

void pumpOff() {
  // request immediate stop by clearing timers; pumpTask will do the LEDC write
  LOCK_STATE();
  pumpManualUntil = 0;
  pumpAutoUntil = 0;
  UNLOCK_STATE();
}

void startPumpMs(int ms) {
  LOCK_STATE();
  unsigned long until = millis() + (unsigned long)ms;
  // set the manual timeout directly (do not stack durations)
  pumpManualUntil = until;
  UNLOCK_STATE();
}

void stopPumpImmediate() {
  LOCK_STATE();
  pumpManualUntil = 0;
  pumpAutoUntil = 0;
  UNLOCK_STATE();
}

// Pump control task: runs every 10ms, updates LEDC and pumpState under lock
void pumpTask(void* pvParameters) {
  (void)pvParameters;
  for (;;) {
    unsigned long now = millis();
    bool shouldOn = false;
    LOCK_STATE();
    // evaluate manual timeout
    if (pumpManualUntil != 0) {
      if (now <= pumpManualUntil) {
        shouldOn = true;
      } else {
        // timeout expired — clear
        pumpManualUntil = 0;
      }
    }
    // evaluate auto timeout
    if (pumpAutoUntil != 0) {
      if (now <= pumpAutoUntil) {
        shouldOn = true;
      } else {
        pumpAutoUntil = 0;
      }
    }
    // perform LEDC writes and update pumpState here to avoid races
    if (shouldOn) {
      if (!pumpState) {
        // turning on
        ledcWrite(PUMP_PIN, pumpPwmDuty);
        lastAppliedDuty = pumpPwmDuty;
        pumpState = true;
      } else {
        // already on: if duty changed, reapply
        if (pumpPwmDuty != lastAppliedDuty) {
          ledcWrite(PUMP_PIN, pumpPwmDuty);
          lastAppliedDuty = pumpPwmDuty;
        }
      }
    } else {
      if (pumpState) {
        // turning off
        ledcWrite(PUMP_PIN, 0);
        lastAppliedDuty = -1;
        pumpState = false;
      }
    }
    UNLOCK_STATE();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// -------------------- Persistence helpers --------------------
void saveCalibrationToPrefs() {
  DynamicJsonDocument doc(1024);
  JsonArray arr = doc.createNestedArray("map");
  for (auto& p : waterMap) {
    JsonObject o = arr.createNestedObject();
    o["r"] = p.raw;
    o["p"] = p.percent;
  }
  doc["soilBaseline"] = soilBaseline;
  doc["pumpDurationMs"] = pumpDurationMs;
  doc["pumpPwmFreq"] = pumpPwmFreq;
  doc["pumpPwmResolution"] = pumpPwmResolution;
  doc["pumpPwmDuty"] = pumpPwmDuty;
  doc["sensorUpdateInterval"] = sensorUpdateInterval;
  String s;
  serializeJson(doc, s);
  prefs.putString("cal", s.c_str());
}

void loadCalibrationFromPrefs() {
  String s = prefs.getString("cal", "");
  if (s.length() == 0) return;
  DynamicJsonDocument doc(1024);
  DeserializationError err = deserializeJson(doc, s);
  if (err) {
    Serial.println("Prefs: bad cal json");
    return;
  }
  if (doc.containsKey("soilBaseline")) soilBaseline = doc["soilBaseline"].as<float>();
  if (doc.containsKey("pumpDurationMs")) pumpDurationMs = doc["pumpDurationMs"].as<int>();
  if (doc.containsKey("pumpPwmFreq")) pumpPwmFreq = doc["pumpPwmFreq"].as<int>();
  if (doc.containsKey("pumpPwmResolution")) pumpPwmResolution = doc["pumpPwmResolution"].as<int>();
  if (doc.containsKey("pumpPwmDuty")) pumpPwmDuty = doc["pumpPwmDuty"].as<int>();
  if (doc.containsKey("sensorUpdateInterval")) sensorUpdateInterval = doc["sensorUpdateInterval"].as<unsigned long>();
  if (doc["map"].is<JsonArray>()) {
    std::vector<CalPoint> newmap;
    for (JsonObject o : doc["map"].as<JsonArray>()) {
      CalPoint cp;
      cp.raw = (uint16_t)o["r"].as<int>();
      cp.percent = o["p"].as<float>();
      newmap.push_back(cp);
    }
    if (newmap.size() >= 2) waterMap = newmap;
  }
}

// -------------------- HTTP handlers --------------------
void handleStatus() {
  DynamicJsonDocument doc(256);
  LOCK_STATE();
  doc["soil_percent"] = lastSoilPercent;
  doc["water_percent"] = lastWaterPercent;
  doc["temperature"] = lastTemp;
  doc["humidity"] = lastHum;
  doc["pump_on"] = pumpState;
  UNLOCK_STATE();
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

// calibration endpoint
void handleCalibrationGet() {
  DynamicJsonDocument doc(1024);
  LOCK_STATE();
  doc["soilBaseline"] = soilBaseline;
  doc["pumpDurationMs"] = pumpDurationMs;
  doc["pumpPwmFreq"] = pumpPwmFreq;
  doc["pumpPwmResolution"] = pumpPwmResolution;
  doc["pumpPwmDuty"] = pumpPwmDuty;
  doc["sensorUpdateInterval"] = sensorUpdateInterval;
  JsonArray arr = doc.createNestedArray("water_map");
  for (auto& p : waterMap) {
    JsonObject o = arr.createNestedObject();
    o["raw"] = p.raw;
    o["percent"] = p.percent;
  }
  doc["last_water_raw"] = lastWaterRaw;
  UNLOCK_STATE();
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

// settings POST
void handleSettingsPost() {
  if (server.method() != HTTP_POST) {
    server.send(405);
    return;
  }
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"no body\"}");
    return;
  }
  String body = server.arg("plain");
  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, body)) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }
  LOCK_STATE();
  if (doc.containsKey("soilBaseline")) soilBaseline = doc["soilBaseline"].as<float>();
  if (doc.containsKey("pumpDurationMs")) pumpDurationMs = doc["pumpDurationMs"].as<int>();
  bool reconfigPwm = false;
  if (doc.containsKey("pumpPwmFreq")) {
    pumpPwmFreq = doc["pumpPwmFreq"].as<int>();
    reconfigPwm = true;
  }
  if (doc.containsKey("pumpPwmResolution")) {
    pumpPwmResolution = doc["pumpPwmResolution"].as<int>();
    reconfigPwm = true;
  }
  if (doc.containsKey("pumpPwmDuty")) {
    pumpPwmDuty = doc["pumpPwmDuty"].as<int>();
    reconfigPwm = true;
  }
  if (doc.containsKey("sensorUpdateInterval")) sensorUpdateInterval = doc["sensorUpdateInterval"].as<unsigned long>();
  if (doc.containsKey("water_map") && doc["water_map"].is<JsonArray>()) {
    std::vector<CalPoint> newmap;
    for (JsonObject o : doc["water_map"].as<JsonArray>()) {
      CalPoint cp;
      cp.raw = (uint16_t)o["raw"].as<int>();
      cp.percent = o["percent"].as<float>();
      newmap.push_back(cp);
    }
    if (newmap.size() >= 2) waterMap = newmap;
  }
  saveCalibrationToPrefs();
  // apply PWM reconfiguration if requested
  if (reconfigPwm) {
    if (pumpPwmResolution < 1) pumpPwmResolution = 1;
    if (pumpPwmResolution > 15) pumpPwmResolution = 15;
    if (pumpPwmFreq <= 0) pumpPwmFreq = 5000;
    int maxDuty = (1 << pumpPwmResolution) - 1;
    if (pumpPwmDuty < 0) pumpPwmDuty = 0;
    if (pumpPwmDuty > maxDuty) pumpPwmDuty = maxDuty;
  // switch to pin-based attach exposed by this core
  ledcAttach(PUMP_PIN, pumpPwmFreq, pumpPwmResolution);
  // clear lastAppliedDuty to force pumpTask to reapply duty if needed
  lastAppliedDuty = -1;
  }
  UNLOCK_STATE();
  server.send(200, "application/json", "{\"ok\":true}");
}

// pump POST
void handlePumpPost() {
  if (server.method() != HTTP_POST) {
    server.send(405);
    return;
  }
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"no body\"}");
    return;
  }
  String body = server.arg("plain");
  DynamicJsonDocument doc(256);
  if (deserializeJson(doc, body)) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }
  if (!doc.containsKey("action")) {
    server.send(400, "application/json", "{\"error\":\"no action\"}");
    return;
  }
  String action = doc["action"].as<String>();
  if (action == "start") {
    int duration = pumpDurationMs;
    if (doc.containsKey("durationMs")) duration = doc["durationMs"].as<int>();
    startPumpMs(duration);
    server.send(200, "application/json", "{\"ok\":true}");
  } else if (action == "stop") {
    stopPumpImmediate();
    server.send(200, "application/json", "{\"ok\":true}");
  } else server.send(400, "application/json", "{\"error\":\"unknown action\"}");
}

// restart
void handleRestart() {
  server.send(200, "application/json", "{\"ok\":true}");
  delay(100);
  ESP.restart();
}

// -------------------- Sensor Task (Core 1) --------------------
TaskHandle_t sensorTaskHandle = NULL;

void sensorTask(void* pvParameters) {
  Serial.printf("Sensor task started on core %d\n", xPortGetCoreID());
  unsigned long lastMillis = 0;
  for (;;) {
    unsigned long now = millis();
    if (now - lastMillis < sensorUpdateInterval) {
      vTaskDelay(pdMS_TO_TICKS(50));
      continue;
    }
    lastMillis = now;

    float soilPct = readSoilPercent();
    uint16_t waterRaw = readWaterRaw();
    float waterPct = readWaterPercent(waterRaw);
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    // no automatic pump-on behavior here (previous 60% test removed)

    // update shared values
    lastSoilPercent = soilPct;
    lastWaterRaw = waterRaw;
    lastWaterPercent = waterPct;
    lastTemp = t;
    lastHum = h;
    UNLOCK_STATE();
    Serial.printf("SENS soil=%.1f%% tank=%.1f%% raw=%u T=%.1fC H=%.1f%% pump=%s\n",
                  soilPct, waterPct, waterRaw, t, h, pumpState ? "ON" : "OFF");
    Serial.println(analogRead(SOIL_PIN));
  }
}

// -------------------- Network Task (Core 0) --------------------
TaskHandle_t networkTaskHandle = NULL;

void startWebRoutes() {
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/calibration", HTTP_GET, handleCalibrationGet);
  server.on("/api/settings", HTTP_POST, handleSettingsPost);
  server.on("/api/pump", HTTP_POST, handlePumpPost);
  server.on("/api/restart", HTTP_POST, handleRestart);
  server.onNotFound([]() {
    server.send(404, "text/plain", "Not found");
  });
  server.begin();
  Serial.println("HTTP server started");
}

void startOTAwithPassword(const char* pwd = nullptr) {
  ArduinoOTA.setHostname("smartpot-ota");
  if (pwd && strlen(pwd) > 0) ArduinoOTA.setPassword(pwd);
  ArduinoOTA.onStart([]() {
    Serial.println("OTA start");
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("OTA end");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("OTA %u%%\n", (progress * 100) / total);
  });
  ArduinoOTA.onError([](ota_error_t e) {
    Serial.printf("OTA err %u\n", e);
  });
  ArduinoOTA.begin();
  Serial.println("OTA ready");
}

void networkTask(void* parameter) {
  Serial.println("Network task started on core 0");

  WiFiManager wifiManager;
  wifiManager.setHostname("Flory");
  if (!wifiManager.autoConnect("Flory-Setup", "flory123")) {
    ESP.restart();
  }
  Serial.print("[WiFi] Connected! IP: ");
  Serial.println(WiFi.localIP());

  startOTAwithPassword();
  startWebRoutes();

  while (true) {
    ArduinoOTA.handle();
    server.handleClient();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// -------------------- Setup & main --------------------
void setup() {
  Serial.begin(115200);
  delay(50);

  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, LOW);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);  // was missing
  dht.begin();

  // mutex
  stateMutex = xSemaphoreCreateMutex();
  if (!stateMutex) {
    Serial.println("Failed mutex");
    while (1) vTaskDelay(pdMS_TO_TICKS(1000));
  }

  // prefs
  prefs.begin(PREF_NAMESPACE, false);
  loadCalibrationFromPrefs();

  // configure LEDC PWM for pump (MOSFET gate) using loaded prefs
  if (pumpPwmResolution < 1) pumpPwmResolution = 1;
  if (pumpPwmResolution > 15) pumpPwmResolution = 15;
  if (pumpPwmFreq <= 0) pumpPwmFreq = 5000;
  int maxDuty = (1 << pumpPwmResolution) - 1;
  if (pumpPwmDuty < 0) pumpPwmDuty = 0;
  if (pumpPwmDuty > maxDuty) pumpPwmDuty = maxDuty;
  // older API used channels; the esp32-hal-ledc we're using exposes
  // a pin-based attach: ledcAttach(pin, freq, resolution)
  ledcAttach(PUMP_PIN, pumpPwmFreq, pumpPwmResolution);
  // start with pump off: pin was already driven LOW above via digitalWrite
  // actual LEDC duty will be managed by pumpTask to avoid races

  // soil baseline calibration
  float sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(SOIL_PIN);
    delay(5);
  }
  if (soilBaseline <= 1.0f) soilBaseline = sum / 10.0f;
  Serial.printf("soilBaseline=%.1f\n", soilBaseline);

  // start sensor task on core 1
  // start pump task on core 1 (handles LEDC writes and timeouts)
  xTaskCreatePinnedToCore(pumpTask, "pumpTask", 2048, NULL, 2, &pumpTaskHandle, 1);
  // start sensor task on core 1
  xTaskCreatePinnedToCore(sensorTask, "sensorTask", 4096, NULL, 1, &sensorTaskHandle, 1);

  // start network task on core 0
  xTaskCreatePinnedToCore(networkTask, "networkTask", 8192, NULL, 1, &networkTaskHandle, 0);

  Serial.println("SmartPot initialized");
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}