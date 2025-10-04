#include "DHT.h"

// --- Pins ---
#define PUMP_PIN 18
#define SOIL_PIN 32
#define WATER_TOUCH_PIN 15
#define DHT_PIN 17
#define DHT_TYPE DHT11

DHT dht(DHT_PIN, DHT_TYPE);

float soilBaseline = 0;
bool pumpState = false;

// --- Water sensor calibration ---
struct CalPoint { uint16_t raw; float percent; };
CalPoint waterMap[] = { {45,0.0},{19,20.0},{11,40.0},{7,60.0},{5,80.0},{1,100.0} };
const int numPoints = sizeof(waterMap)/sizeof(CalPoint);

float mapWaterTouch(uint16_t raw) {
  if (raw >= waterMap[0].raw) return waterMap[0].percent;
  if (raw <= waterMap[numPoints-1].raw) return waterMap[numPoints-1].percent;
  for (int i=0;i<numPoints-1;i++){
    if(raw <= waterMap[i].raw && raw >= waterMap[i+1].raw){
      float slope = (waterMap[i+1].percent - waterMap[i].percent)/(waterMap[i+1].raw - waterMap[i].raw);
      return waterMap[i].percent + slope*(raw - waterMap[i].raw);
    }
  }
  return 0;
}

float readSoilPercent() {
  float sum = 0;
  for(int i=0;i<5;i++){ sum += analogRead(SOIL_PIN); delay(5); }
  float raw = sum/5.0;
  return constrain(100 - (raw/soilBaseline)*100,0,100);
}

uint16_t readWaterRaw() {
  uint32_t sum = 0;
  for(int i=0;i<5;i++){ sum += touchRead(WATER_TOUCH_PIN); delay(5); }
  return sum/5;
}

float readWaterPercent(uint16_t raw){ return constrain(mapWaterTouch(raw),0,100); }

void updatePump(float waterPercent){
  if(waterPercent >= 60.0){ digitalWrite(PUMP_PIN,HIGH); pumpState=true; }
  else{ digitalWrite(PUMP_PIN,LOW); pumpState=false; }
}

void setup(){
  Serial.begin(115200);
  pinMode(PUMP_PIN,OUTPUT); digitalWrite(PUMP_PIN,LOW);
  dht.begin();

  float sumSoil=0;
  for(int i=0;i<10;i++){ sumSoil+=analogRead(SOIL_PIN); delay(5); }
  soilBaseline = sumSoil/10.0;

  Serial.println("Smart Pot Initialized");
}

void loop(){
  float soilPercent = readSoilPercent();
  uint16_t waterRaw = readWaterRaw();
  float waterPercent = readWaterPercent(waterRaw);
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();

  // --- Pump control ---
  updatePump(waterPercent);

  // --- Serial log ---
  Serial.println("=== Smart Pot Status ===");
  Serial.print("Soil Moisture: "); Serial.print(soilPercent); Serial.println("%");
  Serial.print("Water Level (%): "); Serial.println(waterPercent);
  Serial.print("Temperature: "); Serial.print(temp); Serial.println(" C");
  Serial.print("Humidity: "); Serial.print(hum); Serial.println(" %");
  Serial.print("Pump is "); Serial.println(pumpState?"ON":"OFF");
  Serial.println("=======================");

  delay(1000);
}