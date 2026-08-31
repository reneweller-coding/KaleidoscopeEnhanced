# -*- coding: utf-8 -*-
"""Zieht aus dem Katalog-Sweep die drei Katalogbilder je Szene UND misst sie.

  python extract_catalog.py <video> <sweeplog> <outdir>

A = leise/frueh (t0+8), B = leise/spaet (t0+14), C = laut (t0+21)
-- dieselbe Semantik wie die alte Einzel-Harness.
"""
import subprocess, sys, os, re, io, json
import numpy as np

vid, log, out = sys.argv[1], sys.argv[2], sys.argv[3]
S = out          # Messwerte neben die Bilder, nicht neben das Skript
os.makedirs(out, exist_ok=True)

txt = io.open(log, encoding="utf-8", errors="ignore").read()
ev = [(float(m.group(1)), m.group(2)) for m in
      re.finditer(r"^\[sweep\]\s+\d+/\d+\s+t=([\d.]+)s\s+(\S+)", txt, re.M)]
# Sweep-Retries (gleicher Name < 4 s spaeter) zusammenfassen
groups = []
for t0, n in ev:
    if groups and groups[-1][1] == n and (t0 - groups[-1][0]) < 4.0:
        continue
    groups.append((t0, n))
print("%d Szenenfenster im Log" % len(groups))

# --- Zeitversatz Video<->App aus Szenenwechseln schaetzen ---
FPS = 5.0
W, H = 160, 90
p = subprocess.run(["ffmpeg", "-v", "error", "-i", vid, "-vf",
                    "fps=%g,scale=%d:%d" % (FPS, W, H), "-pix_fmt", "rgb24",
                    "-f", "rawvideo", "-"], capture_output=True)
buf = np.frombuffer(p.stdout, np.uint8)
nfr = buf.size // (W * H * 3)
fr = buf[:nfr * W * H * 3].reshape(nfr, H, W, 3).astype(np.float32) / 255.0
lum = fr @ np.array([0.299, 0.587, 0.114], np.float32)
d_all = np.abs(np.diff(lum, axis=0)).mean(axis=(1, 2))
best, sc0 = 0.0, -1.0
for off in np.arange(-3.0, 3.01, 0.2):
    idx = [int(round((t + off) * FPS)) for t, _ in groups[1:]]
    idx = [i for i in idx if 1 <= i < len(d_all)]
    sc = float(np.mean(d_all[idx])) if idx else -1.0
    if sc > sc0: sc0, best = sc, off
print("Zeitversatz %+.1f s, %d Frames (%.0f s)" % (best, nfr, nfr / FPS))

# Die Sweep-Uhr driftet um ein Frame je Szene (m_sweepNextMs = now + secs);
# ueber 179 Szenen sind das mehrere Sekunden, genug damit eine feste
# "laute" Marke in den leisen Teil rutscht. Marken deshalb nach der
# TATSAECHLICHEN Audio-Phase waehlen (WAV-Zyklus 24 s: 0-16 leise, 16-24 laut).
CYCLE, HOT_FROM = 24.0, 16.0
def pick(t0, lo, hi, dt_lo, dt_hi):
    """Bestes dt: Audio-Phase in [lo,hi), dt in [dt_lo,dt_hi], und unter den
    Kandidaten das Bild mit der MEISTEN raeumlichen Struktur.

    Feste Zeitpunkte trafen zwangslaeufig tote Momente: je nach Szene war mal
    die leise Marke eine Flaeche (StellarNursery_A sd 1.0) und mal die laute
    (AlienPlanetOrbit_C sd 3.8), obwohl dieselbe Szene an anderer Stelle
    desselben Fensters sd 20 lieferte.  Die Phasenaufteilung leise/leise/laut
    bleibt -- sie soll die Szene ja in beiden Bedingungen zeigen."""
    cand = []
    dt = dt_lo
    while dt <= dt_hi:
        ph = (t0 + dt) % CYCLE
        if lo <= ph < hi:
            i = int(round((t0 + dt) * FPS))
            if 0 <= i < nfr:
                cand.append((float(lum[i].std()), dt))
        dt += 0.5
    return max(cand)[1] if cand else None
metrics = []
done = 0
for k, (t0, name) in enumerate(groups):
    t1 = groups[k + 1][0] if k + 1 < len(groups) else t0 + 24.0
    if t1 - t0 < 12.0:               # zu kurzes Fenster (Retry-Rest)
        continue
    ph0 = t0 + best
    marks = (("A", pick(ph0, 3.0, 15.0, 3.0, 9.0)),
             ("B", pick(ph0, 3.0, 15.0, 9.5, 15.0)),
             ("C", pick(ph0, HOT_FROM + 1.5, CYCLE - 0.5, 16.5, 22.5)))
    if any(m[1] is None for m in marks):
        continue
    for tag, dt in marks:
        f = os.path.join(out, "%s_%s.png" % (name, tag))
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "%.2f" % (ph0 + dt),
                        "-i", vid, "-frames:v", "1", f], check=False)
    done += 1
    # Messung ueber das ganze Fenster (nach der Blende)
    a = int(round((t0 + best + 2.0) * FPS)); b = int(round((t1 + best - 0.5) * FPS))
    a, b = max(0, a), min(nfr, b)
    if b - a >= 6:
        L = lum[a:b]
        dif = np.abs(np.diff(L, axis=0)).mean(axis=(1, 2))
        tt = (np.arange(a, b - 1) / FPS) - best
        near = np.abs(np.mod(tt, 24.0) - 16.0) < 1.2     # Audio-Sprungkante
        ds = dif[~near] if (~near).any() else dif
        metrics.append(dict(name=name, t0=float(t0),
                            luma_med=float(np.median(L)),
                            luma_min=float(L.mean(axis=(1, 2)).min()),
                            motion_med=float(np.median(ds)),
                            strobe=float(ds.max() / max(np.median(ds), 1e-4)),
                            spatial_std=float(np.median(L.std(axis=(1, 2)))),
                            clip_hi=float((L > 0.97).mean()),
                            hot_vs_quiet=1.0, frames=int(b - a)))
io.open(os.path.join(S, "metrics_cat.json"), "w", encoding="utf-8").write(json.dumps(metrics, indent=1))
print("%d Szenen: je 3 PNG nach %s, Messwerte -> metrics_cat.json" % (done, out))
