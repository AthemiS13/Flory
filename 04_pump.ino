// -------------------- Pump --------------------
void pumpOn() {
  // start pump for default duration (set timeout)
  LOCK_STATE();
  pumpManualUntil = millis() + (unsigned long)pumpDurationMs;
  UNLOCK_STATE();
}

void pumpOff() {
  // request immediate stop by clearing timers; pumpTask will do the LEDC write
  LOCK_STATE();
  pumpManualUntil = 0;
  pumpAutoUntil = 0;
  UNLOCK_STATE();
}

void startPumpMs(int ms) {
  LOCK_STATE();
  unsigned long until = millis() + (unsigned long)ms;
  // set the manual timeout directly (do not stack durations)
  pumpManualUntil = until;
  UNLOCK_STATE();
}

void stopPumpImmediate() {
  LOCK_STATE();
  pumpManualUntil = 0;
  pumpAutoUntil = 0;
  UNLOCK_STATE();
}

// Pump control task: runs every 10ms, updates LEDC and pumpState under lock
void pumpTask(void* pvParameters) {
  (void)pvParameters;
  for (;;) {
    unsigned long now = millis();
    bool shouldOn = false;
    LOCK_STATE();
    // evaluate manual timeout
    if (pumpManualUntil != 0) {
      if (now <= pumpManualUntil) {
        shouldOn = true;
      } else {
        // timeout expired — clear
        pumpManualUntil = 0;
      }
    }
    // evaluate auto timeout
    if (pumpAutoUntil != 0) {
      if (now <= pumpAutoUntil) {
        shouldOn = true;
      } else {
        pumpAutoUntil = 0;
      }
    }
    // perform LEDC writes and update pumpState here to avoid races
    if (shouldOn) {
      if (!pumpState) {
        // turning on
        ledcWrite(PUMP_PIN, pumpPwmDuty);
        lastAppliedDuty = pumpPwmDuty;
        pumpState = true;
      } else {
        // already on: if duty changed, reapply
        if (pumpPwmDuty != lastAppliedDuty) {
          ledcWrite(PUMP_PIN, pumpPwmDuty);
          lastAppliedDuty = pumpPwmDuty;
        }
      }
    } else {
      if (pumpState) {
        // turning off
        ledcWrite(PUMP_PIN, 0);
        lastAppliedDuty = -1;
        pumpState = false;
      }
    }
    UNLOCK_STATE();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
