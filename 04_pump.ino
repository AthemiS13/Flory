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
  // Track elapsed time between iterations to accumulate ON duration
  unsigned long prevMs = millis();
  for (;;) {
    unsigned long now = millis();
    unsigned long delta = (unsigned long)(now - prevMs);
    bool shouldOn = false;
    LOCK_STATE();
    // evaluate manual timeout (safe across millis() wrap)
    if (timeNotExpired(pumpManualUntil)) {
      shouldOn = true;
    } else {
      pumpManualUntil = 0;
    }
    // evaluate auto timeout (safe across millis() wrap)
    if (timeNotExpired(pumpAutoUntil)) {
      shouldOn = true;
    } else {
      pumpAutoUntil = 0;
    }
    // perform LEDC writes and update pumpState here to avoid races
    // Soft-start: ramp duty up over several steps to avoid huge inrush/EMI.
    const int RAMP_STEPS = 20; // number of ramp steps (~RAMP_STEPS * 10ms = ramp duration)
    if (shouldOn) {
      if (!pumpState) {
        // turning on: initialize with 0 duty and start ramping
        ledcWrite(PUMP_PIN, 0);
        lastAppliedDuty = 0;
        pumpState = true;
        // Count rising edge as one activation
        pumpActivationCountSinceLog++;
      }
      // Ramp towards target duty
      if (lastAppliedDuty < pumpPwmDuty) {
        int step = max(1, pumpPwmDuty / RAMP_STEPS);
        int next = lastAppliedDuty + step;
        if (next > pumpPwmDuty) next = pumpPwmDuty;
        ledcWrite(PUMP_PIN, next);
        lastAppliedDuty = next;
      } else if (lastAppliedDuty > pumpPwmDuty) {
        // step down if duty decreased
        int step = max(1, lastAppliedDuty / RAMP_STEPS);
        int next = lastAppliedDuty - step;
        if (next < pumpPwmDuty) next = pumpPwmDuty;
        ledcWrite(PUMP_PIN, next);
        lastAppliedDuty = next;
      }
    } else {
      if (pumpState) {
        // turning off: immediately stop to be safe
        ledcWrite(PUMP_PIN, 0);
        lastAppliedDuty = -1;
        pumpState = false;
      }
    }
    // Accumulate ON duration
    if (pumpState) {
      pumpOnMsSinceLog += delta;
    }
    UNLOCK_STATE();
    prevMs = now;
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
