# Plant Band

A playable p5.js monstera for the four-sensor Arduino UNO R4 Minima instrument. Click **Play demo** for an eight-beat example. Play any instrument to take over.

## Play locally

Open `public/index.html` in your browser, then interact with a control to enable sound. The page includes p5.js locally and works offline. For a local HTTP preview, run `python -m http.server 8080 --directory public` from this folder and open `http://localhost:8080`.

| Instrument | Mouse or touch | Keyboard |
| --- | --- | --- |
| FSR drum | Tap the pot, or tap the drum pad farther right for a stronger hit. | F to strike. Shift + F for an accent. |
| Soil bass | Drag across the soil at the top of the pot, or set the moisture slider. The moisture stays where you leave it. | Tab to the moisture slider and use the arrow keys. |
| Copper chime | Hold a leaf or the chime pad. Lift to release. | Hold C. |
| Soft-pot lead | Press the strip and drag, or slide upward along the illustrated stem for a higher note. | Hold L. Tap or hold the left and right arrows to move in semitones. |

Use multiple fingers on a touchscreen or combine keyboard and pointer input. Escape stops all four voices and dries the soil. The volume and mute controls affect the whole band.

The mix uses the firmware’s four harmonic recipes, 100 BPM pulse, chime arpeggio, and two-octave lead. Browser speakers and a physical piezo have different loudness and frequency responses.

## Deploy to Vercel

Use this directory (the one containing `vercel.json`) as the Vercel project root. For a Git import choose the **Other** framework preset, leave the build command empty, and serve the **public** output directory. No dependencies, server, or environment variables are required.

Alternatively, run `npx vercel` from this directory for a preview deployment and `npx vercel --prod` for production. Vercel will ask you to sign in or choose a project if needed.

The bundled p5.js distribution is version 1.11.11. Its license is in `public/vendor/p5-LICENSE.txt`. [p5.js source](https://github.com/processing/p5.js/tree/v1.11.11) · [Vercel static build settings](https://vercel.com/docs/builds/configure-a-build)
