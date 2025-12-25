#ifndef SMARTPOT_GLOBALS_H
#define SMARTPOT_GLOBALS_H

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <WiFiManager.h>
#include <esp32-hal-ledc.h>
#include "DHT.h"
#include <vector>

// Pins
#define PUMP_PIN 14
#define SOIL_PIN 35
#define WATER_TOUCH_PIN 15
#define DHT_PIN 32
#define DHT_TYPE DHT11

struct CalPoint { uint16_t raw; float percent; };

extern std::vector<CalPoint> waterMap;
extern float soilBaseline;
extern uint16_t soilDryRaw;
extern uint16_t soilWetRaw;
extern float wateringThreshold;
extern int pumpDurationMs;
extern unsigned long sensorUpdateInterval;
extern bool autoWaterEnabled;
// deadzone settings (hours 0-23). If enabled and current local hour is in
// [deadzoneStartHour..deadzoneEndHour) (wrapping allowed), automated watering
// will be suppressed.
extern bool deadzoneEnabled;
extern uint8_t deadzoneStartHour;
extern uint8_t deadzoneEndHour;
// logging interval (ms) used for SD activity logging (defaults to 60000)
extern unsigned long loggingIntervalMs;

// Auto-reboot interval (8 hours)
#define REBOOT_INTERVAL_MS (8 * 60 * 60 * 1000)

extern SemaphoreHandle_t stateMutex;
extern volatile bool pumpState;
extern unsigned long pumpManualUntil;
extern unsigned long pumpAutoUntil;
// Pump activity counters since the last periodic log write
// - pumpActivationCountSinceLog: number of ON transitions (false -> true)
// - pumpOnMsSinceLog: total milliseconds pump was ON
extern volatile unsigned long pumpActivationCountSinceLog;
extern volatile unsigned long pumpOnMsSinceLog;

extern TaskHandle_t pumpTaskHandle;
extern TaskHandle_t sensorTaskHandle;
extern TaskHandle_t networkTaskHandle;
extern int lastAppliedDuty;

extern float lastSoilPercent;
extern uint16_t lastSoilRaw;
extern uint16_t lastWaterRaw;
extern float lastWaterPercent;
extern float lastTemp;
extern float lastHum;

extern int pumpPwmFreq;
extern int pumpPwmResolution;
extern int pumpPwmDuty;

// OTA / network settings
extern String otaHostname;
extern String otaPassword;

// SD upload handler (defined in 06_sd.ino)
// NOTE: this project uses a simple, brute-force upload handler intended for
// emergency drag-and-drop. The handler accepts an HTTPUpload& and streams
// files directly to the SD card. A global flag `sd_upload_started` is used
// to mark the first-file event that triggers wiping `/app` contents.
void sdHandleUpload(HTTPUpload &upload);
// Explicit wipe API for /app
void sdWipeApp();
// Wipe all files under /log (keeps /log directory)
void sdWipeLogs();
// Truncate or recreate the main log file (/log/log.txt)
void sdTruncateLogFile();

extern Preferences prefs;
extern const char* PREF_NAMESPACE;

extern WebServer server;
extern DHT dht;

// task prototypes
void pumpTask(void* pvParameters);
void sensorTask(void* pvParameters);
void networkTask(void* pvParameters);

// Time sync tracking and safe time helper
extern bool timeEverSynced;
extern time_t lastSyncedEpoch;
extern unsigned long lastSyncedMillis;
extern unsigned long approxTimeValidMs;
// Returns true if we can provide a time: exact NTP if available, otherwise
// approximate within approxTimeValidMs of the last sync. If outExact is
// provided, it is set to true when the time is exact (NTP) and false when
// approximate.
bool getLocalTimeSafe(struct tm* out, int timeoutMs, bool* outExact = nullptr);

// Minimal rollover guard to avoid wiping logs multiple times on the 1st if rebooted
extern int lastRolloverYear;
extern int lastRolloverMonth;
void saveLastRollover(int year, int month);
void loadLastRollover();

#endif // SMARTPOT_GLOBALS_H
