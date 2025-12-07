#define BLYNK_TEMPLATE_ID "TMPL6H-cMWIcR"
#define BLYNK_TEMPLATE_NAME "Proj"
#define BLYNK_AUTH_TOKEN "g-bdAArnro7kshKZ7LR4WB6nrya8iH9I"

#include <Arduino.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <BlynkSimpleEsp32.h>
#include <HTTPClient.h>
#include <esp_now.h>
#include "esp_wifi.h"
#include "DHT.h"

// ------------ CONFIGURATION -----------
String GAS_URL = "https://script.google.com/macros/s/AKfycbxOUED034r8Vyhbjur597YmROFteTDIbY1LF1FFCQjea1lLRFVQY6xT50GLGUejPhG5aA/exec";
char ssid[] = "T";
char pass[] = "homeless";
const int FIXED_CHANNEL = 6;

// ------------ SENSOR THRESHOLDS -----------
const int LOW_WATER_THRESHOLD = 500;
const float HIGH_TEMP_THRESHOLD = 35.0;
const float HIGH_HUMIDITY_THRESHOLD = 80.0;

// ------------- HARDWARE PINS -------------
#define DHTPIN 4
#define DHTTYPE DHT11
#define VIBRATION_PIN 18  
const int singleServoPin = 13; // Using Pin 13 for all servo control

// ------------- OBJECTS -------------
DHT dht(DHTPIN, DHTTYPE);
Servo myServo; 
BlynkTimer timer;

// ------------- GLOBAL DATA -----------
struct SensorData {
  int waterLevel;
  float distance;
};

SensorData latestSensorData = {0, 0.0};
float latestTemperature = 0.0;
float latestHumidity = 0.0;
bool vibrationDetected = false; 
const int moveTime = 1000;
// Servo timing control
bool servoActive = false;
unsigned long servoEndTime = 0;

// ------------- SERVO ACTIVATION FUNCTION -----------
void activateServos(bool state) {
  // Set target angles
  int servo1Target = state ? 20 : 0;
  int servo2Target = state ? 20 : 180;
  // Read current position
  int start1 = myServo.read();
  
  int steps = 50;
  int stepDelay = moveTime / steps;
  
  // Calculate step size
  float step1 = (servo1Target - start1) / (float)steps;
  
  float currentPos1 = start1;

  for (int i = 0; i < steps; i++) {
    currentPos1 += step1;
    
    myServo.write((int)currentPos1);
    
    delay(stepDelay);
    Blynk.run();
  }
  
  // Force final position
  myServo.write(servo1Target);
}


// V4: Servo activation button
BLYNK_WRITE(V4) {
  int pinValue = param.asInt();
  Serial.println("Blynk V4 change: " + String(pinValue));

  // Non-blocking: when Blynk button (V4) goes HIGH, move servo to 20deg
  if (pinValue == 1) {
    myServo.write(30);
    servoActive = true;
    servoEndTime = millis() + 800UL; // keep at 20deg for ~1.0 seconds
  }
}

// ------------- SENSOR LOGIC -----------

void checkVibration() {
  int sensorState = digitalRead(VIBRATION_PIN);
  if (sensorState == HIGH) { 
    if (!vibrationDetected) {
      Serial.println("Vibration Detected!");
      Blynk.logEvent("vibration_alert", "Warning: System Vibration Detected!");
      Blynk.virtualWrite(V6, 1); 
      vibrationDetected = true;
    }
  } else {
    vibrationDetected = false;
    Blynk.virtualWrite(V6, 0);
  }
}

void sendSensorReadings() {
  // Read humidity
  float h = dht.readHumidity();
  // Read temperature as Celsius (isFahrenheit = false)
  float t = dht.readTemperature(false); 

  // Check if any reads failed and exit early if so
  if (isnan(h) || isnan(t)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }

  // Update global variables for Google Sheets
  latestTemperature = t;
  latestHumidity = h;

  // Print to Serial Monitor for debugging
  Serial.printf("DHT11 Readings: Temp = %.2f °C, Humid = %.2f %%\n", t, h);

  // Send to Blynk Virtual Pins
  Blynk.virtualWrite(V2, t); // Temperature in Celsius
  Blynk.virtualWrite(V3, h); // Humidity Percentage
  
  // Trigger alerts based on Celsius thresholds
  if (t > HIGH_TEMP_THRESHOLD) {
    Blynk.logEvent("temp_alert", "High Temp: " + String(t, 1) + "°C");
  }
  if (h > HIGH_HUMIDITY_THRESHOLD) {
    Blynk.logEvent("humidity_alert", "High Humidity: " + String(h, 1) + "%");
  }
  
  // Send remote sensor data
  Blynk.virtualWrite(V1, latestSensorData.waterLevel);
  Blynk.virtualWrite(V5, latestSensorData.distance);
}

// ------------- COMMUNICATION -----------

void OnDataRecv(const uint8_t * mac, const uint8_t *incomingData, int len) {
  // Print sender MAC and raw payload for debugging
  Serial.printf("OnDataRecv from %02X:%02X:%02X:%02X:%02X:%02X len=%d\n",
                mac[0], mac[1], mac[2], mac[3], mac[4], mac[5], len);
  Serial.print("  Raw: ");
  for (int i = 0; i < len; i++) {
    Serial.printf("%02X ", incomingData[i]);
  }
  Serial.println();

  // Try parsing common formats sent by sensor nodes.
  // 1) Expected: int32_t waterLevel; float distance;  (sizeof == 8)
  if (len == (int)sizeof(SensorData)) {
    SensorData data;
    memcpy(&data, incomingData, sizeof(data));
    latestSensorData = data;
    Serial.printf("  Parsed (int32, float): waterLevel=%d, distance=%.2f\n", data.waterLevel, data.distance);
    if (data.waterLevel < LOW_WATER_THRESHOLD) {
      Blynk.logEvent("water_alert", "Water level low: " + String(data.waterLevel));
    }
    return;
  }

  // 2) Alternative: uint16_t waterLevel; float distance;  (sizeof == 6)
  if (len == (int)(sizeof(uint16_t) + sizeof(float))) {
    uint16_t w;
    float d;
    memcpy(&w, incomingData, sizeof(w));
    memcpy(&d, incomingData + sizeof(w), sizeof(d));
    latestSensorData.waterLevel = (int)w;
    latestSensorData.distance = d;
    Serial.printf("  Parsed (uint16, float): waterLevel=%u, distance=%.2f\n", w, d);
    if (latestSensorData.waterLevel < LOW_WATER_THRESHOLD) {
      Blynk.logEvent("water_alert", "Water level low: " + String(latestSensorData.waterLevel));
    }
    return;
  }

  // 3) Alternative order: float distance; int32_t waterLevel; (len >= 8)
  if (len >= (int)(sizeof(float) + sizeof(int32_t))) {
    float d;
    int32_t w;
    memcpy(&d, incomingData, sizeof(d));
    memcpy(&w, incomingData + sizeof(d), sizeof(w));
    latestSensorData.waterLevel = (int)w;
    latestSensorData.distance = d;
    Serial.printf("  Parsed (float, int32): waterLevel=%d, distance=%.2f\n", w, d);
    if (latestSensorData.waterLevel < LOW_WATER_THRESHOLD) {
      Blynk.logEvent("water_alert", "Water level low: " + String(latestSensorData.waterLevel));
    }
    return;
  }

  Serial.println("  Unknown data format — unable to parse into SensorData");
}

void sendToGoogleSheets() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = GAS_URL + "?temp=" + String(latestTemperature, 2) + 
                 "&humid=" + String(latestHumidity, 2) + 
                 "&water=" + String(latestSensorData.waterLevel) + 
                 "&distance=" + String(latestSensorData.distance, 2) +
                 "&vibration=" + String(vibrationDetected ? 1 : 0);

    http.begin(url.c_str());
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    http.GET();
    http.end();
  }
}

// ------------- SETUP & LOOP -----------

void setup() {
  Serial.begin(115200);

  pinMode(VIBRATION_PIN, INPUT);
  
  myServo.attach(singleServoPin);
  myServo.write(0); // Initialize to 0 degrees

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  while (WiFi.status() != WL_CONNECTED) {
    delay(100);
    Serial.print(".");
  }

  esp_wifi_set_channel(FIXED_CHANNEL, WIFI_SECOND_CHAN_NONE);
  
  Blynk.config(BLYNK_AUTH_TOKEN);
  Blynk.connect();
  dht.begin();

  if (esp_now_init() == ESP_OK) {
    esp_now_register_recv_cb(OnDataRecv);
  }

  // Define Timers
  timer.setInterval(2000L, sendSensorReadings);
  timer.setInterval(500L, checkVibration); 
  timer.setInterval(60000L, sendToGoogleSheets);
}

void loop() {
  Blynk.run();
  timer.run();
  // Handle servo timeout non-blocking
  if (servoActive && millis() >= servoEndTime) {
    myServo.write(0); // return to 0 degrees
    servoActive = false;
    // Reset button state in Blynk app
    Blynk.virtualWrite(V4, 0);
  }
}