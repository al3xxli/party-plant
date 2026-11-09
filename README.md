# Plant Band

A playable p5.js version of the photographed trailing vine and glazed ceramic pot. Use the virtual controls or connect an **Arduino UNO R3** over USB. The laptop runs the Sonic Pi score and animates the plant. All four gestures can be used together.

## Source code

- [Interface](src/interface/) contains the playable page, p5.js animation, audio, and USB connection.
- [Sonic Pi score](src/interface/score/plant_band.rb) runs in the browser using the bundled Ruby runtime and SuperSonic audio engine.
- [Arduino sketch](src/interface/firmware/PlantBandUSB/PlantBandUSB.ino) runs on the UNO R3. The setup page offers this same file for download.
- [Tools](src/tools/) contains the wiring diagram generator.
- [Tests](src/tests/) cover USB input and audio behavior.

## Connect the real plant

1. Follow the [full visual wiring guide](src/interface/arduino-setup.html) and [breadboard map](src/interface/wiring/PlantBand-UNO-R3-Wiring.pdf). **A0 is flex**, A2 is FSR, and **A1 is unused**. The Adafruit MPU6050 and MPR121 share A4/SDA and A5/SCL. MPR121 E0 is the stem. Leave E1 unused.
2. Open [PlantBandUSB.ino](src/interface/firmware/PlantBandUSB/PlantBandUSB.ino) in Arduino IDE. Select **Arduino Uno** under **Arduino AVR Boards**. Install **Adafruit MPR121 1.2.1 or later** and its **Adafruit BusIO** dependency, then upload. Connect the copper electrode before starting and keep hands off it while automatic electrode calibration runs.
3. Close Serial Monitor/Plotter. Run the local server below or open the Vercel HTTPS site in desktop Chrome or Edge. Click **Connect Arduino** and choose the board. A previously permitted, uniquely identifiable UNO can reconnect on the button click without another chooser.
4. Open **Sensor setup**. Under **Connected sensors**, enable only the sensors actually attached. The project starts with **Bend only** and the measured **275 resting curl → 375 extended** range. Capture new rest/extended and released/pinched endpoints as needed. For the MPU6050, enable **Pot tilt**, hold the pot still in its normal position and choose **Set upright**. Then hold it at a comfortable tilt and choose **Set full tilt** (6–60°, default 30°). Settings are saved locally for this browser and site. Existing flex/FSR calibration is preserved when upgrading.
5. Play together. Live hardware owns the instrument controls; they display the sensor response. Volume and mute still work. **Stop**, Escape, losing focus or hiding the page pauses sound; **Resume sound** continues. Disconnect to use the virtual demo again.

The four sensor values drive the score's bend, pinch, tilt and touch cues. E0 detects contact and release. Bend shapes the notes played by a pinching performer. The MPU6050 measures pot tilt for the swelling pad.

For the user's **Adafruit MPU6050 VIN / STEMMA QT breakout**, connect **VIN → 5V, GND → GND, SDA → A4, SCL → A5**. Leave AD0 at its default low address (0x68); the sketch also detects 0x69. INT is unused. This Adafruit board has a regulator and level-shifted I²C; do not assume a bare MPU6050 or other breakout accepts the same power wiring. Fasten the board to a dry part of the pot so it moves with it. [Adafruit pinouts](https://learn.adafruit.com/mpu6050-6-dof-accelerometer-and-gyro/pinouts)

Use the included USB sketch and wiring guide for this four-input setup. Earlier SoftPot/piezo instructions do not apply to it.

The current physical build uses **four inputs**: flex, leaf pinch, MPU6050 pot tilt and stem copper on **MPR121 E0**. Touching the stem highlights its copper contact and displays **Stem touched** until release.

## Play locally

For USB, run `python -m http.server 8080 --directory src/interface` from this folder and open `http://localhost:8080` in desktop Chrome or Edge. Web Serial requires a suitable browser and secure context (HTTPS or localhost). If an embedded preview does not show a USB chooser, open the address directly in Chrome or Edge. USB readings stay in the local browser, not on a server.

Click **Play demo** to hear the score's repeating 16-bar performance. Play a control or connect the Arduino to take over. The Ruby worker and audio engine load from this site on the first gesture. Use localhost or HTTPS, including for the demo. All runtime files are bundled for offline localhost use.

| Gesture | Score part | Try it on the laptop |
| --- | --- | --- |
| Pinch a leaf | TB-303 arpeggio. A firm pinch adds Prophet chords at the start of a bar. | Hold F or Shift + F. |
| Bend the stem | Opens the arpeggio filter and adds glide between its notes. Bend acts on the pinched part. | Hold F and B together, then use the arrow keys. |
| Tilt the pot | A reverberant Blade pad swells and brightens with tilt. | Drag the pot sideways or adjust Tilt. |
| Touch the stem | Kick, clap and closed hi-hat pattern. | Hold C or touch the copper. |

The [upstream Ruby score](https://github.com/joykeeee/party-plant-clips/blob/cc5ac5b47658ae754edfd91965c7c408eb896181/plant_band.rb) sets the 96 BPM clock and the Am, F, C, G progression. The browser edition adds three unity-gain mix buses, a cue to animate the self-play performance, and a manual start setting. Each sensor reaches the Ruby program via its existing cue address. Sound balance adjusts keys, pad and drums. Master volume and Stop affect the full output. Browser mode reads the UNO directly, so the external Python serial bridge is unnecessary.

The wiring drawing includes an unused E1 pot pad. Wire only the stem electrode on E0. Verify your breakout's voltage rating: the pictured layout assumes a verified 5V-safe breakout such as Adafruit, powered at VIN. A bare MPR121 or 3.3V-only clone requires appropriate supply and level shifting. [MPR121 electrode guidance](https://learn.adafruit.com/adafruit-mpr121-12-key-capacitive-touch-sensor-breakout-tutorial/electrodes)

## Serial contract and checks

115200 baud; newline-delimited JSON at approximately 50 packets/second, raw ADC values 0–1023:

```json
{"type":"plantband","v":2,"seq":1,"flex":275,"fsr":0,"touch":0,"pot":0,"mpr":true,"imu":true,"a":[0,0,16384],"g":[0,0,0]}
```

`a` and `g` are raw signed 16-bit XYZ readings: acceleration at ±2 g (16384 counts/g) and angular speed at ±250°/s (131 counts per °/s). The sketch reads the MPU6050 through Wire directly; no additional MPU library is needed. Its accelerometer estimates tilt relative to the saved upright direction, for the pad. A fast shake can temporarily distort the gravity estimate; this is not an absolute compass heading.

`seq` advances for each packet, including when the plant is still. `mpr` and `imu` report sensor availability. A missing MPU6050 silences only tilt; a missing MPR121 releases the drum input. Missing sensors are retried periodically. Analog channels are sampled at 100 Hz and smoothed on the board. Browser mapping handles either flex direction and uses separate on/off thresholds. Invalid, oversized or partial lines cannot inject values. Lost or repeated packets silence all voices after about one second; recovery stays paused until Resume. The initial sketch detection timeout is five seconds. A USB unplug closes the reader and releases all notes. Version 1 packets remain compatible for flex, FSR and touch, but their old soil value is ignored.

Run `node --test src/tests/usb.test.cjs`. The tests exercise chunk boundaries, malformed data, all four simultaneous mappings, calibration storage, missing hardware, paused/recovered streams, port cancellation and stream cleanup. The connection tests use a simulated serial stream and record values sent to the score.

Early hardware check on 2026-11-06 (superseded by the later checks below): the updated MPU6050 sketch compiled and uploaded to the detected UNO R3 on COM13 (11,390 bytes program / 592 bytes static RAM). Its version 2 stream was read successfully. The MPU6050 and MPR121 report absent; the user confirmed the MPU6050 is not connected yet. Only flex is physically wired, so pot motion, FSR and both touch inputs remain unverified on hardware and are off by default. All-five concurrency and missing-sensor behavior are covered by simulated serial/audio tests, not a five-person hardware trial.

Previously verified with the user: flex on A0 animates the plant, changes laptop pitch, is silent at its resting curl, and stops on USB unplug. The original 275 → 375 endpoints were subsequently recalibrated by the user. Later testing confirmed both I2C boards connected and all four physical interactions producing sound.

## Deploy to Vercel

Use this directory (the one containing `vercel.json`) as the Vercel project root. For a Git import choose the **Other** framework preset, leave the build command empty, and serve the **src/interface** output directory. No dependencies, server, or environment variables are required.

Alternatively, run `npx vercel` from this directory for a preview deployment and `npx vercel --prod` for production. Vercel will ask you to sign in or choose a project if needed.

The bundled p5.js distribution is version 1.11.11. Its license is in `src/interface/vendor/p5-LICENSE.txt`. [p5.js source](https://github.com/processing/p5.js/tree/v1.11.11) · [Vercel static build settings](https://vercel.com/docs/builds/configure-a-build)

## Stem touch verification — 2026-11-06

The MPR121 communicated over I²C but reported an out-of-range condition, zero baselines and no E0 touch events with the previous initialization. Enabling automatic electrode charging calibration in `begin(..., true)` cleared the error while keeping the original 12/6 touch/release thresholds. The untouched E0 reading settled at 712–715 with no touches; a user-held copper test then registered E0 in all 57 samples with no other electrodes triggered. Release then cleared E0 in all 57 samples, again with no range errors. The complete music sketch compiled at 11,392 bytes program / 592 bytes static RAM and was uploaded to the UNO R3. The user confirmed that the laptop chimes sound while touching the copper and stop on release. The application uses this initialization both at startup and when recovering a missing MPR121. Pot touch is disabled in the current browser setup because no E1 electrode is installed. Recalibrate hands-off after changing the copper or its wire.

## Sound balance iteration - 2026-11-06

During a simultaneous FSR and stem-copper test, both channels were active and the user heard both sounds, but one was hard to distinguish. The synthesized version introduced independent mix gains for the four physical parts, a stronger drum attack and a higher chime register. The collapsed Sound balance panel saves levels locally without altering sensor calibration. Nine automated tests pass, including independent mix changes during concurrent input, stored settings, stopping and disconnection. Browser checks confirmed slider persistence, reset and demo playback without console errors. The revised balance still needs a physical group listening test.
