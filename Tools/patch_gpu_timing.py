# -*- coding: utf-8 -*-
"""KALEIDO_GPU_TIMING=1: the GPU time of every frame (GL_TIME_ELAPSED around
draw(), a ring of queries read back three frames later -- no stall), logged
once per second as "[gpu] avg / max ms" with the frame size.  With vsync the
fps stop at the panel's rate and say nothing about the headroom; the GPU time
does.  KALEIDO_NO_VSYNC=1 turns the swap interval off for the same reason."""
import io, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

def rw(path, pairs):
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

rw("Source/glwidget.cpp", [
("""	const qint64 costT0 = frameT0;

	 draw();
""",
"""	const qint64 costT0 = frameT0;

	// KALEIDO_GPU_TIMING=1: the GPU time of each frame.  With vsync the fps
	// stop at the panel's rate (120 here) and hide how much headroom a scene
	// has -- or how far a slower GPU is from it.  A ring of four queries is
	// read three frames late, so the readback never waits for the GPU.
	static const bool gpuTiming = qEnvironmentVariableIsSet( "KALEIDO_GPU_TIMING" );
	static GLuint gpuQ[4] = { 0, 0, 0, 0 };
	static int    gpuFrame = 0;
	static double gpuSum = 0.0, gpuMax = 0.0;
	static int    gpuN = 0;
	static qint64 gpuLast = 0;
	const bool gpuOn = gpuTiming && glGenQueries && glBeginQuery && glEndQuery && glGetQueryObjectuiv;
	if( gpuOn )
	{
		if( !gpuQ[0] ) glGenQueries( 4, gpuQ );
		const GLuint old = gpuQ[ ( gpuFrame + 1 ) & 3 ];     // issued three frames ago
		if( gpuFrame >= 3 )
		{
			GLuint ready = 0;
			glGetQueryObjectuiv( old, 0x8867 /* GL_QUERY_RESULT_AVAILABLE */, &ready );
			if( ready )
			{
				GLuint ns = 0;
				glGetQueryObjectuiv( old, GL_QUERY_RESULT, &ns );
				const double ms = ns * 1e-6;
				gpuSum += ms; gpuN++;
				if( ms > gpuMax ) gpuMax = ms;
			}
		}
		glBeginQuery( 0x88BF /* GL_TIME_ELAPSED */, gpuQ[ gpuFrame & 3 ] );
	}

	 draw();

	if( gpuOn )
	{
		glEndQuery( 0x88BF );
		++gpuFrame;
		const qint64 t = m_fpsTimer.elapsed();
		if( t - gpuLast >= 1000 && gpuN > 0 )
		{
			fprintf( stderr, "[gpu] %.2f ms avg  %.2f ms max  %dx%d  renderScale %.2f\\n",
			         gpuSum / gpuN, gpuMax, m_width, m_height, RenderPipeline::renderScale() );
			gpuSum = gpuMax = 0.0; gpuN = 0; gpuLast = t;
		}
	}
"""),
])

rw("Source/main.cpp", [
("""	fmt.setDepthBufferSize( 24 );
	QSurfaceFormat::setDefaultFormat( fmt );""",
"""	fmt.setDepthBufferSize( 24 );
	// KALEIDO_NO_VSYNC=1: measure without the panel's frame cap (see KALEIDO_GPU_TIMING).
	if( qEnvironmentVariableIsSet( "KALEIDO_NO_VSYNC" ) )
		fmt.setSwapInterval( 0 );
	QSurfaceFormat::setDefaultFormat( fmt );"""),
])
print("ok")
