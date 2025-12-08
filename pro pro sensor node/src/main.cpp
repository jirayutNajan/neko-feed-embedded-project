#include <WiFi.h>
#include <esp_now.h>
#include "esp_wifi.h"

// ---------------- WIFI SETTINGS ----------------
char ssid[] = "Jackie chan";
char pass[] = "987654321";

// ---------------- SENSOR PINS -------------------
#define WATER_LEVEL_PIN 34 
#define TRIG_PIN 12
#define ECHO_PIN 14

// --------------- GATEWAY MAC --------------------
// !!! ต้องเป็น MAC Address ของบอร์ดตัวรับ (Receiver) เท่านั้น !!!
uint8_t gatewayMAC[] = {0x28, 0x56, 0x2F, 0x49, 0x9C, 0x88};

// --------------- DATA STRUCTURE -----------------
struct SensorData {
  int waterLevel; // Raw ADC value (0-4095)
  float distance; // Distance in cm
};

// ---------------- ULTRASONIC FUNCTION --------------------
float getUltrasonicDistance() {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    long duration = pulseIn(ECHO_PIN, HIGH, 25000); 
    if (duration == 0) return -1.0; 
    return (duration * 0.0343) / 2.0;
}

// ---------------- WATER LEVEL FUNCTION -------------------
int getWaterLevel() {
    return analogRead(WATER_LEVEL_PIN);
}

// ---------------- SEND CALLBACK -----------------
void OnSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("Send Failed — Re-adding peer...");
    // Re-add peer logic if needed, but usually not necessary if channel is 0
  } else {
    Serial.println("Send OK");
  }
}

void setup() {
  Serial.begin(115200);

  // ----------- SENSOR PIN INIT -----------
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  // ----------- WIFI INIT -----------
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);

  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(100);
  }

  Serial.println("\nWiFi Connected!");
  Serial.print("Node IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Current Channel: ");
  Serial.println(WiFi.channel()); // ดูว่า Router พาเราไปอยู่ Channel ไหน

  // ------------- ESP-NOW INIT -------------
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW Init Failed! Restarting...");
    delay(1000);
    ESP.restart(); 
  }

  esp_now_register_send_cb(OnSent);

  // ----------- ADD GATEWAY PEER -----------
  esp_now_peer_info_t peer;
  memcpy(peer.peer_addr, gatewayMAC, 6);
  
  // !!! KEY FIX: ใช้ Channel 0 เพื่อให้ตาม WiFi Router อัตโนมัติ !!!
  peer.channel = 0;  
  peer.encrypt = false;
  
  // สำคัญมากเมื่อใช้ร่วมกับ WiFi: ต้องระบุ Interface เป็น WIFI_IF_STA
  peer.ifidx = WIFI_IF_STA;

  if (esp_now_add_peer(&peer) != ESP_OK) {
    Serial.println("ERROR adding peer!");
  } else {
    Serial.println("Peer added OK");
  }
}

void loop() {
  SensorData data;
  data.waterLevel = getWaterLevel();
  data.distance = getUltrasonicDistance();

  // Send the sensor data packet to the gateway
  esp_now_send(gatewayMAC, (uint8_t*)&data, sizeof(data));

  Serial.printf("Water: %d | Distance: %.2fcm\n", data.waterLevel, data.distance);

  delay(1000); // send every second
}