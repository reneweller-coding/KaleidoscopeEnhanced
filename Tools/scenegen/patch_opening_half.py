# -*- coding: utf-8 -*-
"""Openings (chain_classes.OPENING) half as often in the flat labs: at the roll
(deterministic from the rolled knob, no draw from the scene's rand() stream)
and on every walk step (the walk's own generator)."""
import io, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
p = os.path.join(ROOT, "Source", "EffectShader.cpp")
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
pairs = [
("""	// At most one of the stages A..D on a class that streams the picture into
	// an opening (tunnel, Droste zoom, log-polar spiral, pole stream): with two
	// or more nearly every roll of the flat labs read as a tunnel.  The first
	// such stage keeps its class, every later one moves to the nearest class
	// without an opening.  The knobs are constant for the whole activation, so
	// this never shows as a jump.
	parseChainSource();
	bool opening = false;
	for( int s = 0; s < 4; ++s )
		for( Uniform *u : m_uniforms )
			if( u->getName() == kWalkKnob[s] && opensAt( s, u->snapshotValue() ) )
			{
				if( opening )
				{""",
"""	// At most one of the stages A..D on a class that streams the picture into
	// an opening (tunnel, Droste zoom, log-polar spiral, pole stream), and that
	// one only every other time: with two or more nearly every roll of the flat
	// labs read as a tunnel.  A stage that gives its opening up moves to the
	// nearest class without one.  The half is decided from the rolled knob
	// itself (no draw from the scene's random stream), and the knobs are
	// constant for the whole activation, so this never shows as a jump.
	parseChainSource();
	bool opening = false;
	for( int s = 0; s < 4; ++s )
		for( Uniform *u : m_uniforms )
			if( u->getName() == kWalkKnob[s] && opensAt( s, u->snapshotValue() ) )
			{
				const float h = u->snapshotValue() * 9173.13f;
				if( opening || h - floorf( h ) < 0.5f )
				{"""),
("""	// One opening per chain on the walk too: a stage may only fade to a class
	// with an opening while no other stage shows one or is fading to one.
	if( s < 4 && opensAt( s, m_walk.x1[s] ) )
		for( int o = 0; o < 4; ++o )
			if( o != s && ( opensAt( o, m_walk.x0[o] ) || ( m_walk.fading[o] && opensAt( o, m_walk.x1[o] ) ) ) )
			{
				m_walk.x1[s] = closedClass( s, m_walk.x1[s] );
				break;
			}
""",
"""	// The same on the walk: a stage fades to a class with an opening only every
	// other time, and only while no other stage shows one or is fading to one.
	if( s < 4 && opensAt( s, m_walk.x1[s] ) )
	{
		bool other = std::uniform_real_distribution<float>( 0.f, 1.f )( m_walk.rng ) < 0.5f;
		for( int o = 0; o < 4; ++o )
			if( o != s && ( opensAt( o, m_walk.x0[o] ) || ( m_walk.fading[o] && opensAt( o, m_walk.x1[o] ) ) ) )
				other = true;
		if( other )
			m_walk.x1[s] = closedClass( s, m_walk.x1[s] );
	}
"""),
("(one opening per chain)", "(openings: at most one, half as often)"),
]
for a, b in pairs:
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
