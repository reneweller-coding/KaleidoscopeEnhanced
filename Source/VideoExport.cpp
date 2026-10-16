/*****************************************************************************\
 *                              VideoExport
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of VideoExport: settings parsing, the audio decode and block feed, the render and conversion
 *  targets, the readback ring and the ffmpeg writer thread.
 *
 *  @author René Weller
 */

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN ///< windows.h without its rarely used parts (the stdin reader needs only the basics).
#define NOMINMAX            ///< windows.h without its min/max macros, which would break std::min and std::max.
#include <windows.h>
#endif

#include <algorithm>
#include <cmath>
#include <cstring>
#include <string>

#include <QtCore/QCoreApplication>
#include <QtCore/QDateTime>
#include <QtCore/QDir>
#include <QtCore/QFileInfo>
#include <QtCore/QProcess>

#include "glcore.h"
#include "shader_setup.h"
#include "VideoExport.h"
#include "AudioAnalyzer.h"
#include "RenderPipeline.h"
#include "ScoreCues.h"

#ifndef GL_STREAM_READ
#define GL_STREAM_READ 0x88E1 ///< Usage hint for the readback buffers: written once by the GPU, read once by the CPU.
#endif

GLuint fullscreenVAO(); // RenderPipeline.cpp: the shared empty VAO of every fullscreen triangle

VideoExport::Settings VideoExport::M_Settings;
std::atomic<bool>     VideoExport::s_cancel{ false };

/**  Prints one machine-readable "[export] error" line (the export tool shows the text).
 *
 * @param msg  What went wrong. (in)
 *
 * @return
 *   false, so a check can end with "return fail( ... )".
 **/
static bool fail( const QString &msg )
{
    fprintf( stderr, "[export] error %s\n", msg.toUtf8().constData() );
    return false;
}

/**  Hermite smoothstep from 0 to 1.
 *
 * @param x  The input; clamped to [0, 1] first. (in)
 *
 * @return
 *   3x^2 - 2x^3 of the clamped input.
 **/
static double smooth01( double x )
{
    x = x < 0.0 ? 0.0 : ( x > 1.0 ? 1.0 : x );
    return x * x * ( 3.0 - 2.0 * x );
}

bool VideoExport::parseSize( const QString &wxh )
{
    const QString s = wxh.trimmed().toLower();
    int           w = 0, h = 0;
    if ( s == "fullhd" || s == "fhd" || s == "1080p" )
    {
        w = 1920;
        h = 1080;
    }
    else if ( s == "4k" || s == "uhd" || s == "2160p" )
    {
        w = 3840;
        h = 2160;
    }
    else
    {
        const QStringList p = s.split( 'x' );
        if ( p.size() == 2 )
        {
            w = p[0].toInt();
            h = p[1].toInt();
        }
    }
    // Even on both axes: 4:2:0 chroma covers 2x2 blocks.
    if ( w < 16 || h < 16 || w > 8192 || h > 8192 || ( w & 1 ) || ( h & 1 ) )
        return false;
    M_Settings.width = w;
    M_Settings.height = h;
    return true;
}

bool VideoExport::parseOptions( const QString &opts )
{
    bool ok = true;
    for ( QString o : opts.split( ',', Qt::SkipEmptyParts ) )
    {
        o = o.trimmed().toLower();
        if ( o == "h264" || o == "hevc" || o == "av1" || o == "auto" )
            M_Settings.codec = o;
        else if ( o == "h265" )
            M_Settings.codec = "hevc";
        else if ( o == "blur" || o == "noblur" )
            M_Settings.motionBlur = ( o == "blur" );
        else if ( o == "fade" || o == "nofade" )
            M_Settings.fade = ( o == "fade" );
        else if ( o == "title" || o == "notitle" )
            M_Settings.title = ( o == "title" );
        else if ( o == "q=max" || o == "q=high" || o == "q=compact" )
            M_Settings.qualityStep = ( o == "q=max" ) ? -3 : ( o == "q=compact" ? 4 : 0 );
        else if ( o.startsWith( "cq=" ) )
        {
            bool      num = false;
            const int q = o.mid( 3 ).toInt( &num );
            if ( num && q >= 1 && q <= 63 )
                M_Settings.quality = q;
            else
                ok = false;
        }
        else
        {
            fprintf( stderr, "[export] unknown option '%s'\n", o.toUtf8().constData() );
            ok = false;
        }
    }
    return ok;
}

void VideoExport::watchStdin()
{
    // The Win32 handle, not the C runtime's stdin: a thread blocked in fgets() holds the stream lock, and the
    // runtime takes every stream lock again at exit -- the process would hang on its way out.
#ifdef _WIN32
    HANDLE in = GetStdHandle( STD_INPUT_HANDLE );
    if ( in == nullptr || in == INVALID_HANDLE_VALUE )
        return; // started without a stdin (Explorer, a shortcut): nothing to listen to, and no cancel
    std::thread( [in]
    {
        std::string seen;
        char        buf[256];
        DWORD       n = 0;
        while ( ReadFile( in, buf, sizeof( buf ), &n, nullptr ) && n > 0 )
        {
            seen.append( buf, n );
            if ( seen.find( "quit" ) != std::string::npos || seen.find( "cancel" ) != std::string::npos )
            {
                s_cancel.store( true );
                return;
            }
            if ( seen.size() > 64 )
                seen.erase( 0, seen.size() - 8 );
        }
        // EOF or an error: the other end went away, which is no request to stop
    } ).detach();
#endif
}

QString VideoExport::tool( const QString &name )
{
    const QString ff = qEnvironmentVariable( "KALEIDO_FFMPEG" );
    if ( ff.isEmpty() || !QFileInfo( ff ).isFile() )
        return name;
    if ( name == "ffmpeg" )
        return ff;
    const QFileInfo fi( ff );
    const QString   sibling = fi.absoluteDir().filePath( fi.suffix().isEmpty() ? name : name + "." + fi.suffix() );
    return QFileInfo( sibling ).isFile() ? sibling : name;
}

VideoExport::VideoExport()
{
}

VideoExport::~VideoExport()
{
    if ( m_writer.joinable() )
    {
        {
            std::lock_guard<std::mutex> lk( m_mx );
            m_quit = true;
        }
        m_cv.notify_all();
        m_writer.join();
    }
    delete m_analyzer;
    m_pcmFile.close();
    if ( !m_pcmPath.isEmpty() )
        QFile::remove( m_pcmPath );
}

/**  Does this encoder work here, at the video's size and rate?
 *
 * @param args  The encoder's codec arguments ("-c:v ..."). (in)
 * @param hw    Hardware encoder: fed NV12 as it is; software gets yuv420p. (in)
 *
 * @return
 *   true if ffmpeg encoded a 0.2 s test clip without error.
 *
 * At the REAL size and rate, not a token 256x256: a hardware encoder can refuse 4K at 120 fps (level limits, an
 * old GPU) while taking anything small, and finding that out on the first real frame would cost the whole run.
 **/
static bool probeEncoder( const QStringList &args, bool hw )
{
    const VideoExport::Settings &s = VideoExport::M_Settings;
    QProcess                     p;
    QStringList                  a;
    a << "-hide_banner" << "-loglevel" << "error" << "-nostdin"
      << "-f" << "lavfi" << "-i"
      << QString( "color=c=black:s=%1x%2:r=%3:d=0.2" ).arg( s.width ).arg( s.height ).arg( s.fps )
      << "-pix_fmt" << ( hw ? "nv12" : "yuv420p" ) << args << "-f" << "null" << "-";
    p.start( VideoExport::tool( "ffmpeg" ), a );
    if ( !p.waitForFinished( 20000 ) )
    {
        p.kill();
        p.waitForFinished( 2000 );
        return false;
    }
    return p.exitStatus() == QProcess::NormalExit && p.exitCode() == 0;
}

bool VideoExport::pickEncoder()
{
    QString fam = M_Settings.codec;
    if ( fam == "auto" )
        fam = ( static_cast<long long>( M_Settings.width ) * M_Settings.height > 1920LL * 1080LL ) ? "hevc" : "h264";
    const int q = M_Settings.quality, step = M_Settings.qualityStep;
    auto      qs = [q, step]( int def )
    { return QString::number( q > 0 ? q : std::max( 1, def + step ) ); };

    // NVENC's ceiling. Its constant quality (-rc vbr -cq) is only constant below the VBV maximum, and without one
    // NVENC caps at what it picks for the level -- at 1080p60 41.5 Mbit/s for h264, 16.6 for hevc: on the busy
    // psychedelic presets h264 at cq 19 and cq 21 came out the same size, hevc at cq 14, 16 and 18 too, all far
    // below their quality. The ceiling in turn sets the LEVEL the encoder writes: 400 Mbit/s made FullHD level
    // 6.1, which televisions and phones refuse; 60 Mbit/s at 1080p60 gives level 4.2, which everything plays and
    // the hardest scenes stay under. Scaled with the pixel rate to the 3/4 power.
    const double  rate = static_cast<double>( M_Settings.width ) * M_Settings.height * M_Settings.fps;
    const int max_mbit = std::max( 8, static_cast<int>( 60.0 * std::pow( rate / ( 1920.0 * 1080.0 * 60.0 ), 0.75 ) ) );
    const QString maxrate = QString( "%1M" ).arg( max_mbit ), bufsize = QString( "%1M" ).arg( 2 * max_mbit );

    // Per family: discrete-GPU encoder, AMD, Intel, software. The rate control is constant quality everywhere
    // (an export is a master, not a stream) and NOT interchangeable between vendors: NVENC -rc vbr -cq under the
    // ceiling above, AMF -rc cqp, QSV -global_quality, the CPU encoders -crf. Preset p4 without spatial AQ:
    // measured at 1080p on export material, AQ cost 30 % of the encoder's speed (228 against 321 fps) for an
    // SSIM gain of 0.002, and p5 another 12 % for 0.001 -- the encoder is what limits an export's speed.
    struct Cand
    {
        const char *name; ///< ffmpeg encoder name.
        QStringList args; ///< Its codec arguments.
        bool        hw;   ///< Hardware: takes NV12 as it is.
    };
    QList<Cand> list;
    if ( fam == "hevc" )
        list = {
            { "hevc_nvenc",
              { "-c:v", "hevc_nvenc", "-preset", "p4", "-tune", "hq", "-rc", "vbr", "-cq", qs( 23 ), "-b:v", "0",
                "-maxrate", maxrate, "-bufsize", bufsize, "-tag:v", "hvc1" },
              true },
            { "hevc_amf",
              { "-c:v", "hevc_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", qs( 20 ), "-qp_p", qs( 22 ), "-tag:v",
                "hvc1" },
              true },
            { "hevc_qsv",
              { "-c:v", "hevc_qsv", "-preset", "medium", "-global_quality", qs( 21 ), "-tag:v", "hvc1" },
              true },
            { "libx265", { "-c:v", "libx265", "-preset", "fast", "-crf", qs( 21 ), "-tag:v", "hvc1" }, false },
        };
    else if ( fam == "av1" )
        list = {
            { "av1_nvenc",
              { "-c:v", "av1_nvenc", "-preset", "p4", "-tune", "hq", "-rc", "vbr", "-cq", qs( 30 ), "-b:v", "0",
                "-maxrate", maxrate, "-bufsize", bufsize },
              true },
            { "av1_amf",
              { "-c:v", "av1_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", qs( 24 ), "-qp_p", qs( 26 ) },
              true },
            { "av1_qsv", { "-c:v", "av1_qsv", "-preset", "medium", "-global_quality", qs( 26 ) }, true },
            { "libsvtav1", { "-c:v", "libsvtav1", "-preset", "8", "-crf", qs( 30 ) }, false },
        };
    else
        list = {
            { "h264_nvenc",
              { "-c:v", "h264_nvenc", "-preset", "p4", "-tune", "hq", "-rc", "vbr", "-cq", qs( 21 ), "-b:v", "0",
                "-maxrate", maxrate, "-bufsize", bufsize, "-profile:v", "high" },
              true },
            { "h264_amf",
              { "-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", qs( 18 ), "-qp_p", qs( 20 ) },
              true },
            { "h264_qsv", { "-c:v", "h264_qsv", "-preset", "medium", "-global_quality", qs( 19 ) }, true },
            { "libx264", { "-c:v", "libx264", "-preset", "medium", "-crf", qs( 18 ) }, false },
        };

    // Not used: split-frame encoding (-split_encode_mode, ffmpeg 7.1+), which hands the strips of one HEVC frame to
    // several NVENC units. Fed from a separate process it took 4K from 115 to 149 frames per second; inside the
    // export, with the same GPU rendering the next frames, it made the whole run SLOWER (1.8x instead of 2.1x real
    // time at 4K60, measured twice each on an RTX 5090).

    for ( const Cand &c : list )
    {
        if ( probeEncoder( c.args, c.hw ) )
        {
            m_encoder = c.name;
            m_encArgs = c.args;
            m_hwEncoder = c.hw;
            return true;
        }
        fprintf( stderr, "[export] encoder %s not usable here\n", c.name );
    }
    // The wanted family is not available at all: h264, rather than no video.
    if ( fam != "h264" )
    {
        fprintf( stderr, "[export] no %s encoder works here - falling back to h264\n", fam.toUtf8().constData() );
        M_Settings.codec = "h264";
        return pickEncoder();
    }
    return false;
}

void VideoExport::readTags( const QString &path )
{
    QProcess p;
    p.start( tool( "ffprobe" ), { "-v", "error", "-show_entries", "format_tags=title,artist:stream_tags=title,artist",
                                  "-of", "default=noprint_wrappers=1", path } );
    if ( p.waitForFinished( 10000 ) )
        for ( const QString &line : QString::fromUtf8( p.readAllStandardOutput() ).split( '\n' ) )
        {
            const QString l = line.trimmed();
            if ( m_title.isEmpty() && l.startsWith( "TAG:title=", Qt::CaseInsensitive ) )
                m_title = l.mid( 10 ).trimmed();
            else if ( m_artist.isEmpty() && l.startsWith( "TAG:artist=", Qt::CaseInsensitive ) )
                m_artist = l.mid( 11 ).trimmed();
        }
    if ( m_title.isEmpty() )
        m_title = QFileInfo( path ).completeBaseName();
}

bool VideoExport::prepare()
{
    Settings       &s = M_Settings;
    const QFileInfo in( s.audio );
    if ( !in.isFile() )
        return fail( "audio file not found: " + s.audio );
    s.audio = in.absoluteFilePath();
    if ( s.fps < 1 || s.fps > 240 )
        return fail( QString( "frame rate %1 is out of range (1..240)" ).arg( s.fps ) );
    // Named like the audio file, beside it -- unless that IS the audio file (the sound of an mp4).
    if ( s.output.isEmpty() )
    {
        s.output = in.absolutePath() + "/" + in.completeBaseName() + ".mp4";
        if ( QFileInfo( s.output ).absoluteFilePath().compare( in.absoluteFilePath(), Qt::CaseInsensitive ) == 0 )
            s.output = in.absolutePath() + "/" + in.completeBaseName() + " (Kaleidoscope).mp4";
    }
    s.output = QFileInfo( s.output ).absoluteFilePath();
    if ( QFileInfo( s.output ) == in )
        return fail( "the output file would overwrite the audio file" );
    if ( !QDir().mkpath( QFileInfo( s.output ).absolutePath() ) )
        return fail( "cannot create the output folder " + QFileInfo( s.output ).absolutePath() );

    {
        QProcess p;
        p.start( tool( "ffmpeg" ), { "-hide_banner", "-version" } );
        if ( !p.waitForStarted( 10000 ) )
            return fail( "ffmpeg not found - it has to be on the PATH (for example: winget install Gyan.FFmpeg)" );
        p.waitForFinished( 10000 );
    }

    // The whole track once as 48 kHz stereo PCM: the analyzer's block is then exactly 10 ms, and every format
    // ffmpeg reads is one format here. On disk, not in memory -- an hour is 690 MB.
    fprintf( stderr, "[export] phase decode\n" );
    // What a crashed export left behind (the name carries a process id; a day is long enough for any export).
    for ( const QFileInfo &old : QDir::temp().entryInfoList( { "kaleido_export_*.pcm" }, QDir::Files ) )
        if ( old.lastModified().secsTo( QDateTime::currentDateTime() ) > 24 * 3600 )
            QFile::remove( old.absoluteFilePath() );
    m_pcmPath = QDir::temp().filePath( QString( "kaleido_export_%1.pcm" ).arg( QCoreApplication::applicationPid() ) );
    {
        // The first audio stream: the one the mux takes too (ffmpegArgs(), 1:a:0).
        QProcess p;
        p.setProcessChannelMode( QProcess::MergedChannels );
        p.start( tool( "ffmpeg" ), { "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", s.audio, "-map",
                                     "0:a:0", "-ac", "2", "-ar", QString::number( SampleRate ), "-f", "s16le",
                                     "-acodec", "pcm_s16le", m_pcmPath } );
        if ( !p.waitForStarted( 10000 ) || !p.waitForFinished( -1 ) || p.exitStatus() != QProcess::NormalExit
             || p.exitCode() != 0 )
            return fail( "could not decode the audio: " + QString::fromLocal8Bit( p.readAll() ).simplified() );
    }
    m_pcmFrames = QFileInfo( m_pcmPath ).size() / 4;
    m_duration = static_cast<double>( m_pcmFrames ) / SampleRate;
    if ( m_pcmFrames < BlockFrames )
        return fail( "the audio file holds no audio" );

    if ( s.title )
        readTags( s.audio );

    fprintf( stderr, "[export] phase encoder\n" );
    if ( !pickEncoder() )
        return fail( "no working video encoder (not even libx264) - is this a complete ffmpeg build?" );

    // Frames and sub-frames. Motion blur runs the engine at the live rate and sums the sub-frames of each output
    // frame; without it the engine steps at the output rate and liveFrames() keeps it moving like the show.
    m_frames = static_cast<long long>( std::ceil( m_duration * s.fps - 1e-6 ) );
    m_sub = s.motionBlur ? std::max( 1, static_cast<int>( std::lround( RenderPipeline::LiveRefHz / s.fps ) ) ) : 1;
    m_subTotal = m_frames * m_sub;
    RenderPipeline::M_FrameStep = static_cast<float>( 1.0 / ( static_cast<double>( s.fps ) * m_sub ) );

    fprintf( stderr, "[export] audio %.2f s, %lld frames at %d fps, %dx%d, %d sub-frame(s), encoder %s\n", m_duration,
             m_frames, s.fps, s.width, s.height, m_sub, m_encoder.toUtf8().constData() );
    fprintf( stderr, "[export] output %s\n", s.output.toUtf8().constData() );
    fprintf( stderr, "[export] ffmpeg %s: %s\n", tool( "ffmpeg" ).toUtf8().constData(),
             m_encArgs.join( ' ' ).toUtf8().constData() );
    return true;
}

bool VideoExport::beginGL()
{
    const int w = width(), h = height();

    // The render target: the pipeline's "default framebuffer" for the export. Float, so the frame keeps its
    // precision until the dithered 8-bit conversion; a depth buffer as the widget's own framebuffer has one.
    glGenTextures( 1, &m_colorTex );
    glBindTexture( GL_TEXTURE_2D, m_colorTex );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, w, h, 0, GL_RGBA, GL_FLOAT, nullptr );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    glGenRenderbuffers( 1, &m_depthRb );
    glBindRenderbuffer( GL_RENDERBUFFER, m_depthRb );
    glRenderbufferStorage( GL_RENDERBUFFER, GL_DEPTH_COMPONENT24, w, h );
    glBindRenderbuffer( GL_RENDERBUFFER, 0 );
    glGenFramebuffers( 1, &m_fbo );
    glBindFramebuffer( GL_FRAMEBUFFER, m_fbo );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_colorTex, 0 );
    glFramebufferRenderbuffer( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, m_depthRb );
    bool ok = glCheckFramebufferStatus( GL_FRAMEBUFFER ) == GL_FRAMEBUFFER_COMPLETE;

    // The motion-blur sum: float, an 8-bit sum would clip at the second sub-frame.
    if ( ok && m_sub > 1 )
    {
        glGenTextures( 1, &m_accumTex );
        glBindTexture( GL_TEXTURE_2D, m_accumTex );
        glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, w, h, 0, GL_RGBA, GL_FLOAT, nullptr );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
        glGenFramebuffers( 1, &m_accumFbo );
        glBindFramebuffer( GL_FRAMEBUFFER, m_accumFbo );
        glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_accumTex, 0 );
        ok = glCheckFramebufferStatus( GL_FRAMEBUFFER ) == GL_FRAMEBUFFER_COMPLETE;
    }

    // The NV12 image: luma rows, then the interleaved chroma rows (Engine/ExportYuv.frag).
    if ( ok )
    {
        glGenTextures( 1, &m_yuvTex );
        glBindTexture( GL_TEXTURE_2D, m_yuvTex );
        glTexImage2D( GL_TEXTURE_2D, 0, GL_R8, w, h + h / 2, 0, GL_RED, GL_UNSIGNED_BYTE, nullptr );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
        glGenFramebuffers( 1, &m_yuvFbo );
        glBindFramebuffer( GL_FRAMEBUFFER, m_yuvFbo );
        glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_yuvTex, 0 );
        ok = glCheckFramebufferStatus( GL_FRAMEBUFFER ) == GL_FRAMEBUFFER_COMPLETE;
    }
    glBindTexture( GL_TEXTURE_2D, 0 );
    glBindFramebuffer( GL_FRAMEBUFFER, 0 );
    if ( !ok )
        return fail( QString( "could not create the %1x%2 render targets (out of video memory?)" ).arg( w ).arg( h ) );

    m_yuvProg = setShaders( "..\\standard.vert", "..\\Engine\\ExportYuv.frag" );
    m_yuvSrcUni = glGetUniformLocation( m_yuvProg, "src" );
    m_yuvScaleUni = glGetUniformLocation( m_yuvProg, "scale" );
    m_yuvGainUni = glGetUniformLocation( m_yuvProg, "gain" );
    m_yuvSizeUni = glGetUniformLocation( m_yuvProg, "size" );
    m_yuvSeedUni = glGetUniformLocation( m_yuvProg, "seed" );
    m_yuvDitherUni = glGetUniformLocation( m_yuvProg, "dither" );
    if ( m_sub > 1 )
    {
        m_accumProg = setShaders( "..\\standard.vert", "..\\Engine\\Accumulate.frag" );
        m_accumTexUni = glGetUniformLocation( m_accumProg, "tex" );
        m_accumScaleUni = glGetUniformLocation( m_accumProg, "scale" );
    }
    if ( m_yuvProg == 0 || ( m_sub > 1 && m_accumProg == 0 ) )
        return fail( "the export shaders did not build" );

    m_frameBytes = static_cast<size_t>( w ) * static_cast<size_t>( h ) * 3 / 2;
    glGenBuffers( ReadbackDepth, m_pbo );
    for ( GLuint pbo : m_pbo )
    {
        glBindBuffer( GL_PIXEL_PACK_BUFFER, pbo );
        glBufferData( GL_PIXEL_PACK_BUFFER, static_cast<GLsizeiptr>( m_frameBytes ), nullptr, GL_STREAM_READ );
    }
    glBindBuffer( GL_PIXEL_PACK_BUFFER, 0 );

    m_pcmFile.setFileName( m_pcmPath );
    if ( !m_pcmFile.open( QIODevice::ReadOnly ) )
        return fail( "cannot read the decoded audio " + m_pcmPath );
    m_pcmBlock.assign( BlockFrames * 2, 0 );
    m_floatBlock.assign( BlockFrames * 2, 0.f );
    m_analyzer = new AudioAnalyzer();

    m_writer = std::thread( &VideoExport::writer, this );
    m_clock.start();
    fprintf( stderr, "[export] phase render\n" );
    return true;
}

double VideoExport::engineSeconds( long long k ) const
{
    return static_cast<double>( k ) / ( static_cast<double>( M_Settings.fps ) * m_sub );
}

AudioFeatures VideoExport::featuresFor( long long k )
{
    // Up to this moment plus the analysis lag. With motion blur, a frame shows the mean of its sub-frames, whose
    // centre lies half an exposure after the first: the audio is shifted back by that much, so what the frame
    // shows is centred on the frame's own time.
    const double    centre = ( m_sub - 1 ) / ( 2.0 * m_sub * M_Settings.fps );
    const double    up_to = engineSeconds( k ) - centre + LookaheadSec;
    const long long all = ( m_pcmFrames + BlockFrames - 1 ) / BlockFrames;
    const long long want = std::min( all, static_cast<long long>( std::floor( up_to * SampleRate / BlockFrames ) ) );
    while ( m_blocksFed < want )
    {
        const qint64 got = m_pcmFile.read( reinterpret_cast<char *>( m_pcmBlock.data() ),
                                           static_cast<qint64>( BlockFrames ) * 4 );
        const int    n = got > 0 ? static_cast<int>( got / 4 ) : 0;
        if ( n <= 0 )
        {
            m_blocksFed = all; // the file ended early: nothing more to feed
            break;
        }
        for ( int i = 0; i < n * 2; ++i )
            m_floatBlock[i] = static_cast<float>( m_pcmBlock[i] ) / 32768.f;
        m_analyzer->feedBlock( m_floatBlock.data(), n, 2, SampleRate );
        ++m_blocksFed;
    }
    // A score-cue file (-k) is timed by the audio, as in a -x batch render.
    ScoreCueFile::instance().setClock( static_cast<double>( m_blocksFed ) * BlockFrames / SampleRate );
    return m_analyzer->getFeatures();
}

bool VideoExport::titleDue( long long k )
{
    if ( !M_Settings.title || m_titleShown || engineSeconds( k ) < TitleAtSec )
        return false;
    m_titleShown = true;
    return true;
}

float VideoExport::fadeGain( long long frame ) const
{
    if ( !M_Settings.fade )
        return 1.f;
    const double fps = M_Settings.fps;
    const double t = static_cast<double>( frame ) / fps;
    const double left = m_duration - static_cast<double>( frame + 1 ) / fps; // still to come after this frame
    double       g = smooth01( t / FadeInSec );
    g = std::min( g, smooth01( left / FadeOutSec ) );
    return static_cast<float>( g );
}

void VideoExport::subFrameDone( long long k )
{
    if ( m_nsLastDone >= 0 )
        m_nsEngine += m_clock.nsecsElapsed() - m_nsLastDone;
    const long long frame = k / m_sub;
    const int       j = static_cast<int>( k % m_sub );
    const int       w = width(), h = height();
    if ( m_sub > 1 )
    {
        // Into the sum: the first sub-frame of a frame replaces it, the others add on.
        glBindFramebuffer( GL_FRAMEBUFFER, m_accumFbo );
        glViewport( 0, 0, w, h );
        glDisable( GL_DEPTH_TEST );
        glDisable( GL_SCISSOR_TEST );
        glDisable( GL_CULL_FACE );
        if ( j == 0 )
            glDisable( GL_BLEND );
        else
        {
            glEnable( GL_BLEND );
            glBlendFunc( GL_ONE, GL_ONE );
        }
        glUseProgram( m_accumProg );
        glActiveTexture( GL_TEXTURE0 );
        glBindTexture( GL_TEXTURE_2D, m_colorTex );
        glUniform1i( m_accumTexUni, 0 );
        glUniform1f( m_accumScaleUni, 1.f );
        glBindVertexArray( fullscreenVAO() );
        glDrawArrays( GL_TRIANGLES, 0, 3 );
        glBindVertexArray( 0 );
        glDisable( GL_BLEND );
    }
    if ( j == m_sub - 1 )
        emitFrame( frame );
    m_next = k + 1;
    reportProgress();
    m_nsLastDone = m_clock.nsecsElapsed();
}

void VideoExport::emitFrame( long long frame )
{
    const int w = width(), h = height();

    // 1. Colour conversion into the NV12 image.
    glBindFramebuffer( GL_FRAMEBUFFER, m_yuvFbo );
    glViewport( 0, 0, w, h + h / 2 );
    glDisable( GL_BLEND );
    glDisable( GL_DEPTH_TEST );
    glDisable( GL_SCISSOR_TEST );
    glDisable( GL_CULL_FACE );
    glUseProgram( m_yuvProg );
    glActiveTexture( GL_TEXTURE0 );
    glBindTexture( GL_TEXTURE_2D, m_sub > 1 ? m_accumTex : m_colorTex );
    glUniform1i( m_yuvSrcUni, 0 );
    glUniform1f( m_yuvScaleUni, 1.f / static_cast<float>( m_sub ) );
    glUniform1f( m_yuvGainUni, fadeGain( frame ) );
    glUniform2i( m_yuvSizeUni, w, h );
    glUniform1ui( m_yuvSeedUni, static_cast<GLuint>( frame ) );
    // KALEIDO_EXPORT_DITHER=<0..1> scales the dither (a measuring aid: what it costs the encoder in size).
    static const float Dither = qEnvironmentVariableIsSet( "KALEIDO_EXPORT_DITHER" )
                                    ? qBound( 0.f, qEnvironmentVariable( "KALEIDO_EXPORT_DITHER" ).toFloat(), 1.f )
                                    : 1.f;
    glUniform1f( m_yuvDitherUni, Dither );
    glBindVertexArray( fullscreenVAO() );
    glDrawArrays( GL_TRIANGLES, 0, 3 );
    glBindVertexArray( 0 );

    // 2. Its readback into this frame's slot -- asynchronous: the transfer runs while the next frames render.
    const int slot = static_cast<int>( frame % ReadbackDepth );
    if ( m_pboFrame[slot] >= 0 )
        collect( slot ); // a full ring (never in order, a safety net)
    glPixelStorei( GL_PACK_ALIGNMENT, 1 );
    glBindBuffer( GL_PIXEL_PACK_BUFFER, m_pbo[slot] );
    glReadPixels( 0, 0, w, h + h / 2, GL_RED, GL_UNSIGNED_BYTE, nullptr );
    glBindBuffer( GL_PIXEL_PACK_BUFFER, 0 );
    glPixelStorei( GL_PACK_ALIGNMENT, 4 );
    m_pboFrame[slot] = frame;
    glBindFramebuffer( GL_FRAMEBUFFER, 0 );

    // 3. The oldest frame in flight (issued ReadbackDepth-1 frames ago) has had time to arrive: take it.
    const int oldest = static_cast<int>( ( frame + 1 ) % ReadbackDepth );
    if ( m_pboFrame[oldest] >= 0 )
        collect( oldest );
    m_lastShown = frame;
}

void VideoExport::collect( int slot )
{
    std::vector<uchar> buf;
    const qint64       t0 = m_clock.nsecsElapsed();
    {
        // Room in the queue first: the encoder sets the pace, a frame is never dropped.
        std::unique_lock<std::mutex> lk( m_mx );
        m_cv.wait( lk, [this]
        { return m_queue.size() < static_cast<size_t>( QueueDepth ) || m_writeError.load(); } );
        if ( !m_pool.empty() )
        {
            buf = std::move( m_pool.back() );
            m_pool.pop_back();
        }
    }
    const qint64 t1 = m_clock.nsecsElapsed();
    m_nsEncWait += t1 - t0;
    buf.resize( m_frameBytes );
    glBindBuffer( GL_PIXEL_PACK_BUFFER, m_pbo[slot] );
    const void *src = glMapBuffer( GL_PIXEL_PACK_BUFFER, GL_READ_ONLY );
    m_nsGpuWait += m_clock.nsecsElapsed() - t1;
    if ( src )
        memcpy( buf.data(), src, m_frameBytes );
    else
    {
        // A failed map: a black frame keeps the timeline, a missing one would shift the rest of the video.
        const size_t luma = static_cast<size_t>( width() ) * static_cast<size_t>( height() );
        memset( buf.data(), 16, luma );
        memset( buf.data() + luma, 128, m_frameBytes - luma );
    }
    glUnmapBuffer( GL_PIXEL_PACK_BUFFER );
    glBindBuffer( GL_PIXEL_PACK_BUFFER, 0 );
    m_pboFrame[slot] = -1;
    {
        std::lock_guard<std::mutex> lk( m_mx );
        m_queue.push_back( std::move( buf ) );
    }
    m_cv.notify_all();
    ++m_queued;
}

QStringList VideoExport::ffmpegArgs() const
{
    const Settings &s = M_Settings;
    const QString   size = QString( "%1x%2" ).arg( s.width ).arg( s.height );
    QStringList     a;
    // Input 0: the frames, raw NV12 in BT.709 limited range -- said so, so ffmpeg inserts no conversion.
    // Input 1: the original audio file, re-encoded as AAC (what every player and site takes in an mp4).
    a << "-hide_banner" << "-loglevel" << "error" << "-nostats" << "-y"
      << "-f" << "rawvideo" << "-pix_fmt" << "nv12" << "-video_size" << size << "-framerate"
      << QString::number( s.fps ) << "-color_range" << "tv" << "-colorspace" << "bt709" << "-color_primaries"
      << "bt709" << "-color_trc" << "bt709" << "-i" << "pipe:0" << "-i" << s.audio << "-map" << "0:v:0" << "-map"
      << "1:a:0?" << m_encArgs;
    if ( !m_hwEncoder )
        a << "-pix_fmt" << "yuv420p";
    a << "-g" << QString::number( 2 * s.fps ) // a keyframe every two seconds: seekable, and what video sites expect
      << "-color_range" << "tv" << "-colorspace" << "bt709" << "-color_primaries" << "bt709" << "-color_trc" << "bt709"
      << "-c:a" << "aac" << "-b:a" << "320k" << "-shortest" << "-movflags" << "+faststart" << s.output;
    return a;
}

void VideoExport::writer()
{
    // The process lives on this thread from start to end: QProcess is not thread-safe.
    QProcess ff;
    ff.setProcessChannelMode( QProcess::SeparateChannels );
    ff.start( tool( "ffmpeg" ), ffmpegArgs() );
    if ( !ff.waitForStarted( 15000 ) )
    {
        m_ffErrors = "ffmpeg did not start";
        m_writeError.store( true );
    }
    else
        m_ffStarted.store( true );
    m_cv.notify_all();

    for ( ;; )
    {
        std::vector<uchar> frame;
        {
            std::unique_lock<std::mutex> lk( m_mx );
            m_cv.wait( lk, [this]
            { return m_quit || !m_queue.empty(); } );
            if ( m_queue.empty() )
                break; // quit, and everything written
            frame = std::move( m_queue.front() );
            m_queue.pop_front();
        }
        m_cv.notify_all();

        // After an error the frames are still taken (and dropped), so the render loop never waits on a dead pipe.
        if ( !m_writeError.load() )
        {
            QElapsedTimer wt;
            wt.start();
            ff.write( reinterpret_cast<const char *>( frame.data() ), static_cast<qint64>( frame.size() ) );
            // Flush this frame completely before the next: the pipe is the backpressure, and QProcess's own buffer
            // would otherwise grow by a frame for every frame the encoder falls behind.
            while ( ff.bytesToWrite() > 0 )
                if ( !ff.waitForBytesWritten( 30000 ) && ff.state() != QProcess::Running )
                {
                    m_writeError.store( true );
                    break;
                }
            if ( ff.state() != QProcess::Running )
                m_writeError.store( true );
            if ( !m_writeError.load() )
                ++m_written;
            m_nsWrite += wt.nsecsElapsed();
            const QByteArray err = ff.readAllStandardError();
            if ( !err.isEmpty() )
                m_ffErrors += QString::fromLocal8Bit( err );
            if ( m_writeError.load() )
                m_cv.notify_all();
        }
        std::lock_guard<std::mutex> lk( m_mx );
        m_pool.push_back( std::move( frame ) );
    }

    if ( m_ffStarted.load() )
    {
        ff.closeWriteChannel(); // EOF: ffmpeg finishes the file (and moves the index to the front, +faststart)
        if ( !ff.waitForFinished( -1 ) )
            ff.kill();
        m_ffErrors += QString::fromLocal8Bit( ff.readAllStandardError() );
        m_ffExit = ff.exitStatus() == QProcess::NormalExit ? ff.exitCode() : -1;
    }
}

int VideoExport::endGL( bool cancelled )
{
    // The frames still in the readback ring, oldest first.
    for ( long long f = m_lastShown - ReadbackDepth + 1; f <= m_lastShown; ++f )
    {
        if ( f < 0 )
            continue;
        const int slot = static_cast<int>( f % ReadbackDepth );
        if ( m_pboFrame[slot] == f )
            collect( slot );
    }
    fprintf( stderr, "[export] phase finish\n" );
    if ( m_writer.joinable() )
    {
        {
            std::lock_guard<std::mutex> lk( m_mx );
            m_quit = true;
        }
        m_cv.notify_all();
        m_writer.join();
    }

    glDeleteBuffers( ReadbackDepth, m_pbo );
    for ( GLuint *fb : { &m_fbo, &m_accumFbo, &m_yuvFbo } )
        if ( *fb )
            glDeleteFramebuffers( 1, fb );
    for ( GLuint *tex : { &m_colorTex, &m_accumTex, &m_yuvTex } )
        if ( *tex )
            glDeleteTextures( 1, tex );
    if ( m_depthRb )
        glDeleteRenderbuffers( 1, &m_depthRb );
    m_fbo = m_accumFbo = m_yuvFbo = m_colorTex = m_accumTex = m_yuvTex = m_depthRb = 0;
    m_lastShown = -1;

    const double  secs = m_clock.elapsed() / 1000.0;
    const double  video = static_cast<double>( m_written.load() ) / M_Settings.fps;
    const QString out = M_Settings.output;
    if ( m_writeError.load() || m_ffExit != 0 )
    {
        fail( QString( "the encoder failed (ffmpeg exit %1): %2" )
                  .arg( m_ffExit )
                  .arg( m_ffErrors.simplified().isEmpty() ? QString( "no message" ) : m_ffErrors.simplified() ) );
        return 2;
    }
    if ( cancelled )
    {
        fprintf( stderr, "[export] cancelled %s\n", out.toUtf8().constData() );
        return 1;
    }
    const double per = m_frames > 0 ? 1e-6 / static_cast<double>( m_frames ) : 0.0; // ns sum -> ms per frame
    fprintf( stderr, "[export] per frame: engine %.2f ms (%d sub-frame%s), GPU wait %.2f ms, encoder wait %.2f ms; "
                     "the writer was busy %.2f ms\n",
             static_cast<double>( m_nsEngine ) * per, m_sub, m_sub > 1 ? "s" : "",
             static_cast<double>( m_nsGpuWait ) * per, static_cast<double>( m_nsEncWait ) * per,
             static_cast<double>( m_nsWrite.load() ) * per );
    fprintf( stderr, "[export] done %lld frames, %.1f s of video in %.1f s (%.2fx real time) -> %s\n",
             m_written.load(), video, secs, secs > 0.0 ? video / secs : 0.0, out.toUtf8().constData() );
    return 0;
}

void VideoExport::reportProgress()
{
    const qint64 now = m_clock.elapsed();
    if ( now - m_lastReport < 500 && !finished() )
        return;
    m_lastReport = now;
    const double secs = now / 1000.0;
    const double video = static_cast<double>( m_queued ) / M_Settings.fps;
    fprintf( stderr, "[export] progress %lld %lld %.1f %.2f\n", m_queued, m_frames, secs,
             secs > 0.0 ? video / secs : 0.0 );
}

QString VideoExport::statusLine() const
{
    const double secs = m_clock.isValid() ? m_clock.elapsed() / 1000.0 : 0.0;
    const double video = static_cast<double>( m_queued ) / M_Settings.fps;
    const double speed = secs > 0.0 ? video / secs : 0.0;
    const int    pct = m_frames > 0 ? static_cast<int>( 100 * m_queued / m_frames ) : 0;
    QString      line = QString( "Video-Export  %1 %" ).arg( pct );
    if ( speed > 0.0 )
    {
        const int left = static_cast<int>( ( m_duration - video ) / speed + 0.5 );
        line += QString( "   ·   %1x   ·   ~%2:%3" )
                    .arg( speed, 0, 'f', 1 )
                    .arg( left / 60 )
                    .arg( left % 60, 2, 10, QChar( '0' ) );
    }
    return line;
}

void VideoExport::drawPreview( GLuint fbo, int w, int h ) const
{
    glBindFramebuffer( GL_FRAMEBUFFER, fbo );
    glViewport( 0, 0, w, h );
    glDisable( GL_SCISSOR_TEST );
    glClearColor( 0.f, 0.f, 0.f, 1.f );
    glClear( GL_COLOR_BUFFER_BIT );
    if ( m_lastShown < 0 || !m_fbo || w < 2 || h < 2 )
        return;
    // Letterboxed into the window: the video's aspect, centred.
    const double va = static_cast<double>( width() ) / height(), wa = static_cast<double>( w ) / h;
    int          dw = w, dh = h;
    if ( wa > va )
        dw = static_cast<int>( h * va + 0.5 );
    else
        dh = static_cast<int>( w / va + 0.5 );
    const int x0 = ( w - dw ) / 2, y0 = ( h - dh ) / 2;
    glBindFramebuffer( GL_READ_FRAMEBUFFER, m_fbo );
    glBindFramebuffer( GL_DRAW_FRAMEBUFFER, fbo );
    glBlitFramebuffer( 0, 0, width(), height(), x0, y0, x0 + dw, y0 + dh, GL_COLOR_BUFFER_BIT, GL_LINEAR );
    glBindFramebuffer( GL_FRAMEBUFFER, fbo );
}
