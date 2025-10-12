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
  if (doc.containsKey("soilDryRaw")) soilDryRaw = (uint16_t)doc["soilDryRaw"].as<int>();
  if (doc.containsKey("soilWetRaw")) soilWetRaw = (uint16_t)doc["soilWetRaw"].as<int>();
  if (doc.containsKey("wateringThreshold")) wateringThreshold = doc["wateringThreshold"].as<float>();
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
