//---------------------------------------------------------------------------
//                              VideoExport
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Offline video export (CLI -e): a preset rendered to an audio file at a fixed size and frame rate, as fast as the
 *  GPU allows, with the audio muxed in -- every frame exactly one frame period of the show, however long it took.
 *
 *  @author René Weller
 */

#ifndef VIDEOEXPORT_H
#define VIDEOEXPORT_H

#include <atomic>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>
#include <vector>

#include <QtCore/QElapsedTimer>
#include <QtCore/QFile>
#include <QtCore/QString>
#include <QtCore/QStringList>
#include <QtGui/qopengl.h>

#include "AudioFeatures.h"

class AudioAnalyzer;

/** @class VideoExport
 *
 * Renders the show for an audio file into an mp4, frame by frame on a virtual clock.
 *
 * A live recording (Recorder) captures what the screen shows, at whatever rate the machine manages, and turns
 * measured durations into a constant-rate file; a slow frame becomes a held frame. The export turns that around:
 * the ENGINE runs on frame time (EngineClock, RenderPipeline::M_FrameStep), so frame n shows the show at exactly
 * n / fps seconds and no frame is ever dropped or held -- a shader compile or a model upload costs render time, not
 * picture. Rendering runs as fast as the GPU and the encoder allow, which for FullHD is several times real time.
 *
 * The pieces, in frame order:
 *  - the audio is decoded once by ffmpeg into 48 kHz stereo PCM (any format ffmpeg reads) and fed through the
 *    live AudioAnalyzer block by block, exactly up to each frame's time (plus the analysis lag, LookaheadSec);
 *  - the pipeline renders into an RGBA16F target of the video size (renderFbo());
 *  - with motion blur the engine runs at RenderPipeline::LiveRefHz and the sub-frames of each output frame are
 *    summed (a 360-degree shutter); without it, the engine runs at the output rate and scales its per-frame decays
 *    and simulation steps instead (RenderPipeline::frameStepScale());
 *  - Engine/ExportYuv.frag converts the frame on the GPU into NV12 (BT.709, limited range, dithered), which the
 *    hardware encoders take as it is: 1.5 bytes per pixel cross the bus instead of 4;
 *  - a ring of pixel-pack buffers reads it back a few frames late, so the GPU is never waited for;
 *  - a writer thread pipes the frames into ffmpeg, which encodes them (NVENC/AMF/QSV, else x264) and muxes the
 *    original audio as AAC. A full pipe blocks the render loop rather than dropping a frame.
 *
 * Threading: prepare() runs before the window exists; everything else on the GL thread with the context current,
 * except the writer, which owns the ffmpeg process.
 **/
class VideoExport
{
public:
    /** What to render (CLI -e, -g, -p, -d, -j). */
    struct Settings
    {
        QString audio;              ///< Input audio file: anything ffmpeg decodes (wav, mp3, ogg, flac, m4a, ...).
        QString output;             ///< Output .mp4; empty = "<audio folder>/<audio name>_kaleidoscope.mp4".
        int     width = 1920;       ///< Video width in pixels (even).
        int     height = 1080;      ///< Video height in pixels (even).
        int     fps = 60;           ///< Frame rate (24, 30, 60 and 120 are offered; 1..240 accepted).
        QString codec = "auto";     ///< "h264", "hevc", "av1", or "auto": h264 up to FullHD, hevc above.
        int     quality = 0;        ///< Constant-quality level for the encoder (cq/crf/qp); 0 = the codec's default.
        int     qualityStep = 0;    ///< Relative to the default level: -3 "max" (bigger file), 0 "high", +4 "compact".
        bool    motionBlur = false; ///< Engine at LiveRefHz, sub-frames of each output frame averaged.
        bool    fade = true;        ///< Fade in from black over the first second and out over the last two.
        bool    title = false;      ///< Weave the file's title/artist in at the start (the live title reveal).
    };
    static Settings M_Settings; ///< Filled by the command line; a non-empty audio path means export mode.

    /**  Whether this run is a video export.
     *
     * @return
     *   true if the command line named an audio file to export (-e).
     **/
    static bool requested() { return !M_Settings.audio.isEmpty(); }
    /**  Parses the video size of -g.
     *
     * @param wxh  "1920x1080", "3840x2160", or the shorthands "fullhd", "1080p", "4k", "2160p". (in)
     *
     * @return
     *   false (settings unchanged) if the text is no valid even size of at least 16x16.
     **/
    static bool parseSize( const QString &wxh );
    /**  Parses the export options of -j: a comma-separated list.
     *
     * @param opts  Any of h264, hevc, av1, auto, blur, noblur, fade, nofade, title, notitle, q=max|high|compact,
     *              cq=N. (in)
     *
     * @return
     *   false if an entry is not one of these (the valid ones are still applied).
     **/
    static bool parseOptions( const QString &opts );

    /** Asks a running export to stop: the frames so far are finished into a playable file. Any thread. */
    static void requestCancel() { s_cancel.store( true ); }
    /**  Whether a stop was asked for (Esc, the window's close button, or "quit" on stdin).
     *
     * @return
     *   true once requestCancel() was called.
     **/
    static bool cancelRequested() { return s_cancel.load(); }
    /** Listens on stdin for "quit" (the export tool's cancel button); a missing or closed stdin is no cancel. */
    static void watchStdin();
    /**  The ffmpeg (or ffprobe) to run: the one named by KALEIDO_FFMPEG, else whichever the PATH finds.
     *
     * @param name  "ffmpeg" or "ffprobe". (in)
     *
     * @return
     *   An executable path, or the bare name for a PATH lookup.
     *
     * The export tool sets KALEIDO_FFMPEG to the ffmpeg chosen there (by default the newest one it finds -- a
     * machine can have several, and the PATH need not list the best). ffprobe is taken from the same folder.
     **/
    static QString tool( const QString &name );

    VideoExport();
    /** Ends a still-running export as cancelled is NOT done here -- endGL() needs the GL context; only the writer
     * thread and the temporary audio are cleaned up.
     **/
    ~VideoExport();

    /**  Everything that needs no GL: checks the settings, finds ffmpeg, decodes the audio to PCM, reads the tags,
     * picks the encoder and works out the frame counts.
     *
     * @return
     *   false on any error, which has then been reported as an "[export] error" line.
     **/
    bool prepare();
    /**  GL setup (context current): render and conversion targets, programs, readback buffers; starts the encoder.
     *
     * @return
     *   false on any error (reported).
     **/
    bool beginGL();

    /**  Whether every sub-frame has been rendered.
     *
     * @return
     *   true when the last frame is through.
     **/
    bool finished() const { return m_next >= m_subTotal; }
    /**  Whether the encoder failed (ffmpeg died or refused the frames); the render loop then ends the export.
     *
     * @return
     *   true after a writer error.
     **/
    bool failed() const { return m_writeError.load(); }
    /**  The next sub-frame to render.
     *
     * @return
     *   Its index, 0 .. subFrames()*frames()-1.
     **/
    long long nextSubFrame() const { return m_next; }
    /**  Show time of a sub-frame: what EngineClock and the pipeline's frame step add up to.
     *
     * @param k  Sub-frame index. (in)
     *
     * @return
     *   k / (fps * subFrames()) seconds.
     **/
    double engineSeconds( long long k ) const;
    /**  Feeds the analyzer up to the audio time of sub-frame @p k and returns its features.
     *
     * @param k  Sub-frame index, rising by one per call. (in)
     *
     * @return
     *   The analyzer's features with the track analysed up to that moment.
     **/
    AudioFeatures featuresFor( long long k );
    /**  Whether the title reveal is due with sub-frame @p k (once, TitleAtSec into the video, if asked for).
     *
     * @param k  Sub-frame index. (in)
     *
     * @return
     *   true exactly once.
     **/
    bool titleDue( long long k );
    /**  The title for the reveal: the file's title tag, else its name.
     *
     * @return
     *   The text.
     **/
    const QString &title() const { return m_title; }
    /**  The artist for the reveal: the file's artist tag, or empty.
     *
     * @return
     *   The text.
     **/
    const QString &artist() const { return m_artist; }
    /**  The framebuffer the pipeline renders the frame into (its "default FBO").
     *
     * @return
     *   The RGBA16F render target of the video size.
     **/
    GLuint renderFbo() const { return m_fbo; }
    /**  Takes the sub-frame just rendered: adds it to the motion-blur sum, and with the last sub-frame of an output
     * frame converts, reads back and queues the frame. May block while the encoder catches up.
     *
     * @param k  Index of the sub-frame just rendered. (in)
     **/
    void subFrameDone( long long k );
    /**  Ends the export: drains the readbacks, closes the encoder input and waits for ffmpeg to finish the file.
     *
     * @param cancelled  true if the export was stopped early (the file then holds the frames so far). (in)
     *
     * @return
     *   The process exit code: 0 done, 1 cancelled, 2 error.
     **/
    int endGL( bool cancelled );

    /**  Draws the latest frame into a framebuffer, letterboxed (the preview window).
     *
     * @param fbo  Target framebuffer. (in)
     * @param w    Its width in pixels. (in)
     * @param h    Its height in pixels. (in)
     **/
    void drawPreview( GLuint fbo, int w, int h ) const;
    /**  One line of progress for the preview window.
     *
     * @return
     *   "Video-Export 42 %  ·  3.1x Echtzeit  ·  noch 1:20" or the like.
     **/
    QString statusLine() const;

    /**  Video width.
     *
     * @return
     *   Pixels.
     **/
    int width() const { return M_Settings.width; }
    /**  Video height.
     *
     * @return
     *   Pixels.
     **/
    int height() const { return M_Settings.height; }

    static constexpr int    SampleRate = 48000;   ///< The analyzer's rate: one 480-frame block is exactly 10 ms.
    static constexpr int    BlockFrames = 480;    ///< Frames per analyzer block, as in live capture.
    static constexpr double LookaheadSec = 0.025; ///< Analysis lag the feed runs ahead by: half the 2048-sample
                                                  ///< Hann window (21 ms) plus half a block.
    static constexpr double FadeInSec = 1.0;      ///< Fade-in length (Settings::fade).
    static constexpr double FadeOutSec = 2.0;     ///< Fade-out length (Settings::fade).
    static constexpr double TitleAtSec = 1.0;     ///< When the title reveal starts (Settings::title).
    static constexpr int    ReadbackDepth = 3;    ///< Pixel-pack buffers in flight: frame n is read back at n+2.
    static constexpr int    QueueDepth = 4;       ///< Frames waiting for the encoder before the render loop blocks.

private:
    /**  Chooses the encoder for the wanted codec: the first candidate that actually encodes a test clip at the video
     * size and rate.
     *
     * @return
     *   false if none works (not even the software encoder).
     **/
    bool pickEncoder();
    /**  The ffmpeg arguments for the export: raw NV12 on stdin, the original audio, the encoder, colour tags.
     *
     * @return
     *   The argument list.
     **/
    QStringList ffmpegArgs() const;
    /** Writer thread body: starts ffmpeg, pipes queued frames into it in order, finishes it on quit. */
    void writer();
    /**  Converts the finished frame to NV12, starts its readback and collects the readback of an older one.
     *
     * @param frame  Output frame index. (in)
     **/
    void emitFrame( long long frame );
    /**  Maps a pixel-pack buffer whose transfer has been issued, copies the frame out and queues it for the writer.
     *
     * @param slot  Ring slot. (in)
     **/
    void collect( int slot );
    /**  Fade gain of an output frame.
     *
     * @param frame  Output frame index. (in)
     *
     * @return
     *   0 (black) .. 1 (full picture).
     **/
    float fadeGain( long long frame ) const;
    /** Prints the progress line ("[export] progress ...") at most twice a second. */
    void reportProgress();
    /**  Reads a file's title and artist tags with ffprobe.
     *
     * @param path  The audio file. (in)
     **/
    void readTags( const QString &path );

    // ---- timeline ----
    double    m_duration = 0.0;     ///< Audio length in seconds.
    long long m_frames = 0;         ///< Output frames: ceil(duration * fps).
    int       m_sub = 1;            ///< Sub-frames per output frame (motion blur), 1 without.
    long long m_subTotal = 0;       ///< m_frames * m_sub.
    long long m_next = 0;           ///< Next sub-frame to render.
    bool      m_titleShown = false; ///< The title reveal has been started.
    QString   m_title;              ///< Title for the reveal.
    QString   m_artist;             ///< Artist for the reveal.

    // ---- audio ----
    QString            m_pcmPath;            ///< Temporary 48 kHz s16 stereo PCM of the whole track.
    QFile              m_pcmFile;            ///< m_pcmPath, open while feeding.
    long long          m_pcmFrames = 0;      ///< Sample frames in the PCM file.
    long long          m_blocksFed = 0;      ///< Analyzer blocks fed so far.
    AudioAnalyzer     *m_analyzer = nullptr; ///< Never-started analyzer driven by featuresFor().
    std::vector<short> m_pcmBlock;           ///< One block as read from the file.
    std::vector<float> m_floatBlock;         ///< The same block as floats for the analyzer.

    // ---- encoder ----
    QString     m_encoder;           ///< Chosen ffmpeg encoder ("h264_nvenc", "libx264", ...).
    QStringList m_encArgs;           ///< Its codec arguments ("-c:v ..." plus rate control).
    bool        m_hwEncoder = false; ///< Hardware encoder: takes NV12 as it is.

    // ---- GL ----
    GLuint    m_fbo = 0; ///< Render target framebuffer (the pipeline's default FBO during the export).
    GLuint    m_colorTex = 0;                             ///< Its RGBA16F colour texture.
    GLuint    m_depthRb = 0;                              ///< Its depth-stencil renderbuffer.
    GLuint    m_accumFbo = 0;                             ///< Motion-blur sum framebuffer (m_sub > 1 only).
    GLuint    m_accumTex = 0; ///< Its RGBA16F texture: the sum of the output frame's sub-frames so far.
    GLuint    m_yuvFbo = 0;                               ///< NV12 conversion target framebuffer.
    GLuint    m_yuvTex = 0;    ///< Its R8 texture, width x 1.5*height (luma rows, then interleaved chroma rows).
    GLuint    m_accumProg = 0; ///< Engine/Accumulate.frag: scaled copy, additive for the sum.
    GLint     m_accumTexUni = -1;                         ///< "tex" in m_accumProg.
    GLint     m_accumScaleUni = -1;                       ///< "scale" in m_accumProg.
    GLuint    m_yuvProg = 0;                              ///< Engine/ExportYuv.frag.
    GLint     m_yuvSrcUni = -1;                           ///< "src" in m_yuvProg.
    GLint     m_yuvScaleUni = -1;                         ///< "scale" in m_yuvProg.
    GLint     m_yuvGainUni = -1;                          ///< "gain" in m_yuvProg.
    GLint     m_yuvSizeUni = -1;                          ///< "size" in m_yuvProg.
    GLint     m_yuvSeedUni = -1;                          ///< "seed" in m_yuvProg.
    GLint     m_yuvDitherUni = -1;                        ///< "dither" in m_yuvProg.
    GLuint    m_pbo[ReadbackDepth] = {};                  ///< Pixel-pack buffer ring.
    long long m_pboFrame[ReadbackDepth] = { -1, -1, -1 }; ///< Output frame waiting in each slot; -1 = free.
    long long m_lastShown = -1; ///< Last output frame finished (the preview shows m_colorTex).
    size_t    m_frameBytes = 0;                           ///< Bytes of one NV12 frame: width * height * 3 / 2.

    // ---- writer ----
    std::thread                     m_writer;              ///< Owns the ffmpeg process.
    std::mutex                      m_mx;                  ///< Guards the queue, the pool and m_quit.
    std::condition_variable         m_cv;                  ///< Queue changed (a frame in, a frame out, or quit).
    std::deque<std::vector<uchar>>  m_queue;               ///< Frames waiting for the pipe, in order.
    std::vector<std::vector<uchar>> m_pool;                ///< Spent frame buffers for reuse.
    bool                            m_quit = false;        ///< No more frames: finish the file.
    std::atomic<bool>               m_writeError{ false }; ///< ffmpeg failed; the render loop stops.
    std::atomic<bool>               m_ffStarted{ false };  ///< ffmpeg is running (set by the writer).
    int                             m_ffExit = -1;         ///< ffmpeg's exit code once it ended.
    QString                         m_ffErrors;            ///< What ffmpeg wrote to stderr (reported on failure).
    std::atomic<long long>          m_written{ 0 };        ///< Frames handed to ffmpeg.

    // ---- progress ----
    QElapsedTimer m_clock; ///< Wall time since beginGL().
    // Where the time goes, reported with the "done" line: the slowest of the three sets the speed.
    qint64              m_nsLastDone = -1;    ///< m_clock time (ns) the previous subFrameDone() returned.
    qint64 m_nsEngine = 0; ///< Summed time between two subFrameDone() calls: the engine's frame (CPU side).
    qint64              m_nsGpuWait = 0;      ///< Summed time in glMapBuffer: the GPU had not finished the frame yet.
    qint64              m_nsEncWait = 0;      ///< Summed time waiting for room in the queue: the encoder was behind.
    std::atomic<qint64> m_nsWrite{ 0 };       ///< Summed time the writer spent pushing frames into ffmpeg.
    qint64              m_lastReport = -1000; ///< m_clock time of the last progress line.
    long long           m_queued = 0;         ///< Output frames queued for the encoder.

    static std::atomic<bool> s_cancel; ///< Stop requested (requestCancel()).
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    VideoExport( const VideoExport & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    VideoExport &operator=( const VideoExport & ) = delete;
};

#endif
