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
  doc["soilDryRaw"] = soilDryRaw;
  doc["soilWetRaw"] = soilWetRaw;
  doc["wateringThreshold"] = wateringThreshold;
  doc["pumpPwmDuty"] = pumpPwmDuty;
  doc["otaHostname"] = otaHostname.c_str();
  doc["otaPassword"] = otaPassword.c_str();
  doc["sensorUpdateInterval"] = sensorUpdateInterval;
  doc["autoWaterEnabled"] = autoWaterEnabled;
  doc["deadzoneEnabled"] = deadzoneEnabled;
  doc["deadzoneStartHour"] = deadzoneStartHour;
  doc["deadzoneEndHour"] = deadzoneEndHour;
  doc["loggingIntervalMs"] = loggingIntervalMs;
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
  if (doc.containsKey("soilDryRaw")) soilDryRaw = (uint16_t)doc["soilDryRaw"].as<int>();
  if (doc.containsKey("soilWetRaw")) soilWetRaw = (uint16_t)doc["soilWetRaw"].as<int>();
  if (doc.containsKey("wateringThreshold")) wateringThreshold = doc["wateringThreshold"].as<float>();
  if (doc.containsKey("pumpPwmDuty")) pumpPwmDuty = doc["pumpPwmDuty"].as<int>();
  if (doc.containsKey("otaHostname")) otaHostname = String((const char*)doc["otaHostname"]);
  if (doc.containsKey("otaPassword")) otaPassword = String((const char*)doc["otaPassword"]);
  if (doc.containsKey("sensorUpdateInterval")) sensorUpdateInterval = doc["sensorUpdateInterval"].as<unsigned long>();
  if (doc.containsKey("autoWaterEnabled")) autoWaterEnabled = doc["autoWaterEnabled"].as<bool>();
  if (doc.containsKey("deadzoneEnabled")) deadzoneEnabled = doc["deadzoneEnabled"].as<bool>();
  if (doc.containsKey("deadzoneStartHour")) deadzoneStartHour = (uint8_t)doc["deadzoneStartHour"].as<int>();
  if (doc.containsKey("deadzoneEndHour")) deadzoneEndHour = (uint8_t)doc["deadzoneEndHour"].as<int>();
  if (doc.containsKey("loggingIntervalMs")) loggingIntervalMs = doc["loggingIntervalMs"].as<unsigned long>();
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

// Minimal rollover persistence to avoid repeated truncation on 1st after reboot
void saveLastRollover(int year, int month) {
  prefs.putInt("rollover_year", year);
  prefs.putInt("rollover_month", month);
}

void loadLastRollover() {
  lastRolloverYear = prefs.getInt("rollover_year", 0);
  lastRolloverMonth = prefs.getInt("rollover_month", 0);
}
