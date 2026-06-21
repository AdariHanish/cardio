# Complete Beginner's Guide: ESP32 Setup & Project Workflow

This guide will walk you through exactly how to connect your ESP32 to your laptop, upload the code, and how the entire system communicates with your website.

---

## 🛠️ Step 1: Install Required Software on your Laptop

Because you are using an ESP32, you need special software to compile the code and push it to the board.

1. **Download Arduino IDE**: 
   - Go to the [Arduino Software page](https://www.arduino.cc/en/software) and download the latest version for Windows.
   - Install it like a normal program.
2. **USB Drivers (Important!)**: 
   - Most ESP32 boards use a `CP2102` or `CH340` USB-to-UART chip. If your laptop doesn't recognize the ESP32 when you plug it in, you need to download and install the **CP210x USB to UART Bridge VCP Drivers** from Silicon Labs (just Google it and download the Windows version).

---

## ⚙️ Step 2: Configure Arduino IDE for ESP32

By default, Arduino IDE only knows how to talk to standard Arduino boards. You need to teach it about the ESP32.

1. Open **Arduino IDE**.
2. Go to **File > Preferences**.
3. Look for the box named **Additional Boards Manager URLs**. Paste this exact link into the box:
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
4. Click **OK**.
5. Go to **Tools > Board > Boards Manager...**
6. In the search bar on the left, type `esp32`.
7. You will see a result by "Espressif Systems". Click **Install**. (This might take a few minutes as it downloads the ESP32 toolkit).

---

## 📚 Step 3: Install Required Code Libraries

Our `esp32_main.ino` code uses several external libraries to talk to the sensors and the internet.

1. In Arduino IDE, go to **Sketch > Include Library > Manage Libraries...**
2. A sidebar will open. Search for and **Install** the following libraries one by one:
   - `ArduinoJson` (by Benoit Blanchon) - *Used for sending data to your website.*
   - `LiquidCrystal I2C` (by Frank de Brabander) - *Used for your LCD display.*
   - `SparkFun MAX3010x Pulse and Proximity Sensor Library` - *Used for the MAX30102 heart rate sensor.*
   - `Adafruit ADS1X15` - *Used for the ADS1115 analog-to-digital converter (for the ECG).*

---

## 💻 Step 4: Prepare and Upload the Code

1. **Open the Code**: In Arduino IDE, go to **File > Open** and select your `C:\Users\honey\Desktop\cardiovascular_project\esp32_code\esp32_main.ino` file.
2. **Edit Wi-Fi & Server Settings**:
   - Scroll down to line 30-31 in the code.
   - Change `"YOUR_WIFI_NAME"` to your actual house/mobile hotspot Wi-Fi Name.
   - Change `"YOUR_WIFI_PASSWORD"` to your actual Wi-Fi password.
   - Change `"YOUR_FLASK_SERVER_IP"` to the IP address of your computer (if testing locally) or your Vercel URL (e.g., `https://your-vercel-app.vercel.app`).
3. **Connect the ESP32**: Plug the ESP32 into your laptop using a Micro-USB or USB-C data cable.
4. **Select the Board & Port**:
   - Go to **Tools > Board > ESP32 Arduino** and select **DOIT ESP32 DEVKIT V1** (or whichever specific ESP32 model you bought).
   - Go to **Tools > Port** and select the `COM` port that appeared (e.g., `COM3` or `COM4`).
5. **Upload**: Click the Right-Arrow icon `(→)` in the top left corner of Arduino IDE to "Upload".
   - *Note: When the console at the bottom says "Connecting...", you might need to press and hold the "BOOT" button physically located on your ESP32 board until it starts writing the data.*

---

## 🌐 Step 5: How the Whole System Works Together

Now that the code is on the ESP32, here is exactly how the magic happens:

### 1. The Setup Phase
When you plug the ESP32 into a battery, it turns on.
- It connects to your Wi-Fi using the credentials you provided.
- The LCD Display shows "CardioCare AI" and then "Ready. Waiting for website...".
- The Buzzer plays a quick startup melody so you know it's alive.

### 2. Taking Values (The Measurement Phase)
- The ESP32 sits and waits. It acts as an "IoT Node".
- The patient places their finger on the MAX30102 sensor and attaches the AD8232 ECG pads.
- You (the doctor/admin) go to the website, enter the Patient ID, and click **"Start Measurement"**.
- The ESP32 begins reading raw data from the MAX30102 (Pulse/SpO2) and the ADS1115 (ECG signals) using the I2C wires (`SDA` and `SCL`).

### 3. Connecting to the Website
- Once the ESP32 has collected a batch of readings (e.g., average heart rate and SpO2), it packages them into a neat JSON text block.
- It uses its Wi-Fi antenna to send an `HTTP POST` request directly to your Flask Backend server at the URL `/api/inference`. 

### 4. Cloud AI & Database
- Your Python backend receives the JSON data from the ESP32.
- The backend takes these vitals and feeds them into the `.h5` AI Models stored in your TiDB Database.
- The AI predicts the percentage risk of Arrhythmia, Heart Attack, Stroke, and Hypertension.
- The backend automatically saves this entire reading (vitals + AI predictions) securely into your TiDB database under that specific Patient ID.

### 5. Final Display
- The Python backend replies to the ESP32's HTTP request with the final AI predictions.
- The ESP32 receives this reply, parses the JSON, and **prints the Risk Percentages directly onto the physical LCD Display**.
- The buzzer beeps to signal that the test is completely finished and the patient can remove their finger!
- Simultaneously, the website dashboard automatically updates to show the beautiful colored progress bars.
