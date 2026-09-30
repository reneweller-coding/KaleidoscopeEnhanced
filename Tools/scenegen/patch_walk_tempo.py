# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the walk's fades and holds run on MUSIC time.
A fade's nominal length is given in seconds at 120 BPM and, while the music
has a steady beat, stretched to whole beats of the real tempo; its progress
per frame is dt / length * rate, with the rate from the short-term energy and
the spectral flux -- a fade crawls in a quiet passage and rushes in a burst,
and never jumps (the progress only grows)."""
import io, os
R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "Source")) + os.sep

def patch(fn, pairs):
    b = open(R + fn, "rb").read().decode("utf-8")
    crlf = "\r\n" in b
    s = b.replace("\r\n", "\n")
    for old, new in pairs:
        assert s.count(old) == 1, (fn, old[:60])
        s = s.replace(old, new)
    if crlf:
        s = s.replace("\n", "\r\n")
    open(R + fn, "wb").write(s.encode("utf-8"))
    print(fn, "ok")

patch("EffectShader.h", [
    ("		float energy = 0.5f;            ///< Slowly smoothed arousal (8 s).\n",
     "		float energy = 0.5f;            ///< Slowly smoothed arousal (8 s).\n"
     "		float energyFast = 0.5f;        ///< Arousal smoothed over ~1 s: drives the walk's speed.\n"
     "		float fluxS = 0.f;              ///< Spectral flux smoothed over ~0.5 s: bursts hurry a fade.\n"
     "		float rate = 1.f;               ///< Current music speed of the walk (fades and holds), 0.25 .. 2.5.\n"),
])
patch("EffectShader.cpp", [
    # the music speed, computed once per frame after the slow energy
    ("	const float E = m_walk.energy;\n",
     "	const float E = m_walk.energy;\n"
     "	// Music time: the short-term energy and the flux set how fast fades and\n"
     "	// holds run (a quiet passage lets a fade crawl, a burst rushes it).\n"
     "	m_walk.energyFast += ( f.arousal - m_walk.energyFast ) * ( dt < 1.f ? dt : 1.f );\n"
     "	m_walk.fluxS      += ( f.spectralFlux - m_walk.fluxS ) * ( dt * 2.f < 1.f ? dt * 2.f : 1.f );\n"
     "	{\n"
     "		float r = 0.35f + 0.9f * m_walk.energyFast + 1.2f * m_walk.fluxS;\n"
     "		m_walk.rate = r < 0.25f ? 0.25f : ( r > 2.5f ? 2.5f : r );\n"
     "	}\n"),
    # the nominal length in whole beats of the real tempo (steady beat only)
    ("	m_walk.fadeDur[s] = dur > 0.3f ? dur : 0.3f;\n",
     "	// dur is given at 120 BPM; with a steady beat it becomes the same number\n"
     "	// of beats at the real tempo (so a fade spans whole bars of this song).\n"
     "	const float bpm = 40.f + 160.f * m_lastAudioForBake.estimatedBPM;\n"
     "	if( m_lastAudioForBake.estimatedBPM > 0.01f && m_lastAudioForBake.rhythmStrength > 0.35f )\n"
     "		dur = floorf( dur * 2.f + 0.5f ) * 60.f / bpm;            // beats at 120 BPM -> seconds now\n"
     "	m_walk.fadeDur[s] = dur > 0.3f ? dur : 0.3f;\n"),
    ("		if( !m_walk.fading[s] ) m_walk.hold[s] += dt;",
     "		if( !m_walk.fading[s] ) m_walk.hold[s] += dt * m_walk.rate;"),
    ("			m_walk.f[s] += dt / m_walk.fadeDur[s];",
     "			m_walk.f[s] += dt * m_walk.rate / m_walk.fadeDur[s];     // music time: never backwards, never a jump"),
    ('fprintf( stderr, "WALK %s stage %s: %.3f -> %.3f over %.1f s\\n", fragmentName(), kWalkName[s],',
     'fprintf( stderr, "WALK %s stage %s: %.3f -> %.3f, %.1f s at music speed %.2f\\n", fragmentName(), kWalkName[s],'),
    ("	         m_walk.x0[s], m_walk.x1[s], m_walk.fadeDur[s] );",
     "	         m_walk.x0[s], m_walk.x1[s], m_walk.fadeDur[s], m_walk.rate );"),
])
