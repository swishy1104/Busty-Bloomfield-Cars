# Desktop packages

`build.sh` turns the game into installable desktop apps. The launcher (`launcher/main.go`) embeds every game file,
serves them on `127.0.0.1:27831` and opens the page in the Edge, Chrome or Brave already on the machine in app mode
(a plain window, no tabs or address bar). It quits about a minute after the window closes. Nothing needs the internet.

| Output | What it is |
|---|---|
| `dist/Bloomfield-Drift-Setup.exe` | Windows installer: per-user, Start Menu and Desktop shortcuts, uninstaller in Settings > Apps |
| `dist/Bloomfield-Drift-mac.zip` | macOS app bundle (Apple silicon and Intel), unsigned |
| `dist/Bloomfield-Drift-linux-x64.tar.gz` | Linux binary |

Needs `go`, `makensis` (`apt install nsis`), `python3` with Pillow and `go-winres` (`go install github.com/tc-hib/go-winres@latest`).

The packages are not code-signed, so Windows SmartScreen shows "Windows protected your PC" the first time: click
*More info* > *Run anyway*. On macOS, right-click the app and choose *Open* the first time (or allow it under
System Settings > Privacy & Security).

Saved settings, best times and ghosts live in the browser's storage for `http://127.0.0.1:27831`. A log is written to
the temp folder as `bloomfield-drift.log`.
