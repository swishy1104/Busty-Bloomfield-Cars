#!/usr/bin/env bash
# Builds the desktop packages into desktop/dist/:
#   Bloomfield-Drift-Setup.exe        Windows installer (per-user, with uninstaller)
#   Bloomfield-Drift-mac.zip          macOS app bundle (unsigned: right-click > Open the first time)
#   Bloomfield-Drift-linux-x64.tar.gz Linux binary
# Needs: go, makensis (apt install nsis), python3 with Pillow, go-winres (go install github.com/tc-hib/go-winres@latest).
# usage: ./build.sh [version]
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd .. && pwd)
VER=${1:-0.26.0}
export PATH="$PATH:$HOME/go/bin"

rm -rf launcher/game build dist
mkdir -p launcher/game/fonts build dist
cp "$ROOT"/index.html "$ROOT"/*.js "$ROOT"/*.png launcher/game/
cp "$ROOT"/fonts/* launcher/game/fonts/
[ -d "$ROOT"/radio ] && cp -r "$ROOT"/radio launcher/game/      # the car radio's royalty-free songs
cp "$ROOT"/node_modules/three/build/three.min.js launcher/game/      # the page loads three.js from a CDN; the desktop build is offline
python3 make_icon.py build/icon.png build/icon.ico

(
  cd launcher
  go-winres simply --icon ../build/icon.png --manifest gui --product-name "Bloomfield Drift" --file-description "Bloomfield Drift" \
    --product-version "$VER" --file-version "$VER" --copyright "" --original-filename "Bloomfield Drift.exe" --arch amd64
  GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -H windowsgui -X main.version=$VER" -o "../build/Bloomfield Drift.exe" .
  rm -f rsrc_windows_*.syso
  GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -tags noembed -trimpath -ldflags="-s -w -X main.version=$VER" -o ../build/mac-arm64 .
  GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -tags noembed -trimpath -ldflags="-s -w -X main.version=$VER" -o ../build/mac-amd64 .
  GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VER" -o ../build/bloomfield-drift .
)

SIZE_KB=$(( $(stat -c %s "build/Bloomfield Drift.exe") / 1024 + 200 ))
makensis -V2 -DVERSION="$VER" -DSIZE_KB=$SIZE_KB installer.nsi

# macOS app bundle: a tiny shell launcher picks the binary for the Mac's chip
APP="build/Bloomfield Drift.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp build/mac-arm64 build/mac-amd64 "$APP/Contents/MacOS/"
cp -r launcher/game "$APP/Contents/Resources/game"      # one copy of the game for both chips
printf '#!/bin/sh\ncd "$(dirname "$0")"\nif [ "$(uname -m)" = arm64 ]; then exec ./mac-arm64; else exec ./mac-amd64; fi\n' > "$APP/Contents/MacOS/launch"
chmod +x "$APP/Contents/MacOS/"*
python3 -c "from PIL import Image; Image.open('build/icon.png').save('$APP/Contents/Resources/icon.icns')"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Bloomfield Drift</string>
  <key>CFBundleDisplayName</key><string>Bloomfield Drift</string>
  <key>CFBundleIdentifier</key><string>game.bloomfielddrift.launcher</string>
  <key>CFBundleVersion</key><string>$VER</string>
  <key>CFBundleShortVersionString</key><string>$VER</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
EOF
python3 - <<'EOF'
import os, zipfile, stat
app = 'build/Bloomfield Drift.app'
with zipfile.ZipFile('dist/Bloomfield-Drift-mac.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(app):
        for f in files:
            p = os.path.join(root, f); zi = zipfile.ZipInfo(p); zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = (os.stat(p).st_mode & 0xFFFF) << 16
            with open(p, 'rb') as fh: z.writestr(zi, fh.read())
EOF
tar -C build -czf dist/Bloomfield-Drift-linux-x64.tar.gz bloomfield-drift
ls -la dist
