# -*- coding: utf-8 -*-
r"""Ein synthetischer Track MIT STRUKTUR: Groove, Aufbau, Vakuum, Drop -- dreimal.

    python Tools/make_structure_wav.py [out.wav]       # -> .screen/structure128.wav

Wozu: zwei Fragen lassen sich nur an einem Track mit bekannter Wahrheit
pruefen, und echte Musik liegt hier nicht vor.

  1. Trifft die Drop-VORHERSAGE?  Der Conditioner rechnet aus dem 8-Takt-
     Phrasenzaehler, wann der naechste Drop faellt (phraseSecsLeft).  Hier
     ist bekannt, wann er faellt -- die Differenz ist der Fehler.
  2. Folgt die dominante Tonhoehe dem BASS oder der MELODIE?  Der Track hat
     eine prominente Basslinie (55-110 Hz) UND eine Lead-Melodie eine Oktave
     ueber dem Akkordbett.  Ueber KALEIDO_FEATURE_LOG sieht man, wo `pitch`
     sitzt: nahe 0 = Bass, um 0.4-0.6 = Melodie.

Aufbau (128 BPM, 0.469 s je Schlag, 1.875 s je Takt):
    16 s   Intro-Groove          (der Analyzer braucht >= 12 s Aufwaermen)
    3x  [ 8 Takte Groove | 8 Takte AUFBAU | 1 Schlag Vakuum | 8 Takte DROP ]

Der Aufbau liefert genau die Merkmale, die der Detektor summiert: Onsets
verdichten sich (Hats 8tel -> 16tel -> 32tel), ein Rauschen steigt im
Spektrum (Zentroid), der Pegel waechst, die Snare rollt in den letzten zwei
Takten.  Das Vakuum ist ein ganzer Schlag ohne Bass und Kick (>= 250 ms), der
Drop schlaegt mit Kick + Bass auf der Eins zurueck.

Die WAHRHEIT (Drop-Zeitpunkte in Sekunden) steht am Ende auf stdout und in
<out>.drops.txt, damit ein Auswerteskript nicht raten muss.
"""
import io
import math
import os
import struct
import sys
import wave

import numpy as np

SR   = 44100
BPM  = 128.0
SPB  = 60.0 / BPM
BAR  = 4 * SPB
A4   = 440.0


def note(semis):
    return A4 * 2.0 ** (semis / 12.0)


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(t / max(attack, 1e-4), 1.0) * np.exp(-np.maximum(t - attack, 0) / decay)


def kick(dur=0.30):
    n = int(SR * dur); t = np.arange(n) / SR
    f = 42.0 + 90.0 * np.exp(-t * 22.0)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.10)


def snare(dur=0.22):
    n = int(SR * dur)
    rng = np.random.default_rng(7)
    return (0.75 * rng.standard_normal(n) + 0.35 * np.sin(2 * np.pi * 190 * np.arange(n) / SR)) * env(n, 0.001, 0.055)


def hat(dur=0.05):
    n = int(SR * dur)
    rng = np.random.default_rng(11)
    x = rng.standard_normal(n)
    x = x - np.convolve(x, np.ones(8) / 8.0, "same")     # hochpass: nur Hoehen
    return x * env(n, 0.0005, 0.012)


def add(buf, sig, start, gain=1.0):
    i = int(start * SR)
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += gain * sig[:j - i]


# C-Dur I-V-vi-IV wie in make_test_song.py, damit Flux etwas zu messen hat.
CHORDS = [[-9, -5, -2], [-2, 2, 5], [0, 3, 7], [-4, 0, 3]]
BASS   = [-33, -26, -24, -28]          # Grundtoene zwei Oktaven tiefer (~55-110 Hz)
LEAD   = [3, 7, 10, 12, 10, 7, 5, 3, 0, 3, 5, 7, 10, 12, 15, 12]   # 16tel-Motiv, Oktave hoch


def chord_bed(bar_idx, dur, gain):
    n = int(SR * dur); t = np.arange(n) / SR
    out = np.zeros(n)
    for semi in CHORDS[bar_idx % 4]:
        out += np.sin(2 * np.pi * note(semi) * t) * 0.5 + np.sin(2 * np.pi * note(semi + 12) * t) * 0.2
    return out * gain * env(n, 0.02, 3.0)


def bass_line(bar_idx, dur, gain):
    """Saegezahn-Bass, 8tel, prominent -- die Frage 2 braucht ihn laut."""
    n = int(SR * dur); t = np.arange(n) / SR
    f = note(BASS[bar_idx % 4])
    saw = 2.0 * ((f * t) % 1.0) - 1.0
    gate = (np.floor(t / (SPB / 2)) % 2 == 0).astype(float) * 0.9 + 0.1
    return saw * gate * gain * 0.7


def lead(bar_idx, dur, gain):
    n = int(SR * dur); t = np.arange(n) / SR
    out = np.zeros(n)
    step = SPB / 4
    k = 0
    while k * step < dur:
        semi = LEAD[(bar_idx * 16 + k) % len(LEAD)] + 12
        m = int(SR * step); i = int(SR * k * step)
        tt = np.arange(m) / SR
        tone = (np.sin(2 * np.pi * note(semi) * tt) + 0.3 * np.sin(2 * np.pi * note(semi + 12) * tt)) * env(m, 0.005, 0.12)
        add(out, tone, k * step, gain)
        k += 1
    return out


def groove_bars(buf, t0, bars, level=1.0, with_lead=True, hat_div=2):
    for b in range(bars):
        bt = t0 + b * BAR
        add(buf, chord_bed(b, BAR, 0.16 * level), bt)
        add(buf, bass_line(b, BAR, level), bt)
        if with_lead:
            add(buf, lead(b, BAR, 0.20 * level), bt)
        for q in range(4):
            add(buf, kick(), bt + q * SPB, 0.9 * level)
            if q in (1, 3):
                add(buf, snare(), bt + q * SPB, 0.55 * level)
        for h in range(4 * hat_div):
            add(buf, hat(), bt + h * SPB / hat_div, 0.18 * level)


def buildup_bars(buf, t0, bars):
    n_total = int(SR * bars * BAR)
    riser = np.random.default_rng(3).standard_normal(n_total)
    tt = np.arange(n_total) / SR
    # steigendes Rauschen: Pegel UND Hoehenanteil wachsen -> Zentroid steigt
    hp = riser - np.convolve(riser, np.ones(64) / 64.0, "same")
    mix = hp * (tt / (bars * BAR)) ** 2 * 1.0
    add(buf, mix, t0)
    # Der erste Wurf war LEISER als der Groove davor (Pegel 0,45 gegen 0,58)
    # und hob buildUp nur auf 0,43 -- der Detektor summiert Onset-Dichte,
    # Zentroid-Anstieg, Pegel-Anstieg und Snare-Roll, und alle vier muessen
    # gegen ihre 10-s-Baseline WACHSEN.  Also: Pegel 1,0 -> 1,6, Riser dreimal
    # so laut, Kick verdoppelt sich in den letzten zwei Takten, Roll lauter.
    for b in range(bars):
        bt = t0 + b * BAR
        lvl = 1.0 + 0.6 * b / max(bars - 1, 1)
        add(buf, chord_bed(b, BAR, 0.16 * lvl), bt)
        add(buf, bass_line(b, BAR, 1.0), bt)
        div = 2 if b < bars // 2 else (4 if b < bars - 2 else 8)   # Hats verdichten sich
        for h in range(4 * div):
            add(buf, hat(), bt + h * SPB / div, 0.20 * lvl)
        kdiv = 2 if b >= bars - 2 else 1
        for q in range(4 * kdiv):
            add(buf, kick(), bt + q * SPB / kdiv, 0.9 * lvl)
        if b >= bars - 2:                                              # Snare-Roll
            for r in range(16):
                add(buf, snare(), bt + r * SPB / 4, 0.5 + 0.5 * r / 16)
        elif b % 2 == 1:
            add(buf, snare(), bt + 1 * SPB, 0.5); add(buf, snare(), bt + 3 * SPB, 0.5)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".screen", "structure128.wav")
    os.makedirs(os.path.dirname(out), exist_ok=True)

    INTRO = 16.0
    rounds = 3
    total = INTRO + rounds * (8 * BAR + 8 * BAR + 8 * BAR) + 2.0
    buf = np.zeros(int(SR * total))
    drops = []

    groove_bars(buf, 0.0, int(round(INTRO / BAR)) + 1, level=0.9)
    t = INTRO - (INTRO % BAR)                       # auf einen Taktanfang runden
    for r in range(rounds):
        groove_bars(buf, t, 8, level=1.0); t += 8 * BAR
        buildup_bars(buf, t, 8);            t += 8 * BAR
        # VAKUUM: die LETZTEN zwei Schlaege des Aufbaus werden gestrichen
        # (Kick/Bass weg, nur ein leiser Hat), damit der Drop exakt AUF der
        # 8-Takt-Grenze faellt -- so liegt er in echter Musik.  Als Zusatzzeit
        # eingefuegt verschob das Vakuum das ganze Phrasenraster um 2 Schlaege.
        # Der Detektor verlangt >= 250 ms Luecke NACH dem Abklingen der
        # schnellen Bass-Mittelung (tau 0,15 s); ein Schlag war dafuer knapp.
        gap0 = int(SR * (t - 2 * SPB)); buf[gap0:int(SR * t)] = 0.0
        add(buf, hat(), t - 2 * SPB, 0.1)
        drops.append(t)
        # DROP: Kick + Bass schlagen auf der Eins zurueck, lauter als vorher
        add(buf, kick(0.5), t, 1.6)
        add(buf, bass_line(0, SPB, 1.6), t)
        groove_bars(buf, t, 8, level=1.15, hat_div=4); t += 8 * BAR

    peak = np.max(np.abs(buf)) + 1e-9
    buf = buf / peak * 0.89
    w = wave.open(out, "wb")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((buf * 32767).astype("<i2").tobytes()); w.close()
    io.open(out + ".drops.txt", "w").write("\n".join("%.3f" % d for d in drops) + "\n")
    print("%s  (%.1f s)" % (out, len(buf) / SR))
    print("Drops bei:", ", ".join("%.2f s" % d for d in drops))
    return 0


if __name__ == "__main__":
    sys.exit(main())
