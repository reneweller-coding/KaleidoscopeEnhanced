# -*- coding: utf-8 -*-
r"""The web remote's rating walk end to end, over /api only (no key presses): the app, on a private settings copy,
walks N scenes, and the copy holds N verdicts afterwards.

    python Tools/rate_walk_test.py                          # Noir, 20 verdicts, 4 s per scene, port 18391
    python Tools/rate_walk_test.py --preset Ambient --n 30 --secs 5

What is checked:
  * the walk starts, and every verdict is taken (result 0) on a scene that had none before;
  * a second tap before the cut is refused (result -1) -- it must not judge the scene after it;
  * a scene left without a verdict moves on by itself when its time is up and stays unrated;
  * "undo" takes the last verdict back and brings the scene back on screen;
  * the settings copy holds N [rated] entries for the preset; each "like" is a favourite there ([taste] >= 1.25 on a
    copy without an earlier weight) and each "never" a ban ([banned]);
  * Tools/apply_taste.py reads the verdicts from the copy.

The user's settings file is never touched: the app runs on a copy (KALEIDO_SETTINGS, Tools/private_settings.py --
an empty file with --empty).  The app is ours: it is started here, it ends itself after KALEIDO_MAX_RUNTIME_SECS,
and after the checks it is stopped by its PID.  Exit code 0 = every check passed.
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "Tools"))
from private_settings import PrivateSettings  # noqa: E402

QT_BIN = r"C:\Qt\6.11.1\msvc2022_64\bin"
BELOW_NORMAL = 0x00004000
FAILED = []


def check(ok, what, detail=""):
    print("  [%s] %s%s" % (" ok " if ok else "FAIL", what, ("  -- " + detail) if detail else ""))
    if not ok:
        FAILED.append(what)


def api(port, path, action=False, timeout=30.0):
    """One GET on the remote; actions carry the header a foreign web page cannot send.  A scene's first appearance
    can compile its programs on the main thread for some seconds (a chain lab: dozens), and the remote answers
    after that -- hence the long timeout."""
    req = urllib.request.Request("http://127.0.0.1:%d%s" % (port, path))
    if action:
        req.add_header("X-Kaleido", "1")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def read_ini(path):
    """The groups of an ini file as {section: {key: value}} (keys as QSettings writes them, with backslashes)."""
    out, sec = {}, None
    for line in io.open(path, encoding="utf-8", errors="replace"):
        line = line.strip()
        m = re.match(r"\[(.+)\]$", line)
        if m:
            sec = out.setdefault(m.group(1), {})
        elif sec is not None and "=" in line:
            k, v = line.split("=", 1)
            sec[k] = v
    return out


def wait_new_target(port, old, limit=8.0):
    """Polls until the scene being judged is another than `old`; returns the state."""
    t0 = time.time()
    st = api(port, "/api/rate")
    while (not st.get("key") or st["key"] == old) and time.time() - t0 < limit:
        time.sleep(0.2)
        st = api(port, "/api/rate")
    return st


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="Noir")
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--secs", type=int, default=4)
    ap.add_argument("--port", type=int, default=18391)
    ap.add_argument("--empty", action="store_true", help="start from an empty settings file, not a copy of the user's")
    ap.add_argument("--from", dest="src", help="start from a copy of this settings file (read only)")
    ap.add_argument("--exe", default=os.path.join(ROOT, "Release", "Kaleidoscope.exe"))
    a = ap.parse_args()

    ps = PrivateSettings("rate")
    ini = ps.path(0)
    if a.empty:
        open(ini, "w").close()
    elif a.src:
        import shutil
        shutil.copy(a.src, ini)
    before = read_ini(ini)
    rated_before = {k for k in before.get("rated", {}) if k.split("\\")[0] == a.preset}
    log = os.path.join(ps.dir, "app.log")
    env = dict(os.environ)
    env.update({"KALEIDO_SETTINGS": ini, "KALEIDO_NO_ACTIVATE": "1", "KALEIDO_NO_MIDI": "1",
                "KALEIDO_MAX_RUNTIME_SECS": "400"})
    if os.path.isdir(QT_BIN):
        env["PATH"] = QT_BIN + os.pathsep + env.get("PATH", "")
    print("settings copy:", ini)
    proc = subprocess.Popen([a.exe, "-c", a.preset, "-t", str(a.port)], cwd=os.path.dirname(a.exe), env=env,
                            stdout=subprocess.DEVNULL, stderr=open(log, "w"), creationflags=BELOW_NORMAL)
    print("app started, PID", proc.pid)
    try:
        # The remote answers once the window and the preset are up.
        st, t0 = None, time.time()
        while time.time() - t0 < 120 and proc.poll() is None:
            try:
                st = api(a.port, "/api/rate", timeout=2)
                if st.get("total", 0) > 0:
                    break
            except Exception:
                pass
            time.sleep(1.0)
        check(st is not None and st.get("total", 0) > 0, "the remote answers and names the preset's scenes",
              "%s scenes, %s rated" % (st and st.get("total"), st and st.get("rated")))
        if not st or not st.get("total"):
            return 1
        rated0 = st["rated"]
        st = api(a.port, "/api/rate/start?s=%d" % a.secs, action=True)
        check(st["active"] == 1 and abs(st["secs"] - a.secs) < 0.01, "the walk starts at %d s per scene" % a.secs)

        cycle = ["like", "next", "next", "never", "next"]
        judged, verdicts, seen = [], {}, set()
        last = ""
        timeout_done = double_done = False
        while len(judged) < a.n:
            st = wait_new_target(a.port, last)
            key = st.get("key", "")
            if not key or key == last:
                check(False, "the walk moves on after a verdict", "still on %s" % last)
                break
            seen.add(key)
            if not timeout_done and len(judged) == a.n // 2:
                # Leave this one without a verdict: the walk moves on by itself, and it stays unrated.
                timeout_done = True
                rated_then = st["rated"]
                time.sleep(a.secs + 2.0)
                st2 = wait_new_target(a.port, key, limit=4.0)
                check(st2.get("key") != key and st2["rated"] == rated_then,
                      "without a verdict the walk moves on by itself and the scene stays unrated",
                      "%s -> %s, rated %d -> %d" % (key, st2.get("key"), rated_then, st2["rated"]))
                last = key
                continue
            time.sleep(1.0)  # on screen for a moment, as a person would look
            v = cycle[len(judged) % len(cycle)]
            r = api(a.port, "/api/rate/verdict?v=%s&k=%s" % (v, urllib.request.quote(key)), action=True)
            if r["result"] != 0:
                check(False, "verdict %d taken" % (len(judged) + 1), "%s %s -> result %s" % (key, v, r["result"]))
                break
            if not double_done:
                double_done = True
                r2 = api(a.port, "/api/rate/verdict?v=never&k=%s" % urllib.request.quote(key), action=True)
                check(r2["result"] == -1, "a second tap before the cut is refused", "result %s" % r2["result"])
            judged.append(key)
            verdicts[key] = v
            last = key
        check(len(judged) == a.n and len(set(judged)) == a.n,
              "%d verdicts, each on a scene of its own" % a.n, "%d judged, %d distinct" % (len(judged), len(set(judged))))
        check(not (set(judged) & {k.split("\\", 1)[1] for k in rated_before}),
              "no scene that had a verdict before came up")
        st = api(a.port, "/api/rate")
        check(st["rated"] == rated0 + a.n, "the counter says %d more rated" % a.n,
              "%d -> %d of %d" % (rated0, st["rated"], st["total"]))

        # Undo: one more verdict, taken back, and the scene comes back on screen.
        st = wait_new_target(a.port, last)
        u_key = st["key"]
        time.sleep(1.0)
        r = api(a.port, "/api/rate/verdict?v=like&k=%s" % urllib.request.quote(u_key), action=True)
        r2 = api(a.port, "/api/rate/undo", action=True)
        back = wait_new_target(a.port, "", limit=0.1)
        t0 = time.time()
        while back.get("key") != u_key and time.time() - t0 < 6.0:
            time.sleep(0.2)
            back = api(a.port, "/api/rate")
        check(r["result"] == 0 and r2["result"] == 0 and back["rated"] == rated0 + a.n and back.get("key") == u_key,
              "undo takes the last verdict back and brings the scene back",
              "%s: rated %d, on screen %s" % (u_key, back["rated"], back.get("key")))
        st = api(a.port, "/api/rate/stop", action=True)
        check(st["active"] == 0, "the walk stops")
    finally:
        if proc.poll() is None:
            proc.terminate()  # ours, by its PID
            proc.wait(30)

    after = read_ini(ini)
    rated = {k.split("\\", 1)[1]: v for k, v in after.get("rated", {}).items() if k.split("\\")[0] == a.preset}
    new = {k: v for k, v in rated.items() if a.preset + "\\" + k not in rated_before}
    check(len(new) == a.n and all(new.get(k) == v for k, v in verdicts.items()),
          "the settings copy holds the %d verdicts under [rated]" % a.n, "%d new entries" % len(new))
    taste = after.get("taste", {})
    banned = after.get("banned", {})
    likes = [k for k, v in verdicts.items() if v == "like"]
    nevers = [k for k, v in verdicts.items() if v == "never"]
    prior_taste = before.get("taste", {})
    like_ok = all(float(taste.get(a.preset + "\\" + k, 0)) >= 1.2 for k in likes
                  if a.preset + "\\" + k not in prior_taste)
    check(like_ok, "each like is a favourite there ([taste])", ", ".join(
        "%s %s" % (k, taste.get(a.preset + "\\" + k)) for k in likes))
    check(all(banned.get(a.preset + "\\" + k) == "true" for k in nevers), "each never is a ban there ([banned])",
          ", ".join(nevers))
    check(u_key not in rated or u_key in [k.split("\\", 1)[1] for k in rated_before],
          "the verdict taken back is gone from the file")
    out = subprocess.run([sys.executable, os.path.join(ROOT, "Tools", "apply_taste.py"), "--ini", ini],
                         capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
    m = re.search(r"rating walk: (\d+) verdicts", out)
    check(m is not None and int(m.group(1)) >= a.n, "Tools/apply_taste.py reads them", m.group(0) if m else out[-200:])
    for line in io.open(log, encoding="utf-8", errors="replace"):
        if line.startswith(("RATED", "RATING")):
            print("    log:", line.rstrip())
    if FAILED:
        keep = os.path.join(tempfile.gettempdir(), "kaleido_rate_walk_failed.log")
        with io.open(log, encoding="utf-8", errors="replace") as src, io.open(keep, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        print("app log kept:", keep)
    print("\n%d failed" % len(FAILED))
    ps.close()
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
