#!/usr/bin/env bash
# build_appimage.sh -- builds Kaleidoscope-x86_64.AppImage from this repository (Linux, x86_64).
#
#   bash Tools/appimage/build_appimage.sh [output folder]     # default: dist/ in the repository
#
# Needs the build packages of the README (Qt 6 from the distribution, libpulse-dev, cmake), qmake6, `file` and
# network access: linuxdeploy and its Qt plugin are downloaded once, at the pinned releases below, into the work
# folder (KALEIDO_APPIMAGE_WORK, default build-appimage/).
#
# Build on the OLDEST distribution the package is meant to run on.  An AppImage carries its libraries -- Qt, its
# plugins, libpulse -- but not glibc and not the graphics driver (libGL, libX11, libxcb: those must match the
# machine), which come from the system it runs on; built on Ubuntu 22.04 (glibc 2.35) it runs there and on
# everything newer.
#
# The layout inside is the one the program has everywhere: the executable in usr/bin, the shaders, engine files
# and presets one level above it (usr/Engine, usr/Scene2D, ..., usr/Presets).  The program moves into its own
# folder at the start and writes nothing into the image: settings, log, thumbnails and recordings go to the XDG
# folders, photos and 3D models are looked for in ~/.local/share/KaleidoscopeVisualizer (Source/SettingsFile.h).
set -euo pipefail

LINUXDEPLOY_TAG=1-alpha-20251107-1
QTPLUGIN_TAG=1-alpha-20250213-1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$(mkdir -p "${1:-$ROOT/dist}" && cd "${1:-$ROOT/dist}" && pwd)"
WORK="${KALEIDO_APPIMAGE_WORK:-$ROOT/build-appimage}"
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"

# --- the program ----------------------------------------------------------------------------------------------
cmake -S "$ROOT" -B "$WORK/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$WORK/build" -j"$(nproc)"

# --- the AppDir: assets one level above bin/, as the program expects them ------------------------------------
APPDIR="$WORK/AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin"
for d in Engine Scene2D Scene3D FX Transitions Presets; do
	cp -r "$ROOT/$d" "$APPDIR/usr/"
done
cp "$ROOT"/*.vert "$APPDIR/usr/"
cp "$ROOT/icon.ico" "$APPDIR/usr/bin/" # the window icon, read from the working folder
# Only the presets the repository carries: the tools write scratch presets beside them (deploy.ps1 does the same).
if git -C "$ROOT" rev-parse --git-dir > /dev/null 2>&1; then
	for f in "$APPDIR"/usr/Presets/*; do
		if ! git -C "$ROOT" ls-files --error-unmatch "Presets/$(basename "$f")" > /dev/null 2>&1; then
			echo "not packaged (not in the repository): Presets/$(basename "$f")"
			rm -rf "$f"
		fi
	done
fi
cp "$ROOT/Tools/appimage/kaleidoscope.desktop" "$WORK/kaleidoscope.desktop"
cp "$ROOT/icon.png" "$WORK/kaleidoscope.png"

# --- linuxdeploy + Qt plugin, pinned ------------------------------------------------------------------------
TOOLS="$WORK/tools"
mkdir -p "$TOOLS"
fetch() {
	if [ ! -s "$TOOLS/$2" ]; then
		curl -fsSL --retry 3 -o "$TOOLS/$2" "$1"
	fi
	chmod +x "$TOOLS/$2"
}
fetch "https://github.com/linuxdeploy/linuxdeploy/releases/download/$LINUXDEPLOY_TAG/linuxdeploy-x86_64.AppImage" \
	linuxdeploy-x86_64.AppImage
fetch "https://github.com/linuxdeploy/linuxdeploy-plugin-qt/releases/download/$QTPLUGIN_TAG/linuxdeploy-plugin-qt-x86_64.AppImage" \
	linuxdeploy-plugin-qt-x86_64.AppImage

if [ -z "${QMAKE:-}" ]; then
	for q in qmake6 /usr/lib/qt6/bin/qmake qmake; do
		if command -v "$q" > /dev/null 2>&1; then
			QMAKE="$(command -v "$q")"
			break
		fi
	done
fi
export QMAKE
echo "qmake: $QMAKE ($("$QMAKE" -query QT_VERSION))"

# No FUSE in containers and on many CI machines: the tools unpack themselves instead of mounting.
export APPIMAGE_EXTRACT_AND_RUN=1
export ARCH=x86_64
export PATH="$TOOLS:$PATH"
export LDAI_OUTPUT="Kaleidoscope-x86_64.AppImage"
export OUTPUT="$LDAI_OUTPUT"

cd "$OUT"
rm -f "$OUT/$LDAI_OUTPUT"
"$TOOLS/linuxdeploy-x86_64.AppImage" --appdir "$APPDIR" \
	--executable "$WORK/build/Kaleidoscope" \
	--desktop-file "$WORK/kaleidoscope.desktop" \
	--icon-file "$WORK/kaleidoscope.png" \
	--plugin qt --output appimage

if [ ! -f "$OUT/$LDAI_OUTPUT" ]; then
	# Older appimage plugins name the file after the desktop entry; take the newest one.
	made="$(ls -t "$OUT"/*.AppImage 2> /dev/null | head -n 1 || true)"
	[ -n "$made" ] || { echo "no AppImage was written" >&2; exit 1; }
	mv "$made" "$OUT/$LDAI_OUTPUT"
fi
ls -l "$OUT/$LDAI_OUTPUT"
