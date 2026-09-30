# -*- coding: utf-8 -*-
"""One-off patch (30.09.): background shader compilation via the driver's
parallel compile (GL_KHR/ARB_parallel_shader_compile), so the warm-up never
freezes the picture -- a chain lab without the driver cache took seconds."""
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

patch("glcore.h", [
    ("GLuint glcoreDummyShadow();\n",
     "GLuint glcoreDummyShadow();\n"
     "/// Resolves any GL entry point by name (context current); null if the driver lacks it.\n"
     "void *glcoreProc( const char *name );\n"),
])
patch("glcore.cpp", [
    ("static void *glcGet(const char *name)\n{",
     "static void *glcGet(const char *name);\nvoid *glcoreProc( const char *name ) { return glcGet( name ); }\nstatic void *glcGet(const char *name)\n{"),
])
patch("shader_setup.h", [
    ("GLuint setShaders( const char *vert_source, const char * frag_source );\n",
     "GLuint setShaders( const char *vert_source, const char * frag_source );\n"
     "// Background build of a setShaders() program (driver-parallel compile, see\n"
     "// shader_setup.cpp): start never blocks; poll hands finished programs to the\n"
     "// program cache, so the later setShaders() call is a cache hit.  Start returns\n"
     "// false when the driver cannot compile in the background (then nothing changed).\n"
     "bool shaderPrebuildStart( const char *frag_source );\n"
     "int  shaderPrebuildPoll();          ///< Collects finished background builds; returns how many are still running.\n"
     "bool shaderPrebuildReady( const char *frag_source );   ///< True if setShaders() for this file would be a cache hit.\n"),
])
patch("shader_setup.cpp", [
    ("GLuint setShaders( const char *vert_source, const char * frag_source )\n{",
     r'''// ---------------------------------------------------------------------------
// Background builds (GL_KHR_parallel_shader_compile / GL_ARB_parallel_shader_compile).
//
// A plain compile blocks the render thread until the driver is done: a few ms
// for most scenes, but SECONDS for a chain lab when the driver's shader cache
// is cold (after every shader change, a driver update, a fresh install) -- the
// warm-up then froze the picture.  With the extension the driver compiles on
// its own threads: we hand it the source, link, and only ask the non-blocking
// GL_COMPLETION_STATUS until it is done; then the program goes into the cache.
// ---------------------------------------------------------------------------
#ifndef GL_COMPLETION_STATUS_KHR
#define GL_COMPLETION_STATUS_KHR 0x91B1
#endif
struct PrebuildJob { std::string key; GLuint prog; GLuint fs; };
static std::map<std::string, PrebuildJob> s_prebuild;
static int s_parallel = -1;                 ///< -1 unknown, 0 no, 1 yes
static bool parallelCompile()
{
	if( s_parallel >= 0 ) return s_parallel == 1;
	s_parallel = 0;
	if( const char *e = getenv( "KALEIDO_NO_PARALLEL_COMPILE" ) ) { (void)e; return false; }
	GLint n = 0;
	glGetIntegerv( GL_NUM_EXTENSIONS, &n );
	bool has = false;
	for( GLint i = 0; i < n && !has; ++i )
	{
		const char *ext = (const char *) glGetStringi( GL_EXTENSIONS, (GLuint) i );
		if( ext && ( !strcmp( ext, "GL_KHR_parallel_shader_compile" ) || !strcmp( ext, "GL_ARB_parallel_shader_compile" ) ) )
			has = true;
	}
	if( has )
	{
		typedef void (APIENTRY *MaxThreadsFn)( GLuint );
		MaxThreadsFn fn = (MaxThreadsFn) glcoreProc( "glMaxShaderCompilerThreadsKHR" );
		if( !fn ) fn = (MaxThreadsFn) glcoreProc( "glMaxShaderCompilerThreadsARB" );
		if( fn ) fn( 0xFFFFFFFFu );          // as many threads as the driver likes
		s_parallel = 1;
	}
	fprintf( stderr, "SHADER: background compile %s\n", s_parallel ? "on (parallel_shader_compile)" : "off" );
	return s_parallel == 1;
}

bool shaderPrebuildStart( const char *frag_source )
{
	if( !parallelCompile() ) return false;
	const std::string key = progKey( "FS", frag_source, 0, 0, 0, 0 );
	if( s_progByKey.count( key ) || s_prebuild.count( key ) ) return true;
	GLchar *src = textFileRead( frag_source );
	if( !src ) return false;
	PrebuildJob j;
	j.key  = key;
	j.prog = glCreateProgram();
	glAttachShader( j.prog, fullscreenVertShader() );
	j.fs = glCreateShader( GL_FRAGMENT_SHADER );
	glShaderSource( j.fs, 1, const_cast<const GLchar**>( &src ), NULL );
	free( src );
	glCompileShader( j.fs );                 // no status query: that would block
	glAttachShader( j.prog, j.fs );
	glLinkProgram( j.prog );
	s_prebuild[key] = j;
	return true;
}

int shaderPrebuildPoll()
{
	for( auto it = s_prebuild.begin(); it != s_prebuild.end(); )
	{
		GLint done = 0;
		glGetProgramiv( it->second.prog, GL_COMPLETION_STATUS_KHR, &done );
		if( !done ) { ++it; continue; }
		GLint linked = 0;
		glGetProgramiv( it->second.prog, GL_LINK_STATUS, &linked );
		glDeleteShader( it->second.fs );     // flagged; freed with the program
		if( linked )
			progStore( it->second.key, it->second.prog );
		else
			glDeleteProgram( it->second.prog );   // the blocking path will build it again and log why
		it = s_prebuild.erase( it );
	}
	return (int) s_prebuild.size();
}

bool shaderPrebuildReady( const char *frag_source )
{
	return s_progByKey.count( progKey( "FS", frag_source, 0, 0, 0, 0 ) ) != 0;
}

GLuint setShaders( const char *vert_source, const char * frag_source )
{'''),
])
patch("EffectShader.h", [
    ("	/// @return True once ensureCompiled() has successfully built the GL program.\n",
     "	/// @return The fragment shader file (for background builds).\n"
     "	const char *fragmentFile() const { return m_fragmentShaderFilename; }\n"
     "	/// @brief True if this effect builds with plain setShaders() (fullscreen fragment only); background builds apply only to those.\n"
     "	virtual bool plainFragment() const { return true; }\n"
     "	/// @return True once ensureCompiled() has successfully built the GL program.\n"),
])
patch("RenderPipeline.cpp", [
    ('''		if( !warmed )
			for( EffectShader *s : m_effectTextures )
				if( !s->isCompiled() )
				{
					s->ensureCompiled();      // GLSL only; a mesh build defers itself''',
     '''		// Background compile: the driver builds on its own threads; a shader
		// is only "compiled" here once its program waits in the cache (then
		// ensureCompiled() is a cache hit and costs nothing).  The scene and
		// FX that come NEXT go first -- they are known one fade in advance.
		// Up to four builds run at a time.  Without the driver extension the
		// old one-per-frame blocking path below runs unchanged.
		if( !warmed && shaderPrebuildPoll() < 4 )
		{
			auto want = [&]( EffectShader *s ) -> bool {
				if( !s || s->isCompiled() || !s->plainFragment() || !s->fragmentFile() ) return false;
				if( strstr( s->fragmentFile(), "Scene3D" ) ) return false;
				return shaderPrebuildStart( s->fragmentFile() );
			};
			int started = 0;
			if( m_scheduler.nextTexture() < m_effectTextures.size() && want( m_effectTextures[m_scheduler.nextTexture()] ) ) ++started;
			if( m_scheduler.nextFx() < m_effectFx.size() && want( m_effectFx[m_scheduler.nextFx()] ) ) ++started;
			for( EffectShader *s : m_effectTextures ) { if( started >= 2 ) break; if( want( s ) ) ++started; }
			for( EffectShader *s : m_effectFx )       { if( started >= 2 ) break; if( want( s ) ) ++started; }
		}
		if( !warmed )
			for( EffectShader *s : m_effectTextures )
				if( !s->isCompiled() && s->plainFragment() && s->fragmentFile() && !strstr( s->fragmentFile(), "Scene3D" )
				    && shaderPrebuildStart( s->fragmentFile() ) )
				{
					if( !shaderPrebuildReady( s->fragmentFile() ) ) continue;   // still building in the background
					s->ensureCompiled();      // cache hit: instant
					s_warmLabel = QStringLiteral( "glsl " ) + QString::fromLocal8Bit( s->fragmentName() );
					warmed = true;
					break;
				}
		if( !warmed )
			for( EffectShader *s : m_effectTextures )
				if( !s->isCompiled() && !( s->plainFragment() && s->fragmentFile() && !strstr( s->fragmentFile(), "Scene3D" ) && shaderPrebuildStart( s->fragmentFile() ) ) )
				{
					s->ensureCompiled();      // GLSL only; a mesh build defers itself'''),
    ('''		if( !warmed )
			for( EffectShader *s : m_effectFx )
				if( !s->isCompiled() )
				{
					s->ensureCompiled();''',
     '''		if( !warmed )
			for( EffectShader *s : m_effectFx )
				if( !s->isCompiled() )
				{
					// a background build in flight: wait for it instead of blocking
					if( s->plainFragment() && s->fragmentFile() && shaderPrebuildStart( s->fragmentFile() )
					    && !shaderPrebuildReady( s->fragmentFile() ) )
						continue;
					s->ensureCompiled();'''),
])
print("ok")
