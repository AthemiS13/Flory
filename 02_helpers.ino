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

// ---- Time helpers ----
#include <time.h>

bool getLocalTimeSafe(struct tm* out, int timeoutMs, bool* outExact) {
  if (!out) return false;
  // Try exact time first
  if (getLocalTime(out, timeoutMs)) {
    if (outExact) *outExact = true;
    // Record last known epoch for approximate fallback
    time_t nowEpoch = time(nullptr);
    if (nowEpoch > 0) {
      lastSyncedEpoch = nowEpoch;
      lastSyncedMillis = millis();
      timeEverSynced = true;
    }
    return true;
  }
  // Fallback: approximate time if we have a recent sync
  if (timeEverSynced && approxTimeValidMs > 0) {
    unsigned long elapsed = millis() - lastSyncedMillis;
    if ((long)elapsed >= 0 && elapsed <= approxTimeValidMs) {
      time_t approxEpoch = lastSyncedEpoch + (time_t)(elapsed / 1000UL);
      struct tm tmp;
      if (localtime_r(&approxEpoch, &tmp) != nullptr) {
        *out = tmp;
        if (outExact) *outExact = false;
        return true;
      }
    }
  }
  return false;
}
