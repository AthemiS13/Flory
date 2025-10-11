// Main file: setup/loop only. Other functionality split into separate .ino files
#include "globals.h"

// Uncomment to run SD card test on boot (calls sdTest() from 06_sd.ino)
#define SD_TEST

// sdTest() is implemented in 06_sd.ino
extern void sdTest();

// Ensure prototypes/externs are visible before setup uses them (helps Arduino single-file concat)
extern TaskHandle_t networkTaskHandle;
void sensorTask(void* pvParameters);

void setup() {
  Serial.begin(115200);
  delay(50);

#ifdef SD_TEST
  // Run a quick SD verification test. Remove or comment out when done.
  sdTest();
#endif

  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, LOW);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);  // ensure ADC attenuation
  dht.begin();

  // mutex
  stateMutex = xSemaphoreCreateMutex();
  if (!stateMutex) {
    Serial.println("Failed mutex");
    while (1) vTaskDelay(pdMS_TO_TICKS(1000));
  }

  // prefs
  prefs.begin(PREF_NAMESPACE, false);
  loadCalibrationFromPrefs();

  // configure LEDC PWM for pump (MOSFET gate) using loaded prefs
  if (pumpPwmResolution < 1) pumpPwmResolution = 1;
  if (pumpPwmResolution > 15) pumpPwmResolution = 15;
  if (pumpPwmFreq <= 0) pumpPwmFreq = 5000;
  int maxDuty = (1 << pumpPwmResolution) - 1;
  if (pumpPwmDuty < 0) pumpPwmDuty = 0;
  if (pumpPwmDuty > maxDuty) pumpPwmDuty = maxDuty;
  // attach PWM to pin (pin-based attach in this core)
  ledcAttach(PUMP_PIN, pumpPwmFreq, pumpPwmResolution);

  // soil baseline calibration
  float sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(SOIL_PIN);
    delay(5);
  }
  if (soilBaseline <= 1.0f) soilBaseline = sum / 10.0f;
  Serial.printf("soilBaseline=%.1f\n", soilBaseline);

  // start pump task on core 1 (handles LEDC writes and timeouts)
  xTaskCreatePinnedToCore(pumpTask, "pumpTask", 2048, NULL, 2, &pumpTaskHandle, 1);
  // start sensor task on core 1
  xTaskCreatePinnedToCore(sensorTask, "sensorTask", 4096, NULL, 1, &sensorTaskHandle, 1);
  // start network task on core 0
  xTaskCreatePinnedToCore(networkTask, "networkTask", 8192, NULL, 1, &networkTaskHandle, 0);

  Serial.println("SmartPot initialized");
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}

// -------------------- To do --------------------

//SENSORS
///DHT11 - TEMPERATURE AND HUMIDITY SENSOR
// returns temp in celsius and the humidity in percent as is, no settings needed

///SOIL MOISTURE SENSOR
// Check the percentage calculation logic
//add calibration api to set dry and wet soil values and also watering treshold value
//expose raw value via api

///WATER LEVEL SENSOR
// expose raw value via api
// Check calibration map in api

//PUMP CONTROL (PWM)
// keep only duty cycle setting, remove freq and resolution from api

//Other settings
// sensor update interval
// Device restart api
// File manager drag and drop to edit the web files on the sd card
// Add mdns support to web server
// logging interval setting
// a deadzone setting for when not to water (e.g. between 22:00 and 6:00)


// -------------------- Automated Operation --------------------
// Add support for automated watering based on soil moisture levels
// e.g. if soil moisture < threshold, activate pump for defined duration
// use a time server to avoid watering at night
// threshold and duration configurable via api as mentioned above
// store logs of sensors and activity into sd card /log folder in root
// rewrite logs every month to avoid filling up the sd card
// use efficient way to write logs to avoid excessive sd card wear

