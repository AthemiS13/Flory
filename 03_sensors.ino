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

// Compute soil percent from a raw ADC reading using calibration if available
float soilPercentFromRaw(float raw) {
  if ((soilWetRaw > soilDryRaw + 1) || (soilDryRaw > soilWetRaw + 1)) {
    float pct;
    if (soilWetRaw < soilDryRaw) {
      // sensor inverted: higher raw == drier, lower raw == wetter
      // map raw in [soilDryRaw..soilWetRaw] -> [0..100] where soilDryRaw -> 0, soilWetRaw -> 100
      // when soilDryRaw > soilWetRaw: pct = (soilDryRaw - raw) / (soilDryRaw - soilWetRaw) * 100
      pct = (float(soilDryRaw) - raw) / float(soilDryRaw - soilWetRaw) * 100.0f;
    } else {
      // normal mapping: soilDryRaw < soilWetRaw
      pct = (raw - float(soilDryRaw)) / float(soilWetRaw - soilDryRaw) * 100.0f;
    }
    return constrain(pct, 0.0f, 100.0f);
  }
  // legacy fallback using soilBaseline
  if (soilBaseline <= 1.0f) return 0.0f;  // prevent divide by zero
  float pct = 100.0f - (raw / soilBaseline) * 100.0f;
  return constrain(pct, 0.0f, 100.0f);
}

float readSoilPercent() {
  float raw = readSoilRaw();
  return soilPercentFromRaw(raw);
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

// sensor task handle
TaskHandle_t sensorTaskHandle = NULL;

#include <time.h>

// sensor task: periodically read sensors and update shared state under lock
void sensorTask(void* pvParameters) {
  (void)pvParameters;
  Serial.println("Sensor task started on core 1");
  unsigned long lastLogMs = 0;
  for (;;) {
    // Read raw once and compute percent from it to keep values consistent
    float soilRaw = readSoilRaw();
    float soilPct = soilPercentFromRaw(soilRaw);
    uint16_t waterRaw = readWaterRaw();
    float waterPct = readWaterPercent(waterRaw);
    float temp = NAN;
    float hum = NAN;
    // read DHT sensor (may take time)
    if (dht.read()) {
      temp = dht.readTemperature();
      hum = dht.readHumidity();
    } else {
      // try to get values even if read() returns false (older libs)
      temp = dht.readTemperature();
      hum = dht.readHumidity();
    }

    LOCK_STATE();
    lastSoilPercent = soilPct;
    lastSoilRaw = (uint16_t)soilRaw;
    lastWaterRaw = waterRaw;
    lastWaterPercent = waterPct;
    if (!isnan(temp)) lastTemp = temp;
    if (!isnan(hum)) lastHum = hum;
    UNLOCK_STATE();

    // Automated watering logic: run only if enabled, not already auto-watering,
    // and soil percent is below threshold. Honor deadzone if configured.
    if (autoWaterEnabled) {
      // get local hour; if time not available, proceed (fail-open)
      struct tm timeinfo;
      bool haveTime = getLocalTime(&timeinfo, 0);
      int hour = haveTime ? timeinfo.tm_hour : -1;

      bool inDeadzone = false;
      if (deadzoneEnabled && hour >= 0) {
        uint8_t s = deadzoneStartHour;
        uint8_t e = deadzoneEndHour;
        if (s <= e) {
          inDeadzone = (hour >= s && hour < e);
        } else {
          // wraps past midnight, e.g., 22..6
          inDeadzone = (hour >= s || hour < e);
        }
      }

      // check and trigger auto-watering under lock
      LOCK_STATE();
      bool alreadyAuto = (pumpAutoUntil != 0 && millis() <= pumpAutoUntil);
      float curSoil = lastSoilPercent;
      UNLOCK_STATE();

      if (!inDeadzone && !alreadyAuto && curSoil < wateringThreshold) {
        // start auto pump
        LOCK_STATE();
        pumpAutoUntil = millis() + (unsigned long)pumpDurationMs;
        UNLOCK_STATE();
        Serial.printf("Auto-watering triggered: soil=%.1f < threshold=%.1f\n", curSoil, wateringThreshold);
      }
    }

    // SD logging: append a single-line CSV once per loggingIntervalMs
    unsigned long nowMs = millis();
    if (loggingIntervalMs > 0 && (nowMs - lastLogMs >= loggingIntervalMs)) {
      lastLogMs = nowMs;
      // prepare timestamp
      struct tm timeinfo;
      char timestr[32] = {0};
      if (getLocalTime(&timeinfo, 1000)) {
        snprintf(timestr, sizeof(timestr), "%04d-%02d-%02d %02d:%02d:%02d", timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday, timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
      } else {
        snprintf(timestr, sizeof(timestr), "ms:%lu", nowMs);
      }

      // prepare log file name YYYY-MM.txt
      char fname[32];
      if (getLocalTime(&timeinfo, 1000)) {
        snprintf(fname, sizeof(fname), "/log/%04d-%02d.txt", timeinfo.tm_year + 1900, timeinfo.tm_mon + 1);
      } else {
        // fallback to a generic log file
        snprintf(fname, sizeof(fname), "/log/unknown.txt");
      }

      // build CSV line: timestamp,soilPercent,soilRaw,waterPercent,waterRaw,temp,hum,pumpOn
      LOCK_STATE();
      bool pstate = pumpState;
      float spercent = lastSoilPercent;
      uint16_t sraw = lastSoilRaw;
      float wpercent = lastWaterPercent;
      uint16_t wraw = lastWaterRaw;
      float t = lastTemp;
      float h = lastHum;
      UNLOCK_STATE();

      char line[256];
      int len = snprintf(line, sizeof(line), "%s,%.1f,%u,%.1f,%u,%.1f,%.1f,%d", timestr, spercent, (unsigned)sraw, wpercent, (unsigned)wraw, t, h, pstate ? 1 : 0);
      if (len > 0) {
        // append by opening FILE_WRITE (sdWriteText uses FILE_WRITE and println)
        String content = String(line);
        // sdWriteText writes with println which adds a newline
        sdWriteText(fname, content);
      }
    }

    vTaskDelay(pdMS_TO_TICKS(sensorUpdateInterval));
  }
}
