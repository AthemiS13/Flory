// -------------------- HTTP handlers --------------------
#include "globals.h"
#include <ESPmDNS.h>
#include <SD.h>

// Simple CORS helper: sets minimal permissive headers for browser-based dev clients.
void setCorsHeaders() {
  // Allow any origin (dev). If you want to restrict, replace '*' with your origin.
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

void sendCors(int code) {
  setCorsHeaders();
  server.send(code);
}

void sendCors(int code, const char* contentType, const String& body) {
  setCorsHeaders();
  server.send(code, contentType, body);
}


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
  sendCors(200, "application/json", out);
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
  sendCors(200, "application/json", out);
}

// settings POST
void handleSettingsPost() {
  if (server.method() != HTTP_POST) {
  sendCors(405);
    return;
  }
  if (!server.hasArg("plain")) {
  sendCors(400, "application/json", "{\"error\":\"no body\"}");
    return;
  }
  String body = server.arg("plain");
  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, body)) {
  sendCors(400, "application/json", "{\"error\":\"invalid json\"}");
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
  sendCors(200, "application/json", "{\"ok\":true}");
}

// pump POST
void handlePumpPost() {
  if (server.method() != HTTP_POST) {
  sendCors(405);
    return;
  }
  if (!server.hasArg("plain")) {
  sendCors(400, "application/json", "{\"error\":\"no body\"}");
    return;
  }
  String body = server.arg("plain");
  DynamicJsonDocument doc(256);
  if (deserializeJson(doc, body)) {
  sendCors(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }
  if (!doc.containsKey("action")) {
  sendCors(400, "application/json", "{\"error\":\"no action\"}");
    return;
  }
  String action = doc["action"].as<String>();
  if (action == "start") {
    int ms = pumpDurationMs;
    if (doc.containsKey("durationMs")) ms = doc["durationMs"].as<int>();
    startPumpMs(ms);
  sendCors(200, "application/json", "{\"ok\":true}");
  } else if (action == "stop") {
    stopPumpImmediate();
  sendCors(200, "application/json", "{\"ok\":true}");
  } else {
  sendCors(400, "application/json", "{\"error\":\"unknown action\"}");
  }
}

// restart endpoint
void handleRestart() {
  sendCors(200, "application/json", "{\"ok\":true}");
  delay(500);
  ESP.restart();
}

// Helper: determine content type from file extension
String getContentType(const String& path) {
  if (path.endsWith(".html")) return "text/html";
  else if (path.endsWith(".css")) return "text/css";
  else if (path.endsWith(".js")) return "application/javascript";
  else if (path.endsWith(".json")) return "application/json";
  else if (path.endsWith(".png")) return "image/png";
  else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  else if (path.endsWith(".gif")) return "image/gif";
  else if (path.endsWith(".svg")) return "image/svg+xml";
  else if (path.endsWith(".ico")) return "image/x-icon";
  else if (path.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

// Static file serving with compression support
bool handleFileRead() {
  String path = server.uri();
  Serial.printf("handleFileRead: %s\n", path.c_str());

  // Check Accept-Encoding header for br and gzip support
  bool brOk = false;
  bool gzipOk = false;
  if (server.hasHeader("Accept-Encoding")) {
    String enc = server.header("Accept-Encoding");
    brOk = enc.indexOf("br") >= 0;
    gzipOk = enc.indexOf("gzip") >= 0;
  }

  // Build the file path directly from /app/out
  String filePath;
  if (path == "/") {
    filePath = "/app/out/index.html";
  } else {
    filePath = String("/app/out") + path;
  }

  // Check for compressed versions: prefer br, then gz, then original
  String servePath;
  String contentEncoding = "";
  String brPath = filePath + ".br";
  String gzPath = filePath + ".gz";

  // Helper lambda to check and select compressed/original file
  auto chooseFile = [&](const String &candidate) -> bool {
    String b = candidate + ".br";
    String g = candidate + ".gz";
    if (brOk && SD.exists(b.c_str())) {
      servePath = b;
      contentEncoding = "br";
      return true;
    }
    if (gzipOk && SD.exists(g.c_str())) {
      servePath = g;
      contentEncoding = "gzip";
      return true;
    }
    if (SD.exists(candidate.c_str())) {
      servePath = candidate;
      contentEncoding = "";
      return true;
    }
    return false;
  };

  // Try the exact path first
  if (!chooseFile(filePath)) {
    // Try common alternatives for clean URLs: append .html
    String htmlPath = filePath + ".html";
    if (!chooseFile(htmlPath)) {
      // Try as directory index: /foo -> /foo/index.html
      String idxPath = filePath;
      if (!idxPath.endsWith("/")) idxPath += "/";
      idxPath += "index.html";
      if (!chooseFile(idxPath)) {
        Serial.printf("File not found: %s\n", filePath.c_str());
        return false;
      } else {
        // ensure contentType is detected from the real served file path
        filePath = idxPath;
      }
    } else {
      filePath = htmlPath;
    }
  }

  File file = SD.open(servePath.c_str());
  if (!file) {
    Serial.printf("Failed to open: %s\n", servePath.c_str());
    return false;
  }
  
  String contentType = getContentType(filePath);

  // ETag: simple size-based tag for caching
  String etag = String("\"") + String(file.size(), HEX) + String("\"");
  if (server.hasHeader("If-None-Match")) {
    String inm = server.header("If-None-Match");
    if (inm == etag) {
      server.sendHeader("ETag", etag);
    setCorsHeaders();
  setCorsHeaders();
  server.send(304);
      file.close();
      return true;
    }
  }

  // Set headers for optimal performance
  if (contentEncoding.length() > 0) {
    server.sendHeader("Content-Encoding", contentEncoding);
  }
  server.sendHeader("Vary", "Accept-Encoding");
  server.sendHeader("ETag", etag);
  server.sendHeader("Connection", "keep-alive");
  
  // Aggressive caching for static assets, no-cache for HTML
  if (filePath.endsWith(".html")) {
    server.sendHeader("Cache-Control", "no-cache, must-revalidate");
  } else {
    server.sendHeader("Cache-Control", "public, max-age=31536000, immutable");
  }

  Serial.printf("Serving: %s (%s)\n", servePath.c_str(), contentEncoding.length() > 0 ? contentEncoding.c_str() : "uncompressed");
  setCorsHeaders();
  server.streamFile(file, contentType.c_str());
  file.close();
  return true;
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
  sendCors(500, "application/json", "{\"error\":\"failed to open path\"}");
    return;
  }
  if (!dir.isDirectory()) {
  sendCors(400, "application/json", "{\"error\":\"path is not a directory\"}");
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
  sendCors(200, "application/json", out);
}

void startWebRoutes() {
  // Handle CORS preflight requests globally
  server.on("/", HTTP_OPTIONS, []() {
    setCorsHeaders();
  sendCors(200);
  });
  server.on("/api/:path*", HTTP_OPTIONS, []() {
    setCorsHeaders();
  sendCors(200);
  });
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/calibration", HTTP_GET, handleCalibrationGet);
  // SD upload endpoint (delegate to SD helper)
  server.on("/sd/upload", HTTP_POST, []() {
  sendCors(200, "application/json", "{\"ok\":true}");
  }, []() {
    HTTPUpload& upload = server.upload();
    sdHandleUpload(upload);
  });

  // Explicit wipe endpoint: POST /sd/wipe?force=1 will remove all files under /app
  server.on("/sd/wipe", HTTP_POST, []() {
    // require explicit force to avoid accidental wipes
    if (!(server.hasArg("force") && server.arg("force") == "1")) {
  sendCors(400, "application/json", "{\"error\":\"missing force=1\"}");
      return;
    }
    sdWipeApp();
  sendCors(200, "application/json", "{\"ok\":true}\n");
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
  sendCors(200, "application/json", out);
  });
  server.on("/sd/list", HTTP_GET, handleSdList);
  server.on("/api/settings", HTTP_POST, handleSettingsPost);
  server.on("/api/logs/rollover", HTTP_POST, []() {
    // force truncate the main log file (useful for testing)
    sdTruncateLogFile();
  sendCors(200, "application/json", "{\"ok\":true}");
  });
  server.on("/api/pump", HTTP_POST, handlePumpPost);
  server.on("/api/restart", HTTP_POST, handleRestart);
  server.onNotFound([]() {
    // If this is a CORS preflight (OPTIONS), respond OK so browsers can proceed.
    if (server.method() == HTTP_OPTIONS) {
      setCorsHeaders();
      server.send(200);
      return;
    }
    // Try serving static file from SD first
    if (handleFileRead()) return;
    sendCors(404, "text/plain", "Not found");
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
  // Try to obtain NTP time for a short period so sensor task can rely on local time.
  Serial.println("Starting NTP sync... checking local time availability...");
  struct tm timeinfo;
  bool timeOk = false;
  unsigned long startWait = millis();
  const unsigned long maxWait = 10000; // wait up to 10s for time sync
  while (millis() - startWait < maxWait) {
    if (getLocalTime(&timeinfo, 2000)) {
      timeOk = true;
      break;
    }
    Serial.println("NTP: local time not yet available, retrying...");
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
  if (timeOk) {
    Serial.println("NTP: local time synced");
  } else {
    Serial.println("NTP: local time NOT available after wait; sensor task may skip auto-watering until time is available");
  }
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
  // Be defensive: print hostname/IP, retry once if begin() fails, and report details.
  String mdnsHost = otaHostname;
  if (mdnsHost.length() == 0) {
    // fallback to a sensible default
    mdnsHost = String("flory");
  }
  Serial.printf("mDNS: attempting to start with hostname='%s' IP=%s\n", mdnsHost.c_str(), WiFi.localIP().toString().c_str());
  bool mdnsStarted = MDNS.begin(mdnsHost.c_str());
  if (!mdnsStarted) {
    // try to stop any leftover responder and try once more
    Serial.println("mDNS: initial begin() failed, trying MDNS.end() and retrying");
    MDNS.end();
    delay(100);
    mdnsStarted = MDNS.begin(mdnsHost.c_str());
  }
  if (mdnsStarted) {
    Serial.printf("mDNS responder started: %s.local\n", mdnsHost.c_str());
  } else {
    Serial.printf("mDNS start failed (hostname='%s', IP=%s)\n", mdnsHost.c_str(), WiFi.localIP().toString().c_str());
  }
  startWebRoutes();

  while (true) {
    ArduinoOTA.handle();
    server.handleClient();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
