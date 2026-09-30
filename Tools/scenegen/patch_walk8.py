# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the app's chain walk steers eight stages -- A..D, the
look (S) and, in ChainLab3D, the 3D structure: space, fold core, body.  Only one
structure stage fades at a time (the shader mixes two whole worlds then), and
they walk more slowly than the colour chain."""
import io, os
R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "Source")) + os.sep

def patch(fn, pairs):
    b = open(R + fn, "rb").read().decode("utf-8")
    crlf = "\r\n" in b
    s = b.replace("\r\n", "\n")
    for old, new in pairs:
        assert s.count(old) == 1, (fn, old[:70])
        s = s.replace(old, new)
    if crlf:
        s = s.replace("\n", "\r\n")
    open(R + fn, "wb").write(s.encode("utf-8"))
    print(fn, "ok")

H = []
for a, b in [("float x0[5] = {};               ///< Knob value shown per stage (A, B, C, D, look).",
              "float x0[8] = {};               ///< Knob value shown per stage (A, B, C, D, look, space, core, body)."),
             ("float x1[5] = {};", "float x1[8] = {};"),
             ("float f[5] = {};", "float f[8] = {};"),
             ("float fadeDur[5] = {};", "float fadeDur[8] = {};"),
             ("float hold[5] = {};", "float hold[8] = {};"),
             ("bool  fading[5] = {};", "bool  fading[8] = {};"),
             ("std::map<int, std::array<float, 5>> sectionLook;", "std::map<int, std::array<float, 8>> sectionLook;"),
             ("GLint	m_walkLoc[5] = { -1, -1, -1, -1, -1 };   ///< Locations of walkA, walkB, walkC, walkD, walkS.",
              "GLint	m_walkLoc[8] = { -1, -1, -1, -1, -1, -1, -1, -1 };   ///< Locations of walkA..walkD, walkS, walkSpace, walkCore, walkBody (-1 = stage absent)."),
             (" * Here each stage (A..D and the look, S) keeps the knob value it shows, its",
              " * Here each stage (A..D, the look S, and in the 3D lab space/core/body) keeps\n * the knob value it shows, its")]:
    H.append((a, b))
patch("EffectShader.h", H)

C = [
 ('static const char *kWalkKnob[5]  = { "chainAP", "chainBP", "chainCP", "chainDP", "styleP" };\n'
  'static const char *kWalkUni[5]   = { "walkA", "walkB", "walkC", "walkD", "walkS" };',
  '// Stages 5..7 (the 3D structure: space, fold core, body) exist in ChainLab3D only.\n'
  'static const int   kWalkN = 8;\n'
  'static const char *kWalkKnob[8]  = { "chainAP", "chainBP", "chainCP", "chainDP", "styleP", "spaceP", "coreP", "bodyP" };\n'
  'static const char *kWalkUni[8]   = { "walkA", "walkB", "walkC", "walkD", "walkS", "walkSpace", "walkCore", "walkBody" };\n'
  'static const char *kWalkName[8]  = { "A", "B", "C", "D", "look", "space", "core", "body" };\n'
  'static bool isStructure( int s ) { return s >= 5; }'),
 ("	m_walk.active = ( m_walkHostLoc >= 0 && morph >= 0.5f );\n	for( int s = 0; s < 5; ++s )",
  "	m_walk.active = ( m_walkHostLoc >= 0 && morph >= 0.5f );\n	for( int s = 0; s < kWalkN; ++s )"),
 ("	if( m_walk.fading[s] )\n		return;\n	m_walk.x1[s]",
  "	if( m_walk.fading[s] || ( m_walkLoc[s] < 0 && s != 0 ) )\n		return;\n"
  "	// The shader mixes two whole 3D worlds while a structure stage fades: one at a time.\n"
  "	if( isStructure( s ) )\n"
  "		for( int o = 5; o < kWalkN; ++o )\n"
  "			if( m_walk.fading[o] ) return;\n"
  "	m_walk.x1[s]"),
 ('fprintf( stderr, "WALK %s stage %c: %.3f -> %.3f over %.1f s\\n", fragmentName(), "ABCDS"[s],',
  'fprintf( stderr, "WALK %s stage %s: %.3f -> %.3f over %.1f s\\n", fragmentName(), kWalkName[s],'),
 ("		for( int s = 0; s < 5; ++s )\n			m_walkLoc[s] = glGetUniformLocation( m_sh_prog_id, kWalkUni[s] );",
  "		for( int s = 0; s < kWalkN; ++s )\n			m_walkLoc[s] = glGetUniformLocation( m_sh_prog_id, kWalkUni[s] );"),
 ("			for( int s = 0; s < 5; ++s )\n				if( fabsf( it->second[s] - m_walk.x0[s] ) > 1e-4f )",
  "			for( int s = 0; s < kWalkN; ++s )\n				if( fabsf( it->second[s] - m_walk.x0[s] ) > 1e-4f )"),
 ("			if( uni( m_walk.rng ) < 0.5f )\n				startWalk( 4, pick(), 6.f );\n",
  "			if( uni( m_walk.rng ) < 0.5f )\n				startWalk( 4, pick(), 6.f );\n"
  "			// ... and in the 3D lab often a new space or fold core: the world itself turns.\n"
  "			if( uni( m_walk.rng ) < 0.6f )\n"
  "				startWalk( 5 + (int) ( m_walk.rng() % 2u ), pick(), lerp( 14.f, 8.f, E ) );\n"),
 ("			std::array<float, 5> look;\n			for( int s = 0; s < 5; ++s )",
  "			std::array<float, 8> look;\n			for( int s = 0; s < kWalkN; ++s )"),
 ("	for( int s = 0; s < 5; ++s )\n		if( !m_walk.fading[s] ) m_walk.hold[s] += dt;",
  "	for( int s = 0; s < kWalkN; ++s )\n		if( !m_walk.fading[s] ) m_walk.hold[s] += dt;"),
 ("		for( int s = 0; s < 5; ++s )\n		{\n			float r = m_walk.hold[s] / ( lerp( 90.f, 35.f, E ) * ( s == 4 ? 1.6f : 1.f ) );",
  "		for( int s = 0; s < kWalkN; ++s )\n		{\n			if( m_walkLoc[s] < 0 ) continue;            // stage absent in this shader\n"
  "			// the look holds longer than the chain, the 3D structure longer still\n"
  "			float r = m_walk.hold[s] / ( lerp( 90.f, 35.f, E ) * ( s == 4 ? 1.6f : ( isStructure( s ) ? 1.4f : 1.f ) ) );"),
 ("		if( best >= 0 )\n			startWalk( best, pick(), lerp( 10.f, 5.f, E ) );",
  "		if( best >= 0 )\n			startWalk( best, pick(), isStructure( best ) ? lerp( 14.f, 8.f, E ) : lerp( 10.f, 5.f, E ) );"),
 ("	// Advance the fades and upload: (shown, target, progress) per stage.\n	for( int s = 0; s < 5; ++s )",
  "	// Advance the fades and upload: (shown, target, progress) per stage.\n	for( int s = 0; s < kWalkN; ++s )"),
]
patch("EffectShader.cpp", C)
