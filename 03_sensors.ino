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
  int curLogYear = 0;
  int curLogMonth = 0;
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
      // get local hour; require time to be available — do not trigger automated
      // operation if the device doesn't know the time (fail-closed)
      struct tm timeinfo;
      bool haveTime = getLocalTime(&timeinfo, 2000); // wait up to 2s for time
      if (!haveTime) {
        // don't trigger auto-watering when time is unknown
        Serial.println("Auto-watering skipped: local time not available");
      } else {
        int hour = timeinfo.tm_hour;

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
  bool alreadyAuto = timeNotExpired(pumpAutoUntil);
  float curSoil = lastSoilPercent;
  UNLOCK_STATE();

        // Also respect an auto-watering cooldown to prevent repeated triggers
  LOCK_STATE();
  bool cooldownActive = timeNotExpired(autoWaterCooldownUntil);
  UNLOCK_STATE();

        if (!inDeadzone && !alreadyAuto && !cooldownActive && curSoil < wateringThreshold) {
          // start auto pump
          unsigned long now = millis();
          LOCK_STATE();
          pumpAutoUntil = now + (unsigned long)pumpDurationMs;
          // set cooldown to 60s after the pump stops
          autoWaterCooldownUntil = pumpAutoUntil + 60000UL; // 60000 ms = 1 minute
          UNLOCK_STATE();
          Serial.printf("Auto-watering triggered: soil=%.1f < threshold=%.1f (cooldown until %lu)\n", curSoil, wateringThreshold, autoWaterCooldownUntil);
        }
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

      // Use single log file /log/log.txt. If the month rolled over, truncate it.
      char fname[32];
      snprintf(fname, sizeof(fname), "/log/log.txt");
      int y = 0;
      int m = 0;
      bool timeSynced = false;
      if (getLocalTime(&timeinfo, 1000)) {
        y = timeinfo.tm_year + 1900;
        m = timeinfo.tm_mon + 1;
        timeSynced = true;
      }

      // If we have time, only truncate when the month actually changes.
      // On first run after boot curLogYear/curLogMonth are zero: in that case
      // initialize them without truncating so we don't wipe same-month logs on restart.
      if (timeSynced) {
        if (curLogYear == 0 && curLogMonth == 0) {
          // first init after boot — remember current month but do not truncate
          curLogYear = y;
          curLogMonth = m;
        } else if (y != curLogYear || m != curLogMonth) {
          Serial.printf("Month rollover detected: truncating /log/log.txt for new month %04d-%02d\n", y, m);
          sdTruncateLogFile();
          curLogYear = y;
          curLogMonth = m;
        }
      }

  // build CSV line: timestamp,soilPercent,waterPercent,temp,hum,pumpOn,timeSynced,pumpActivations,pumpOnMs
      LOCK_STATE();
      bool pstate = pumpState;
      float spercent = lastSoilPercent;
      float wpercent = lastWaterPercent;
      float t = lastTemp;
      float h = lastHum;
    // Snapshot and reset counters so new events count towards the next period
    unsigned long activationCount = pumpActivationCountSinceLog;
    unsigned long onMs = pumpOnMsSinceLog;
    pumpActivationCountSinceLog = 0;
    pumpOnMsSinceLog = 0;
      UNLOCK_STATE();

      char line[256];
  // Add timeSynced flag (1 = exact NTP time, 0 = unknown/approx) and counters
  int len = snprintf(line, sizeof(line), "%s,%.1f,%.1f,%.1f,%.1f,%d,%d,%lu,%lu", timestr, spercent, wpercent, t, h, pstate ? 1 : 0, timeSynced ? 1 : 0, activationCount, onMs);
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
