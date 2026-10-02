# -*- coding: utf-8 -*-
"""Visual regression of the whole catalogue: frozen, reproducible frames of every scene, and their comparison.

  render   every TextureShader entry of Presets/Komplett.xml alone in a hidden
           preset, frozen (KALEIDO_FREEZE_TIME: 600 fixed steps, then the frame
           stands), one fixed photo (KALEIDO_FIXED_PHOTO), fixed rolls
           (KALEIDO_SEED), silent audio.  The screenshot is taken when the app
           logs "FREEZE engaged" -- the frame is final then, so two renders of
           unchanged code are identical.  Saved as 640x360 JPEG.
  compare  two snapshot sets: every scene whose frame changed beyond the
           tolerance, sorted by how much, side by side in an HTML report;
           scenes new or gone, frames that are black, renders that failed.

Snapshot sets live in %LOCALAPPDATA%\\KaleidoscopeVisualizer\\snapshots\\<label>.
The repo ini is backed up and restored.  Nothing is sent anywhere.

  python Tools/scene_snapshots.py render v1.18-pre            # all scenes (~3-4 h)
  python Tools/scene_snapshots.py render quick --only Chain   # names containing 'Chain'
  python Tools/scene_snapshots.py compare v1.17 v1.18-pre      # -> report.html in the second set
"""
import argparse, html, io, os, re, shutil, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REL = os.path.join(ROOT, "Release")
INI = os.path.join(ROOT, "kaleidoscope_settings.ini")
EXE = os.environ.get("KALEIDO_EXE", "Kaleidoscope.exe")      # a copy: the app can be rebuilt meanwhile
BASE = os.path.join(os.environ.get("LOCALAPPDATA", ROOT), "KaleidoscopeVisualizer", "snapshots")


def entries():
    """(name, block) for every TextureShader entry of Komplett.xml; repeated shaders get a running number."""
    src = io.open(os.path.join(ROOT, "Presets", "Komplett.xml"), encoding="utf-8").read()
    seen = {}
    for m in re.finditer(r"[ \t]*<TextureShader\b[^>]*file=\"[^\"]*[\\/](\w+)\.frag\"[^>]*>.*?</TextureShader>", src, re.S):
        base = m.group(1)
        seen[base] = seen.get(base, 0) + 1
        yield (base if seen[base] == 1 else "%s__%d" % (base, seen[base])), m.group(0)


def preset(block, fx):
    head, rest = block.split(">", 1)
    head = re.sub(r'\s(probability|minTimeSolo|maxTimeSolo)="[^"]*"', "", head)
    block = head + ' probability="1.0" minTimeSolo="100" maxTimeSolo="120">' + rest
    return ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..' + "\\\\" + 'Images" '
            'ConfigurationName="_snap" hidden="true">\n' + block + "\n" + fx + "\n</configuration>\n")


def shoot(block, fx, out, photo, timeout):
    io.open(os.path.join(ROOT, "Presets", "_snap.xml"), "w", encoding="utf-8").write(preset(block, fx))
    env = dict(os.environ, KALEIDO_MAX_RUNTIME_SECS=str(timeout + 15), KALEIDO_NO_ACTIVATE="1",
               KALEIDO_FREEZE_TIME="20", KALEIDO_FIXED_PHOTO=photo, KALEIDO_SEED="7")
    log_p = os.path.join(REL, "kaleidoscope.log")
    try:
        os.remove(log_p)                                     # never read the previous run's "FREEZE engaged"
    except OSError:
        pass
    p = subprocess.Popen([os.path.join(REL, EXE), "-c", "_snap", "-l"], cwd=REL, env=env,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    t0 = time.time()
    try:
        port = None
        while time.time() - t0 < timeout:                    # the frame is final when the app freezes
            time.sleep(0.5)
            try:
                lg = io.open(log_p, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            if port is None:
                m = re.search(r"WEB REMOTE: http://<this-pc>:(\d+)/", lg)
                port = m.group(1) if m else None
            if "FREEZE engaged" in lg and port:
                time.sleep(0.4)
                urllib.request.urlopen("http://127.0.0.1:%s/api/screenshot" % port, timeout=8).read()
                for _ in range(20):
                    time.sleep(0.3)
                    lg = io.open(log_p, encoding="utf-8", errors="replace").read()
                    saved = re.findall(r"Saved screenshot: (.*)", lg)
                    if saved:
                        f = saved[-1].strip()
                        f = f if os.path.isabs(f) else os.path.join(REL, f)
                        from PIL import Image
                        Image.open(f).convert("RGB").resize((640, 360), Image.LANCZOS).save(out, quality=92)
                        os.remove(f)
                        return True
                return False
        return False
    except OSError:
        return False
    finally:
        if p.poll() is None:
            p.terminate()                                     # our own run: it would end itself later anyway
            try:
                p.wait(timeout=20)
            except subprocess.TimeoutExpired:
                p.kill()


def render(label, only, photo, timeout):
    out = os.path.join(BASE, label)
    os.makedirs(out, exist_ok=True)
    src = io.open(os.path.join(ROOT, "Presets", "Komplett.xml"), encoding="utf-8").read()
    fx = re.search(r"[ \t]*<CombineShader\b[^>]*[\\/]FxPlain\.frag\"[^>]*>.*?</CombineShader>", src, re.S).group(0)
    photo = photo or sorted(os.listdir(os.path.join(ROOT, "Images")))[len(os.listdir(os.path.join(ROOT, "Images"))) // 2]
    backup = INI + ".snap_backup"
    shutil.copy(INI, backup)
    idx = io.open(os.path.join(out, "index.tsv"), "a", encoding="utf-8")
    ok = bad = 0
    try:
        for name, block in entries():
            if only and not any(o in name for o in only):
                continue
            f = os.path.join(out, name + ".jpg")
            if os.path.exists(f):
                continue                                     # resumable
            t = time.time()
            good = shoot(block, fx, f, photo, timeout)
            ok += good; bad += not good
            idx.write("%s\t%s\t%.1f\n" % (name, "ok" if good else "FAIL", time.time() - t))
            idx.flush()
            print("%-44s %s %.1f s" % (name, "ok  " if good else "FAIL", time.time() - t), flush=True)
    finally:
        idx.close()
        shutil.copy(backup, INI)
        os.remove(backup)
        try:
            os.remove(os.path.join(ROOT, "Presets", "_snap.xml"))
        except OSError:
            pass
    print("%d rendered, %d failed -> %s" % (ok, bad, out))


def compare(a, b, tol):
    from PIL import Image
    import numpy as np
    da, db = os.path.join(BASE, a), os.path.join(BASE, b)
    na = {f[:-4] for f in os.listdir(da) if f.endswith(".jpg")}
    nb = {f[:-4] for f in os.listdir(db) if f.endswith(".jpg")}
    rows = []
    for n in sorted(na & nb):
        x = np.asarray(Image.open(os.path.join(da, n + ".jpg"))).astype(float)
        y = np.asarray(Image.open(os.path.join(db, n + ".jpg"))).astype(float)
        rows.append((abs(x - y).mean(), n, y.mean()))
    rows.sort(reverse=True)
    changed = [r for r in rows if r[0] > tol]
    black = [r for r in rows if r[2] < 3.0]
    rep = os.path.join(db, "report_vs_%s.html" % a)
    with io.open(rep, "w", encoding="utf-8") as h:
        h.write("<!doctype html><meta charset='utf-8'><title>Scenes %s vs %s</title>"
                "<style>body{font-family:sans-serif;background:#111;color:#ddd}img{width:420px}td{vertical-align:top;padding:4px}"
                "h2{margin-top:2em}</style>")
        h.write("<h1>%s &rarr; %s</h1><p>%d compared, %d changed (mean abs diff &gt; %.1f / 255), %d new, %d gone, %d black.</p>"
                % (html.escape(a), html.escape(b), len(rows), len(changed), tol, len(nb - na), len(na - nb), len(black)))
        for title, items in (("Changed", changed), ("Black in %s" % b, black)):
            h.write("<h2>%s</h2><table>" % title)
            for d, n, m in items:
                h.write("<tr><td><b>%s</b><br>diff %.2f<br>mean %.0f</td><td><img src='file:///%s'></td><td><img src='file:///%s'></td></tr>"
                        % (html.escape(n), d, m, os.path.join(da, n + ".jpg").replace("\\", "/"), os.path.join(db, n + ".jpg").replace("\\", "/")))
            h.write("</table>")
        for title, names in (("New", sorted(nb - na)), ("Gone", sorted(na - nb))):
            h.write("<h2>%s</h2><p>%s</p>" % (title, ", ".join(html.escape(x) for x in names) or "-"))
    print("%d compared, %d changed, %d new, %d gone, %d black -> %s" % (len(rows), len(changed), len(nb - na), len(na - nb), len(black), rep))
    for d, n, m in changed[:30]:
        print("  %6.2f  %s" % (d, n))
    return len(changed)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render")
    r.add_argument("label")
    r.add_argument("--only", nargs="*", help="only scenes whose name contains one of these")
    r.add_argument("--photo", help="the fixed photo (default: the middle one of Images/)")
    r.add_argument("--timeout", type=int, default=60, help="seconds per scene at most")
    c = sub.add_parser("compare")
    c.add_argument("a")
    c.add_argument("b")
    c.add_argument("--tol", type=float, default=1.0, help="mean absolute difference (0..255) that counts as changed")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    if a.cmd == "render":
        render(a.label, a.only, a.photo, a.timeout)
    else:
        sys.exit(min(compare(a.a, a.b, a.tol), 255))


if __name__ == "__main__":
    main()
