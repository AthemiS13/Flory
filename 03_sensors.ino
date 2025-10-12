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

// sensor task: periodically read sensors and update shared state under lock
void sensorTask(void* pvParameters) {
  (void)pvParameters;
  Serial.println("Sensor task started on core 1");
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

    vTaskDelay(pdMS_TO_TICKS(sensorUpdateInterval));
  }
}
