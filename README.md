# Bloomfield Drift

An open-world drifting game set in the real town of Bloomfield, Indiana, built in the browser with three.js from real data:
OpenStreetMap / Overture streets and 1,752 building footprints, USGS lidar terrain, roofs and trees, hand-modelled landmark
buildings, the roads out to IN-157 and the Linton Taco Bell, and half a mile south of town. Seven cars on a four-wheel
tyre-model physics engine, eight race presets, drift scoring, keyboard, touch and gamepad controls.

## Play it

**Easiest: the installer.** Download `Bloomfield-Drift-Setup.exe` (Windows) or `Bloomfield-Drift-mac.zip` (macOS) from the
[Releases](../../releases) page. The installer is not code-signed, so Windows shows "Windows protected your PC" the first
time: click *More info* then *Run anyway*. On a Mac, right-click the app and choose *Open* the first time.

**From the source.** The game must be served over HTTP (opening `index.html` straight from the disk blocks the terrain
data). Any static server works:

```bash
git clone https://github.com/swishy1104/Busty-Bloomfield-Cars.git
cd Busty-Bloomfield-Cars
python3 -m http.server 8000
```

then open http://localhost:8000/ in Chrome, Edge or Firefox. Or `npx serve .` if you have Node.

## Controls

Keyboard: W/S or arrows gas and brake, A/D steer, Space handbrake, E/Q shift (manual gearbox), C camera, R reset, Esc menu.
In the desktop app, click **Exit Game** or press Esc on the main menu, including while the map loads.
Gamepad: left stick steer, triggers gas and brake, A handbrake, bumpers shift, Y camera, B reset, Start pause. A pad with a
layout the browser does not know is set up once in Options > Controller > Set up buttons.

## Building the desktop packages

See [desktop/README.md](desktop/README.md).

## Data credits

Streets and building footprints © OpenStreetMap contributors, via Overture Maps (ODbL). Terrain, roof heights and shapes,
pavement and trees: USGS 3DEP lidar survey of Indiana, 2017 (public domain). Fields and woods beyond town: © ESA WorldCover
2021 (CC BY 4.0). Wall colours, windows and signs are stylized.
