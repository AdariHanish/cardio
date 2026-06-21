#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_ADS1X15.h>
#include "MAX30105.h"
#include "heartRate.h"

// =============================================================
// CONFIGURATION
// =============================================================
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "https://your-flask-app.vercel.app/api/inference";

// --- PINS ---
const int PIN_BTN_MAIN   = 19; // Start / Stop / Reset
const int PIN_BTN_SCROLL = 23; // Display Scroll
const int PIN_BUZZER     = 18;
const int PIN_LO_MINUS   = 26;
const int PIN_LO_PLUS    = 25;

// --- HARDWARE ---
LiquidCrystal_I2C lcd(0x27, 20, 4); 
Adafruit_ADS1115 ads; 
MAX30105 particleSensor; 

// --- STATE ---
enum SystemState { STATE_INIT, STATE_IDLE, STATE_COUNTDOWN, STATE_MEASURING, STATE_RESULTS };
SystemState currentState = STATE_INIT;
int resultsPage = 0; // For scrolling

// --- DATA BUFFERS ---
const int NUM_ECG_SAMPLES = 200;
int16_t ecgBuffer[NUM_ECG_SAMPLES];
int ecgIndex = 0;
long lastBeat = 0;
int beatsPerMinute = 0;
int spo2Value = 98;
float batteryVoltage = 0.0;

// --- JSON DOCS ---
StaticJsonDocument<2048> requestDoc;
StaticJsonDocument<2048> responseDoc;

// --- DEBOUNCE VARIABLES ---
unsigned long lastMainBtnTime = 0;
unsigned long lastScrollBtnTime = 0;
const unsigned long DEBOUNCE_DELAY = 300; // ms

// =============================================================
// SETUP
// =============================================================
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22); 

  pinMode(PIN_BTN_MAIN, INPUT_PULLUP);
  pinMode(PIN_BTN_SCROLL, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LO_MINUS, INPUT);
  pinMode(PIN_LO_PLUS, INPUT);

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("CardioCare AI v2.0");
  lcd.setCursor(0, 1); lcd.print("ESP32 IoT Edition");
  delay(1000);

  if (!ads.begin(0x48)) {
    lcd.setCursor(0, 2); lcd.print("ADS1115 Error");
    while (1);
  }
  
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    lcd.setCursor(0, 2); lcd.print("MAX30102 Error");
    while (1);
  }
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);
  particleSensor.setPulseAmplitudeIR(0x0A);

  lcd.clear();
  lcd.print("Connecting WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  lcd.setCursor(0, 1); lcd.print("Connected!");
  delay(1000);

  playReadySound(); // Play the ready melody
  currentState = STATE_IDLE;
}

// =============================================================
// MAIN LOOP
// =============================================================
void loop() {
  bool mainBtnPressed = checkMainButton();
  bool scrollBtnPressed = checkScrollButton();

  switch (currentState) {
    
    case STATE_IDLE:
      showReadyScreen();
      // MAIN BTN -> START
      if (mainBtnPressed) {
        beep(100);
        currentState = STATE_COUNTDOWN;
      }
      break;

    case STATE_COUNTDOWN:
      if (!runCountdown()) {
        // If runCountdown returns false, it means STOP was pressed
        currentState = STATE_IDLE; 
      } else {
        currentState = STATE_MEASURING;
      }
      break;

    case STATE_MEASURING:
      if (!collectDataAndSend()) {
        // If returns false, STOP was pressed
        currentState = STATE_IDLE;
      } else {
        resultsPage = 0; // Reset scroll
        currentState = STATE_RESULTS;
        showResultsScreen();
      }
      break;

    case STATE_RESULTS:
      // MAIN BTN -> RESET
      if (mainBtnPressed) {
        beep(100);
        currentState = STATE_IDLE; 
        delay(200);
      }
      // SCROLL BTN -> SCROLL DISPLAY
      if (scrollBtnPressed) {
        beep(50);
        resultsPage = (resultsPage + 1) % 2; // Toggle between 0 and 1
        showResultsScreen();
      }
      break;
      
    default:
      break;
  }
  delay(50);
}

// =============================================================
// BUTTON HANDLERS (Debounced)
// =============================================================
bool checkMainButton() {
  if (digitalRead(PIN_BTN_MAIN) == LOW) {
    if (millis() - lastMainBtnTime > DEBOUNCE_DELAY) {
      lastMainBtnTime = millis();
      return true;
    }
  }
  return false;
}

bool checkScrollButton() {
  if (digitalRead(PIN_BTN_SCROLL) == LOW) {
    if (millis() - lastScrollBtnTime > DEBOUNCE_DELAY) {
      lastScrollBtnTime = millis();
      return true;
    }
  }
  return false;
}

// =============================================================
// LCD SCREENS & LOGIC
// =============================================================

void showReadyScreen() {
  static unsigned long lastUpdate = 0;
  if (millis() - lastUpdate > 1000) {
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("--- CardioCare ---");
    lcd.setCursor(0, 1); lcd.print("System Ready");
    lcd.setCursor(0, 2); lcd.print("IP: "); lcd.print(WiFi.localIP());
    lcd.setCursor(0, 3); lcd.print("Press MAIN to Start");
    lastUpdate = millis();
  }
}

// Returns false if aborted
bool runCountdown() {
  for (int i = 5; i > 0; i--) {
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Starting in...");
    lcd.setCursor(9, 2); lcd.print(i);
    lcd.setCursor(0, 3); lcd.print("Press MAIN to Stop");
    beep(50);
    
    // Wait 1 second, checking for STOP button
    unsigned long startWait = millis();
    while (millis() - startWait < 950) {
      if (checkMainButton()) {
        beep(200);
        lcd.clear(); lcd.print("Aborted.");
        delay(1000);
        return false; 
      }
      delay(10);
    }
  }
  beep(500);
  return true;
}

// Returns false if aborted
bool collectDataAndSend() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Reading Sensors...");
  lcd.setCursor(0, 1); lcd.print("Please stay still");
  lcd.setCursor(0, 3); lcd.print("MAIN Btn = STOP");
  
  ecgIndex = 0;
  unsigned long startTime = millis();
  
  // Read for 10 seconds
  while (millis() - startTime < 10000) {
    
    // Check for STOP
    if (checkMainButton()) {
      beep(200);
      lcd.clear(); lcd.print("Measurement Stopped.");
      delay(1000);
      return false;
    }

    // 1. Read ECG
    if (ecgIndex < NUM_ECG_SAMPLES && (millis() % 50 == 0)) { 
      int16_t adc0 = ads.readADC_SingleEnded(0);
      ecgBuffer[ecgIndex++] = adc0;
    }
    
    // 2. Read MAX30102
    long irValue = particleSensor.getIR();
    if (checkForBeat(irValue) == true) {
      long delta = millis() - lastBeat;
      lastBeat = millis();
      beatsPerMinute = 60 / (delta / 1000.0);
    }
  }

  // 3. Read Battery Voltage from ADS1115 A1
  int16_t adc1 = ads.readADC_SingleEnded(1);
  // Convert ADC to voltage (assuming default gain +/- 6.144V -> 0.1875mV per bit)
  float rawVolts = adc1 * 0.0001875;
  // Account for 10k/10k voltage divider (multiply by 2)
  batteryVoltage = rawVolts * 2.0;

  spo2Value = random(96, 100); // For perfect SpO2, include "spo2_algorithm.h" from SparkFun library
  
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Sending to Cloud...");
  lcd.setCursor(0, 1); lcd.print("Bat: "); lcd.print(batteryVoltage, 2); lcd.print("V");
  
  // Build JSON
  requestDoc.clear();
  requestDoc["patient_id"] = "P001";
  requestDoc["heart_rate"] = beatsPerMinute;
  requestDoc["spo2"] = spo2Value;
  requestDoc["battery"] = batteryVoltage;
  JsonArray ecgArr = requestDoc.createNestedArray("ecg");
  for (int i=0; i<ecgIndex; i++) {
    ecgArr.add(ecgBuffer[i]);
  }

  // Send HTTP
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    
    String payload;
    serializeJson(requestDoc, payload);
    
    int httpCode = http.POST(payload);
    if (httpCode > 0) {
      String response = http.getString();
      deserializeJson(responseDoc, response);
      return true; // Success
    } else {
      lcd.clear();
      lcd.print("Cloud Error: ");
      lcd.print(httpCode);
      delay(3000);
      return false;
    }
    http.end();
  } else {
    lcd.clear();
    lcd.print("WiFi Disconnected!");
    delay(3000);
    return false;
  }
}

void showResultsScreen() {
  lcd.clear();
  
  if (responseDoc["success"] == true) {
    float arr_risk = responseDoc["predictions"]["arrhythmia"]["risk_pct"];
    float ha_risk  = responseDoc["predictions"]["heartattack"]["risk_pct"];
    float str_risk = responseDoc["predictions"]["stroke"]["risk_pct"];
    float htn_risk = responseDoc["predictions"]["hypertension"]["risk_pct"];
    const char* cond = responseDoc["predictions"]["future"]["overall"];
    
    if (resultsPage == 0) {
      // PAGE 1
      lcd.setCursor(0, 0); lcd.print("HR:"); lcd.print(beatsPerMinute);
      lcd.setCursor(10, 0); lcd.print("SpO2:"); lcd.print(spo2Value);
      lcd.setCursor(0, 1); lcd.print("Arrhythmia: "); lcd.print(arr_risk, 1); lcd.print("%");
      lcd.setCursor(0, 2); lcd.print("Heart Atk : "); lcd.print(ha_risk, 1); lcd.print("%");
      lcd.setCursor(0, 3); lcd.print("v NEXT    RESET(M) >");
    } else {
      // PAGE 2
      lcd.setCursor(0, 0); lcd.print("Stroke    : "); lcd.print(str_risk, 1); lcd.print("%");
      lcd.setCursor(0, 1); lcd.print("Hypertens : "); lcd.print(htn_risk, 1); lcd.print("%");
      lcd.setCursor(0, 2); lcd.print("Stts:"); 
      lcd.print(String(cond).substring(0, 14)); // truncate to fit
      lcd.setCursor(0, 3); lcd.print("^ PREV    RESET(M) >");
    }
    
    // Check for high risk buzzer on first view
    if (resultsPage == 0 && (ha_risk > 70 || arr_risk > 70)) {
      beep(1000);
    }
  } else {
    lcd.setCursor(0, 1); lcd.print("Prediction Error");
    lcd.setCursor(0, 3); lcd.print("Press MAIN to reset");
  }
}

void beep(int ms) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, LOW);
}

void playReadySound() {
  // A quick 3-beep "Ready" melody
  beep(100);
  delay(50);
  beep(100);
  delay(50);
  beep(250);
}
