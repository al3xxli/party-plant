# Plant Band

A playable p5.js version of the photographed trailing vine and glazed ceramic pot. Use the virtual controls or connect an **Arduino UNO R3** over USB. The laptop creates all five sounds and animations simultaneously.

## Connect the real plant

1. Follow the [full visual wiring guide](public/arduino-setup.html) and [breadboard map](public/wiring/PlantBand-UNO-R3-Wiring.pdf). **A0 is flex**, A2 is FSR, and **A1 is unused**. The Adafruit MPU6050 and MPR121 share A4/SDA and A5/SCL. MPR121 E0 is the stem and E1 is the separate pot pad.
2. Open [PlantBandUSB.ino](public/firmware/PlantBandUSB/PlantBandUSB.ino) in Arduino IDE. Select **Arduino Uno** under **Arduino AVR Boards**. Install **Adafruit MPR121 1.2.1 or later** and its **Adafruit BusIO** dependency, then upload. Connect the copper electrode before starting and keep hands off it while automatic electrode calibration runs.
3. Close Serial Monitor/Plotter. Run the local server below or open the Vercel HTTPS site in desktop Chrome or Edge. Click **Connect Arduino** and choose the board. A previously permitted, uniquely identifiable UNO can reconnect on the button click without another chooser.
4. Open **Sensor setup**. Under **Connected sensors**, enable only the sensors actually attached. The project starts with **Bend only** and the measured **275 resting curl → 375 extended** range. Capture new rest/extended and released/pinched endpoints as needed. For the MPU6050, enable **Pot tilt**, hold the pot still in its normal position and choose **Set upright**. Then hold it at a comfortable tilt and choose **Set full tilt** (6–60°, default 30°). Settings are saved locally for this browser and site. Existing flex/FSR calibration is preserved when upgrading.
5. Play together. Live hardware owns the instrument controls; they display the sensor response. Volume and mute still work. **Stop**, Escape, losing focus or hiding the page pauses sound; **Resume sound** continues. Disconnect to use the virtual demo again.

The UNO reads all five inputs in each packet. There is no exclusive instrument switching and no piezo output in this sketch. A continuous copper stem electrode provides touch/release, not finger position; the separate flex sensor provides continuous pitch. Pot tilt replaces moisture: tilt selects bass notes, returning upright silences them, and faster rotation accents the bass while it plays.

For the user's **Adafruit MPU6050 VIN / STEMMA QT breakout**, connect **VIN → 5V, GND → GND, SDA → A4, SCL → A5**. Leave AD0 at its default low address (0x68); the sketch also detects 0x69. INT is unused. This Adafruit board has a regulator and level-shifted I²C; do not assume a bare MPU6050 or other breakout accepts the same power wiring. Fasten the board to a dry part of the pot so it moves with it. [Adafruit pinouts](https://learn.adafruit.com/mpu6050-6-dof-accelerometer-and-gyro/pinouts)

Use the included USB sketch and wiring guide for this five-input setup. Earlier SoftPot/piezo instructions do not apply to it.

The current physical build uses **four inputs**: flex, leaf pinch, MPU6050 pot tilt and stem copper on **MPR121 E0**. Leave **Pot touch** unchecked because no E1 pot electrode is attached. The optional fifth voice remains available in the demo and for a future E1 electrode.

## Play locally

For USB, run `python -m http.server 8080 --directory public` from this folder and open `http://localhost:8080` in desktop Chrome or Edge. Web Serial requires a suitable browser and secure context (HTTPS or localhost). If an embedded preview does not show a USB chooser, open the address directly in Chrome or Edge. USB readings stay in the local browser, not on a server.

The virtual demo also works by opening `public/index.html` directly. p5.js is bundled locally for offline use. Click **Play demo** for an eight-beat example; play an instrument to take over.

| Instrument | Mouse or touch | Keyboard |
| --- | --- | --- |
| Flex sensor | Grab the stem and drag to bend it. A deeper bend raises the melody. Release to let it spring back. The Bend control also works. | Hold B and use left/right arrows. |
| FSR on a leaf | Hold a leaf to pinch it. Drag while holding to squeeze harder. A firmer pinch gives a louder, faster beat. | Hold F. Shift + F gives a firm pinch. |
| Pot tilt / bass | Drag the pot sideways; release to return upright. The Tilt slider can hold a virtual tilted position. | Tab to the Tilt slider and use the arrow keys. |
| Capacitive stem touch | Hold the stem without dragging to sound the chimes. | Hold C. |
| Surprise pot chorus | Hold the pot for 0.7 seconds. A soft chord swells in and reveals the fifth control. Release to fade it out. | Hold P. |

Use multiple fingers on a touchscreen or combine keyboard and pointer input. All five parts can overlap. Escape stops the sounds, releases the bend and pinch, and returns the pot upright. The volume and mute controls affect the whole band.

The browser uses a 100 BPM bass pulse, high chime arpeggio, two-octave flex melody, pressure-driven percussion and a three-note pot chord. Open **Sound balance** to set the Bend, Pinch, Tilt and Touch levels independently. These settings stay in this browser; **Reset balance** restores the starting mix without changing sensor calibration. The chime sits an octave higher than before, and the drum has a stronger attack to help separate simultaneous parts.

For the pot, connect a separate copper pad on the exterior to MPR121 E1, with the stem on E0. Hide the pad on the back or beneath a thin nonconductive decorative layer. Keep it electrically separate from the soil and stem. Touching arbitrary uninstrumented ceramic is not assumed to register. Verify your breakout's voltage rating: the pictured layout assumes a verified 5V-safe breakout such as Adafruit, powered at VIN. A bare MPR121 or 3.3V-only clone requires appropriate supply and level shifting. [MPR121 electrode guidance](https://learn.adafruit.com/adafruit-mpr121-12-key-capacitive-touch-sensor-breakout-tutorial/electrodes)

## Serial contract and checks

115200 baud; newline-delimited JSON at approximately 50 packets/second, raw ADC values 0–1023:

```json
{"type":"plantband","v":2,"seq":1,"flex":275,"fsr":0,"touch":0,"pot":0,"mpr":true,"imu":true,"a":[0,0,16384],"g":[0,0,0]}
```

`a` and `g` are raw signed 16-bit XYZ readings: acceleration at ±2 g (16384 counts/g) and angular speed at ±250°/s (131 counts per °/s). The sketch reads the MPU6050 through Wire directly; no additional MPU library is needed. Its accelerometer estimates tilt relative to the saved upright direction, and gyro speed adds accents. A fast shake can temporarily distort the gravity estimate; this is not an absolute compass heading.

`seq` advances for each packet, including when the plant is still. `mpr` and `imu` report sensor availability. A missing MPU6050 silences only tilt; a missing MPR121 silences its two touch voices. Missing sensors are retried periodically. Analog channels are sampled at 100 Hz and smoothed on the board. Browser mapping handles either flex direction and uses separate on/off thresholds. Invalid, oversized or partial lines cannot inject values. Lost or repeated packets silence all voices after about one second; recovery stays paused until Resume. The initial sketch detection timeout is five seconds. A USB unplug closes the reader and releases all notes. Version 1 packets remain compatible for flex, FSR and touch, but their old soil value is ignored.

Run `node --test tests/usb.test.cjs`. The tests exercise chunk boundaries, malformed data, all five simultaneous mappings, calibration storage, missing hardware, paused/recovered streams, port cancellation and stream cleanup. The connection tests use a simulated serial stream and audio clock.

Early hardware check on 2026-11-06 (superseded by the later checks below): the updated MPU6050 sketch compiled and uploaded to the detected UNO R3 on COM13 (11,390 bytes program / 592 bytes static RAM). Its version 2 stream was read successfully. The MPU6050 and MPR121 report absent; the user confirmed the MPU6050 is not connected yet. Only flex is physically wired, so pot motion, FSR and both touch inputs remain unverified on hardware and are off by default. All-five concurrency and missing-sensor behavior are covered by simulated serial/audio tests, not a five-person hardware trial.

Previously verified with the user: flex on A0 animates the plant, changes laptop pitch, is silent at its resting curl, and stops on USB unplug. The original 275 → 375 endpoints were subsequently recalibrated by the user. Later testing confirmed both I2C boards connected and all four physical interactions producing sound.

## Deploy to Vercel

Use this directory (the one containing `vercel.json`) as the Vercel project root. For a Git import choose the **Other** framework preset, leave the build command empty, and serve the **public** output directory. No dependencies, server, or environment variables are required.

Alternatively, run `npx vercel` from this directory for a preview deployment and `npx vercel --prod` for production. Vercel will ask you to sign in or choose a project if needed.

The bundled p5.js distribution is version 1.11.11. Its license is in `public/vendor/p5-LICENSE.txt`. [p5.js source](https://github.com/processing/p5.js/tree/v1.11.11) · [Vercel static build settings](https://vercel.com/docs/builds/configure-a-build)

## Stem touch verification — 2026-11-06

The MPR121 communicated over I²C but reported an out-of-range condition, zero baselines and no E0 touch events with the previous initialization. Enabling automatic electrode charging calibration in `begin(..., true)` cleared the error while keeping the original 12/6 touch/release thresholds. The untouched E0 reading settled at 712–715 with no touches; a user-held copper test then registered E0 in all 57 samples with no other electrodes triggered. Release then cleared E0 in all 57 samples, again with no range errors. The complete music sketch compiled at 11,392 bytes program / 592 bytes static RAM and was uploaded to the UNO R3. The user confirmed that the laptop chimes sound while touching the copper and stop on release. The application uses this initialization both at startup and when recovering a missing MPR121. Pot touch is disabled in the current browser setup because no E1 electrode is installed. Recalibrate hands-off after changing the copper or its wire.

## Sound balance iteration - 2026-11-06

During a simultaneous FSR and stem-copper test, both channels were active and the user heard both sounds, but one was hard to distinguish. The browser now has independent mix gains for the four physical parts, a stronger drum attack and a higher chime register. The collapsed Sound balance panel saves levels locally without altering sensor calibration. Nine automated tests pass, including independent mix changes during concurrent input, stored settings, stopping and disconnection. Browser checks confirmed slider persistence, reset and demo playback without console errors. The revised balance still needs a physical group listening test.
