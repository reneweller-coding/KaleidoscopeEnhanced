# -*- coding: utf-8 -*-
"""App side of "at most one centred stage" (chain_classes.CENTRED): the chain
source is parsed by its own function, the knob roll and every walk step of a
flat lab keep at most one of the stages A..D on a class with a centre."""
import io, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")

def patch(path, pairs):
    p = os.path.join(ROOT, path)
    s = io.open(p, encoding="utf-8", newline="").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    for a, b in pairs:
        assert s.count(a) == 1, (path, a[:60])
        s = s.replace(a, b)
    if crlf:
        s = s.replace("\n", "\r\n")
    io.open(p, "w", encoding="utf-8", newline="").write(s)

H_OLD = """	std::map<std::string, float> m_chainConsts;   ///< Knobs frozen as constants (ChainLike*): name -> value.
"""
H_NEW = """	std::map<std::string, float> m_chainConsts;   ///< Knobs frozen as constants (ChainLike*): name -> value.
	std::map<std::string, std::vector<int>> m_chainCentred;   ///< Stage knob -> positions of its classes with a centre, from "// @chaincentred".
	/// @brief Reads the chain lab's "// @chainclasses" / "// @chaincentred" lines and frozen knobs once (m_chainParsed).
	void parseChainSource();
	/// @brief Whether knob value x of stage s (0..3 = A..D) picks a class with a centre (see chain_classes.CENTRED).
	bool centredAt( int s, float x ) const;
	/// @brief The nearest class of stage s without a centre (energy order), same sub-variant; x if there is none.
	float flatClass( int s, float x ) const;
"""

C_OLD_HEAD = """std::string EffectShader::chainInfo()
{
	if( m_chainParsed < 0 )
	{"""
C_NEW_HEAD = """void EffectShader::parseChainSource()
{
	if( m_chainParsed < 0 )
	{"""
C_OLD_TAIL = """	if( m_chainParsed != 1 )
		return std::string();

	// The rolled value of a knob (or its frozen constant); -1 if the shader has neither."""
C_NEW_TAIL = """}

// Class position of a knob value, exactly as the shader's pickStage().
static int classPos( float x, int n )
{
	int k = (int)( ( x < 0.f ? 0.f : ( x > 1.f ? 1.f : x ) ) * n );
	return k > n - 1 ? n - 1 : k;
}

bool EffectShader::centredAt( int s, float x ) const
{
	auto c = m_chainCentred.find( kWalkKnob[s] );
	auto n = m_chainClasses.find( kWalkKnob[s] );
	if( c == m_chainCentred.end() || n == m_chainClasses.end() || n->second.empty() )
		return false;
	const int k = classPos( x, (int) n->second.size() );
	for( int p : c->second )
		if( p == k ) return true;
	return false;
}

float EffectShader::flatClass( int s, float x ) const
{
	auto n = m_chainClasses.find( kWalkKnob[s] );
	if( n == m_chainClasses.end() || n->second.empty() )
		return x;
	const int cnt = (int) n->second.size();
	const int k = classPos( x, cnt );
	const float sub = x * cnt - (float) k;          // the sub-variant (arms, mirrors ...) stays
	for( int d = 1; d < cnt; ++d )
		for( int sign = -1; sign <= 1; sign += 2 )
		{
			const int j = k + sign * d;
			if( j < 0 || j >= cnt ) continue;
			const float v = ( (float) j + ( sub < 0.f ? 0.f : ( sub > 0.99f ? 0.99f : sub ) ) ) / (float) cnt;
			if( !centredAt( s, v ) ) return v;
		}
	return x;
}

std::string EffectShader::chainInfo()
{
	parseChainSource();
	if( m_chainParsed != 1 )
		return std::string();

	// The rolled value of a knob (or its frozen constant); -1 if the shader has neither."""

C_OLD_PARSE = """				// frozen likes: "const float chainAP = 0.4752;\""""
C_NEW_PARSE = """				// "// @chaincentred chainAP 1|4|9": the classes with a centre (flat labs only)
				static const std::string ztag = "// @chaincentred ";
				if( line.compare( 0, ztag.size(), ztag ) == 0 )
				{
					const std::string rest = line.substr( ztag.size() );
					const size_t sp = rest.find( ' ' );
					std::vector<int> pos;
					if( sp != std::string::npos )
						for( size_t c = sp + 1; c < rest.size(); )
						{
							size_t d = rest.find( '|', c );
							if( d == std::string::npos ) d = rest.size();
							if( d > c ) pos.push_back( atoi( rest.c_str() + c ) );
							c = d + 1;
						}
					m_chainCentred[ rest.substr( 0, sp ) ] = pos;
				}
				// frozen likes: "const float chainAP = 0.4752;\""""

C_OLD_RESET = """void EffectShader::resetChainWalk()
{
	float morph = -1.f;"""
C_NEW_RESET = """void EffectShader::resetChainWalk()
{
	// At most one of the stages A..D on a class with a centre (a vanishing
	// point, a rosette, a zoom into a point): with two or more nearly every roll
	// of the flat labs read as a tunnel.  The first such stage keeps its class,
	// every later one moves to the nearest class without a centre.  The knobs
	// are constant for the whole activation, so this never shows as a jump.
	parseChainSource();
	bool centre = false;
	for( int s = 0; s < 4; ++s )
		for( Uniform *u : m_uniforms )
			if( u->getName() == kWalkKnob[s] && centredAt( s, u->snapshotValue() ) )
			{
				if( centre )
				{
					const float v = flatClass( s, u->snapshotValue() );
					fprintf( stderr, "%s: stage %s %.3f -> %.3f (one centre per chain)\\n", fragmentName(), kWalkName[s], u->snapshotValue(), v );
					u->restoreValue( v );
				}
				centre = true;
			}
	float morph = -1.f;"""

C_OLD_WALK = """	m_walk.x1[s]      = target < 0.f ? 0.f : ( target > 0.999f ? 0.999f : target );
"""
C_NEW_WALK = """	m_walk.x1[s]      = target < 0.f ? 0.f : ( target > 0.999f ? 0.999f : target );
	// One centre per chain on the walk too: a stage may only fade to a class
	// with a centre while no other stage shows one or is fading to one.
	if( s < 4 && centredAt( s, m_walk.x1[s] ) )
		for( int o = 0; o < 4; ++o )
			if( o != s && ( centredAt( o, m_walk.x0[o] ) || ( m_walk.fading[o] && centredAt( o, m_walk.x1[o] ) ) ) )
			{
				m_walk.x1[s] = flatClass( s, m_walk.x1[s] );
				break;
			}
"""

patch("Source/EffectShader.h", [(H_OLD, H_NEW)])
patch("Source/EffectShader.cpp", [(C_OLD_HEAD, C_NEW_HEAD), (C_OLD_TAIL, C_NEW_TAIL), (C_OLD_PARSE, C_NEW_PARSE),
                                  (C_OLD_RESET, C_NEW_RESET), (C_OLD_WALK, C_NEW_WALK)])
print("ok")
