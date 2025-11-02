/* Globals and includes - kept in a separate file so other files compile cleanly */
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <WiFiManager.h>
#include <esp32-hal-ledc.h>
#include "DHT.h"

// -------------------- Pins (change to your wiring) --------------------
#define PUMP_PIN 14
#define SOIL_PIN 35        // analog input (0-4095)
#define WATER_TOUCH_PIN 15  // touchRead
#define DHT_PIN 32
#define DHT_TYPE DHT11

DHT dht(DHT_PIN, DHT_TYPE);


// default map: 6 points 0,20,40,60,80,100
std::vector<CalPoint> waterMap = {
  { 45, 0.0 }, { 19, 20.0 }, { 11, 40.0 }, { 7, 60.0 }, { 5, 80.0 }, { 1, 100.0 }
};

float soilBaseline = 0.0f;
// New soil calibration values (raw ADC)
// Default to inverted-sensor orientation (dry = higher reading, wet = lower)
uint16_t soilDryRaw = 4095;   // dry soil raw reading (default: high)
uint16_t soilWetRaw = 0;      // wet soil raw reading (default: low)
// watering threshold in percent (0-100)
float wateringThreshold = 30.0f;
int pumpDurationMs = 5000;
unsigned long sensorUpdateInterval = 1000;  // ms
// Automated watering defaults
bool autoWaterEnabled = false;
// Deadzone (night) watering prevention
bool deadzoneEnabled = true;
uint8_t deadzoneStartHour = 22; // 22:00
uint8_t deadzoneEndHour = 6;    // 06:00 (wraps past midnight)

// SD logging interval (ms): default to 60s to avoid heavy writes
unsigned long loggingIntervalMs = 60000;

// -------------------- Runtime state (shared) --------------------
SemaphoreHandle_t stateMutex;
volatile bool pumpState = false;
unsigned long pumpManualUntil = 0;
unsigned long pumpAutoUntil = 0;
// cooldown until (millis) during which auto-watering is suppressed after a trigger
unsigned long autoWaterCooldownUntil = 0;
// Pump activity counters since last log write
volatile unsigned long pumpActivationCountSinceLog = 0;
volatile unsigned long pumpOnMsSinceLog = 0;

// Pump task
TaskHandle_t pumpTaskHandle = NULL;
int lastAppliedDuty = -1;

// Task handles
TaskHandle_t networkTaskHandle = NULL;

float lastSoilPercent = 0.0;
uint16_t lastSoilRaw = 0;
uint16_t lastWaterRaw = 0;
float lastWaterPercent = 0.0;
float lastTemp = 0.0;
float lastHum = 0.0;
// PWM settings for pump (persisted)
int pumpPwmFreq = 5000;           // Hz
int pumpPwmResolution = 8;        // bits (0..(2^bits -1))
int pumpPwmDuty = 255;            // duty (0..(2^bits -1))

// -------------------- Persistence --------------------
Preferences prefs;
const char* PREF_NAMESPACE = "smartpot_v1";

// OTA / network settings (persisted)
String otaHostname = "flory";
String otaPassword = "";

// -------------------- Server --------------------
WebServer server(80);

// Helper: safe expiry check that handles millis() wrap-around.
// Returns true if the given absolute expiry time is still in the future.
inline bool timeNotExpired(unsigned long expiry) {
  if (expiry == 0) return false;
  // Use signed subtraction to handle unsigned wrap-around correctly for intervals
  // shorter than 2^31 ms (~24.8 days). This is the common Arduino idiom.
  return (long)(expiry - millis()) > 0;
}

// -------------------- Time sync tracking (NTP) --------------------
// We keep the last known valid epoch and when it was observed so we can
// provide an approximate local time if NTP is temporarily unavailable.
bool timeEverSynced = false;           // set true after first successful getLocalTime
time_t lastSyncedEpoch = 0;            // epoch seconds when we last had valid time
unsigned long lastSyncedMillis = 0;    // millis() captured at the same moment
// How long an approximate time is considered safe/valid for automation decisions
// (24 hours default). If you prefer strict mode, set this to 0.
unsigned long approxTimeValidMs = 24UL * 60UL * 60UL * 1000UL;

// Minimal persisted rollover marker (YYYY/MM of last truncation)
int lastRolloverYear = 0;
int lastRolloverMonth = 0;
