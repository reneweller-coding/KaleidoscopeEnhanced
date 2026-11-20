#!/usr/bin/env bash
# test_appimage.sh -- starts the AppImage the way a user would and checks that it works without writing beside itself.
#
#   bash Tools/appimage/test_appimage.sh Kaleidoscope-x86_64.AppImage [work folder]
#
# Runs, in a fresh HOME below the work folder (default: a new temporary folder; the real one is not touched):
#   1. the self test (-q): "N passed, 0 failed";
#   2. a video export of a generated five-second sound (-e, 640x360, 30 fps, preset Club), started from a third
#      folder with relative paths, with one test photo in ~/.local/share/KaleidoscopeVisualizer/Images.
# and checks: the exit codes, the mp4's length (4.5..5.6 s), nothing new beside the AppImage, and in the log
# (-l, ~/.local/state/KaleidoscopeVisualizer/kaleidoscope.log): the program folder it moved into, the settings file
# in ~/.config, the presets read, the photo folder in ~/.local/share.
#
# Needs ffmpeg/ffprobe and an X display -- xvfb-run is used when DISPLAY is unset.  Without a GPU, Mesa's llvmpipe
# does it (LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe).  Not as root: the self test checks that a read-only
# settings file is noticed, and root can write to one anyway.  KALEIDO_APPIMAGE_ARGS (e.g.
# --appimage-extract-and-run, where there is no FUSE) is passed to the AppImage first.
set -euo pipefail

if [ "$(id -u)" = 0 ]; then
	echo "test_appimage.sh: run it as a normal user, not as root" >&2
	exit 2
fi
APP="$(readlink -f "$1")"
if [ -n "${2:-}" ]; then
	mkdir -p "$2"
	W="$(cd "$2" && pwd)"
else
	W="$(mktemp -d)"
fi
EXTRA=(${KALEIDO_APPIMAGE_ARGS:-})

# A fresh HOME (the X authority stays the caller's); the XDG variables unset, so the defaults below HOME apply.
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"
export HOME="$W/home"
unset XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME XDG_STATE_HOME
export TMPDIR="$W/tmp"
mkdir -p "$HOME" "$TMPDIR" "$W/run" "$W/in" "$HOME/.local/share/KaleidoscopeVisualizer/Images"
X=()
if [ -z "${DISPLAY:-}" ]; then
	X=(xvfb-run -a -s "-screen 0 1280x720x24")
fi
fail() {
	echo "FAILED: $*" >&2
	exit 1
}

ls -A "$(dirname "$APP")" > "$W/beside-before.txt"

# --- 1. the self test
cd "$W/run"
set +e
"${X[@]}" "$APP" "${EXTRA[@]}" -q > "$W/selftest.txt" 2>&1
code=$?
set -e
grep -E '^  \[FAIL\]' "$W/selftest.txt" || true
tail -n 3 "$W/selftest.txt"
[ "$code" -eq 0 ] || fail "self test: exit code $code"
grep -Eq '^[0-9]+ passed, 0 failed' "$W/selftest.txt" || fail "self test: not all passed"

# --- 2. a five-second export from a third folder, with relative paths
ffmpeg -v error -y -f lavfi -i "sine=frequency=110:beep_factor=4:sample_rate=44100:duration=5" -ac 2 "$W/in/smoke.wav"
ffmpeg -v error -y -f lavfi -i "testsrc2=size=512x512" -frames:v 1 \
	"$HOME/.local/share/KaleidoscopeVisualizer/Images/test.jpg"
cd "$W/run"
set +e
timeout 900 "${X[@]}" "$APP" "${EXTRA[@]}" -e ../in/smoke.wav -c Club -g 640x360 -p 30 -d out/smoke.mp4 -l
code=$?
set -e
log="$HOME/.local/state/KaleidoscopeVisualizer/kaleidoscope.log"
echo "--- written below HOME:"
(cd "$HOME" && find . -type f | grep -v '^\./\.cache/mesa_shader_cache/' | sort)
echo "(and $(find "$HOME/.cache/mesa_shader_cache" -type f 2> /dev/null | wc -l) files in Mesa's own shader cache)"
echo "--- the log, head and tail:"
head -n 25 "$log" || true
echo "..."
tail -n 25 "$log" || true
[ "$code" -eq 0 ] || fail "export: exit code $code"

ls -A "$(dirname "$APP")" > "$W/beside-after.txt"
diff "$W/beside-before.txt" "$W/beside-after.txt" || fail "something was written beside the AppImage"
echo "ok: nothing written beside the AppImage"
grep -F "Program folder: " "$log" || fail "it did not move into its own folder"
grep -F "Settings: $HOME/.config/KaleidoscopeVisualizer/kaleidoscope_settings.ini" "$log" \
	|| fail "settings file not in ~/.config"
grep -E "^Presets: [1-9][0-9]* files read" "$log" || fail "no preset read"
grep -F "Photo source: $HOME/.local/share/KaleidoscopeVisualizer/Images (preset default)" "$log" \
	|| fail "photos not looked for in ~/.local/share"
dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/run/out/smoke.mp4")"
echo "out/smoke.mp4: $dur s"
awk -v d="$dur" 'BEGIN { exit !(d >= 4.5 && d <= 5.6) }' || fail "the video is $dur s long"
echo "AppImage test passed"
