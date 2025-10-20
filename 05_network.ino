// -------------------- HTTP handlers --------------------
#include "globals.h"
#include <ESPmDNS.h>
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
  doc["soilDryRaw"] = soilDryRaw;
  doc["soilWetRaw"] = soilWetRaw;
  doc["wateringThreshold"] = wateringThreshold;
  doc["pumpDurationMs"] = pumpDurationMs;
  doc["pumpPwmDuty"] = pumpPwmDuty;
  doc["autoWaterEnabled"] = autoWaterEnabled;
  doc["deadzoneEnabled"] = deadzoneEnabled;
  doc["deadzoneStartHour"] = deadzoneStartHour;
  doc["deadzoneEndHour"] = deadzoneEndHour;
  doc["loggingIntervalMs"] = loggingIntervalMs;
  doc["sensorUpdateInterval"] = sensorUpdateInterval;
  JsonArray arr = doc.createNestedArray("water_map");
  for (auto& p : waterMap) {
    JsonObject o = arr.createNestedObject();
    o["raw"] = p.raw;
    o["percent"] = p.percent;
  }
  doc["last_water_raw"] = lastWaterRaw;
  doc["last_soil_raw"] = lastSoilRaw;
  doc["otaHostname"] = otaHostname.c_str();
  doc["otaPassword"] = otaPassword.c_str();
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
  if (doc.containsKey("soilDryRaw")) soilDryRaw = (uint16_t)doc["soilDryRaw"].as<int>();
  if (doc.containsKey("soilWetRaw")) soilWetRaw = (uint16_t)doc["soilWetRaw"].as<int>();
  if (doc.containsKey("wateringThreshold")) wateringThreshold = doc["wateringThreshold"].as<float>();
  if (doc.containsKey("pumpDurationMs")) pumpDurationMs = doc["pumpDurationMs"].as<int>();
  if (doc.containsKey("autoWaterEnabled")) autoWaterEnabled = doc["autoWaterEnabled"].as<bool>();
  if (doc.containsKey("deadzoneEnabled")) deadzoneEnabled = doc["deadzoneEnabled"].as<bool>();
  if (doc.containsKey("deadzoneStartHour")) deadzoneStartHour = (uint8_t)doc["deadzoneStartHour"].as<int>();
  if (doc.containsKey("deadzoneEndHour")) deadzoneEndHour = (uint8_t)doc["deadzoneEndHour"].as<int>();
  if (doc.containsKey("loggingIntervalMs")) loggingIntervalMs = doc["loggingIntervalMs"].as<unsigned long>();
  if (doc.containsKey("otaHostname")) otaHostname = String((const char*)doc["otaHostname"]);
  if (doc.containsKey("otaPassword")) otaPassword = String((const char*)doc["otaPassword"]);
  // Only accept duty from API; frequency and resolution are internal-only
  bool dutyChanged = false;
  if (doc.containsKey("pumpPwmDuty")) {
    pumpPwmDuty = doc["pumpPwmDuty"].as<int>();
    dutyChanged = true;
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
  // If duty changed, clamp to allowed range and force pumpTask to reapply duty
  if (dutyChanged) {
    if (pumpPwmResolution < 1) pumpPwmResolution = 1;
    if (pumpPwmResolution > 15) pumpPwmResolution = 15;
    int maxDuty = (1 << pumpPwmResolution) - 1;
    if (pumpPwmDuty < 0) pumpPwmDuty = 0;
    if (pumpPwmDuty > maxDuty) pumpPwmDuty = maxDuty;
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

// --- Static file serving from SD card ---------------------------------
#include <SD.h>

String getContentType(const String &filename) {
  if (filename.endsWith(".htm") || filename.endsWith(".html")) return "text/html";
  if (filename.endsWith(".css")) return "text/css";
  if (filename.endsWith(".js")) return "application/javascript";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  if (filename.endsWith(".ico")) return "image/x-icon";
  if (filename.endsWith(".svg")) return "image/svg+xml";
  if (filename.endsWith(".json")) return "application/json";
  if (filename.endsWith(".txt")) return "text/plain";
  if (filename.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}
bool handleFileRead() {
  String path = server.uri();
  if (path == "/") path = "/index.html";
  if (path.endsWith("/")) path += "index.html";
  Serial.printf("Web request for: %s\n", path.c_str());

  // Try a few candidate locations on the SD card. Prefer `/app` where
  // the emergency uploader writes files. Fallback to root or `/out`.
  const char* candidates[] = { "/app", nullptr, "/app/out" };
  for (int i = 0; i < 3; ++i) {
    String candidatePath;
    if (candidates[i]) candidatePath = String(candidates[i]) + path;
    else candidatePath = path;

    Serial.printf("  trying: %s\n", candidatePath.c_str());
    if (!SD.exists(candidatePath.c_str())) continue;
    File file = SD.open(candidatePath.c_str());
    if (!file) {
      Serial.printf("  exists but failed to open: %s\n", candidatePath.c_str());
      continue;
    }
    String contentType = getContentType(candidatePath);
    Serial.printf("  serving: %s\n", candidatePath.c_str());
    server.streamFile(file, contentType.c_str());
    file.close();
    return true;
  }
  return false;
}

// Debug: list SD root contents as JSON
void handleSdList() {
  String path = "/";
  if (server.hasArg("path")) {
    path = server.arg("path");
    // ensure leading slash
    if (!path.startsWith("/")) path = String("/") + path;
  }
  DynamicJsonDocument doc(4096);
  JsonArray arr = doc.to<JsonArray>();
  File dir = SD.open(path.c_str());
  if (!dir) {
    server.send(500, "application/json", "{\"error\":\"failed to open path\"}");
    return;
  }
  if (!dir.isDirectory()) {
    server.send(400, "application/json", "{\"error\":\"path is not a directory\"}");
    dir.close();
    return;
  }
  File file = dir.openNextFile();
  while (file) {
    JsonObject o = arr.createNestedObject();
    o["name"] = String(file.name());
    o["isDir"] = file.isDirectory();
    if (!file.isDirectory()) o["size"] = (long)file.size();
    file = dir.openNextFile();
  }
  dir.close();
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void startWebRoutes() {
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/calibration", HTTP_GET, handleCalibrationGet);
  // SD upload endpoint (delegate to SD helper)
  server.on("/sd/upload", HTTP_POST, []() {
    server.send(200, "application/json", "{\"ok\":true}");
  }, []() {
    HTTPUpload& upload = server.upload();
    sdHandleUpload(upload);
  });

  // Explicit wipe endpoint: POST /sd/wipe?force=1 will remove all files under /app
  server.on("/sd/wipe", HTTP_POST, []() {
    // require explicit force to avoid accidental wipes
    if (!(server.hasArg("force") && server.arg("force") == "1")) {
      server.send(400, "application/json", "{\"error\":\"missing force=1\"}");
      return;
    }
    sdWipeApp();
    server.send(200, "application/json", "{\"ok\":true}\n");
  });
  server.on("/api/settings", HTTP_GET, []() {
    DynamicJsonDocument doc(512);
    LOCK_STATE();
    doc["soilBaseline"] = soilBaseline;
    doc["soilDryRaw"] = soilDryRaw;
    doc["soilWetRaw"] = soilWetRaw;
    doc["wateringThreshold"] = wateringThreshold;
    doc["pumpDurationMs"] = pumpDurationMs;
  doc["pumpPwmDuty"] = pumpPwmDuty;
    doc["sensorUpdateInterval"] = sensorUpdateInterval;
  doc["last_soil_raw"] = lastSoilRaw;
  doc["last_water_raw"] = lastWaterRaw;
  doc["autoWaterEnabled"] = autoWaterEnabled;
  doc["deadzoneEnabled"] = deadzoneEnabled;
  doc["deadzoneStartHour"] = deadzoneStartHour;
  doc["deadzoneEndHour"] = deadzoneEndHour;
  doc["loggingIntervalMs"] = loggingIntervalMs;
    UNLOCK_STATE();
    String out;
    serializeJson(doc, out);
    server.send(200, "application/json", out);
  });
  server.on("/sd/list", HTTP_GET, handleSdList);
  server.on("/api/settings", HTTP_POST, handleSettingsPost);
  server.on("/api/logs/rollover", HTTP_POST, []() {
    // force truncate the main log file (useful for testing)
    sdTruncateLogFile();
    server.send(200, "application/json", "{\"ok\":true}");
  });
  server.on("/api/pump", HTTP_POST, handlePumpPost);
  server.on("/api/restart", HTTP_POST, handleRestart);
  server.onNotFound([]() {
    // Try serving static file from SD first
    if (handleFileRead()) return;
    server.send(404, "text/plain", "Not found");
  });
  server.begin();
  Serial.println("HTTP server started");
}

void startOTAwithPassword(const char* pwd = nullptr) {
  // Use persisted hostname/password if provided
  ArduinoOTA.setHostname(otaHostname.c_str());
  const char* usePwd = pwd;
  if ((usePwd == nullptr || strlen(usePwd) == 0) && otaPassword.length() > 0) usePwd = otaPassword.c_str();
  if (usePwd && strlen(usePwd) > 0) ArduinoOTA.setPassword(usePwd);
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

  // Configure timezone to Europe/Prague (CET/CEST) and start SNTP/NTP.
  // TZ string: CET-1CEST,M3.5.0/2,M10.5.0/3  -> follows POSIX TZ format
  const char* tz = "CET-1CEST,M3.5.0/2,M10.5.0/3";
  setenv("TZ", tz, 1);
  tzset();
  configTzTime(tz, "pool.ntp.org", "time.nist.gov");
  Serial.println("NTP configured (Europe/Prague TZ)");

  // Initialize SD for static file serving (best effort)
  if (sdInit()) {
    Serial.println("SD initialized for web serving");
  } else {
    Serial.println("SD not initialized; web static files disabled");
  }

  startOTAwithPassword();
  // start mDNS so the device is discoverable as <otaHostname>.local
  if (MDNS.begin(otaHostname.c_str())) {
    Serial.printf("mDNS responder started: %s.local\n", otaHostname.c_str());
  } else {
    Serial.println("mDNS start failed");
  }
  startWebRoutes();

  while (true) {
    ArduinoOTA.handle();
    server.handleClient();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
