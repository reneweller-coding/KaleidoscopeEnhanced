# -*- coding: utf-8 -*-
r"""The music-video picture-in-picture under load for minutes: the app plays a 1280x720 clip in the corner for the
whole run and must neither crash nor stop uploading frames.  The same for the video source (-v, VideoIn), which hands
its frames over the same way.

    python Tools/pip_soak_test.py                       # the PiP, 300 s on Noir
    python Tools/pip_soak_test.py --source both --secs 600 --keep   # PiP and -v together; keep the clip
    python Tools/pip_soak_test.py --exe other\Release\Kaleidoscope.exe

Why (20.11.2026): QVideoSink hands its frames over on Qt's FFmpeg render thread, not on the GUI thread.  VideoPiP
swapped its frame image there while the GUI thread was uploading it with glTexSubImage2D; the old image was freed
under the driver's feet, and with a 720p frame (3.7 MB, its own VirtualAlloc block) that is an access violation
seconds to a minute after the PiP starts (docs/engine-internals.md, "Video frames cross threads").

How the PiP is switched on without a player or the network:
  * KALEIDO_LYRICS_TEST="|Kaleido PiP soak" -- the test track (no artist: no artist-image download); its position
    runs on the app clock;
  * a "not found" lyrics cache entry for it (no lyrics request) and the clip as its cached music video
    (cache\video\<md5 of the key>\video.mp4 beside the exe's folder; ffmpeg's testsrc2, generated once);
  * artistImages / videoEnabled switched on in the private settings copy (the user's file is never touched).
The video source (--source in|both) simply gets the same clip with -v.

What is checked:
  * the app runs the whole time and ends itself (KALEIDO_MAX_RUNTIME_SECS) -- no "CRASH:" line, no new crash dump;
  * each decoder under test plays the clip, and the log says on which thread its frames arrive;
  * at the end, frames decoded and uploaded: the picture really was fed the whole time (a lower bound per second).

The app is ours: started here, it ends itself; only if it hangs past the deadline is it stopped by its PID.
Exit code 0 = every check passed.
"""
import argparse
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "Tools"))
from private_settings import PrivateSettings  # noqa: E402

QT_BIN = r"C:\Qt\6.11.1\msvc2022_64\bin"
CDB = r"C:\Program Files (x86)\Windows Kits\10\Debuggers\x64\cdb.exe"
BELOW_NORMAL = 0x00004000
TEST_TITLE = "Kaleido PiP soak"
TEST_KEY = "|" + TEST_TITLE.lower()  # TrackMedia::requestTrack(): artist|title, trimmed, lower case
FAILED = []


def check(ok, what, detail=""):
    print("  [%s] %s%s" % (" ok " if ok else "FAIL", what, ("  -- " + detail) if detail else ""))
    if not ok:
        FAILED.append(what)


def set_general(ini, values):
    """Sets top-level keys (QSettings' [General] group) in an ini file, adding the group if it is missing."""
    lines = open(ini, encoding="utf-8", errors="replace").read().splitlines() if os.path.exists(ini) else []
    out, in_general, done = [], False, set()
    for line in lines:
        m = re.match(r"\s*\[(.+)\]\s*$", line)
        if m:
            if in_general:
                out += ["%s=%s" % (k, v) for k, v in values.items() if k not in done]
                done.update(values)
            in_general = m.group(1) == "General"
        elif in_general and "=" in line and line.split("=", 1)[0].strip() in values:
            k = line.split("=", 1)[0].strip()
            out.append("%s=%s" % (k, values[k]))
            done.add(k)
            continue
        out.append(line)
    if in_general:
        out += ["%s=%s" % (k, v) for k, v in values.items() if k not in done]
        done.update(values)
    if len(done) < len(values):
        out = ["[General]"] + ["%s=%s" % (k, v) for k, v in values.items()] + [""] + out
    open(ini, "w", encoding="utf-8").write("\n".join(out) + "\n")


def make_clip(path, secs):
    """A 1280x720, 30 fps H.264 clip (yuv420p, like a downloaded music video) of at least `secs` seconds."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp.mp4"
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
           "-i", "testsrc2=size=1280x720:rate=30", "-t", str(secs), "-c:v", "libx264", "-preset", "veryfast",
           "-crf", "28", "-pix_fmt", "yuv420p", "-threads", "4", "-movflags", "+faststart", tmp]
    t0 = time.time()
    subprocess.run(cmd, check=True, creationflags=BELOW_NORMAL)
    os.replace(tmp, path)
    print("clip generated in %.0f s: %s" % (time.time() - t0, path))


def clip_secs(path):
    """The clip's duration in seconds (0 if ffprobe cannot read it)."""
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                             capture_output=True, text=True, check=True).stdout
        return float(out.strip())
    except Exception:
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--secs", type=int, default=300, help="how long the PiP runs")
    ap.add_argument("--source", choices=("pip", "in", "both"), default="pip",
                    help="the music-video PiP, the video source (-v), or both at once")
    ap.add_argument("--preset", default="Noir")
    ap.add_argument("--exe", default=os.path.join(ROOT, "Release", "Kaleidoscope.exe"))
    ap.add_argument("--keep", action="store_true", help="keep the generated clip and cache entries for the next run")
    ap.add_argument("--log", help="where the app's log goes (default: the temp folder)")
    ap.add_argument("--debugger", action="store_true",
                    help="run the app under cdb: any second-chance exception or fail-fast (0xC0000409, which "
                         "bypasses the app's own crash handler) leaves a full dump and every thread's stack")
    a = ap.parse_args()

    exe = os.path.abspath(a.exe)
    exe_dir = os.path.dirname(exe)
    cache = os.path.join(os.path.dirname(exe_dir), "cache")  # the app opens ..\cache from its own folder
    h = hashlib.md5(TEST_KEY.encode("utf-8")).hexdigest()
    clip = os.path.join(cache, "video", h, "video.mp4")
    lyrics = os.path.join(cache, "lyrics", h + ".json")
    made_clip = not os.path.exists(clip)
    if not made_clip and clip_secs(clip) < a.secs + 30:
        os.remove(clip)
        made_clip = True
    if made_clip:
        make_clip(clip, a.secs + 60)
    os.makedirs(os.path.dirname(lyrics), exist_ok=True)
    json.dump({"found": False, "ts": time.time()}, open(lyrics, "w"))  # known "no lyrics": no network request

    pip = a.source in ("pip", "both")
    vin = a.source in ("in", "both")
    ps = PrivateSettings("pipsoak")
    ini = ps.path(0)
    set_general(ini, {"artistImages": "true" if pip else "false", "videoEnabled": "true" if pip else "false",
                      "idleMinutes": "0"})
    log = os.path.abspath(a.log) if a.log else os.path.join(
        os.path.dirname(ps.dir), "kaleido_pip_soak_%s.log" % time.strftime("%Y%m%d-%H%M%S"))
    dumps_before = set(glob.glob(os.path.join(exe_dir, "crash-*.dmp")))
    env = dict(os.environ)
    # Qt writes its own messages (qWarning, qFatal) to the debugger, not to stderr, in an app without a console.
    env.update({"KALEIDO_SETTINGS": ini, "KALEIDO_NO_ACTIVATE": "1", "KALEIDO_NO_MIDI": "1",
                "KALEIDO_MAX_RUNTIME_SECS": str(a.secs), "QT_FORCE_STDERR_LOGGING": "1"})
    if pip:
        env.update({"KALEIDO_LYRICS_TEST": "|" + TEST_TITLE, "KALEIDO_LYRICS_MODE": "0",
                    "KALEIDO_VIDEO_TEST_DURATION": str(a.secs + 30)})
    if os.path.isdir(QT_BIN):
        env["PATH"] = QT_BIN + os.pathsep + env.get("PATH", "")
    cmd = [exe, "-c", a.preset] + (["-v", clip] if vin else [])
    dbg_log = dbg_dump = None
    stdin = subprocess.DEVNULL
    if a.debugger:
        # First-chance access violations are the driver's and Qt's own business; only what nobody handles breaks.
        # At that break cdb reads the commands below from stdin: the event, every stack, a dump, quit.  (A full
        # dump, /ma, failed on a region it could not read: 0x8007012B.)
        dbg_log = os.path.splitext(log)[0] + ".cdb.txt"
        dbg_dump = os.path.splitext(log)[0] + ".dmp"
        cmds = os.path.splitext(log)[0] + ".cdb-in.txt"
        open(cmds, "w").write(".lastevent\n.ecxr\nkn 60\n~*kn 30\n.dump /mhiu /o \"%s\"\nq\n" % dbg_dump)
        stdin = open(cmds)
        cmd = [CDB, "-G", "-y", exe_dir, "-logo", dbg_log,
               "-c", "sxd av; sxd ch; sxd sov; sxd ii; sxd dz; sxd eh; g"] + cmd
    print("exe:", exe)
    print("source:", a.source)
    print("settings copy:", ini)
    print("log:", log)
    if dbg_log:
        print("debugger log:", dbg_log)
    t0 = time.time()
    proc = subprocess.Popen(cmd, cwd=exe_dir, env=env, stdin=stdin, stdout=subprocess.DEVNULL,
                            stderr=open(log, "w"), creationflags=BELOW_NORMAL)
    print("app started, PID %d%s; runs %d s" % (proc.pid, " (cdb)" if dbg_log else "", a.secs))
    hung = False
    try:
        proc.wait(a.secs + 120)
    except subprocess.TimeoutExpired:
        hung = True
        proc.terminate()  # ours, by its PID
        proc.wait(30)
    ran = time.time() - t0
    rc = proc.returncode
    text = open(log, encoding="utf-8", errors="replace").read()
    new_dumps = sorted(set(glob.glob(os.path.join(exe_dir, "crash-*.dmp"))) - dumps_before)
    crash = re.search(r"^CRASH:.*$", text, re.M)
    if dbg_log:
        # cdb's own exit code says nothing about the app's; the event it broke on does.
        dtext = open(dbg_log, encoding="utf-8", errors="replace").read() if os.path.exists(dbg_log) else ""
        ev = re.search(r"^.*(second chance|Security check failure|c0000409|stack buffer overrun).*$", dtext, re.M | re.I)
        rc = 0 if ev is None else 0xC0000409 if "c0000409" in ev.group(0).lower() else 1
        if ev:
            crash = ev
            new_dumps.append(dbg_dump)

    check(not hung, "the app ends itself after %d s" % a.secs, "ran %.0f s" % ran)
    check(rc == 0 and not crash and not new_dumps, "no crash",
          "exit code 0x%08X after %.0f s%s%s" % (rc & 0xFFFFFFFF, ran,
                                                 ("; " + crash.group(0)) if crash else "",
                                                 ("; dump " + new_dumps[-1]) if new_dumps else ""))
    for on, tag, what, playing in ((pip, "video PiP", "the PiP", "video PiP: playing"),
                                   (vin, "video input", "the video source", "video input: 1 file(s)")):
        if not on:
            continue
        check(playing in text, "%s plays the clip" % what)
        m = re.search(r"^%s: first frame on (.+)$" % tag, text, re.M)
        check(m is not None, "%s: the log names the thread the frames arrive on" % what,
              m.group(1) if m else "no such line")
        m = re.search(r"^%s: released after (\d+) frames decoded, (\d+) uploaded$" % tag, text, re.M)
        if m:
            decoded, uploaded = int(m.group(1)), int(m.group(2))
            # 30 fps clip; the first seconds go to start-up and the first scene's programs.
            floor = 15 * max(a.secs - 30, 1)
            check(uploaded >= floor, "%s: frames uploaded the whole time" % what,
                  "%d decoded, %d uploaded (at least %d expected, %.1f/s)" % (decoded, uploaded, floor,
                                                                              uploaded / max(a.secs, 1)))
        else:
            check(False, "%s: frames uploaded the whole time" % what, "no release line in the log")

    ps.close()
    if not a.keep:
        if made_clip:
            shutil.rmtree(os.path.dirname(clip), ignore_errors=True)
        try:
            os.remove(lyrics)
        except OSError:
            pass
    print("%s -- log: %s" % ("FAILED: " + "; ".join(FAILED) if FAILED else "all checks passed", log))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
