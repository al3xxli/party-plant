// Plant Band USB — Arduino UNO R3 / ATmega328P (also compatible with UNO R4).
// Upload this sketch instead of the older piezo/SoftPot sketch.
// Library Manager: Adafruit MPR121, including Adafruit BusIO when prompted.
// A0 flex divider; A2 FSR divider; A4 SDA; A5 SCL. A1 is unused.
// Adafruit MPU6050 in the pot shares I2C with MPR121. VIN -> 5V.
// MPR121 E0 stem copper; E1 separate pot copper. Laptop generates the audio.
#include <Wire.h>
#include <Adafruit_MPR121.h>

constexpr uint8_t FLEX_PIN = A0, FORCE_PIN = A2;
constexpr uint8_t TOUCH_ADDRESS = 0x5A;
constexpr uint32_t SAMPLE_MS = 10, SEND_MS = 20, RETRY_MS = 2000;
Adafruit_MPR121 touch;
bool touchReady = false;
float flexValue, forceValue;
uint32_t lastSample = 0, lastSend = 0, lastRetry = 0, sequence = 0;
uint8_t mpuAddress = 0x68;
bool mpuConfigured = false;
uint32_t mpuStarted = 0;
int16_t accel[3] = {}, gyro[3] = {};

// Tune each electrode's charging parameters before establishing its baseline.
// Fixed defaults produced zero baselines and out-of-range errors on this plant.
// Keep hands off the copper during startup/reconnection; thresholds stay 12/6.
bool startTouch() {
  return touch.begin(TOUCH_ADDRESS, &Wire, 12, 6, true);
}

bool readRegisters(uint8_t address, uint8_t reg, uint8_t* data, uint8_t count) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(address, count) != count) {
    while (Wire.available()) Wire.read();
    return false;
  }
  for (uint8_t i = 0; i < count; ++i) data[i] = Wire.read();
  return true;
}
bool writeMPU(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(mpuAddress);Wire.write(reg);Wire.write(value);
  return Wire.endTransmission() == 0;
}
bool startMPU() {
  for (uint8_t address = 0x68; address <= 0x69; ++address) {
    uint8_t id = 0;
    if (!readRegisters(address, 0x75, &id, 1) || id != 0x68) continue;
    mpuAddress = address;
    // Awake, gyro PLL clock, all axes enabled, no FIFO or auxiliary I2C master.
    // ±2g (16384 LSB/g), ±250 deg/s (131 LSB/deg/s), 21 Hz filter, 100 Hz sample.
    if (writeMPU(0x6B, 0x01) && writeMPU(0x6C, 0) && writeMPU(0x6A, 0) &&
        writeMPU(0x23, 0) && writeMPU(0x1C, 0) && writeMPU(0x1B, 0) &&
        writeMPU(0x1A, 4) && writeMPU(0x19, 9)) {
      mpuStarted = millis();return true;
    }
  }
  return false;
}
bool readMPU(uint32_t now) {
  if (!mpuConfigured || uint32_t(now - mpuStarted) < 100) return false;
  uint8_t bytes[14];
  if (!readRegisters(mpuAddress, 0x3B, bytes, 14)) {mpuConfigured = false;return false;}
  for (uint8_t axis = 0; axis < 3; ++axis) {
    accel[axis] = int16_t((uint16_t(bytes[axis*2]) << 8) | bytes[axis*2+1]);
    gyro[axis] = int16_t((uint16_t(bytes[8+axis*2]) << 8) | bytes[9+axis*2]);
  }
  return true;
}

// Discard the first conversion after changing ADC channels. Averaging and the
// RC capacitors in the wiring guide help these high-resistance dividers settle.
int readSensor(uint8_t pin) {
  analogRead(pin);
  int sum = 0;
  for (uint8_t i = 0; i < 4; ++i) sum += analogRead(pin);
  return (sum + 2) / 4;
}

void setup() {
  Serial.begin(115200);
  // UNO R4 supports higher resolutions; the shared protocol is always 10-bit.
#if defined(ARDUINO_ARCH_RENESAS_UNO)
  analogReadResolution(10);
#endif
  Wire.begin();
  Wire.setClock(100000);
#if defined(ARDUINO_ARCH_AVR)
  Wire.setWireTimeout(25000, true);
#endif
  // Keep hands away while the capacitive controller establishes its baseline.
  touchReady = startTouch();
  mpuConfigured = startMPU();
  flexValue = readSensor(FLEX_PIN);
  forceValue = readSensor(FORCE_PIN);
  // No while(!Serial): the board must keep sampling when the browser is closed.
}

void loop() {
  const uint32_t now = millis();
  if (uint32_t(now - lastSample) >= SAMPLE_MS) {
    lastSample = now;
    flexValue += 0.25f * (readSensor(FLEX_PIN) - flexValue);
    forceValue += 0.25f * (readSensor(FORCE_PIN) - forceValue);
  }
  if (uint32_t(now - lastRetry) >= RETRY_MS) {
    lastRetry = now;
    if (!touchReady) {
      touchReady = startTouch();
    }
    if (!mpuConfigured) mpuConfigured = startMPU();
  }
  if (uint32_t(now - lastSend) < SEND_MS) return;
  lastSend = now;
  const bool imuReady = readMPU(now);
  if (!imuReady) for (uint8_t i = 0; i < 3; ++i) {accel[i] = 0;gyro[i] = 0;}
  uint16_t touched = 0;
  if (touchReady) {
    Wire.beginTransmission(TOUCH_ADDRESS);
    touchReady = Wire.endTransmission() == 0;
    if (touchReady) touched = touch.touched();
  }
  if (!Serial) return;

  // One complete newline-delimited JSON sample, with all five inputs together.
  // Sequence changes even with still hands; the browser detects frozen streams.
  char packet[224];
  const int length = snprintf(packet, sizeof(packet),
    "{\"type\":\"plantband\",\"v\":2,\"seq\":%lu,\"flex\":%d,\"fsr\":%d,\"touch\":%u,\"pot\":%u,\"mpr\":%s,\"imu\":%s,\"a\":[%d,%d,%d],\"g\":[%d,%d,%d]}\n",
    (unsigned long)sequence++, int(flexValue + 0.5f), int(forceValue + 0.5f),
    (unsigned)((touched & 1) != 0), (unsigned)((touched & 2) != 0), touchReady ? "true" : "false",
    imuReady ? "true" : "false", int(accel[0]), int(accel[1]), int(accel[2]), int(gyro[0]), int(gyro[1]), int(gyro[2]));
  if (length > 0 && length < int(sizeof(packet))) Serial.write((const uint8_t*)packet, length);
}
