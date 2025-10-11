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
