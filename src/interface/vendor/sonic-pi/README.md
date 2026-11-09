# Sonic Pi for the web

This directory contains the Sonic Pi browser Ruby runtime and its SuperSonic audio engine. The modules, compiled Ruby runtime, random table and sample index were obtained from the official [Sonic Pi web distribution](https://sonic-pi.net/) on 2026-11-09. The engine, synth definitions and audio samples are from the published SuperSonic 0.96.0 packages.

- [Sonic Pi source and web build instructions](https://github.com/sonic-pi-net/sonic-pi/tree/dev/app/web)
- [SuperSonic 0.96.0 published client and source metadata](https://www.npmjs.com/package/supersonic-scsynth/v/0.96.0)
- [SuperSonic source](https://github.com/samaaron/supersonic)
- [Licenses and third-party notices](licenses/)

The browser loads these files from the same static site. The local engine manifest and application bootstrap point to the included synth definitions and the four drum samples used by Plant Band.
