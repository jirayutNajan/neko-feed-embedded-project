#include <WiFi.h>
#include <esp_now.h>
#include "esp_wifi.h"

// ---------------- WIFI SETTINGS ----------------
// NOTE: These are for temporarily joining a WiFi network to set the channel.
char ssid[] = "T";
char pass[] = "homeless";
const int FIXED_CHANNEL = 6;

// ---------------- SENSOR PINS -------------------
// Analog pin for water level.
#define WATER_LEVEL_PIN 34 
// Digital pins for Ultrasonic sensor.
#define TRIG_PIN 12
#define ECHO_PIN 14

// --------------- GATEWAY MAC --------------------
// !!! ENSURE THIS IS THE CORRECT MAC ADDRESS OF YOUR RECEIVING GATEWAY !!!
uint8_t gatewayMAC[] = {0x28, 0x56, 0x2F, 0x49, 0x9C, 0x88};

// --------------- DATA STRUCTURE -----------------
// Structure to hold sensor data for ESP-NOW transmission.
struct SensorData {
  int waterLevel; // Raw ADC value (0-4095)
  float distance; // Distance in cm
};

// ---------------- ULTRASONIC FUNCTION --------------------
/**
 * Reads distance from the ultrasonic sensor.
 * NOTE: Ensure a voltage divider is used on ECHO_PIN (14) if using a 5V sensor.
 */
float getUltrasonicDistance() {
    // 1. Ensure a clean low pulse
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);

    // 2. Send a 10us high pulse to trigger the sensor
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    // 3. Measure the duration of the incoming echo pulse.
    // Timeout set to 25000us (25ms), allowing measurement up to approx 4.3m.
    long duration = pulseIn(ECHO_PIN, HIGH, 25000); 

    // Return -1.0 if the sensor times out (no echo received)
    if (duration == 0) return -1.0; 

    // Calculate distance (cm): Duration * Speed of Sound (0.0343 cm/µs) / 2
    return (duration * 0.0343) / 2.0;
}

// ---------------- WATER LEVEL FUNCTION -------------------
/**
 * Reads the raw analog value from the water level sensor.
 */
int getWaterLevel() {
    // Reads a value between 0 (low voltage/no water) and 4095 (high voltage/max water)
    return analogRead(WATER_LEVEL_PIN);
}

// ---------------- SEND CALLBACK -----------------
/**
 * Callback function executed after an ESP-NOW packet is sent.
 */
void OnSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("Send Failed — Re-adding peer...");

    // This block re-adds the peer on failure to recover the connection
    esp_now_peer_info_t peer;
    memcpy(peer.peer_addr, gatewayMAC, 6);
    peer.channel = FIXED_CHANNEL;
    peer.encrypt = false;
    peer.ifidx = WIFI_IF_STA;

    esp_now_add_peer(&peer);
  } else {
    Serial.println("Send OK");
  }
}

void setup() {
  Serial.begin(115200);

  // ----------- SENSOR PIN INIT (Best Practice) -----------
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  // WATER_LEVEL_PIN (34) is an analog input, which is the default.

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
  Serial.print("Node MAC: ");
  Serial.println(WiFi.macAddress());

  // Force WiFi channel to 6 for ESP-NOW/WiFi coexistence
  esp_wifi_set_channel(FIXED_CHANNEL, WIFI_SECOND_CHAN_NONE);
  Serial.print("Using Channel: ");
  Serial.println(FIXED_CHANNEL);

  // ------------- ESP-NOW INIT -------------
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW Init Failed! Restarting...");
    // A fatal error; consider a reset here
    delay(1000);
    ESP.restart(); 
  }

  esp_now_register_send_cb(OnSent);

  // ----------- ADD GATEWAY PEER -----------
  esp_now_peer_info_t peer;
  memcpy(peer.peer_addr, gatewayMAC, 6);
  peer.channel = FIXED_CHANNEL;
  peer.encrypt = false;
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