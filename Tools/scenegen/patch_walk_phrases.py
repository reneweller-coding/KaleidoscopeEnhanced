# -*- coding: utf-8 -*-
"""The chain walk on the music's phrases (user, 01.10.2026: "the lab's reaction
to the music is rather modest"; "allow the morph of single transforms").

* With a steady beat every 8-bar phrase boundary moves the chain on --
  alternately a new VARIANT of one transform (the same class with other
  mirrors / arms / lattice: the transform itself morphs) and a new transform
  for the stage held longest; the fade spans two bars.
* A drop turns the frame too (stage A), not only the warp and the look.
* A build-up hurries the walk and pulls the targets toward the energetic end.
* Without a beat the hold before a stage walks is a little shorter (70..30 s)."""
import io, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")

def rw(path, pairs):
    p = os.path.join(ROOT, path)
    s = io.open(p, encoding="utf-8", newline="").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    for a, b in pairs:
        assert s.count(a) == 1, (path, a[:70])
        s = s.replace(a, b)
    if crlf:
        s = s.replace("\n", "\r\n")
    io.open(p, "w", encoding="utf-8", newline="").write(s)

rw("Source/EffectShader.h", [(
"""		float harmCool = 0.f;           ///< Cooldown for harmonic-change walks, seconds.
""",
"""		float harmCool = 0.f;           ///< Cooldown for harmonic-change walks, seconds.
		float lastPhrase = -1.f;        ///< AudioFeatures::phrasePos of the previous frame (-1 = not yet): its wrap is an 8-bar boundary.
		int   phraseN = 0;              ///< Phrase boundaries seen: odd ones bring a new variant, even ones a new transform.
""")])

rw("Source/EffectShader.cpp", [
("""	m_walk.lastSection = m_walk.lastDrop = -1;
""",
"""	m_walk.lastSection = m_walk.lastDrop = -1;
	m_walk.lastPhrase  = -1.f;
	m_walk.phraseN     = 0;
"""),
("""void EffectShader::stepChainWalk( const AudioFeatures &f )
{""",
"""static int classPos( float x, int n );

void EffectShader::stepChainWalk( const AudioFeatures &f )
{"""),
("""		float r = 0.35f + 0.9f * m_walk.energyFast + 1.2f * m_walk.fluxS;
""",
"""		// a build-up hurries the walk toward the drop
		float r = 0.35f + 0.9f * m_walk.energyFast + 1.2f * m_walk.fluxS + 0.8f * f.buildUp;
"""),
("""	auto pick = [&]() { return 0.08f + 0.84f * E + ( uni( m_walk.rng ) - 0.5f ) * 0.5f; };
""",
"""	// (a build-up pulls the targets toward the energetic end)
	const float Eb = E + 0.3f * f.buildUp < 1.f ? E + 0.3f * f.buildUp : 1.f;
	auto pick = [&]() { return 0.08f + 0.84f * Eb + ( uni( m_walk.rng ) - 0.5f ) * 0.5f; };
"""),
("""	// 2. A drop: the warp and the look turn fast.
	if( f.dropCount != m_walk.lastDrop )
	{
		m_walk.lastDrop = f.dropCount;
		startWalk( 3, pick(), 1.5f );
""",
"""	// 2. A drop: the frame, the warp and the look turn fast (about a bar).
	if( f.dropCount != m_walk.lastDrop )
	{
		m_walk.lastDrop = f.dropCount;
		startWalk( 0, pick(), 2.f );
		startWalk( 3, pick(), 1.5f );
"""),
("""	// 4. Otherwise the stage held longest walks when its time is up (sooner
	//    the more energy; the look holds longer than the chain).
	for( int s = 0; s < kWalkN; ++s )
		if( !m_walk.fading[s] ) m_walk.hold[s] += dt * m_walk.rate;
""",
"""	// 4. Phrases (with a steady beat): every 8-bar boundary moves the chain
	//    on -- alternately a new VARIANT of one transform (the same class with
	//    other mirrors, arms, lattice: the transform itself morphs) and a new
	//    transform for the stage held longest.  The fade spans two bars.
	const bool steady = f.estimatedBPM > 0.01f && f.rhythmStrength > 0.35f;
	const bool phraseTurn = steady && m_walk.lastPhrase >= 0.f && f.phrasePos + 0.5f < m_walk.lastPhrase;
	m_walk.lastPhrase = f.phrasePos;
	if( phraseTurn && !anyFading() )
	{
		++m_walk.phraseN;
		if( m_walk.phraseN % 2 == 1 )
		{
			int cand[4], nc = 0;                        // stages A..D that show a transform (not 'none')
			for( int s = 0; s < 4; ++s )
			{
				auto it = m_chainClasses.find( kWalkKnob[s] );
				if( m_walkLoc[s] < 0 || it == m_chainClasses.end() || it->second.empty() ) continue;
				if( it->second[ classPos( m_walk.x0[s], (int) it->second.size() ) ] != "none" ) cand[nc++] = s;
			}
			if( nc > 0 )
			{
				const int s = cand[ m_walk.rng() % (unsigned) nc ];
				const int n = (int) m_chainClasses[ kWalkKnob[s] ].size();
				const int k = classPos( m_walk.x0[s], n );
				startWalk( s, ( (float) k + 0.05f + 0.9f * uni( m_walk.rng ) ) / (float) n, 4.f );
			}
		}
		else
		{
			int best = -1; float bh = -1.f;
			for( int s = 0; s <= 4; ++s )               // A..D and the look
				if( m_walkLoc[s] >= 0 && m_walk.hold[s] > bh ) { bh = m_walk.hold[s]; best = s; }
			if( best >= 0 )
				startWalk( best, pick(), 4.f );
		}
	}
	// 5. Otherwise the stage held longest walks when its time is up (sooner
	//    the more energy; the look holds longer than the chain).
	for( int s = 0; s < kWalkN; ++s )
		if( !m_walk.fading[s] ) m_walk.hold[s] += dt * m_walk.rate;
"""),
("""			float r = m_walk.hold[s] / ( lerp( 90.f, 35.f, E ) * ( s == 4 ? 1.6f : ( isStructure( s ) ? 1.4f : 1.f ) ) );""",
 """			float r = m_walk.hold[s] / ( lerp( 70.f, 30.f, E ) * ( s == 4 ? 1.6f : ( isStructure( s ) ? 1.4f : 1.f ) ) );"""),
])
print("ok")
