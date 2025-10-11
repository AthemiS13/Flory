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

// sensor task handle
TaskHandle_t sensorTaskHandle = NULL;

// sensor task: periodically read sensors and update shared state under lock
void sensorTask(void* pvParameters) {
  (void)pvParameters;
  Serial.println("Sensor task started on core 1");
  for (;;) {
    float soilPct = readSoilPercent();
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
    lastWaterRaw = waterRaw;
    lastWaterPercent = waterPct;
    if (!isnan(temp)) lastTemp = temp;
    if (!isnan(hum)) lastHum = hum;
    UNLOCK_STATE();

    vTaskDelay(pdMS_TO_TICKS(sensorUpdateInterval));
  }
}
