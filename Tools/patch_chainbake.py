# -*- coding: utf-8 -*-
"""Chain runner, bake mode (the tunnel lab): a lab whose final shader carries
"// @chainbake N" reads its chain at arbitrary points (the tunnel wall in
every march step), so the runner renders the chain over its input square
[0,1]^2 into an N x N texture -- stored mirrored, sampled bilinearly with
mirrored repeat -- instead of per screen pixel.  Labs without an order knob
run the fixed order A -> B -> C -> D."""
import io, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

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
"""	int		m_cpW = 0, m_cpH = 0;       ///< Their size (the target viewport).""",
"""	int		m_cpW = 0, m_cpH = 0;       ///< Their size (the target viewport, or the bake square).
	int		m_chainBake = 0;            ///< > 0: the chain is baked over [0,1]^2 at this size ("// @chainbake N" in the final shader)."""
)])

rw("Source/EffectShader.cpp", [
("""				m_compileFile = (char *) malloc( fin.size() + 1 );
				strcpy( m_compileFile, fin.c_str() );""",
"""				m_compileFile = (char *) malloc( fin.size() + 1 );
				strcpy( m_compileFile, fin.c_str() );
				if( char *t = textFileRead( m_compileFile ) )
				{
					if( const char *b = strstr( t, "// @chainbake " ) )
						m_chainBake = atoi( b + 14 );
					free( t );
				}"""),
("""	GLint texIn = -1, texB = -1, firstPass = -1, subV = -1, mixF = -1, chainOff = -1,""",
 """	GLint texIn = -1, texB = -1, firstPass = -1, subV = -1, mixF = -1, chainOff = -1, bakeSize = -1,"""),
("""	p.chainOff = glGetUniformLocation( p.prog, "chainOff" );""",
 """	p.chainOff = glGetUniformLocation( p.prog, "chainOff" );
	p.bakeSize = glGetUniformLocation( p.prog, "bakeSize" );"""),
("""	if( m_permCodes.size() != 24 ) return;
""",
"""	const bool fixedOrder = m_permCodes.size() != 24;  // a lab without an order knob: A -> B -> C -> D
"""),
("""	const int W = vp[2] > 0 ? vp[2] : 1, H = vp[3] > 0 ? vp[3] : 1;""",
 """	const int W = m_chainBake > 0 ? m_chainBake : ( vp[2] > 0 ? vp[2] : 1 );
	const int H = m_chainBake > 0 ? m_chainBake : ( vp[3] > 0 ? vp[3] : 1 );"""),
("""			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );""",
"""			// baked: read bilinearly at any point of the mirrored square (passes use texelFetch)
			const GLint filt = m_chainBake > 0 ? GL_LINEAR : GL_NEAREST;
			const GLint wrap = m_chainBake > 0 ? 0x8370 /* GL_MIRRORED_REPEAT */ : GL_CLAMP_TO_EDGE;
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, filt );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, filt );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, wrap );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, wrap );"""),
("""		if( p.chainOff >= 0 )  glUniform2f( p.chainOff, (float) vp[0], (float) vp[1] );""",
 """		if( p.chainOff >= 0 )  glUniform2f( p.chainOff, m_chainBake > 0 ? 0.f : (float) vp[0], m_chainBake > 0 ? 0.f : (float) vp[1] );
		if( p.bakeSize >= 0 )  glUniform1f( p.bakeSize, (float) m_chainBake );"""),
("""	auto orderCode = [&]( float x ) { return m_permCodes[ classPos( x, 24 ) ]; };
	int res = runOrder( orderCode( m_walk.x0[8] ) );
	const bool orderFade = m_walk.active && m_walk.fading[8] && m_walk.f[8] > 0.f""",
"""	auto orderCode = [&]( float x ) { return fixedOrder ? 228 : m_permCodes[ classPos( x, 24 ) ]; };   // 228: A, B, C, D
	int res = runOrder( orderCode( m_walk.x0[8] ) );
	const bool orderFade = !fixedOrder && m_walk.active && m_walk.fading[8] && m_walk.f[8] > 0.f"""),
("""	if( w > 0.f )
	{
		const int out = freeTex( 1u << res );
		pass( "..\\\\Engine\\\\ChainPass\\\\Fallback.frag", res, -1, out, 0.f, w );
		res = out;
	}""",
"""	if( w > 0.f )
	{
		const int out = freeTex( 1u << res );
		pass( "..\\\\Engine\\\\ChainPass\\\\Fallback.frag", res, -1, out, 0.f, w );
		res = out;
	}
	else if( m_chainBake > 0 )
	{
		// baked coordinates are interpolated: store them mirrored (continuous)
		const int out = freeTex( 1u << res );
		pass( "..\\\\Engine\\\\ChainPass\\\\Id.frag", res, -1, out, 0.f, 0.f );
		res = out;
	}"""),
])
p = os.path.join(ROOT, "Source", "EffectShader.cpp")
s = io.open(p, encoding="utf-8", newline="").read()
if '#include "textfile.h"' not in s:
    raise SystemExit("textfile.h include missing")
print("ok")
