# -*- coding: utf-8 -*-
"""Bestes Einzelbild aus einem Zeitfenster eines Videos schreiben.

    python Tools/pick_best_frame.py <video> <t_mitte> <ausgabe.png> [halbe_breite]

"Bestes" heisst: die groesste raeumliche Standardabweichung, also am meisten
zu sehen.  Ein FESTER Aufnahmezeitpunkt trifft sonst zwangslaeufig tote
Momente -- im Szenenkatalog lagen so mehrere Bilder bei sd unter 1.5, waehrend
dieselbe Aufnahme wenige Sekunden weiter sd 20 bis 60 hergab.
"""
import subprocess, sys, os
import numpy as np

vid   = sys.argv[1]
tmid  = float(sys.argv[2])
out   = sys.argv[3]
half  = float(sys.argv[4]) if len(sys.argv) > 4 else 4.0

FPS = 2.0
t0  = max(0.0, tmid - half)
span = half * 2.0

p = subprocess.run(["ffmpeg", "-v", "error", "-ss", "%.2f" % t0, "-t", "%.2f" % span,
                    "-i", vid, "-vf", "fps=%g,scale=192:108" % FPS,
                    "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True)
b = np.frombuffer(p.stdout, np.uint8)
n = b.size // (192 * 108 * 3)
if n == 0:
    # nichts zu waehlen -- alte Semantik, damit der Aufrufer nie leer ausgeht
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "%.2f" % tmid, "-i", vid,
                    "-vframes", "1", "-q:v", "2", out], check=False)
    print("kein Fenster lesbar, fester Zeitpunkt %.2f benutzt" % tmid)
    raise SystemExit(0)

L = (b[:n*192*108*3].reshape(n, 108, 192, 3).astype(np.float32) / 255.0) \
    @ np.array([0.299, 0.587, 0.114], np.float32)
sd = L.std(axis=(1, 2))
k  = int(np.argmax(sd))
tb = t0 + k / FPS
subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "%.2f" % tb, "-i", vid,
                "-vframes", "1", "-q:v", "2", out], check=False)
print("%s: t=%.2f (sd %.4f, fest waere %.2f mit sd %.4f)"
      % (os.path.basename(out), tb, sd[k], tmid, sd[min(int((tmid-t0)*FPS), n-1)]))
