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

extern SemaphoreHandle_t stateMutex;
extern volatile bool pumpState;
extern unsigned long pumpManualUntil;
extern unsigned long pumpAutoUntil;

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
void sdHandleUpload(HTTPUpload &upload);

extern Preferences prefs;
extern const char* PREF_NAMESPACE;

extern WebServer server;
extern DHT dht;

// task prototypes
void pumpTask(void* pvParameters);
void sensorTask(void* pvParameters);
void networkTask(void* pvParameters);

#endif // SMARTPOT_GLOBALS_H
