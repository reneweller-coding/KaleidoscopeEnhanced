# -*- coding: utf-8 -*-
"""How the music moves the picture: rates and pulses per track, and the chain labs' walk they cause.

Input: the CSV of `PresetEditor --features in.wav out.csv` (the app's analyzer and AudioConditioner, every 50 ms).
Per track it prints

  * the music: presence, arousal (as the walk sees it), share of steady beat, sections per minute
  * motion: audioPhase rate (rad/s, what turns 576 shaders) and audioAdvance rate (1/s, the flow and the 3D flight)
  * light: audioKick mean and share of time above 0.3 (1050 shaders flash with it)
  * colour: the 2D chain lab's colour-field hue rate (0.12 audioPhase + 0.3 audioMode + 0.004 sceneTime, deg/s)
  * geometry: the 1-s wobble of the spectral spread (the scale of five global maps of the 2D lab)
  * harmony: the harmonic-change envelope (mean, swells over 0.55 a minute) and the harmony's advance a minute
    (audioHarmAdvance: ~1 per chord change)
  * a model of EffectShader::stepChainWalk (energy, music speed, section/drop/harmony/phrase/hold walks, the rest
    after a fade, the target region): walks per minute, share of time a fade runs, target quantiles -- whole class
    list and inside an entry range (--range, default the Ambient variants' 0..0.6)

The walk model follows EffectShader.cpp as of 16.10.2026; keep the two in step when the walk changes.

  PresetEditor.exe --features track.wav track.csv
  python Tools/audio_mapping_stats.py track.csv [more.csv ...] [--range 0 0.6]
"""
import argparse
import math
import os

import numpy as np
import pandas as pd


def walk_model( d, dt, lo, hi, seed=1 ):
    """stepChainWalk frame by frame for the nine stages of a 3D lab (A..D, look, space, core, body, order)."""
    rng = np.random.default_rng( seed )
    n = 9
    hold = np.array( [ 9.0 * s for s in range( n ) ] )
    fading = np.zeros( n, bool )
    f = np.zeros( n )
    fdur = np.ones( n )
    energy, energy_fast, flux_s, rest, harm_cool = 0.5, 0.5, 0.0, 0.0, 8.0
    has_harm = hasattr( d, "harm_c" )
    last_sec = last_drop = None
    last_phr, phrase_n = -1.0, 0
    walks, fade_time, targets = 0, 0.0, []
    lerp = lambda a, b, t: a + ( b - a ) * t

    def pick( eb ):
        spread = 0.25 + 0.15 * ( 1.0 - eb )
        v = 0.08 + 0.84 * eb + ( rng.random() - 0.5 ) * 2.0 * spread
        v = -v if v < 0.0 else ( 2.0 - v if v > 1.0 else v )
        return min( max( v, 0.0 ), 1.0 )

    def start( s, dur, eb ):
        nonlocal walks
        if fading[ s ] or ( 5 <= s <= 7 and fading[ 5:8 ].any() ):
            return
        targets.append( pick( eb ) )
        fading[ s ] = True
        f[ s ] = 0.0
        fdur[ s ] = max( dur, 0.3 )
        walks += 1

    for r in d.itertuples():
        energy += ( r.arousal_c - energy ) * min( dt / 8.0, 1.0 )
        energy_fast += ( r.arousal_c - energy_fast ) * min( dt, 1.0 )
        flux_s += ( r.flux_c - flux_s ) * min( dt * 2.0, 1.0 )
        rate = min( max( 0.35 + 0.9 * energy_fast + 1.2 * flux_s + 0.8 * r.buildup, 0.25 ), 2.5 )
        eb = min( energy + 0.3 * r.buildup, 1.0 )
        if last_sec is None:
            last_sec, last_drop = r.sections, r.drops
        if r.sections != last_sec:
            last_sec = r.sections
            start( 0, 4.0, eb )
            if rng.random() < 0.5:
                start( 4, 6.0, eb )
            if rng.random() < 0.6:
                start( 5 + int( rng.integers( 2 ) ), lerp( 14, 8, energy ), eb )
        if r.drops != last_drop:
            last_drop = r.drops
            start( 0, 2.0, eb )
            start( 3, 1.5, eb )
            start( 4, 1.5, eb )
        rest -= dt
        resting = rest > 0.0
        harm_cool -= dt
        if has_harm and not fading.any() and not resting and harm_cool <= 0.0 and r.harm_c > 0.55:
            start( 1 + int( rng.integers( 2 ) ), lerp( 8, 4, energy ), eb )
            harm_cool = 12.0
        steady = r.bpm > 0.0 and r.rhythm > 0.35
        turn = steady and last_phr >= 0.0 and r.phrase_pos + 0.5 < last_phr
        last_phr = r.phrase_pos
        if turn and not fading.any() and not resting:
            phrase_n += 1
            start( int( rng.integers( 4 ) ) if phrase_n % 2 else int( np.argmax( hold[ :5 ] ) ), 4.0, eb )
        hold[ ~fading ] += dt * rate
        if not fading.any() and not resting:
            best, best_r = -1, 1.0
            for s in range( n ):
                ratio = hold[ s ] / ( lerp( 70, 30, energy ) * ( 1.6 if s == 4 else ( 1.4 if 5 <= s <= 7 else 1.0 ) ) )
                if 5 <= s <= 7 and steady and ratio < 1.5:
                    continue
                if ratio >= best_r:
                    best_r, best = ratio, s
            if best >= 0:
                start( best, lerp( 14, 8, energy ) if 5 <= best <= 7 else lerp( 10, 5, energy ), eb )
        if fading.any():
            fade_time += dt
        for s in range( n ):
            if fading[ s ]:
                f[ s ] += dt * rate / fdur[ s ]
                if f[ s ] >= 1.0:
                    fading[ s ] = False
                    hold[ s ] = 0.0
                    rest = 24.0 * ( 1.0 - energy ) ** 2
    minutes = len( d ) * dt / 60.0
    t = np.array( targets or [ 0.0 ] )
    return walks / minutes, fade_time / ( len( d ) * dt ), np.percentile( t, [ 10, 50, 90 ] ), \
        np.percentile( lo + ( hi - lo ) * t, [ 10, 50, 90 ] )


def main():
    ap = argparse.ArgumentParser( description=__doc__.split( "\n" )[ 0 ] )
    ap.add_argument( "csv", nargs="+" )
    ap.add_argument( "--range", nargs=2, type=float, default=[ 0.0, 0.6 ], metavar=( "LO", "HI" ) )
    a = ap.parse_args()
    for path in a.csv:
        d = pd.read_csv( path )
        dt = float( d.t.iloc[ 1 ] - d.t.iloc[ 0 ] )
        live = d[ d.t > 10.0 ] if d.t.iloc[ -1 ] > 60 else d
        minutes = len( live ) * dt / 60.0
        rot = np.gradient( live.rotphase.values, dt )
        adv = np.gradient( live.advance.values, dt )
        hue = 360.0 * np.abs( 0.12 * rot + 0.3 * np.gradient( live[ "mode" ].values, dt ) + 0.004 )
        spread = live[ "spread_c" ] if "spread_c" in live else live.spread
        wobble = spread.rolling( max( 1, int( round( 1.0 / dt ) ) ) ).std().median()
        steady = ( ( live.bpm > 0 ) & ( live.rhythm > 0.35 ) ).mean()
        sections = ( live.sections.iloc[ -1 ] - live.sections.iloc[ 0 ] ) / minutes
        wpm, fade, tq, tr = walk_model( d, dt, a.range[ 0 ], a.range[ 1 ] )
        print( "\n=== %s (%.1f min)" % ( os.path.basename( path ), minutes ) )
        print( "  music: presence %.2f, arousal %.2f, steady beat %.0f %%, sections %.2f/min"
               % ( live.presence.median(), live.arousal_c.median(), 100 * steady, sections ) )
        print( "  motion: audioPhase %.3f rad/s, audioAdvance %.4f /s | light: kick mean %.3f, >0.3 %.0f %%"
               % ( np.median( np.abs( rot ) ), np.median( adv ), live.kick_c.mean(), 100 * ( live.kick_c > 0.3 ).mean() ) )
        print( "  colour: lab colour-field hue median %.1f deg/s, p90 %.1f | geometry: spread 1-s wobble %.4f"
               % ( np.median( hue ), np.percentile( hue, 90 ), wobble ) )
        if "harm_c" in live:
            env = live.harm_c.values
            swells = np.sum( ( env[ 1: ] > 0.55 ) & ( env[ :-1 ] <= 0.55 ) ) / minutes
            print( "  harmony: envelope mean %.3f, swells over 0.55 %.1f/min, advance %.1f/min"
                   % ( env.mean(), swells, ( live.harm_adv.iloc[ -1 ] - live.harm_adv.iloc[ 0 ] ) / minutes ) )
        print( "  walk: %.2f walks/min, a fade running %.0f %% of the time, targets p10/50/90 %.2f/%.2f/%.2f"
               " (in %.2f..%.2f: %.2f/%.2f/%.2f)"
               % ( wpm, 100 * fade, tq[ 0 ], tq[ 1 ], tq[ 2 ], a.range[ 0 ], a.range[ 1 ], tr[ 0 ], tr[ 1 ], tr[ 2 ] ) )


if __name__ == "__main__":
    main()
