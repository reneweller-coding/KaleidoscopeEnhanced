# -*- coding: utf-8 -*-
"""A synthetic track with KNOWN chord changes, to calibrate the harmonic-change detector (harmonicChange, HCDF).

    python Tools/make_chord_wav.py [out.wav]          # default: .screen/chords.wav (+ .changes.txt)

Real music has no chord list here, and "does the detector see the chord change, and nothing else?" can only be
answered against the truth.  The parts, 48 kHz, 16 bit, stereo:

     0- 30 s  a drone on A (root, fifth, octave, slow beating)         no change: the noise floor
    30- 94 s  ambient pad, a chord every 8 s, 1.5-s crossfade          Am F C G Am Dm E Am
    94-126 s  pop changes every 2 s, 0.1-s crossfade, kick + hats      C G Am F x 4
   126-156 s  one held chord (Am) with a melody moving over it         no change: notes are not chords
   156-188 s  a key change: C F G C every 4 s, then up a minor third   C F G C | Eb Ab Bb Eb

The change times (seconds) go to <out>.changes.txt, one per line, with the kind ("slow", "fast", "key").
"""
import math
import os
import struct
import sys

import numpy as np

SR = 48000
NOTE = { "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
         "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11 }


def freq( midi ):
    return 440.0 * 2.0 ** ( ( midi - 69 ) / 12.0 )


def chord_notes( name ):
    """MIDI notes of a chord in a pad voicing around C3..C5: 'Am', 'F', 'Eb', 'Dm', 'E'."""
    minor = name.endswith( "m" )
    root = NOTE[ name[ :-1 ] if minor else name ]
    base = 48 + root                                   # the root an octave below the middle
    third = 3 if minor else 4
    return [ base - 12, base, base + 7, base + 12, base + 12 + third, base + 19 ]


def pad( notes, n, phase0=0.0 ):
    """A soft pad: a few partials per note, slow vibrato, stereo detune."""
    t = np.arange( n ) / SR + phase0
    left = np.zeros( n )
    right = np.zeros( n )
    for i, m in enumerate( notes ):
        f = freq( m )
        amp = 0.16 if i == 0 else 0.10
        for k, a in ( ( 1, 1.0 ), ( 2, 0.35 ), ( 3, 0.15 ), ( 4, 0.07 ) ):
            vib = 0.0015 * np.sin( 2 * math.pi * ( 0.21 + 0.03 * i ) * t )
            left += amp * a * np.sin( 2 * math.pi * f * k * ( 1.0 + vib ) * t )
            right += amp * a * np.sin( 2 * math.pi * f * k * ( 1.0 + vib + 0.0007 ) * t + 0.5 )
    return left, right


def progression( chords, step, fade ):
    """Chords one after another, each `step` seconds, crossfaded over `fade` seconds."""
    n = int( SR * step )
    nf = max( 1, int( SR * fade ) )
    total = n * len( chords ) + nf
    left = np.zeros( total )
    right = np.zeros( total )
    for i, c in enumerate( chords ):
        a = i * n
        seg = n + nf
        l, r = pad( chord_notes( c ), seg, a / SR )
        w = np.ones( seg )
        w[ :nf ] = np.linspace( 0.0, 1.0, nf ) if i > 0 else 1.0
        w[ n: ] = np.linspace( 1.0, 0.0, seg - n )
        left[ a:a + seg ] += l * w
        right[ a:a + seg ] += r * w
    return left[ :n * len( chords ) ], right[ :n * len( chords ) ]


def drums( seconds, bpm=120.0 ):
    n = int( SR * seconds )
    out = np.zeros( n )
    beat = 60.0 / bpm
    kn = int( SR * 0.3 )
    tk = np.arange( kn ) / SR
    kick = np.sin( 2 * math.pi * np.cumsum( 45.0 + 90.0 * np.exp( -tk * 22.0 ) ) / SR ) * np.exp( -tk / 0.1 )
    hn = int( SR * 0.05 )
    rng = np.random.default_rng( 3 )
    hat = rng.standard_normal( hn ) * np.exp( -np.arange( hn ) / SR / 0.012 ) * 0.15
    t = 0.0
    while t < seconds:
        a = int( t * SR )
        out[ a:a + kn ] += 0.7 * kick[ :max( 0, min( kn, n - a ) ) ]
        h = int( ( t + beat / 2 ) * SR )
        if h < n:
            out[ h:h + hn ] += hat[ :max( 0, min( hn, n - h ) ) ]
        t += beat
    return out


def main():
    out = sys.argv[ 1 ] if len( sys.argv ) > 1 else os.path.join( ".screen", "chords.wav" )
    os.makedirs( os.path.dirname( out ) or ".", exist_ok=True )
    parts_l, parts_r, changes = [], [], []
    t = 0.0

    # 1. a drone on A
    n = SR * 30
    tt = np.arange( n ) / SR
    l = sum( a * np.sin( 2 * math.pi * f * tt ) for f, a in ( ( 110.0, 0.3 ), ( 165.0, 0.18 ), ( 220.4, 0.15 ) ) )
    parts_l.append( l )
    parts_r.append( l * 0.95 )
    t += 30.0

    # 2. slow ambient changes
    chords = [ "Am", "F", "C", "G", "Am", "Dm", "E", "Am" ]
    l, r = progression( chords, 8.0, 1.5 )
    parts_l.append( l )
    parts_r.append( r )
    changes += [ ( t + 8.0 * i, "slow" ) for i in range( 1, len( chords ) ) ]
    t += 8.0 * len( chords )

    # 3. pop changes every 2 s, with drums
    chords = [ "C", "G", "Am", "F" ] * 4
    l, r = progression( chords, 2.0, 0.1 )
    d = drums( 2.0 * len( chords ) )
    parts_l.append( l + d )
    parts_r.append( r + d )
    changes += [ ( t + 2.0 * i, "fast" ) for i in range( 0, len( chords ) ) ]   # the first one leaves the Am
    t += 2.0 * len( chords )

    # 4. one held chord, a melody over it
    n = SR * 30
    l, r = pad( chord_notes( "Am" ), n )
    tt = np.arange( n ) / SR
    melody = [ 69, 72, 76, 74, 72, 71, 69, 67, 69, 72, 74, 76, 79, 76, 74, 72 ]   # A minor scale tones
    mel = np.zeros( n )
    step = n // len( melody )
    for i, m in enumerate( melody ):
        a = i * step
        seg = tt[ a:a + step ] - tt[ a ]
        mel[ a:a + step ] = 0.12 * np.sin( 2 * math.pi * freq( m ) * seg ) * np.minimum( seg / 0.02, 1.0 ) * np.exp( -seg / 1.2 )
    parts_l.append( l + mel )
    parts_r.append( r + mel )
    changes.append( ( t, "fast" ) )   # F -> Am at the start of the part
    t += 30.0

    # 5. a key change
    chords = [ "C", "F", "G", "C", "C", "F", "G", "C", "Eb", "Ab", "Bb", "Eb", "Eb", "Ab", "Bb", "Eb" ]
    l, r = progression( chords, 2.0, 0.3 )
    parts_l.append( l )
    parts_r.append( r )
    for i in range( 0, len( chords ) ):
        if i == 0 or chords[ i ] != chords[ i - 1 ]:
            changes.append( ( t + 2.0 * i, "key" if i == 8 else "fast" ) )
    t += 2.0 * len( chords )

    left = np.concatenate( parts_l )
    right = np.concatenate( parts_r )
    peak = max( np.abs( left ).max(), np.abs( right ).max() )
    left = np.int16( np.clip( left / peak * 0.8, -1, 1 ) * 32767 )
    right = np.int16( np.clip( right / peak * 0.8, -1, 1 ) * 32767 )
    frames = np.empty( 2 * len( left ), dtype=np.int16 )
    frames[ 0::2 ] = left
    frames[ 1::2 ] = right
    with open( out, "wb" ) as f:
        data = frames.tobytes()
        f.write( b"RIFF" + struct.pack( "<I", 36 + len( data ) ) + b"WAVE" )
        f.write( b"fmt " + struct.pack( "<IHHIIHH", 16, 1, 2, SR, SR * 4, 4, 16 ) )
        f.write( b"data" + struct.pack( "<I", len( data ) ) + data )
    with open( os.path.splitext( out )[ 0 ] + ".changes.txt", "w", encoding="utf-8" ) as f:
        for c, kind in changes:
            f.write( "%.2f\t%s\n" % ( c, kind ) )
    print( "%s: %.0f s, %d chord changes" % ( out, len( left ) / SR, len( changes ) ) )


if __name__ == "__main__":
    main()
