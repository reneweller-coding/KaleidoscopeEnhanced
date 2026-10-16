/**
 * @file AudioAnalyzer.cpp
 * @brief Implementation of AudioAnalyzer: WASAPI loopback capture, the per-block DSP pipeline (processBlock), and
 * offline/replay/recording helpers.
 */
#include "AudioAnalyzer.h"
#include "CueReceiver.h"

// Windows / WASAPI headers
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <combaseapi.h>
#elif defined( KALEIDO_HAVE_PULSE )
// Linux (and a macOS with PulseAudio installed): the loopback counterpart.
// KALEIDO_HAVE_PULSE is set by the CMake build when libpulse-simple is found.
#include <pulse/simple.h>
#include <pulse/error.h>
#endif

#include <cmath>
#include <algorithm>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <chrono>

#include <QtCore/QElapsedTimer>

/**
 * @brief One-pole IIR low-pass coefficient for given cutoff and sample rate.
 *
 *   a = exp(-2*pi*fc/fs)
 *   y[n] = a*y[n-1] + (1-a)*x[n]
 * Larger 'a' → slower response (lower cutoff).
 */
float AudioAnalyzer::coeff( float cutoffHz, int sampleRate )
{
    return std::exp( -2.f * 3.14159265f * cutoffHz / static_cast<float>( sampleRate ) );
}

/**
 * @brief In-place Radix-2 Cooley-Tukey Decimation-In-Time FFT.
 *
 * After the call, the magnitude of the k-th frequency bin is:
 *   |X[k]| = sqrt(re[k]^2 + im[k]^2),  frequency = k * sampleRate / N.
 *
 * For real-valued input the spectrum is conjugate-symmetric:
 *   X[N-k] = conj(X[k]),  so only bins 0..N/2 carry unique information.
 *
 * Both arrays are overwritten in place: `re` enters as the windowed audio
 * samples and leaves as the real part of X, `im` enters all-zero (for
 * real-valued audio) and leaves as the imaginary part. The parameters are
 * documented on the declaration in AudioAnalyzer.h.
 */
/*static*/ void AudioAnalyzer::radix2fft( float *re, float *im, int N )
{
    // ---- Bit-reversal permutation ----
    // Reorders the input array so the butterfly passes work correctly.
    for ( int i = 1, j = 0; i < N; ++i )
    {
        int bit = N >> 1;
        for ( ; j & bit; bit >>= 1 )
            j ^= bit;
        j ^= bit;
        if ( i < j )
        {
            std::swap( re[i], re[j] );
            std::swap( im[i], im[j] );
        }
    }

    // ---- Butterfly stages ----
    // len doubles each iteration: 2 → 4 → 8 → … → N.
    // Each stage computes the DFT of sub-sequences of length len using
    // the DFT results of sub-sequences of length len/2 (Cooley-Tukey).
    for ( int len = 2; len <= N; len <<= 1 )
    {
        const float ang = -2.f * 3.14159265358979f / static_cast<float>( len ); // negative: forward FFT
        const float w_re = std::cos( ang );                                     // twiddle factor increment (real)
        const float w_im = std::sin( ang );                                     // twiddle factor increment (imag)

        for ( int i = 0; i < N; i += len )
        {
            float cur_re = 1.f, cur_im = 0.f; // current twiddle = W^0 = 1
            for ( int j = 0; j < len / 2; ++j )
            {
                // Butterfly:  (u, v) → (u + W^j·v,  u - W^j·v)
                const float u_re = re[i + j];
                const float u_im = im[i + j];
                // W^j · x[i+j+len/2]  (complex multiply)
                const float v_re = re[i + j + len / 2] * cur_re
                                   - im[i + j + len / 2] * cur_im;
                const float v_im = re[i + j + len / 2] * cur_im
                                   + im[i + j + len / 2] * cur_re;
                re[i + j] = u_re + v_re;
                im[i + j] = u_im + v_im;
                re[i + j + len / 2] = u_re - v_re;
                im[i + j + len / 2] = u_im - v_im;
                // Advance twiddle factor:  cur *= W  (complex multiply)
                const float next_re = cur_re * w_re - cur_im * w_im;
                cur_im = cur_re * w_im + cur_im * w_re;
                cur_re = next_re;
            }
        }
    }
}

/**
 * @brief Constructs the analyzer: zeroes all DSP state and precomputes the FFT window.
 */
AudioAnalyzer::AudioAnalyzer( QObject *parent )
    : QThread( parent )
{
    m_tapClock.start(); // tap-tempo clock (read from both threads, set once)
    std::memset( m_bassHistory, 0, sizeof( m_bassHistory ) );
    std::memset( m_envHistory, 0, sizeof( m_envHistory ) );
    std::memset( m_ringBuf, 0, sizeof( m_ringBuf ) );
    std::memset( m_fftRe, 0, sizeof( m_fftRe ) );
    std::memset( m_fftIm, 0, sizeof( m_fftIm ) );
    std::memset( m_prevMags, 0, sizeof( m_prevMags ) );
    std::memset( m_smoothedChroma, 0, sizeof( m_smoothedChroma ) );

    // Precompute Hann window for FFT:  w[i] = 0.5 · (1 - cos(2π·i/(N-1)))
    // Reduces spectral leakage from block edges.
    for ( int i = 0; i < FFTSize; ++i )
        m_fftWin[i] = 0.5f
                      * ( 1.f
                          - std::cos( 2.f * 3.14159265358979f * static_cast<float>( i )
                                      / static_cast<float>( FFTSize - 1 ) ) );
}

/** @brief Stops capture and waits for the thread to finish. */
AudioAnalyzer::~AudioAnalyzer()
{
    stop();
    wait();
}

/** @brief Requests the capture/analysis loop in run() to exit (does not block; see the destructor's wait()). */
void AudioAnalyzer::stop()
{
    m_running = false;
}

/** @brief Returns a thread-safe copy of the latest published AudioFeatures. */
AudioFeatures AudioAnalyzer::getFeatures() const
{
    QMutexLocker lk( &m_mutex );
    return m_features;
}

// ---------------------------------------------------------------------------
// Device enumeration + accessors (runtime audio-source selection)
// ---------------------------------------------------------------------------
/**
 * @brief (Re)populates m_devices with every active render (output/loopback) and capture (input) endpoint.
 * @param pEnum WASAPI device enumerator to query.
 */
void AudioAnalyzer::enumerateDevices( IMMDeviceEnumerator *pEnum )
{
#ifndef _WIN32
    // Endpoint enumeration is a WASAPI concept and this is only ever called
    // from the WASAPI capture loop, which does not exist here. The device
    // list stays empty, which is what the web remote's picker already shows
    // when no endpoints are found.
    (void)pEnum;
    return;
#else
    QList<AudioDevice> devs;
    auto               add_flow = [&]( EDataFlow flow, bool isCap )
    {
        IMMDeviceCollection *coll = nullptr;
        if ( FAILED( pEnum->EnumAudioEndpoints( flow, DEVICE_STATE_ACTIVE, &coll ) ) || !coll )
            return;
        UINT n = 0;
        coll->GetCount( &n );
        for ( UINT i = 0; i < n; ++i )
        {
            IMMDevice *d = nullptr;
            if ( FAILED( coll->Item( i, &d ) ) || !d )
                continue;
            LPWSTR  id = nullptr;
            QString qid, qname;
            if ( SUCCEEDED( d->GetId( &id ) ) && id )
            {
                qid = QString::fromWCharArray( id );
                CoTaskMemFree( id );
            }
            IPropertyStore *ps = nullptr;
            if ( SUCCEEDED( d->OpenPropertyStore( STGM_READ, &ps ) ) && ps )
            {
                PROPVARIANT v;
                PropVariantInit( &v );
                if ( SUCCEEDED( ps->GetValue( PKEY_Device_FriendlyName, &v ) ) && v.vt == VT_LPWSTR )
                    qname = QString::fromWCharArray( v.pwszVal );
                PropVariantClear( &v );
                ps->Release();
            }
            if ( !qid.isEmpty() )
            {
                AudioDevice ad;
                ad.id = qid;
                ad.name = qname.isEmpty() ? qid : qname;
                ad.isCapture = isCap;
                devs.append( ad );
            }
            d->Release();
        }
        coll->Release();
    };
    add_flow( eRender, false ); // outputs (loopback)
    add_flow( eCapture, true ); // inputs (mic / line-in)

    QMutexLocker lk( &m_mutex );
    m_devices = devs;
#endif
}

/** @brief Returns a thread-safe copy of the current selectable-device list. */
QList<AudioDevice> AudioAnalyzer::devices() const
{
    QMutexLocker lk( &m_mutex );
    return m_devices;
}

/** @brief Returns the friendly name of the source currently being captured. */
QString AudioAnalyzer::currentDeviceName() const
{
    QMutexLocker lk( &m_mutex );
    return m_curDeviceName;
}

// ---------------------------------------------------------------------------
// Audio recording: capture the loopback (the music) to a 16-bit stereo WAV.
// open / write / close all happen on the capture (run) thread.
// ---------------------------------------------------------------------------
/** @brief Writes one little-endian 32-bit value to a raw file (WAV header/chunk-size helper). */
static void wr32( FILE *f, unsigned int v )
{
    fwrite( &v, 4, 1, f );
}
/** @brief Writes one little-endian 16-bit value to a raw file (WAV header helper). */
static void wr16( FILE *f, unsigned short v )
{
    fwrite( &v, 2, 1, f );
}

/**
 * @brief Opens m_wavFile at the requested path and writes a placeholder 44-byte PCM16 stereo WAV header.
 *
 * The sample rate goes into the header as given; the RIFF/data chunk sizes
 * are written as 0 here and fixed up on close by recClose(). Parameters are
 * documented on the declaration in AudioAnalyzer.h.
 */
void AudioAnalyzer::recOpen( int sampleRate )
{
    QString p;
    {
        QMutexLocker lk( &m_mutex );
        p = m_recWavPath;
    }
    FILE *f = fopen( p.toLocal8Bit().constData(), "wb" );
    if ( !f )
        return;
    // 44-byte WAV header, 16-bit stereo, placeholder sizes (fixed up on close).
    fwrite( "RIFF", 1, 4, f );
    wr32( f, 0 );
    fwrite( "WAVE", 1, 4, f );
    fwrite( "fmt ", 1, 4, f );
    wr32( f, 16 );
    wr16( f, 1 );
    wr16( f, 2 );
    wr32( f, static_cast<unsigned>( sampleRate ) );
    wr32( f, static_cast<unsigned>( sampleRate * 4 ) );
    wr16( f, 4 );
    wr16( f, 16 );
    fwrite( "data", 1, 4, f );
    wr32( f, 0 );
    m_wavFile = f;
    m_wavDataBytes = 0;
    m_wavOpen = true;
}

/**
 * @brief Converts and appends captured samples to the currently open recording as interleaved 16-bit stereo PCM.
 *
 * Takes the first two interleaved channels of `src` (channel 2+ ignored,
 * mono mirrored to both outputs), scales by 32767 with clipping and writes
 * them as little-endian shorts. Parameters are documented on the declaration
 * in AudioAnalyzer.h.
 */
void AudioAnalyzer::recWrite( const float *src, int numFrames, int numChannels )
{
    FILE *f = static_cast<FILE *>( m_wavFile );
    if ( !f )
        return;
    for ( int i = 0; i < numFrames; ++i )
    {
        float l = src[i * numChannels + 0];
        float r = ( numChannels > 1 ) ? src[i * numChannels + 1] : l;
        short sl = static_cast<short>( std::max( -32768.f, std::min( 32767.f, l * 32767.f ) ) );
        short sr = static_cast<short>( std::max( -32768.f, std::min( 32767.f, r * 32767.f ) ) );
        wr16( f, static_cast<unsigned short>( sl ) );
        wr16( f, static_cast<unsigned short>( sr ) );
    }
    m_wavDataBytes += static_cast<unsigned>( numFrames * 4 );
}

/** @brief Finalises the WAV header's chunk sizes and closes the recording file. */
void AudioAnalyzer::recClose()
{
    FILE *f = static_cast<FILE *>( m_wavFile );
    if ( !f )
        return;
    fseek( f, 4, SEEK_SET );
    wr32( f, 36 + m_wavDataBytes ); // RIFF chunk size
    fseek( f, 40, SEEK_SET );
    wr32( f, m_wavDataBytes ); // data chunk size
    fclose( f );
    m_wavFile = nullptr;
    m_wavOpen = false;
}

/**
 * @brief Requests that the capture thread start recording to a WAV file (opened lazily on the next captured block).
 *
 * Stores the destination path under m_mutex and raises m_recReq; the
 * capture loop opens the 16-bit stereo WAV itself. Parameters are documented
 * on the declaration in AudioAnalyzer.h.
 */
void AudioAnalyzer::startRecording( const QString &wavPath )
{
    {
        QMutexLocker lk( &m_mutex );
        m_recWavPath = wavPath;
    }
    m_recReq = true;
}

/** @brief Requests recording to stop and blocks (up to ~500 ms) until the capture thread has flushed and closed the
 * file. */
void AudioAnalyzer::stopRecording()
{
    m_recReq = false;
    // Wait briefly for the capture thread to flush + close the file.
    for ( int i = 0; i < 100 && m_wavOpen; ++i )
        QThread::msleep( 5 );
}

/**
 * @brief Requests that the capture loop switch to a different audio source.
 *
 * An empty id reverts to the default loopback device; otherwise the endpoint
 * id and its input/output kind are stored under m_mutex and
 * m_deviceChangeReq asks the capture loop to re-initialise. Parameters are
 * documented on the declaration in AudioAnalyzer.h.
 */
void AudioAnalyzer::requestDevice( const QString &id, bool isCapture )
{
    {
        QMutexLocker lk( &m_mutex );
        if ( id.isEmpty() )
        {
            m_useReqDevice = false;
            m_reqDeviceId.clear();
        }
        else
        {
            m_useReqDevice = true;
            m_reqDeviceId = id;
            m_reqIsCapture = isCapture;
        }
    }
    m_deviceChangeReq = true; // ask the capture loop to re-initialise now
}

/**
 * @brief TAP TEMPO (key 't', GUI thread): registers one tap; the median inter-tap interval overrides tempo + beat phase
 * for ~45 s.
 *
 * A pause > 2.5 s starts a fresh series. The override is applied at publish
 * time in processBlock() (see the "Manual TAP tempo" block near the end).
 */
void AudioAnalyzer::tapTempo()
{
    qint64 now = m_tapClock.elapsed();
    if ( m_tapN > 0 && now - m_tapTimes[( m_tapN - 1 ) & 7] > 2500 )
        m_tapN = 0; // series broken
    m_tapTimes[m_tapN & 7] = now;
    ++m_tapN;

    int cnt = std::min( m_tapN, 8 );
    if ( cnt < 2 )
    {
        fprintf( stderr, "TAP: weiter tippen...\n" );
        return;
    }

    // Median of the (up to 7) intervals between the last taps.
    float iv[7];
    int   n = 0;
    for ( int i = cnt - 1; i >= 1; --i )
    {
        qint64 a = m_tapTimes[( m_tapN - i - 1 ) & 7];
        qint64 b = m_tapTimes[( m_tapN - i ) & 7];
        iv[n++] = static_cast<float>( b - a );
    }
    std::sort( iv, iv + n );
    float med = iv[n / 2];
    med = std::max( 250.f, std::min( med, 1500.f ) ); // 40..240 BPM
    m_tapIntervalMs = static_cast<int>( med + 0.5f );
    m_tapAnchorMs = now;
    m_tapUntilMs = now + 45000;
    fprintf( stderr, "TAP tempo: %.1f BPM (%d taps)\n", 60000.f / med, cnt );
}

/** @brief Definition of the static offline-WAV path flag (see AudioAnalyzer::M_OfflineWav in the header). */
QString AudioAnalyzer::M_OfflineWav;

/**
 * @brief Offline analysis (CLI -w): feeds a 16-bit PCM WAV through processBlock() in 480-frame chunks, paced to real
 * time.
 *
 * Block-for-block identical to live capture (all smoothing constants are
 * per-block), but deterministic and immune to whatever the system happens to
 * be playing.  Used to test/calibrate the classifiers. Takes the path of a
 * 16-bit PCM WAV file (parameter documented on the declaration in
 * AudioAnalyzer.h).
 */
void AudioAnalyzer::analyzeWavOffline( const QString &path )
{
    FILE *f = fopen( path.toLocal8Bit().constData(), "rb" );
    if ( !f )
    {
        fprintf( stderr, "OFFLINE: cannot open %s\n", qPrintable( path ) );
        return;
    }

    // Minimal RIFF parse: find fmt + data chunks (16-bit PCM only).
    char           id[5] = { 0 };
    unsigned int   sz = 0;
    unsigned short fmt_tag = 0, channels = 0, bits = 0;
    unsigned int   sample_rate = 48000;
    long           data_pos = 0;
    unsigned int   data_len = 0;
    fseek( f, 12, SEEK_SET ); // skip RIFF....WAVE
    while ( fread( id, 1, 4, f ) == 4 && fread( &sz, 4, 1, f ) == 1 )
    {
        if ( strncmp( id, "fmt ", 4 ) == 0 )
        {
            unsigned char buf[16];
            fread( buf, 1, 16, f );
            fmt_tag = *reinterpret_cast<unsigned short *>( buf + 0 );
            channels = *reinterpret_cast<unsigned short *>( buf + 2 );
            sample_rate = *reinterpret_cast<unsigned int *>( buf + 4 );
            bits = *reinterpret_cast<unsigned short *>( buf + 14 );
            if ( sz > 16 )
                fseek( f, sz - 16, SEEK_CUR );
        }
        else if ( strncmp( id, "data", 4 ) == 0 )
        {
            data_pos = ftell( f );
            data_len = sz;
            break;
        }
        else
            fseek( f, sz, SEEK_CUR );
    }
    if ( fmt_tag != 1 || bits != 16 || channels < 1 || data_pos == 0 )
    {
        fprintf( stderr, "OFFLINE: unsupported WAV (PCM16 required)\n" );
        fclose( f );
        return;
    }

    fprintf( stderr, "OFFLINE: %s  %u Hz, %u ch, %.1f s\n", qPrintable( path ),
             sample_rate, channels, data_len / static_cast<float>( sample_rate * channels * 2 ) );

    const int chunk = 480; // = one live capture block
    short    *pcm = new short[chunk * channels];
    float    *conv = new float[chunk * channels];
    fseek( f, data_pos, SEEK_SET );
    unsigned int  remain = data_len / ( channels * 2 );
    QElapsedTimer clock;
    clock.start();
    qint64 fed = 0; // frames delivered so far
    while ( remain > 0 && m_running )
    {
        int n = ( remain < static_cast<unsigned int>( chunk ) ) ? static_cast<int>( remain ) : chunk;
        if ( fread( pcm, 2 * channels, n, f ) != static_cast<size_t>( n ) )
            break;
        for ( int i = 0; i < n * channels; ++i )
            conv[i] = pcm[i] / 32768.f;
        processBlock( conv, n, ( channels > 2 ) ? 2 : channels, sample_rate );

        // Recording (-x batch render): mirror the live loop's WAV writer so
        // the mux gets the music.
        if ( m_recReq && !m_wavFile )
            recOpen( sample_rate );
        if ( m_wavFile )
            recWrite( conv, n, channels );

        remain -= n;

        // Pace to the wall clock: the render loop (and an -x recording) runs
        // in real time, so the features must arrive at capture speed too.
        // KALEIDO_OFFLINE_FAST=1 drops the pacing. Everything in processBlock
        // is per-BLOCK (EMAs, ring buffers, counters), so the analysis output
        // is identical either way -- only the visuals, which depend on wall
        // clock, are meaningless. That makes sweeping a few dozen tracks for
        // classifier tuning minutes instead of hours.
        static const bool Fast = qEnvironmentVariableIsSet( "KALEIDO_OFFLINE_FAST" );
        fed += n;
        // A cue file (-k) is timed by the WAV itself: this is how far it has played.
        ScoreCueFile::instance().setClock( static_cast<double>( fed ) / sample_rate );
        if ( !Fast )
        {
            qint64 ahead = fed * 1000 / sample_rate - clock.elapsed();
            if ( ahead > 2 )
                msleep( static_cast<unsigned long>( ahead ) );
        }
    }
    if ( m_wavFile )
        recClose(); // finalise a still-open WAV
    delete[] pcm;
    delete[] conv;
    fclose( f );
    fprintf( stderr, "OFFLINE: done\n" );
}

/**
 * @brief Instant replay: writes the last `seconds` of the rolling PCM ring (see ReplaySeconds) as a 16-bit stereo WAV.
 * @param path Destination WAV path.
 * @param seconds How many trailing seconds to dump (clamped to what has actually been captured).
 * @return false if nothing has been captured yet or the file could not be opened, true on success.
 */
bool AudioAnalyzer::dumpReplayWav( const QString &path, float seconds )
{
    QMutexLocker rl( &m_replayMx );
    if ( m_replayCount == 0 || m_replayRing.empty() )
        return false;

    size_t       want_frames = static_cast<size_t>( seconds * m_replayRate );
    size_t       have_frames = std::min( want_frames, m_replayCount );
    const size_t cap = m_replayRing.size();

    FILE *f = fopen( path.toLocal8Bit().constData(), "wb" );
    if ( !f )
        return false;

    unsigned int   data_len = static_cast<unsigned int>( have_frames * 2 * 2 );
    unsigned int   riff_len = 36 + data_len;
    unsigned short fmt = 1, ch = 2, bits = 16, align = 4;
    unsigned int   rate = static_cast<unsigned int>( m_replayRate ), bytes_sec = rate * align;
    fwrite( "RIFF", 1, 4, f );
    fwrite( &riff_len, 4, 1, f );
    fwrite( "WAVEfmt ", 1, 8, f );
    unsigned int fmt_len = 16;
    fwrite( &fmt_len, 4, 1, f );
    fwrite( &fmt, 2, 1, f );
    fwrite( &ch, 2, 1, f );
    fwrite( &rate, 4, 1, f );
    fwrite( &bytes_sec, 4, 1, f );
    fwrite( &align, 2, 1, f );
    fwrite( &bits, 2, 1, f );
    fwrite( "data", 1, 4, f );
    fwrite( &data_len, 4, 1, f );

    // Oldest wanted sample sits have_frames*2 behind the write cursor.
    size_t start = ( m_replayPos + cap - have_frames * 2 ) % cap;
    for ( size_t i = 0; i < have_frames * 2; ++i )
        fwrite( &m_replayRing[( start + i ) % cap], 2, 1, f );
    fclose( f );
    return true;
}

/**
 * @brief Offline (Preset-Editor) analysis: runs the full pipeline at full speed, returning one AudioFeatures snapshot
 * per 10 ms block.
 *
 * A local, never-started AudioAnalyzer instance (`az`) keeps this completely
 * independent of any live capture. Takes the path of a 16-bit PCM WAV file
 * and returns an empty timeline if it cannot be read (parameters and return
 * value documented on the declaration in AudioAnalyzer.h).
 */
std::vector<AudioFeatures> AudioAnalyzer::analyzeWavToTimeline( const QString &path )
{
    std::vector<AudioFeatures> timeline;

    FILE *f = fopen( path.toLocal8Bit().constData(), "rb" );
    if ( !f )
    {
        fprintf( stderr, "TIMELINE: cannot open %s\n", qPrintable( path ) );
        return timeline;
    }

    char           id[5] = { 0 };
    unsigned int   sz = 0;
    unsigned short fmt_tag = 0, channels = 0, bits = 0;
    unsigned int   sample_rate = 48000;
    long           data_pos = 0;
    unsigned int   data_len = 0;
    fseek( f, 12, SEEK_SET );
    while ( fread( id, 1, 4, f ) == 4 && fread( &sz, 4, 1, f ) == 1 )
    {
        if ( strncmp( id, "fmt ", 4 ) == 0 )
        {
            unsigned char buf[16];
            fread( buf, 1, 16, f );
            fmt_tag = *reinterpret_cast<unsigned short *>( buf + 0 );
            channels = *reinterpret_cast<unsigned short *>( buf + 2 );
            sample_rate = *reinterpret_cast<unsigned int *>( buf + 4 );
            bits = *reinterpret_cast<unsigned short *>( buf + 14 );
            if ( sz > 16 )
                fseek( f, sz - 16, SEEK_CUR );
        }
        else if ( strncmp( id, "data", 4 ) == 0 )
        {
            data_pos = ftell( f );
            data_len = sz;
            break;
        }
        else
            fseek( f, sz, SEEK_CUR );
    }
    if ( fmt_tag != 1 || bits != 16 || channels < 1 || data_pos == 0 )
    {
        fprintf( stderr, "TIMELINE: unsupported WAV (PCM16 required)\n" );
        fclose( f );
        return timeline;
    }

    AudioAnalyzer az;    // never start()ed: pure DSP state
    az.m_running = true; // processBlock guards check this

    const int chunk = 480;
    short    *pcm = new short[chunk * channels];
    float    *conv = new float[chunk * channels];
    fseek( f, data_pos, SEEK_SET );
    unsigned int remain = data_len / ( channels * 2 );
    timeline.reserve( remain / chunk + 1 );
    while ( remain > 0 )
    {
        int n = ( remain < static_cast<unsigned int>( chunk ) ) ? static_cast<int>( remain ) : chunk;
        if ( fread( pcm, 2 * channels, n, f ) != static_cast<size_t>( n ) )
            break;
        for ( int i = 0; i < n * channels; ++i )
            conv[i] = pcm[i] / 32768.f;
        az.processBlock( conv, n, ( channels > 2 ) ? 2 : channels, sample_rate );
        timeline.push_back( az.getFeatures() );
        remain -= n;
    }
    delete[] pcm;
    delete[] conv;
    fclose( f );
    fprintf( stderr, "TIMELINE: %d blocks (%.1f s)\n",
             static_cast<int>( timeline.size() ), timeline.size() * 0.01f );
    return timeline;
}

/**
 * @brief QThread entry point: the WASAPI loopback capture loop (or, if M_OfflineWav is set, delegates to
 * analyzeWavOffline() and returns).
 *
 * Contains an outer reconnect loop: if the capture device is invalidated (the
 * user switches the default output, unplugs headphones, an HDMI display
 * sleeps, …), the per-device COM objects are released and the default (or
 * requested) endpoint is re-acquired, so audio reactivity recovers
 * automatically instead of dying.
 */
void AudioAnalyzer::run()
{
    m_running = true;

    // Offline mode: analyze the given WAV deterministically, then finish.
    // NOTE: rand() is seeded further down, AFTER this early return -- offline
    // analysis is deliberately relied on elsewhere as a byte-for-byte
    // reproducible oracle (see processblock-fp-sensitivity), so this path
    // must keep processBlock()'s rand()-driven kaleidoscope-side rerolls at
    // their fixed default sequence.
    if ( !M_OfflineWav.isEmpty() )
    {
        analyzeWavOffline( M_OfflineWav );
        return;
    }

    // MSVC's rand()/srand() keep PER-THREAD state (verified empirically: a
    // background thread's rand() sequence is identical run after run unless
    // THAT thread calls srand() itself) -- main()'s srand() only seeds the
    // main/render thread. processBlock() rolls the kaleidoscope side-count
    // and a drop-gate coin flip via rand() and runs entirely on THIS thread,
    // so without its own seed those two picks would replay identically on
    // every launch even after main()'s fix.
    // KALEIDO_SEED pinnt den Zufall auf einen festen Wert.  Ohne das ist ein
    // Vorher/Nachher-Vergleich zweier Laeufe wertlos: die Szenen wuerfeln ihre
    // Parameter und Seeds pro Lauf neu, und unveraenderte Kontrollszenen
    // schwankten in der Messung um den Faktor zwei -- mehr als die Wirkung,
    // die belegt werden sollte.  Nur fuer Messlaeufe gedacht, im Betrieb nicht
    // gesetzt und damit weiterhin uhrgeseedet.
    {
        const char *seed_env = getenv( "KALEIDO_SEED" );
        srand( seed_env ? static_cast<unsigned>( strtoul( seed_env, nullptr, 10 ) )
                        : static_cast<unsigned>( std::chrono::high_resolution_clock::now()
                                                     .time_since_epoch()
                                                     .count() ) );
    }

#ifdef _WIN32
    // --- COM init for this thread ---
    HRESULT hr = CoInitializeEx( nullptr, COINIT_MULTITHREADED );
    if ( FAILED( hr ) )
    {
        m_running = false;
        return;
    }

    IMMDeviceEnumerator *p_enum = nullptr;
    hr = CoCreateInstance( __uuidof( MMDeviceEnumerator ), nullptr, CLSCTX_ALL,
                           __uuidof( IMMDeviceEnumerator ), reinterpret_cast<void **>( &p_enum ) );
    if ( FAILED( hr ) )
    {
        CoUninitialize();
        m_running = false;
        return;
    }

    // Temporary float conversion buffer (max 4096 frames × 8 channels)
    static float conv_buf[4096 * 8];

    // Outer reconnect loop.  If the capture device is invalidated (the user
    // switches the default output, unplugs headphones, an HDMI display sleeps,
    // …), the per-device objects are released and the default endpoint is
    // re-acquired — so audio reactivity recovers automatically instead of dying.
    while ( m_running )
    {
        IMMDevice           *p_device = nullptr;
        IAudioClient        *p_client = nullptr;
        IAudioCaptureClient *p_capture = nullptr;
        WAVEFORMATEX        *pwfx = nullptr;

        auto device_cleanup = [&]()
        {
            if ( p_capture )
            {
                p_capture->Release();
                p_capture = nullptr;
            }
            if ( p_client )
            {
                p_client->Stop();
                p_client->Release();
                p_client = nullptr;
            }
            if ( pwfx )
            {
                CoTaskMemFree( pwfx );
                pwfx = nullptr;
            }
            if ( p_device )
            {
                p_device->Release();
                p_device = nullptr;
            }
        };

        // Refresh the selectable-device list (cheap; keeps it current across
        // plug/unplug), and read the runtime selection.
        enumerateDevices( p_enum );
        QString req_id;
        bool    req_cap = false;
        bool    use_req = false;
        {
            QMutexLocker lk( &m_mutex );
            use_req = m_useReqDevice;
            req_id = m_reqDeviceId;
            req_cap = m_reqIsCapture;
        }
        m_deviceChangeReq = false;

        // The selected endpoint, or the default render endpoint (loopback) if none.
        // Loopback only applies to OUTPUT endpoints; an input device (mic/line-in)
        // is captured normally.
        bool is_capture_endpoint = false;
        if ( use_req && !req_id.isEmpty() )
        {
            hr = p_enum->GetDevice( reinterpret_cast<LPCWSTR>( req_id.utf16() ), &p_device );
            is_capture_endpoint = req_cap;
        }
        else
        {
            hr = p_enum->GetDefaultAudioEndpoint( eRender, eConsole, &p_device );
            is_capture_endpoint = false;
        }
        if ( SUCCEEDED( hr ) )
            hr = p_device->Activate( __uuidof( IAudioClient ), CLSCTX_ALL, nullptr,
                                     reinterpret_cast<void **>( &p_client ) );
        if ( SUCCEEDED( hr ) )
            hr = p_client->GetMixFormat( &pwfx );
        if ( SUCCEEDED( hr ) )
        {
            REFERENCE_TIME buffer_duration = 200000; // 100ns units → 20 ms
            DWORD          stream_flags = is_capture_endpoint ? 0 : AUDCLNT_STREAMFLAGS_LOOPBACK;
            hr = p_client->Initialize( AUDCLNT_SHAREMODE_SHARED, stream_flags,
                                       buffer_duration, 0, pwfx, nullptr );
        }
        if ( SUCCEEDED( hr ) )
            hr = p_client->GetService( __uuidof( IAudioCaptureClient ), reinterpret_cast<void **>( &p_capture ) );
        if ( SUCCEEDED( hr ) )
            hr = p_client->Start();

        if ( FAILED( hr ) )
        {
            // Setup failed.  If a *selected* device failed, drop back to the
            // default so we don't get stuck retrying a dead source.
            device_cleanup();
            if ( use_req )
            {
                QMutexLocker lk( &m_mutex );
                m_useReqDevice = false;
            }
            msleep( 500 );
            continue;
        }

        // Publish the friendly name of what we're now capturing. Left EMPTY
        // for the default device on purpose -- a language-neutral sentinel
        // (this used to be the literal display string "Standard-Ausgabe
        // (Loopback)", which broke the moment that label became
        // translatable: drawAudioMenu()'s "is this the default entry"
        // check compared against it directly, so an English UI would never
        // have matched). currentDeviceName() has exactly one consumer
        // (GLwidget::drawAudioMenu()), which now checks isEmpty() instead.
        {
            QMutexLocker lk( &m_mutex );
            m_curDeviceName.clear();
            if ( use_req )
                for ( const AudioDevice &ad : m_devices )
                    if ( ad.id == req_id )
                    {
                        m_curDeviceName = ad.name;
                        break;
                    }
        }

        const int sample_rate = pwfx->nSamplesPerSec;
        const int num_channels = pwfx->nChannels;
        // Detect IEEE float vs PCM16 format
        const bool is_float = ( pwfx->wFormatTag == WAVE_FORMAT_IEEE_FLOAT )
                              || ( pwfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE
                                   && reinterpret_cast<WAVEFORMATEXTENSIBLE *>( pwfx )->SubFormat
                                          == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT );

        bool device_lost = false;
        while ( m_running && !device_lost )
        {
            if ( m_deviceChangeReq )
            {
                device_lost = true;
                break;
            } // runtime source switch

            UINT32 packet_size = 0;
            hr = p_capture->GetNextPacketSize( &packet_size );
            if ( FAILED( hr ) )
            {
                device_lost = true;
                break;
            } // e.g. AUDCLNT_E_DEVICE_INVALIDATED

            while ( packet_size > 0 && m_running )
            {
                BYTE  *p_data = nullptr;
                UINT32 num_frames = 0;
                DWORD  flags = 0;

                hr = p_capture->GetBuffer( &p_data, &num_frames, &flags, nullptr, nullptr );
                if ( FAILED( hr ) )
                {
                    device_lost = true;
                    break;
                }

                if ( !( flags & AUDCLNT_BUFFERFLAGS_SILENT ) && num_frames > 0 )
                {
                    const int    total_samples = num_frames * num_channels;
                    const float *src = nullptr;

                    if ( is_float )
                    {
                        src = reinterpret_cast<const float *>( p_data );
                    }
                    else
                    {
                        // PCM 16-bit → float
                        const int16_t *pcm = reinterpret_cast<const int16_t *>( p_data );
                        int            count = std::min( total_samples, 4096 * 8 );
                        for ( int i = 0; i < count; ++i )
                            conv_buf[i] = pcm[i] / 32768.f;
                        src = conv_buf;
                    }

                    processBlock( src, num_frames, std::min( num_channels, 2 ), sample_rate );

                    // Recording: open on first request, then append the samples.
                    if ( m_recReq && !m_wavFile )
                        recOpen( sample_rate );
                    if ( m_wavFile )
                        recWrite( src, num_frames, num_channels );
                }

                p_capture->ReleaseBuffer( num_frames );
                hr = p_capture->GetNextPacketSize( &packet_size );
                if ( FAILED( hr ) )
                {
                    device_lost = true;
                    break;
                }
            }

            if ( m_wavFile && !m_recReq )
                recClose(); // finalise the WAV when stopped

            msleep( 10 ); // poll every 10 ms
        }

        if ( m_wavFile )
            recClose(); // finalise if recording when the device drops / app stops
        device_cleanup();
        if ( device_lost && m_running )
            msleep( 300 ); // brief pause before attempting to reconnect
    }

    if ( p_enum )
        p_enum->Release();
    CoUninitialize();
#elif defined( KALEIDO_HAVE_PULSE )
    // --- PulseAudio monitor capture ---------------------------------------
    // The counterpart to WASAPI loopback is recording the default sink's
    // MONITOR source: what the speakers are playing, not what a microphone
    // hears. PulseAudio resolves "@DEFAULT_MONITOR@" to it, and PipeWire's
    // pulse server answers to the same name, so one path covers both.
    //
    // Block size is not free to choose: every smoothing constant downstream is
    // tuned PER BLOCK, not per second (see processBlock), so 480 frames at
    // 48 kHz reproduces the same ~10 ms cadence WASAPI delivers and the offline
    // WAV path feeds. Getting this wrong would retune the whole analyser.
    const int    kRate = 48000, kCh = 2, kFrames = 480;
    static float pulseBuf[kFrames * kCh];

    pa_sample_spec ss;
    ss.format = PA_SAMPLE_FLOAT32NE;
    ss.rate = kRate;
    ss.channels = kCh;

    pa_buffer_attr attr;
    memset( &attr, 0xFF, sizeof( attr ) ); // 0xFF.. = -1 = server default
    attr.fragsize = kFrames * kCh * sizeof( float );
    attr.maxlength = attr.fragsize * 4;

    // Outer reconnect loop, with the same intent as the WASAPI one: a server
    // restart or a change of default sink must not kill audio reactivity for
    // the rest of the session.
    while ( m_running )
    {
        int        err = 0;
        pa_simple *rec = pa_simple_new( nullptr, "Kaleidoscope", PA_STREAM_RECORD,
                                        "@DEFAULT_MONITOR@", "loopback",
                                        &ss, nullptr, &attr, &err );
        if ( !rec )
        {
            fprintf( stderr, "AUDIO: no monitor source (%s); retrying\n", pa_strerror( err ) );
            msleep( 1000 );
            continue;
        }
        fprintf( stderr, "AUDIO: capturing @DEFAULT_MONITOR@, %d Hz, %d ch\n", kRate, kCh );

        while ( m_running )
        {
            // Blocking read, but a monitor source always delivers -- silence is
            // still samples -- so this returns about every 10 ms and stop()
            // stays responsive without a poll.
            if ( pa_simple_read( rec, pulseBuf, sizeof( pulseBuf ), &err ) < 0 )
            {
                fprintf( stderr, "AUDIO: capture dropped (%s)\n", pa_strerror( err ) );
                break; // fall out and reopen
            }
            processBlock( pulseBuf, kFrames, kCh, kRate );

            if ( m_recReq && !m_wavFile )
                recOpen( kRate );
            if ( m_wavFile )
                recWrite( pulseBuf, kFrames, kCh );
        }

        if ( m_wavFile )
            recClose();
        pa_simple_free( rec );
        if ( m_running )
            msleep( 300 );
    }
#else
    // No loopback backend on this platform (macOS without PulseAudio: CoreAudio
    // cannot tap system output at all without a virtual device such as
    // BlackHole). Offline analysis (-w / -x) is unaffected and still exact.
    fprintf( stderr, "AUDIO: no loopback capture backend on this platform;\n"
                     " the visuals run untriggered. Use -w <file.wav> for audio.\n" );
    while ( m_running )
        msleep( 200 );
#endif
}

/**
 * @brief Core per-block DSP pipeline: 6-band IIR analysis, beat/onset/tempo/section/drop detection, FFT features, mood
 * proxies — publishes AudioFeatures.
 *
 * Called once per captured (or offline-simulated) audio block, roughly every
 * 10 ms. Order of operations (each stage builds on the smoothed state left by
 * the previous call):
 *   1. Feed the instant-replay ring and the 5-band IIR cascade, accumulate
 *      per-sample RMS/ZCR/stereo statistics over the block.
 *   2. Ambient-adaptive attack/release smoothing of the 6 band energies, then
 *      dB-normalisation for display.
 *   3. Time-domain beat detection on raw (unsmoothed) sub+bass RMS, with an
 *      ambient-adaptive threshold and a rising-edge test.
 *   4. AGC (loudness-normalised) outputs, spectral flux/centroid, sharpness,
 *      stereo width, the ambient/beat classifier, speed/power envelopes.
 *   5. Full-spectrum FFT (radix2fft) → magnitude spectrum → harmonicity,
 *      32-band spectrum, FFT-based onset detection (global + per instrument
 *      group), section-change / song-structure detection, rolloff, spread,
 *      roughness, chroma/key/mode, chroma hue, dominant pitch.
 *   6. Higher-level classifiers built from the above: music/speech gate,
 *      build-up/drop (EDM dramaturgy), DJ-stop/slam, relative band levels,
 *      waveform downsample.
 *   7. Publish every derived value into m_features under m_mutex.
 *
 * All internal EMA/threshold constants are tuned per-block (not per-second),
 * so this function must be called at a fixed ~10 ms cadence for the smoothing
 * time constants documented on the member variables (in AudioAnalyzer.h) to
 * hold; analyzeWavOffline()/analyzeWavToTimeline() preserve this by feeding
 * fixed 480-sample chunks.
 *
 * The parameters are documented on the declaration in AudioAnalyzer.h: `data`
 * is interleaved float PCM of `numFrames` frames and `numChannels` (1 or 2)
 * channels at `sampleRate` Hz.
 */
void AudioAnalyzer::processBlock( const float *data, int numFrames,
                                  int numChannels, int sampleRate )
{
    // ---- 5 one-pole LP coefficients ----
    // One-pole IIR: y[n] = a*y[n-1] + (1-a)*x[n]
    // ---- Instant-replay ring: keep the last ~32 s of PCM (stereo s16) ----
    {
        QMutexLocker rl( &m_replayMx );
        if ( m_replayRing.empty() || m_replayRate != sampleRate )
        {
            m_replayRate = sampleRate;
            m_replayRing.assign( static_cast<size_t>( sampleRate ) * 2 * ReplaySeconds, 0 );
            m_replayPos = m_replayCount = 0;
        }
        const size_t cap = m_replayRing.size();
        for ( int i = 0; i < numFrames; ++i )
        {
            float l = data[i * numChannels];
            float r = ( numChannels > 1 ) ? data[i * numChannels + 1] : l;
            m_replayRing[m_replayPos] = static_cast<short>( std::max( -1.f, std::min( 1.f, l ) ) * 32000.f );
            m_replayRing[m_replayPos + 1] = static_cast<short>( std::max( -1.f, std::min( 1.f, r ) ) * 32000.f );
            m_replayPos = ( m_replayPos + 2 ) % cap;
        }
        m_replayCount = std::min( m_replayCount + static_cast<size_t>( numFrames ),
                                  static_cast<size_t>( sampleRate ) * ReplaySeconds );
    }

    // Band extraction by subtraction of adjacent LP outputs.
    const float a60 = coeff( 60.f, sampleRate );
    const float a150 = coeff( 150.f, sampleRate );
    const float a500 = coeff( 500.f, sampleRate );
    const float a2k = coeff( 2000.f, sampleRate );
    const float a6k = coeff( 6000.f, sampleRate );

    // Stereo per-channel 3-band split (low <250 Hz, mid 250-2500 Hz, high >2500 Hz)
    const float a_st_lo = coeff( 250.f, sampleRate );
    const float a_st_hi = coeff( 2500.f, sampleRate );

    // ---- Ambient-adaptive smoothing (one-pole attack / release) ----
    // Beat mode: fast release (≈0.88-0.93) – visuals snap with each kick.
    // Ambient mode: very slow release (≈0.985-0.99) – majestic long swell.
    // The ambientFactor (0=beat, 1=ambient) blends the two coefficients.
    // At 100 update cycles/sec: release=0.99 → ~37% decay in ~100 frames ≈ 1 s.
    const float af = m_ambientFactor; // 0=beat, 1=ambient

    // Attack coefficients (same for both modes – fast rise is always desired)
    const float atk_sub = 0.80f;
    const float atk_bass = 0.70f;
    const float atk_low = 0.65f;
    const float atk_mid = 0.60f;
    const float atk_upp = 0.55f;
    const float atk_high = 0.50f;

    // Release coefficients: lerp between beat-mode and ambient-mode values
    auto lerp_rel = [&]( float beat, float amb )
    { return beat + af * ( amb - beat ); };
    const float rel_sub = lerp_rel( 0.94f, 0.993f );
    const float rel_bass = lerp_rel( 0.93f, 0.990f );
    const float rel_low = lerp_rel( 0.92f, 0.990f );
    const float rel_mid = lerp_rel( 0.91f, 0.988f );
    const float rel_upp = lerp_rel( 0.89f, 0.987f );
    const float rel_high = lerp_rel( 0.88f, 0.985f ); // slightly faster so shimmer can breathe

    // ---- Per-sample IIR pass: accumulate squared band energies + ZCR ----
    float acc_sub = 0.f, acc_bass = 0.f, acc_low = 0.f;
    float acc_mid = 0.f, acc_upp = 0.f, acc_high = 0.f;
    float acc_stereo_side = 0.f, acc_stereo_mid = 0.f; // for stereo width
    float acc_st_lo[2] = { 0.f, 0.f }, acc_st_mid[2] = { 0.f, 0.f }, acc_st_hi[2] = { 0.f, 0.f };
    int   crossings = 0;
    float prev_mono = 0.f;

    for ( int i = 0; i < numFrames; ++i )
    {
        // Mix to mono
        float mono = 0.f;
        for ( int c = 0; c < numChannels; ++c )
            mono += data[i * numChannels + c];
        mono /= static_cast<float>( numChannels );

        // Waveform ring for `audioWave[64]` (oscilloscope effects).
        m_waveRing[m_waveWritePos] = mono;
        m_waveWritePos = ( m_waveWritePos + 1 ) & ( WaveRing - 1 );

        // Per-channel samples (R falls back to L for mono → mirrored spectrum).
        const float L = data[i * numChannels + 0];
        const float R = ( numChannels >= 2 ) ? data[i * numChannels + 1] : L;

        // Stereo width: energy of the side (L-R) vs. mid (L+R) signal.
        if ( numChannels >= 2 )
        {
            float side = 0.5f * ( L - R );
            float mid_s = 0.5f * ( L + R );
            acc_stereo_side += side * side;
            acc_stereo_mid += mid_s * mid_s;
        }

        // Stereo-separated spectrum: cheap 3-band split per channel (2 LPs each).
        m_lpStL[0] = a_st_lo * m_lpStL[0] + ( 1.f - a_st_lo ) * L;
        m_lpStL[1] = a_st_hi * m_lpStL[1] + ( 1.f - a_st_hi ) * L;
        m_lpStR[0] = a_st_lo * m_lpStR[0] + ( 1.f - a_st_lo ) * R;
        m_lpStR[1] = a_st_hi * m_lpStR[1] + ( 1.f - a_st_hi ) * R;
        const float lo_l = m_lpStL[0], mi_l = m_lpStL[1] - m_lpStL[0], hi_l = L - m_lpStL[1];
        const float lo_r = m_lpStR[0], mi_r = m_lpStR[1] - m_lpStR[0], hi_r = R - m_lpStR[1];
        acc_st_lo[0] += lo_l * lo_l;
        acc_st_mid[0] += mi_l * mi_l;
        acc_st_hi[0] += hi_l * hi_l;
        acc_st_lo[1] += lo_r * lo_r;
        acc_st_mid[1] += mi_r * mi_r;
        acc_st_hi[1] += hi_r * hi_r;

        // Zero-crossing rate: count sign changes (Temporal feature from paper)
        if ( ( mono > 0.f && prev_mono < 0.f ) || ( mono < 0.f && prev_mono > 0.f ) )
            ++crossings;
        prev_mono = mono;

        // Feed ring buffer for FFT (circular, FFTSize = 2048 samples)
        m_ringBuf[m_ringWrite] = mono;
        m_ringWrite = ( m_ringWrite + 1 ) % FFTSize;

        // Feed 5 LP filters in parallel (same input, different cutoffs)
        m_lp60 = a60 * m_lp60 + ( 1.f - a60 ) * mono;
        m_lp150 = a150 * m_lp150 + ( 1.f - a150 ) * mono;
        m_lp500 = a500 * m_lp500 + ( 1.f - a500 ) * mono;
        m_lp2k = a2k * m_lp2k + ( 1.f - a2k ) * mono;
        m_lp6k = a6k * m_lp6k + ( 1.f - a6k ) * mono;

        // Extract 6 bands by subtraction of adjacent LP outputs
        float v_sub = m_lp60;            // 20–60 Hz   sub-bass rumble
        float v_bass = m_lp150 - m_lp60; // 60–150 Hz  drone body / kick
        float v_low = m_lp500 - m_lp150; // 150–500 Hz harmonic warmth
        float v_mid = m_lp2k - m_lp500;  // 500–2k Hz  melody / texture
        float v_upp = m_lp6k - m_lp2k;   // 2k–6k Hz   metallic / scrape
        float v_high = mono - m_lp6k;    // 6k+ Hz     air / shimmer

        // Accumulate squared amplitudes for RMS calculation
        acc_sub += v_sub * v_sub;
        acc_bass += v_bass * v_bass;
        acc_low += v_low * v_low;
        acc_mid += v_mid * v_mid;
        acc_upp += v_upp * v_upp;
        acc_high += v_high * v_high;
    }

    m_frameCounter += static_cast<float>( numFrames );

    // ---- RMS per band ----
    const float inv = ( numFrames > 0 ) ? 1.f / static_cast<float>( numFrames ) : 0.f;
    float       r_sub = std::sqrt( acc_sub * inv );
    float       r_bass = std::sqrt( acc_bass * inv );
    float       r_low = std::sqrt( acc_low * inv );
    float       r_mid = std::sqrt( acc_mid * inv );
    float       r_upp = std::sqrt( acc_upp * inv );
    float       r_high = std::sqrt( acc_high * inv );

    // ---- Asymmetric attack/release smoothing per band ----
    auto smooth = []( float &s, float v, float atk, float rel )
    {
        float a = ( v > s ) ? atk : rel;
        s = a * s + ( 1.f - a ) * v;
    };
    smooth( m_sSubBass, r_sub, atk_sub, rel_sub );
    smooth( m_sBass, r_bass, atk_bass, rel_bass );
    smooth( m_sLowMid, r_low, atk_low, rel_low );
    smooth( m_sMid, r_mid, atk_mid, rel_mid );
    smooth( m_sUpperMid, r_upp, atk_upp, rel_upp );
    smooth( m_sHigh, r_high, atk_high, rel_high );

    // ---- Beat detection on combined sub_bass + bass (linear RMS) ----
    // Beat detection intentionally stays in linear domain (more sensitive
    // to energy transients than dB). Combined sub+bass catches both:
    //   - Electronic kick drums (body in 60-150 Hz)
    //   - Dark ambient sub-bass pulses (modulation in 20-60 Hz)
    // Uses the RAW per-block RMS, NOT the display-smoothed bands: the smoothed
    // release kept the level high between kicks, crushing the peak/background
    // contrast to ~1.9x — any ambient-raised threshold then missed real kicks
    // entirely (measured: 4 of 32 kicks detected on a plain 120 BPM pattern).
    // Raw RMS falls to ~0 between kicks -> contrast 5-10x, so real kicks clear
    // the threshold while slow drone wobble still stays below it.
    float beat_band = r_sub * 0.35f + r_bass * 0.65f;

    m_bassHistory[m_histIdx] = beat_band;
    m_histIdx = ( m_histIdx + 1 ) % HistoryLen;

    float hist_mean = 0.f;
    for ( float v : m_bassHistory )
        hist_mean += v;
    hist_mean /= static_cast<float>( HistoryLen );

    bool  is_beat = false;
    float beat_str = 0.f;

    // Ambient-adaptive beat threshold.
    // Beat music (ambientFactor≈0): threshold = 1.5× hist_mean  (normal sensitivity).
    // Drone music (ambientFactor≈1): threshold = 4.5× hist_mean  (requires a true
    // transient 3× above the drone level — small sustain fluctuations never qualify).
    // This is the primary defence against false beats on Köner / Lustmord / Heemann.
    const float dyn_thresh = BeatThresholdRatio + m_ambientFactor * 3.0f;

    if ( m_beatCooldown > 0.f )
    {
        m_beatCooldown -= 1.f;
    }
    else if ( hist_mean > 1e-4f && beat_band > dyn_thresh * hist_mean
              && beat_band > m_prevBeatBand * 1.15f )
    {
        // The rising-edge test (vs. the previous block) makes sure we trigger on
        // the kick's ATTACK only — a long kick/808 tail that is still above the
        // threshold when the cooldown expires must not fire a phantom 2nd beat.
        is_beat = true;
        beat_str = std::min( ( beat_band / ( hist_mean * dyn_thresh ) ) - 1.f, 1.f );
        m_beatCooldown = BeatCooldownFrames;
    }
    m_prevBeatBand = beat_band;

    // ---- Logarithmic (dB) normalisation for shader outputs ----
    // Human hearing is logarithmic. dB mapping gives far better perceived
    // dynamic range for driving visual parameters.
    //   dB = 20 * log10(rms + ε)
    //   Map [-60 dB .. 0 dB] → [0 .. 1]
    auto to_norm = []( float rms ) -> float
    {
        const float d_b = 20.f * std::log10( rms + 1e-5f );
        return std::max( 0.f, std::min( 1.f, ( d_b + 60.f ) / 60.f ) );
    };

    float sub_bass = to_norm( m_sSubBass );
    float bass = to_norm( m_sBass );
    float low_mid = to_norm( m_sLowMid );
    float mid = to_norm( m_sMid );
    float upper_mid = to_norm( m_sUpperMid );
    float high = to_norm( m_sHigh );

    // Overall level: perceptually weighted mix (bass-heavy, as drones tend to be)
    float level = sub_bass * 0.15f
                  + bass * 0.30f
                  + low_mid * 0.25f
                  + mid * 0.15f
                  + upper_mid * 0.10f
                  + high * 0.05f;

    // Rolling ~6 s envelope history, read by the music/speech classifier.
    // Stores the RAW LINEAR per-block band sum, not `level`: `level` is dB-
    // normalised and attack/release smoothed, and both steps erase the pauses
    // this ring exists to find. Measured across 45 clips, the dB/smoothed
    // version put speech and music within 0.001 of each other on every
    // spectral ratio derived from it.
    m_envHistory[m_envIdx] = r_sub + r_bass + r_low + r_mid + r_upp + r_high;
    m_envIdx = ( m_envIdx + 1 ) % EnvHistLen;

    // ---- Sharpness (Zwicker-style high-frequency weighting) ----
    // Ratio of high-frequency energy to total: dark drones → ~0, bright/harsh → ~1.
    float sharp_num = 0.40f * mid + 0.70f * upper_mid + 1.00f * high;
    float sharp_den = sub_bass + bass + low_mid + mid + upper_mid + high + 1e-6f;
    m_sSharpness = 0.95f * m_sSharpness + 0.05f * std::min( sharp_num / sharp_den, 1.f );

    // ---- Stereo width: RMS(side) / (RMS(mid) + RMS(side)) ----
    float raw_width = 0.f;
    if ( acc_stereo_mid > 1e-9f )
    {
        float rms_side = std::sqrt( acc_stereo_side * inv );
        float rms_mid = std::sqrt( acc_stereo_mid * inv );
        raw_width = rms_side / ( rms_mid + rms_side + 1e-6f );
    }
    m_sStereoWidth = 0.90f * m_sStereoWidth + 0.10f * std::min( raw_width * 2.f, 1.f );

    // ---- Automatic gain control (volume independence) ----
    // Track a slow loudness reference (only while there is signal, with a floor)
    // and normalise the levels the VISUALS see to it, so the same track played
    // quietly or loudly drives the visualisation identically.  A single gain is
    // applied to overall level + all bands, so the spectral SHAPE is preserved;
    // beat / ambient / music-speech detection keep using the raw values.
    if ( level > 0.02f )
        m_loudnessRef = 0.9995f * m_loudnessRef + 0.0005f * level; // ~ tens of seconds
    m_loudnessRef = std::max( m_loudnessRef, 0.04f );              // don't amplify near-silence
    const float TargetLevel = 0.40f;                               // average music → ~0.40
    float       agc_gain = std::max( 0.3f, std::min( TargetLevel / m_loudnessRef, 5.0f ) );

    float n_level = std::min( level * agc_gain, 1.f );
    float n_sub_bass = std::min( sub_bass * agc_gain, 1.f );
    float n_bass = std::min( bass * agc_gain, 1.f );
    float n_low_mid = std::min( low_mid * agc_gain, 1.f );
    float n_mid = std::min( mid * agc_gain, 1.f );
    float n_upper_mid = std::min( upper_mid * agc_gain, 1.f );
    float n_high = std::min( high * agc_gain, 1.f );

    // ---- Stereo per-channel band levels (AGC-normalised, lightly smoothed) ----
    {
        auto sm_ch = []( float &s, float v )
        { s = 0.7f * s + 0.3f * v; };
        for ( int ch = 0; ch < 2; ++ch )
        {
            sm_ch( m_sStBand[ch][0], std::min( std::sqrt( acc_st_lo[ch] * inv ) * agc_gain, 1.f ) );
            sm_ch( m_sStBand[ch][1], std::min( std::sqrt( acc_st_mid[ch] * inv ) * agc_gain, 1.f ) );
            sm_ch( m_sStBand[ch][2], std::min( std::sqrt( acc_st_hi[ch] * inv ) * agc_gain, 1.f ) );
        }
    }

    // ---- Ambient / beat classification (content-based, HPSS-inspired) ----
    // The old test used the rolling loudness VARIANCE, which classified by
    // dynamics statistics — and misfiled steadily-loud electronic music as
    // "ambient" (low variance!) while lively drones could read as "beat".  Per
    // the MIR literature the robust separator is CONTENT: harmonic-sustained
    // (drone/pad/chord) vs. percussive-transient material.  Three ingredients:
    //   harmonicity  — spectral frame-to-frame self-similarity (m_sSpecSim):
    //                  drones ~0.99+, beat music dips hard on every transient;
    //   percussiveness — onset density (m_onsetRate, ~onsets/sec);
    //   rhythm evidence — m_sRhythm (beat regularity + autocorrelation tempo).
    // Ambient = harmonic AND sparse-onset AND arrhythmic.
    //
    // Near-silence is NOT "ambient drone": pushing the factor up during quiet
    // intros / pauses used to leave the beat threshold ambient-boosted for ~10 s
    // into the next song — the detector was measurably deaf (4 of 32 kicks).
    // Hold the factor while there is no signal to classify.
    // SPEECH is not classifiable material either: dialogue is mid-dominant,
    // gappy and arrhythmic, so letting it drive the factor would drag the
    // beat/drone classification around while the reactivity is gated off
    // anyway.  Hold the factor whenever the music/speech classifier says
    // this isn't music — the beat/drone state then survives a talk break
    // unchanged and is instantly right when the music returns.
    if ( level > 0.05f && m_sMusicPresence > 0.45f )
    {
        // Calibrated against the offline test WAVs: a 120 BPM kick pattern
        // measures sim ~0.32, a sustained 4-partial drone ~0.82.
        float harm = ( m_sSpecSim - 0.50f ) / 0.25f;
        harm = std::max( 0.f, std::min( harm, 1.f ) );
        float perc = std::min( m_onsetRate / 2.5f, 1.f ); // >=2.5 onsets/s = fully percussive
        float target_ambient = harm * ( 1.f - perc ) * ( 1.f - m_sRhythm );

        // Transition speeds: rising into ambient stays deliberate (~2 s); the
        // fall back to beat mode is nearly as fast (~2.5 s) so the beat
        // threshold recovers quickly when a rhythm starts.
        const float amb_speed_rise = 0.005f; // 200 blocks ≈ 2 s
        const float amb_speed_fall = 0.004f; // 250 blocks ≈ 2.5 s
        float       ambient_speed = ( target_ambient > m_ambientFactor ) ? amb_speed_rise : amb_speed_fall;
        m_ambientFactor += ambient_speed * ( target_ambient - m_ambientFactor );
    }

    // ---- Speed scale envelope ----
    // On beat: m_beatPulse jumps then decays at 0.85×/cycle → 4-frame ramp.
    // In ambient mode: speed tracks spectral flux (drone moves when it changes).
    // beatPulse magnitude is gated by ambientFactor:
    //   ambientFactor=0 → full pulse (1 + beat_str*2, up to 3.0)
    //   ambientFactor=1 → almost no pulse (×0.05 = max 0.15)
    // Even if the raised threshold above lets a drone fluctuation through as a "beat",
    // the resulting visual flash is negligible because beatDecay ≤ 0.15/3 = 0.05.
    if ( is_beat )
        m_beatPulse = ( 1.f + beat_str * 2.f ) * ( 1.f - m_ambientFactor * 0.95f );
    m_beatPulse = std::max( m_beatPulse * 0.85f, 0.f );

    // Kick dominance: a leaky rate of DETECTED BASS-DRUM beats.  While a
    // steady kick grid is running (>= ~1 kick/s) the full-spectrum onsets
    // below (snares/hats/melodic hits) contribute far less to the global
    // pulse — the picture pumps ON the kick grid instead of on every hi-hat
    // ("hectic, off-rhythm" feel).  Without a kick (kickRate -> 0) the
    // onsets keep their full drive, so kick-less genres stay reactive.
    if ( is_beat )
        m_kickRate += 0.333f;
    m_kickRate *= 0.99667f; // tau ~3 s -> ~kicks per second

    // ---- Downbeat accent: accent the bar's "1" ----
    // Triggered below from the continuous beat phase (every 4th beat), which is
    // far more reliable than counting kick transients (works for kick-light music
    // via the autocorrelation tempo too); here we just decay the pulse.
    m_downbeatPulse = std::max( m_downbeatPulse * 0.92f, 0.f );

    // ---- Power (distortion) scale ----
    float power_scale = ( 1.f + high * 2.f ) * ( 1.f - m_ambientFactor )
                        + ( 1.f + level * 0.5f ) * m_ambientFactor;

    // ---- beatDecay: smooth decaying pulse 0..1 for shaders ----
    // Jumps to >0 on a beat and decays in ~4-5 frames (40-50 ms).
    // Shaders can use this for a sustained visual pop, unlike the one-frame isBeat flag.
    float beat_decay = std::min( m_beatPulse / 3.f, 1.f );

    // ---- Spectral Flux (6-band) ----
    // Measures positive-only inter-frame change across all bands.
    // Zero for a perfectly static held drone; peaks when layers enter or leave.
    // Primary motion driver for the dark ambient tunnel shader.
    float raw_flux = std::max( 0.f, sub_bass - m_prevSubBass )
                     + std::max( 0.f, bass - m_prevBass )
                     + std::max( 0.f, low_mid - m_prevLowMid )
                     + std::max( 0.f, mid - m_prevMid )
                     + std::max( 0.f, upper_mid - m_prevUpperMid )
                     + std::max( 0.f, high - m_prevHigh );

    m_prevSubBass = sub_bass;
    m_prevBass = bass;
    m_prevLowMid = low_mid;
    m_prevMid = mid;
    m_prevUpperMid = upper_mid;
    m_prevHigh = high;

    m_sFlux = 0.7f * m_sFlux + 0.3f * raw_flux;
    float spectral_flux = std::min( m_sFlux / 0.15f, 1.f );

    // ---- Spectral-flux variance over ~1 s ("restlessness") ----
    m_fluxHistory[m_fluxIdx] = spectral_flux;
    m_fluxIdx = ( m_fluxIdx + 1 ) % FluxHistLen;
    float f_mean = 0.f;
    for ( float v : m_fluxHistory )
        f_mean += v;
    f_mean /= static_cast<float>( FluxHistLen );
    float f_var = 0.f;
    for ( float v : m_fluxHistory )
    {
        float d = v - f_mean;
        f_var += d * d;
    }
    f_var /= static_cast<float>( FluxHistLen );
    m_sFluxVar = 0.90f * m_sFluxVar + 0.10f * std::min( std::sqrt( f_var ) * 4.f, 1.f );

    // ---- Full-spectrum onset detection (snares / claps / melodic, not just kicks) ----
    // Peak-pick the onset detection function: an onset is a clear rising jump
    // above its recent average.  The ODF is the FFT-based normalised spectral
    // flux (m_odfFFT) — the old per-block band-RMS deltas rippled on sustained
    // low-frequency content and fired ~10 phantom onsets/sec on pure drones,
    // which in turn faked a "rhythm" and kept ambientFactor at 0.  A detected
    // onset boosts the visual beat pulse, so the SAME beat-driven reactions
    // (zoom, rotation kick) fire across every genre.
    float onset_strength = 0.f;
    if ( m_onsetCooldown > 0.f )
    {
        m_onsetCooldown -= 1.f;
    }
    else if ( m_odfFFT > m_onsetAvg * 2.2f + 0.060f && m_odfFFT > m_prevODF )
    {
        // SPIKE test: a real onset is a jump far above its own short-term average
        // (2.2x + 0.06 abs).  Slowly swelling drones keep the ODF *steadily*
        // elevated — near its average — so they no longer fire; a kick from
        // silence exceeds many times its decayed average.
        onset_strength = std::min( ( m_odfFFT / ( m_onsetAvg * 2.2f + 1e-4f ) ) - 1.f, 1.f );
        m_onsetCooldown = 5.f;
        // Kick-dominant global pulse: with a running bass-drum grid the
        // non-kick onsets only NUDGE the pulse (25%), on kick-less material
        // they carry it fully (see m_kickRate above).
        float kick_dom = std::min( m_kickRate / 1.2f, 1.f );
        float onset_pulse = ( 0.6f + 0.8f * onset_strength )
                            * ( 1.f - m_ambientFactor * 0.9f )
                            * ( 1.f - 0.75f * kick_dom );
        m_beatPulse = std::max( m_beatPulse, onset_pulse );
        m_onsetRate += 0.333f; // leaky integrator: += 1/tau per event
    }
    m_onsetRate *= 0.99667f; // tau ~3 s at ~100 blocks/s -> ~onsets/sec
    m_onsetAvg = 0.95f * m_onsetAvg + 0.05f * m_odfFFT;
    m_prevODF = m_odfFFT;

    // Re-derive the decaying beat pulse now that onsets are folded into m_beatPulse.
    beat_decay = std::min( m_beatPulse / 3.f, 1.f );

    // ---- Track-change detection (sustained silence -> first onset/energy) ----
    // When the audio goes near-silent for a while (track ends / is changed) and
    // then sound returns, fire a one-shot flag so the host can start the new
    // track with a clean, fresh transition instead of mid-effect.
    bool track_change = false;
    {
        const float silence_thresh = 0.015f; // raw level below this ≈ silence
        if ( level < silence_thresh )
        {
            m_silenceFrames += 1.f;
            if ( m_silenceFrames > 60.f ) // ~0.6 s+ of silence → armed
                m_wasSilent = true;
        }
        else
        {
            // A DJ STOP claims short gaps (the break machinery below freezes
            // and slam-resumes) — only an unclaimed silence means a new track.
            if ( m_wasSilent && !m_stopActive
                 && ( onset_strength > 0.25f || level > 0.05f ) )
                track_change = true; // first real sound after the gap
            m_silenceFrames = 0.f;
            m_wasSilent = false;
        }
    }

    // ---- Autocorrelation tempo ----
    // Feed the onset detection function into a fixed-rate envelope, then autocorrelate
    // it over the natural-tempo lag range (70..180 BPM).  The peak lag gives a robust
    // tempo estimate (and confidence) that refines the inter-beat BPM below.
    {
        int frames_per_env = std::max( 1, sampleRate / EnvRate );
        m_envFrameAcc += numFrames;
        while ( m_envFrameAcc >= frames_per_env )
        {
            m_envFrameAcc -= frames_per_env;
            // FFT-based ODF: the old band-RMS flux rippled on sustained bass and
            // made the autocorrelation "find" a phantom tempo in pure drones.
            m_odfEnv[m_odfEnvIdx] = m_odfFFT;
            m_odfEnvIdx = ( m_odfEnvIdx + 1 ) % OdfEnvLen;
        }
        const int lag_lo = ( 60 * EnvRate ) / 180; // 33 samples (180 BPM)
        const int lag_hi = ( 60 * EnvRate ) / 70;  // 85 samples (70 BPM)
        float     env_sum = 0.f;
        for ( int i = 0; i < OdfEnvLen; ++i )
            env_sum += m_odfEnv[i];
        float env_mean = env_sum / static_cast<float>( OdfEnvLen );
        // MEAN-REMOVED variance: the raw ODF envelope is all-positive (DC-heavy)
        // and the normalised AC of a DC-dominated signal is ~1 at EVERY lag.
        float ac_z = 1e-6f;
        for ( int i = 0; i < OdfEnvLen; ++i )
        {
            float z = m_odfEnv[i] - env_mean;
            ac_z += z * z;
        }
        float env_std = std::sqrt( ac_z / static_cast<float>( OdfEnvLen ) );
        // Published for KALEIDO_SPEECH_DEBUG so the state below stays checkable.
        m_odfEnvMean = env_mean;
        m_odfEnvStd = env_std;

        // KNOWN DEAD, measured 2026-08-22 -- left in place deliberately, see
        // docs/engine-internals.md ("Autocorrelation tempo").
        //
        // `env_std < 0.050f` was calibrated against the BAND-RMS onset function
        // this block used to consume ("a kick envelope measures std ~0.14").
        // The ODF was later swapped for the FFT-based one without re-deriving
        // the threshold, and on that scale real music sits at 0.021..0.038 --
        // so this gate has been closed permanently ever since and m_acConf
        // reads exactly 0.000 on all 45 corpus clips. Since
        // `rhythm = max(kick_rhythm, m_acConf)` and the BPM fusion below is
        // guarded by `m_acConf > 0.35f`, the entire tempo autocorrelation
        // currently contributes nothing.
        //
        // Simply lowering the threshold does NOT fix it. Measured with the gate
        // forced open across beat-driven and beatless material, neither the
        // autocorrelation peak nor its prominence separates the two: Kai Tracid
        // (trance) peaks at 0.609 but The Prodigy at 0.167, BELOW Alcest
        // (ambient) at 0.427, and prominence sits at ~1.0 for everything. The
        // onset envelope itself does not carry the distinction, so reviving
        // this needs a different ODF, not a different constant.
        if ( env_mean < 0.010f || env_std < 0.050f )
        {
            m_acConf *= 0.98f;
        }
        else
        {
            float best_ac = 0.f;
            int   best_lag = 0;
            for ( int lag = lag_lo; lag <= lag_hi; ++lag )
            {
                float ac = 0.f;
                for ( int i = 0; i + lag < OdfEnvLen; ++i )
                    ac += ( m_odfEnv[i] - env_mean ) * ( m_odfEnv[i + lag] - env_mean );
                if ( ac > best_ac )
                {
                    best_ac = ac;
                    best_lag = lag;
                }
            }
            if ( best_lag > 0 )
            {
                float bpm = static_cast<float>( 60 * EnvRate ) / static_cast<float>( best_lag );
                float conf = best_ac / ac_z;
                m_acConf = 0.90f * m_acConf + 0.10f * std::min( conf * 2.f, 1.f );
                m_acBPM = ( m_acBPM < 1.f ) ? bpm : 0.90f * m_acBPM + 0.10f * bpm;
            }
        }
    }

    // ---- Spectral Centroid (6-band, log-spaced frequency weights) ----
    // Each weight is the log-normalised centre frequency of that band,
    // mapped to [0..1] over the audible range (20 Hz – 20 kHz).
    //   pos = (log10(fc) - log10(20)) / (log10(20000) - log10(20))
    //   sub_bass  fc≈ 40 Hz  → 0.10
    //   bass     fc≈100 Hz  → 0.23
    //   low_mid   fc≈275 Hz  → 0.38
    //   mid      fc≈1000 Hz → 0.57
    //   upper_mid fc≈3500 Hz → 0.75
    //   high     fc≈13000 Hz→ 0.94
    static const float CentroidWeights[6] = { 0.10f, 0.23f, 0.38f, 0.57f, 0.75f, 0.94f };
    float              bands6[6] = { sub_bass, bass, low_mid, mid, upper_mid, high };

    float total_energy = 1e-6f;
    float raw_centroid = 0.f;
    for ( int k = 0; k < 6; ++k )
    {
        total_energy += bands6[k];
        raw_centroid += bands6[k] * CentroidWeights[k];
    }
    raw_centroid /= total_energy;

    // Very slow smoothing: colour temperature should drift like sunrise/sunset,
    // not flash with every transient.
    float smoothed_centroid = 0.98f * m_features.spectralCentroid + 0.02f * raw_centroid;

    // ---- Zero-Crossing Rate (ZCR) ----
    // Normalise: typical tonal music sits at 0-0.10 crossings/sample,
    // noise/harsh textures reach 0.25+.  Clip to [0,1].
    float raw_zcr = ( numFrames > 0 ) ? static_cast<float>( crossings ) / static_cast<float>( numFrames ) : 0.f;
    m_sZCR = 0.92f * m_sZCR + 0.08f * std::min( raw_zcr / 0.25f, 1.f );

    // ---- Spectral Flatness Measure (SFM) ----
    // Geometric mean / Arithmetic mean of the 6 band energies -- on the LINEAR
    // band RMS. It used the dB-normalised 0..1 bands before, and at any audible
    // level those all sit in the same 0.4..0.7 window, so the ratio read 0.994
    // for every track in an 80-track corpus: yet another instance of the
    // "ratios after dB compression are meaningless" trap documented at the
    // classifier and the drop detector.
    // SFM = 0: one dominant band (pure drone), SFM = 1: even energy (noise).
    {
        float b[6] = { m_sSubBass, m_sBass, m_sLowMid, m_sMid, m_sUpperMid, m_sHigh };
        float log_sum = 0.f, sum_b = 1e-6f;
        for ( int k = 0; k < 6; ++k )
        {
            log_sum += std::log( b[k] + 1e-6f );
            sum_b += b[k];
        }
        float geo_mean = std::exp( log_sum / 6.f );
        float arith_mean = sum_b / 6.f;
        float raw_sfm = ( arith_mean > 1e-6f ) ? geo_mean / arith_mean : 0.f;
        m_sSFM = 0.93f * m_sSFM + 0.07f * std::min( raw_sfm, 1.f );
    }

    // ---- Log Attack Time (onset sharpness) ----
    // Measures how quickly the overall level rises frame-to-frame.
    // Fast rise (> threshold in one cycle) = sharp attack (kick, metal hit).
    // Very slow rise = pad swell, drone layer entry.
    {
        float rise = std::max( level - m_prevLevel, 0.f );
        // 0.05 per cycle = moderate attack; clip fast transients to 1.
        float raw_attack = std::min( rise / 0.05f, 1.f );
        m_attackAccum = 0.85f * m_attackAccum + 0.15f * raw_attack;
        m_prevLevel = level;
    }

    // ---- BPM estimation from inter-beat intervals ----
    // Store the time (in samples) between the last BPMHistLen beats.
    // Smooth the resulting BPM to avoid jitter.
    // Octave folding: tempo estimators readily lock onto half or double the true
    // tempo (kicks on every 2nd beat, or a busy hi-hat grid).  Fold every
    // estimate into the canonical [70..180) BPM dance range — visually, pulsing
    // at exactly half/double tempo is still ON the grid, so a folded estimate is
    // always safe, while an unfolded 240 would pulse between the beats.
    auto fold_bpm = []( float bpm )
    {
        if ( bpm < 1.f )
            return bpm;
        while ( bpm < 70.f )
            bpm *= 2.f;
        while ( bpm >= 180.f )
            bpm *= 0.5f;
        return bpm;
    };
    float estimated_bpm = m_smoothedBPM;
    if ( is_beat )
    {
        float interval_frames = m_frameCounter - m_lastBeatFrame;
        m_lastBeatFrame = m_frameCounter;
        if ( interval_frames > 0.f && interval_frames < static_cast<float>( sampleRate ) * 3.f )
        {
            // Convert sample interval to BPM
            float bpm = fold_bpm( static_cast<float>( sampleRate ) * 60.f / interval_frames );
            m_beatIntervals[m_bpmIdx] = bpm;
            m_bpmIdx = ( m_bpmIdx + 1 ) % BPMHistLen;

            float bpm_sum = 0.f;
            for ( float v : m_beatIntervals )
                bpm_sum += v;
            float mean_bpm = bpm_sum / static_cast<float>( BPMHistLen );

            // Smooth BPM estimate (slow — tempo should drift, not jump)
            m_smoothedBPM = 0.85f * m_smoothedBPM + 0.15f * mean_bpm;
        }
    }
    // Refine the tempo with the autocorrelation estimate when it is confident
    // (robust for tracks where the kick-based inter-beat estimate is noisy).
    if ( m_acConf > 0.35f && m_acBPM > 1.f )
    {
        float ac_folded = fold_bpm( m_acBPM );
        if ( m_smoothedBPM < 1.f )
            m_smoothedBPM = ac_folded;
        else
            m_smoothedBPM = 0.97f * m_smoothedBPM + 0.03f * ac_folded;
    }
    m_smoothedBPM = fold_bpm( m_smoothedBPM );

    // Normalise BPM to [0,1] over 40..200 BPM — every frame, not only on beats.
    estimated_bpm = std::max( 0.f, std::min( ( m_smoothedBPM - 40.f ) / 160.f, 1.f ) );

    // ---- Rhythm strength: beat-interval (tempo) consistency × recency ----
    // Regular, recent beats → ~1; irregular / no recent beats / speech → ~0.
    float frames_since_beat = m_frameCounter - m_lastBeatFrame;
    float recency = std::exp( -frames_since_beat / ( 2.0f * static_cast<float>( sampleRate ) ) ); // ~2 s
    float ib_mean = 0.f;
    for ( float v : m_beatIntervals )
        ib_mean += v;
    ib_mean /= static_cast<float>( BPMHistLen );
    float ib_var = 0.f;
    for ( float v : m_beatIntervals )
    {
        float d = v - ib_mean;
        ib_var += d * d;
    }
    ib_var /= static_cast<float>( BPMHistLen );
    float ib_cv = ( ib_mean > 1e-3f ) ? std::sqrt( ib_var ) / ib_mean : 1.f;
    float kick_rhythm = std::max( 0.f, 1.f - ib_cv ) * recency;
    // A steady onset envelope (autocorrelation confidence) also means "rhythmic",
    // so genres without a strong kick still register a rhythm.
    float rhythm = std::max( kick_rhythm, m_acConf );
    m_sRhythm = 0.90f * m_sRhythm + 0.10f * rhythm;

    // ---- Continuous beat phase 0..1 (wraps every beat) from the tempo ----
    float beat_phase = 0.f;
    if ( m_smoothedBPM > 1.f )
    {
        float beat_period_frames = static_cast<float>( sampleRate ) * 60.f / m_smoothedBPM;
        if ( beat_period_frames > 1.f )
        {
            float ph = frames_since_beat / beat_period_frames;
            beat_phase = ph - std::floor( ph );
        }
    }

    // True downbeat (bar tracking).  Every detected beat's strength is
    // accumulated into its position within the 4-beat bar (with per-bar decay);
    // the consistently-strongest position is the musical "1" — instead of the
    // old "every 4th wrap from an arbitrary start", the accent now lands on the
    // actual bar line (kick/accent on the 1 outweighs snares on 2 & 4).
    if ( is_beat )
    {
        // A beat firing just before the phase wrap belongs to the NEXT position.
        int slot = ( m_prevBeatPhase > 0.5f ) ? ( ( m_barBeat + 1 ) & 3 ) : m_barBeat;
        m_barAccum[slot] = 0.80f * m_barAccum[slot] + ( 0.4f + beat_str );
    }
    if ( m_smoothedBPM > 1.f && m_prevBeatPhase > 0.65f && beat_phase < 0.35f )
    {
        m_barBeat = ( m_barBeat + 1 ) & 3;
        int best = 0;
        for ( int k = 1; k < 4; ++k )
            if ( m_barAccum[k] > m_barAccum[best] )
                best = k;
        if ( m_barBeat == best )
            m_downbeatPulse = 1.f;
    }
    m_prevBeatPhase = beat_phase;
    float downbeat = m_downbeatPulse;

    // ---- Arousal & Valence (Russell/Thayer axes) ----
    // Every ingredient and weight below is MEASURED, not guessed: 80 corpus
    // tracks, genre priors as ground truth (death metal IS high-arousal, a
    // Satie Gymnopedie is not; "Shiny Happy People" IS high-valence, "Ohne
    // dich" is not). Per-ingredient AUC decided membership, per-track-median
    // p10/p90 provide the normalisation anchors. Tools/mood_axes.md has the
    // full tables and how to re-run the sweep.
    //
    // The literature split (PVAN et al.) holds in our data too: arousal lives
    // in rhythm/flux/tempo, valence in harmony/consonance -- and valence is
    // the fundamentally harder axis for every system in the field.
    auto nrm = []( float v, float lo, float hi )
    {
        return std::max( 0.f, std::min( ( v - lo ) / ( hi - lo ), 1.f ) );
    };

    // Arousal: AUC on the corpus -- flux 0.911, rhythm 0.885, tempo 0.849,
    // sharpness 0.802. The old formula's biggest term was the AGC-normalised
    // level at AUC 0.557: the AGC exists to remove exactly the loudness
    // differences that term was supposed to measure, so it measured nothing.
    float arousal = 0.30f * nrm( spectral_flux, 0.019f, 0.086f )
                    + 0.30f * m_sRhythm
                    + 0.22f * nrm( estimated_bpm, 0.313f, 0.578f )
                    + 0.18f * nrm( m_sSharpness, 0.279f, 0.326f );

    // Valence: key clarity 0.753, consonance (1 - roughness) 0.753, and the
    // tonic-third major/minor estimate. Centroid (0.484) and the 6-band SFM
    // (0.452) measured at chance level for valence and are out; both previous
    // dead ingredients are documented at their computation sites.
    float valence = 0.38f * nrm( m_sKeyClarity, 0.652f, 0.805f )
                    + 0.38f * ( 1.f - m_sRoughness )
                    + 0.24f * m_sMode;

    // Dev hook: KALEIDO_FORCE_MOOD="v,a" pins both axes, so the colour grade
    // and every other mood consumer can be A/B-captured against the SAME
    // track with forced extremes -- the only way to verify a slow, subtle
    // grade on a renderer that is not frame-deterministic.
    {
        static const QByteArray Forced = qgetenv( "KALEIDO_FORCE_MOOD" );
        if ( !Forced.isEmpty() )
        {
            const QList<QByteArray> parts = Forced.split( ',' );
            if ( parts.size() == 2 )
            {
                valence = qBound( 0.f, parts[0].toFloat(), 1.f );
                arousal = qBound( 0.f, parts[1].toFloat(), 1.f );
            }
        }
    }

    // KALEIDO_MOOD_DEBUG=1 prints the mood model's ingredients once a second.
    // Same lesson as the speech gate: a composite score can sit at a plausible
    // value while half its inputs are dead, and only the ingredients show it.
    {
        static const bool Dbg = qEnvironmentVariableIsSet( "KALEIDO_MOOD_DEBUG" );
        static int        dbg_n = 0;
        if ( Dbg && ( ++dbg_n % 100 ) == 0 )
            fprintf( stderr,
                     "MOOD val=%.3f aro=%.3f | mode=%.3f keyClar=%.3f centroid=%.3f "
                     "sfm=%.3f rough=%.3f roughRaw=%.4f rhythm=%.3f | nLvl=%.3f bpmN=%.3f flux=%.3f sharp=%.3f "
                     "ambient=%.3f\n",
                     valence, arousal, m_sMode, m_sKeyClarity, smoothed_centroid,
                     m_sSFM, m_sRoughness, m_roughRaw, m_sRhythm, n_level, estimated_bpm, spectral_flux,
                     m_sSharpness, m_ambientFactor );
    }

    // ---- Dynamic timing scale (for RenderPipeline / EffectShader) ----
    // Drives how fast scenes/shaders cycle:
    //   timingScale < 1 → ALL times scaled longer (longer solos, slower cross-fades)
    //   timingScale > 1 → times shortened (quicker cuts)
    // The beat-mode end now tracks arousal, so a calm song cycles gently while an
    // energetic track cuts fast; ambient/drone collapses to very long holds.
    // Range: ~0.10 (pure drone) .. ~2.8 (fast, high-arousal beat music).
    // Tempo is now a primary driver, so faster music = shorter scenes AND shorter
    // cross-fades (both are divided by timingScale in RenderPipeline), arousal adds
    // intensity on top.  estimatedBPM is normalised 0..1 over 40..200 BPM.
    float beat_scale = 0.7f + 0.9f * arousal + 1.2f * estimated_bpm; // 0.7 .. ~2.8
    float timing_scale = beat_scale * ( 1.f - m_ambientFactor )
                         + 0.10f * m_ambientFactor; // ambient: down to 0.10×
    // Smooth slowly so transitions aren't abrupt
    float prev_timing_scale = m_features.timingScale;
    timing_scale = 0.998f * prev_timing_scale + 0.002f * timing_scale;

    // ---- Beat-triggered discrete changes (sub-sampled to avoid restlessness) ----
    // FIX for "too restless": sides change only every 4 beats, flip every 8.
    // In ambient mode (few/no beats) these rarely trigger anyway.
    int   beat_sides_hint = m_currentSides;
    float audio_flip = m_flipDir;

    // Discrete visual changes are gated by ambientFactor.
    // In ambient / drone mode (ambientFactor > 0.4) these changes are suppressed
    // entirely — a static drone like Köner's Daikan should produce a single,
    // slowly evolving geometry that holds for minutes, not one that flips every
    // few seconds due to false beats.
    if ( is_beat && m_ambientFactor < 0.4f )
    {
        ++m_beatCount;

        // Change kaleidoscope symmetry only every 16 beats (≈ every 4 bars) so it
        // is a rare, deliberate event rather than a constant churn.
        if ( m_beatCount % 16 == 0 )
        {
            static const int SidesSet[] = { 3, 4, 6, 8, 10, 12 };
            static const int SidesCount = 6;
            int              idx;
            do
            {
                idx = rand() % SidesCount;
            } while ( SidesSet[idx] == m_currentSides );
            m_currentSides = SidesSet[idx];
            beat_sides_hint = m_currentSides;
        }

        // Flip rotation only every 8 beats, only on very strong beats (strength > 0.6)
        if ( m_beatCount % 8 == 0 && beat_str > 0.6f && ( rand() % 10 ) < 4 )
        {
            m_flipDir = -m_flipDir;
            audio_flip = m_flipDir;
        }
    }

    // ========================================================================
    // FFT-based spectral analysis
    // ========================================================================
    // Linearise ring buffer: oldest sample first → in-place FFT input.
    // After the per-sample loop above, m_ringWrite points to the slot that
    // will be overwritten NEXT, so (m_ringWrite + i) % FFTSize gives sample i
    // in chronological order (oldest i=0, newest i=FFTSize-1).
    for ( int i = 0; i < FFTSize; ++i )
    {
        int src = ( m_ringWrite + i ) % FFTSize;
        m_fftRe[i] = m_ringBuf[src] * m_fftWin[i]; // apply Hann window
        m_fftIm[i] = 0.f;
    }
    radix2fft( m_fftRe, m_fftIm, FFTSize );

    // Compute magnitude spectrum for k = 0 .. FFTHalf-1.
    // (The upper half k > FFTHalf is conjugate-symmetric; discard it.)
    float mags[FFTHalf];
    float total_mag_sq = 1e-10f;
    for ( int k = 0; k < FFTHalf; ++k )
    {
        float mag = std::sqrt( m_fftRe[k] * m_fftRe[k] + m_fftIm[k] * m_fftIm[k] );
        mags[k] = mag;
        total_mag_sq += mag * mag;
    }

    // ---- HPSS-inspired harmonicity (see m_sSpecSim in the header) ----
    // Cosine similarity of this frame's magnitude spectrum vs. the previous one.
    // This measures CONTENT (harmonic-sustained vs. percussive-transient), which
    // is what actually separates drone/ambient music from beat music — unlike
    // the old loudness-variance test, which misfiled steady full-mix electronic
    // music as "ambient".  (Cheap stand-in for full median-filter HPSS.)
    {
        float dot = 0.f, na = 1e-9f, nb = 1e-9f;
        for ( int k = 1; k < FFTHalf; ++k )
        {
            dot += mags[k] * m_prevMags[k];
            na += mags[k] * mags[k];
            nb += m_prevMags[k] * m_prevMags[k];
        }
        if ( total_mag_sq > 1e-6f ) // silence: hold (nothing to classify)
        {
            float sim = dot / std::sqrt( na * nb );
            if ( sim < m_sSpecSim )
                m_sSpecSim = 0.70f * m_sSpecSim + 0.30f * sim; // dip fast
            else
                m_sSpecSim = 0.995f * m_sSpecSim + 0.005f * sim; // recover slow
        }

        std::memcpy( m_prevMags, mags, sizeof( mags ) );
    }

    // ---- 32-band log-spaced spectrum for the analyzer effects ----
    // Group the FFT magnitudes into perceptually-spaced bands (~40 Hz..16 kHz)
    // and self-normalise with a decaying-peak reference so the loudest band sits
    // near 1.0 and the rest scale under it (a lively, volume-independent analyzer).
    {
        const int   NB = AudioFeatures::SpectrumBands;
        const float f_lo = 40.f, f_hi = 16000.f;
        const float bin_hz = static_cast<float>( sampleRate ) / static_cast<float>( FFTSize );
        float       raw[AudioFeatures::SpectrumBands];
        float       frame_max = 1e-6f;
        for ( int b = 0; b < NB; ++b )
        {
            float f0 = f_lo * std::pow( f_hi / f_lo, static_cast<float>( b ) / static_cast<float>( NB ) );
            float f1 = f_lo * std::pow( f_hi / f_lo, static_cast<float>( b + 1 ) / static_cast<float>( NB ) );
            int   k0 = std::max( 1, static_cast<int>( f0 / bin_hz ) );
            int   k1 = std::min( FFTHalf - 1, std::max( k0 + 1, static_cast<int>( f1 / bin_hz ) ) );
            float acc = 0.f;
            int   cnt = 0;
            for ( int k = k0; k < k1; ++k )
            {
                acc += mags[k] * mags[k];
                ++cnt;
            }
            raw[b] = ( cnt > 0 ) ? std::sqrt( acc / static_cast<float>( cnt ) ) : 0.f;
            frame_max = std::max( frame_max, raw[b] );
        }
        m_specRef = std::max( m_specRef * 0.98f, frame_max ); // slow-decaying peak
        m_specRef = std::max( m_specRef, 1e-4f );             // floor → silence stays low
        for ( int b = 0; b < NB; ++b )
        {
            float v = std::min( raw[b] / m_specRef, 1.f );
            v = std::pow( v, 0.6f );                             // lift mid bands for visibility
            m_sSpectrum[b] = 0.55f * m_sSpectrum[b] + 0.45f * v; // fast attack, mild smoothing
        }

        // FFT-based onset detection function (see m_odfFFT in the header):
        // per-band flux against a PEAK-HOLD reference (max of the last ~200 ms,
        // exponential release).  Close partials in a drone genuinely beat: their
        // interference redistributes band energy every hop, so plain frame-to-
        // frame flux "fires" on perfectly steady material.  Against the recent
        // per-band MAXIMUM, a steady oscillation stays below its own peak
        // (ODF = 0) and only genuinely NEW energy — a kick, a snare, a fresh
        // layer — rises above it.
        {
            float pos = 0.f, ref = 1e-6f;
            float pos_g[3] = { 0.f, 0.f, 0.f };
            float ref_g[3] = { 1e-6f, 1e-6f, 1e-6f };
            for ( int b = 0; b < NB; ++b )
            {
                float r = m_bandRef32[b];
                float d = raw[b] - r;
                int   g = ( b < 8 ) ? 0 : ( b < 20 ) ? 1
                                                     : 2; // kick / snare / hat bands
                if ( d > 0.f )
                {
                    pos += d;
                    pos_g[g] += d;
                }
                ref += r;
                ref_g[g] += r;
                m_bandRef32[b] = std::max( raw[b], r * 0.985f ); // ~650 ms release: slow
                // enough that beating drone partials stay under their recent peak
                // (a kick still exceeds its half-decayed reference many times over)
            }
            m_odfFFT = ( frame_max > 1e-4f ) ? ( pos / ref ) : 0.f;

            // Instrument-separated onsets: the same spike test as the global
            // onset, but per band group, each against its own running average.
            for ( int g = 0; g < 3; ++g )
            {
                float odf = ( frame_max > 1e-4f ) ? ( pos_g[g] / ref_g[g] ) : 0.f;
                if ( m_onsetCoolGrp[g] > 0 )
                {
                    --m_onsetCoolGrp[g];
                }
                else if ( odf > m_onsetAvgGrp[g] * 2.2f + 0.060f )
                {
                    float str = std::min( odf / ( m_onsetAvgGrp[g] * 2.2f + 1e-4f ) - 1.f, 1.f );
                    m_onsetEnvGrp[g] = std::max( m_onsetEnvGrp[g], str );
                    m_onsetCoolGrp[g] = 12; // >= 120 ms between hits
                }
                m_onsetAvgGrp[g] = 0.95f * m_onsetAvgGrp[g] + 0.05f * odf;
                m_onsetEnvGrp[g] *= 0.93f; // ~150 ms decay
            }
        }

        // ---- Section-change detection (Strophe / Refrain / Bridge) ----
        // Real-time Foote-style novelty: a short-term (~2.5 s) EMA of the
        // NORMALISED band shape (and of the total band energy) is compared
        // against a long-term (~18 s) one.  Within a section both agree; when
        // the arrangement changes (chorus: new instruments, more energy) the
        // fast average pulls away -> the cosine distance spikes once.
        {
            float sum = 1e-6f;
            for ( int b = 0; b < NB; ++b )
                sum += raw[b];
            // Bias-corrected EMAs: alpha = max(nominal, 1/(n+1)) makes both
            // averages track the true mean from the very first block instead
            // of converging up from their zero initialisation.  (Without this
            // the slow level average lags for ~1 min and the level term reads
            // as permanent "novelty" -> phantom triggers on the cooldown grid.)
            float a_bias = 1.f / static_cast<float>( m_secWarm + 1 );
            float a_f = std::max( 0.004f, a_bias );   // tau ~2.5 s at 100 blocks/s
            float a_s = std::max( 0.00056f, a_bias ); // tau ~18 s
            float a_p = std::max( 0.01f, a_bias );    // tau ~1 s (fingerprint)
            for ( int b = 0; b < NB; ++b )
            {
                float sh = raw[b] / sum;
                m_secFast[b] += a_f * ( sh - m_secFast[b] );
                m_secSlow[b] += a_s * ( sh - m_secSlow[b] );
                m_secPrint[b] += a_p * ( sh - m_secPrint[b] );
            }
            m_secFastLvl += a_f * ( sum - m_secFastLvl );
            m_secSlowLvl += a_s * ( sum - m_secSlowLvl );

            float dot_fs = 0.f, n_f = 1e-9f, n_s = 1e-9f;
            for ( int b = 0; b < NB; ++b )
            {
                dot_fs += m_secFast[b] * m_secSlow[b];
                n_f += m_secFast[b] * m_secFast[b];
                n_s += m_secSlow[b] * m_secSlow[b];
            }
            float shape_dist = 1.f - dot_fs / std::sqrt( n_f * n_s );
            float lvl_dist = std::fabs( std::log( ( m_secFastLvl + 1e-5f )
                                                  / ( m_secSlowLvl + 1e-5f ) ) );
            m_secNovelty = shape_dist * 3.0f + lvl_dist * 0.5f;

            if ( m_secWarm < 1000000 )
                ++m_secWarm;
            if ( m_secCooldown > 0 )
                --m_secCooldown;

            // Trigger: enough history for the averages to mean something
            // (>= 8 s), music actually playing, not silence, novelty clearly
            // above the steady-state floor.  The cooldown keeps sections
            // >= ~12 s apart (no verse is shorter).
            if ( m_secWarm > 800 && m_secCooldown == 0 && m_sMusicPresence > 0.5f && sum > 1e-3f
                 && m_secNovelty > 0.20f )
            {
                ++m_sectionCount;
                m_secCooldown = 1200;
                // Re-anchor the long-term average fully onto the new section
                // so the novelty tail dies out (no echo triggers).
                for ( int b = 0; b < NB; ++b )
                    m_secSlow[b] = m_secFast[b];
                m_secSlowLvl = m_secFastLvl;

                // ---- Song-structure memory: recognise returning sections ----
                // Match the ~1 s fingerprint against every stored section
                // print (cosine similarity).  A close match means this section
                // has been heard before (chorus #2 = chorus #1) -> same id;
                // otherwise store it as a new section (LRU replacement).
                {
                    int   best = -1;
                    float best_sim = 0.f;
                    float n_p = 1e-9f;
                    for ( int b = 0; b < NB; ++b )
                        n_p += m_secPrint[b] * m_secPrint[b];
                    for ( int i = 0; i < m_secPrintN; ++i )
                    {
                        float d = 0.f, n_q = 1e-9f;
                        for ( int b = 0; b < NB; ++b )
                        {
                            d += m_secPrint[b] * m_secPrints[i][b];
                            n_q += m_secPrints[i][b] * m_secPrints[i][b];
                        }
                        float sim = d / std::sqrt( n_p * n_q );
                        if ( sim > best_sim )
                        {
                            best_sim = sim;
                            best = i;
                        }
                    }
                    if ( best >= 0 && best_sim > 0.988f )
                    {
                        // Returning section: refresh its print (running blend).
                        m_secCurId = best;
                        m_secKnown = true;
                        for ( int b = 0; b < NB; ++b )
                            m_secPrints[best][b] += 0.3f * ( m_secPrint[b] - m_secPrints[best][b] );
                    }
                    else
                    {
                        // New section: store (replace the least recently used).
                        // The recycled slot's id is REUSED -- the host must
                        // read sectionKnown (false here) to tell this apart
                        // from a genuine return of whatever section used to
                        // own that slot.
                        int slot = m_secPrintN;
                        if ( m_secPrintN < MaxSectionPrints )
                            ++m_secPrintN;
                        else
                        {
                            slot = 0;
                            for ( int i = 1; i < MaxSectionPrints; ++i )
                                if ( m_secPrintUse[i] < m_secPrintUse[slot] )
                                    slot = i;
                        }
                        std::memcpy( m_secPrints[slot], m_secPrint, sizeof( m_secPrint ) );
                        m_secCurId = slot;
                        m_secKnown = false;
                    }
                    m_secPrintUse[m_secCurId] = m_sectionCount; // LRU stamp
                    fprintf( stderr, "SECTION change #%d -> id %d (%s, sim %.3f, "
                                     "novelty %.3f, t=%.1fs)\n",
                             m_sectionCount, m_secCurId,
                             ( best >= 0 && best_sim > 0.988f ) ? "known" : "new",
                             best_sim, m_secNovelty, static_cast<float>( m_secWarm ) * 0.01f );
                }
            }
        }
    }

    // ---- Spectral Rolloff ----
    // Find the bin below which 85% of total spectral energy lies.
    // Low rolloff: dark sub-bass drone.  High rolloff: cymbals / bright pads.
    {
        float cum_mag_sq = 0.f;
        int   r_bin = FFTHalf - 1;
        for ( int k = 1; k < FFTHalf; ++k )
        {
            cum_mag_sq += mags[k] * mags[k];
            if ( cum_mag_sq >= 0.85f * total_mag_sq )
            {
                r_bin = k;
                break;
            }
        }
        float roll_hz = static_cast<float>( r_bin ) * static_cast<float>( sampleRate ) / static_cast<float>( FFTSize );
        float roll_norm = std::min( roll_hz / ( static_cast<float>( sampleRate ) * 0.5f ), 1.f );
        m_sRolloff = 0.95f * m_sRolloff + 0.05f * roll_norm;
    }

    // ---- Spectral Spread (standard deviation around FFT centroid) ----
    // Narrow spread: pure sine / single drone tone.  Wide: full-band noise.
    {
        float w_sum = 0.f, m_sum = 1e-6f;
        for ( int k = 1; k < FFTHalf; ++k )
        {
            float f = static_cast<float>( k ) * static_cast<float>( sampleRate ) / static_cast<float>( FFTSize );
            w_sum += f * mags[k];
            m_sum += mags[k];
        }
        float cent_hz = w_sum / m_sum;

        float var_sum = 0.f;
        for ( int k = 1; k < FFTHalf; ++k )
        {
            float f = static_cast<float>( k ) * static_cast<float>( sampleRate ) / static_cast<float>( FFTSize );
            float d = f - cent_hz;
            var_sum += d * d * mags[k];
        }
        float spread_norm = std::min( std::sqrt( var_sum / m_sum ) / 5000.f, 1.f );
        m_sSpread = 0.95f * m_sSpread + 0.05f * spread_norm;
    }

    // ---- Roughness (sensory dissonance, Plomp-Levelt / Sethares) ----
    // Beating between nearby partials creates roughness.  For each bin we sum the
    // dissonance contribution of a few higher neighbours, weighted by the
    // amplitude product and the Plomp-Levelt curve.  Restricted to the musical
    // band and a small window so it stays real-time.
    {
        const int r_lo = std::max(
            2, static_cast<int>( 50.f * static_cast<float>( FFTSize ) / static_cast<float>( sampleRate ) ) );
        const int r_hi = std::min( FFTHalf - 1, static_cast<int>( 5000.f * static_cast<float>( FFTSize )
                                                                  / static_cast<float>( sampleRate ) ) );
        const int r_win = 10;
        float     rough = 0.f;
        for ( int k = r_lo; k < r_hi; ++k )
        {
            float ak = mags[k];
            if ( ak < 1e-6f )
                continue;
            float fk = static_cast<float>( k ) * static_cast<float>( sampleRate ) / static_cast<float>( FFTSize );
            float s = 0.24f / ( 0.0207f * fk + 18.96f ); // critical-band scaling
            int   j_hi = std::min( k + r_win, r_hi - 1 );
            for ( int j = k + 1; j <= j_hi; ++j )
            {
                float fj = static_cast<float>( j ) * static_cast<float>( sampleRate ) / static_cast<float>( FFTSize );
                float x = s * ( fj - fk );
                float d = std::exp( -3.5f * x ) - std::exp( -5.75f * x ); // dissonance
                rough += ak * mags[j] * d;
            }
        }
        // The old scale (ratio * 4, clamped at 1) saturated on every track of
        // an 80-track corpus -- the clamp WAS the output. Keep the raw ratio
        // for the debug trace and map through a measured range instead.
        m_roughRaw = rough / ( total_mag_sq + 1e-6f );
        // Anchors are the p10/p90 of per-track medians over the 80-track corpus
        // (0.241 / 0.399): consonant pop sits near 0, distorted metal near 1.
        float raw_rough = std::max( 0.f, std::min( ( m_roughRaw - 0.24f ) / 0.16f, 1.f ) );
        m_sRoughness = 0.93f * m_sRoughness + 0.07f * raw_rough;
    }

    // ---- Chroma vector + Key/Mode (Krumhansl-Kessler 1982 profiles) ----
    // Each FFT bin is mapped to one of 12 pitch classes (C=0 .. B=11)
    // using MIDI note arithmetic.  Energy is accumulated per pitch class,
    // then compared against the KK major and minor profiles.
    // Best-matching profile family (major vs. minor) across all 12 key
    // transpositions determines musicalMode (0=minor, 1=major).
    {
        float chroma[12] = {};
        for ( int k = 3; k < FFTHalf; ++k )
        {
            float f = static_cast<float>( k ) * static_cast<float>( sampleRate ) / static_cast<float>( FFTSize );
            if ( f < 60.f || f > 5000.f )
                continue; // musical pitch range only
            // MIDI note: 69 + 12 * log2(f / 440)  → pitch class 0..11
            float midi = 69.f + 12.f * std::log2( f / 440.f );
            int   pitch_class = static_cast<int>( std::round( midi ) ) % 12;
            if ( pitch_class < 0 )
                pitch_class += 12;
            chroma[pitch_class] += mags[k];
        }
        // L1-normalise then blend into slow-moving smoothed chroma
        float c_sum = 1e-6f;
        for ( int i = 0; i < 12; ++i )
            c_sum += chroma[i];
        for ( int i = 0; i < 12; ++i )
        {
            chroma[i] /= c_sum;
            m_smoothedChroma[i] = 0.92f * m_smoothedChroma[i] + 0.08f * chroma[i];
        }

        // Krumhansl-Kessler key profiles (original 1982 tonal hierarchy ratings)
        static const float MajorKK[12] = {
            6.35f, 2.23f, 3.48f, 2.33f, 4.38f, 4.09f,
            2.52f, 5.19f, 2.39f, 3.66f, 2.29f, 2.88f };
        static const float MinorKK[12] = {
            6.33f, 2.68f, 3.52f, 5.38f, 2.60f, 3.53f,
            2.54f, 4.75f, 3.98f, 2.69f, 3.34f, 3.17f };

        // PEARSON correlation, not a raw dot product. The Krumhansl-Schmuckler
        // algorithm mean-centres both vectors, and that is not pedantry: the
        // profiles have large means (they sum to 41.8 and 44.5), so a dot
        // product against any broadly-spread chroma is dominated by
        // profileMean x chromaSum and the major/minor ratio collapses to the
        // constant 41.8/(41.8+44.5) = 0.484. Measured over 80 tracks the old
        // ratio sat at 0.489..0.490 for EVERYTHING -- happy pop and funeral
        // doom alike. Mean-centring removes the shared offset, which is the
        // whole point of the original algorithm.
        float c_mean = 0.f;
        for ( int i = 0; i < 12; ++i )
            c_mean += m_smoothedChroma[i];
        c_mean /= 12.f;
        float c_var = 1e-9f;
        for ( int i = 0; i < 12; ++i )
        {
            const float d = m_smoothedChroma[i] - c_mean;
            c_var += d * d;
        }
        // Profile deviations and their variances are compile-time constants.
        static float s_maj_dev[12], s_min_dev[12], s_maj_var = 0.f, s_min_var = 0.f;
        static bool  s_profiles_ready = false;
        if ( !s_profiles_ready )
        {
            float m_m = 0.f, m_n = 0.f;
            for ( int i = 0; i < 12; ++i )
            {
                m_m += MajorKK[i];
                m_n += MinorKK[i];
            }
            m_m /= 12.f;
            m_n /= 12.f;
            for ( int i = 0; i < 12; ++i )
            {
                s_maj_dev[i] = MajorKK[i] - m_m;
                s_maj_var += s_maj_dev[i] * s_maj_dev[i];
                s_min_dev[i] = MinorKK[i] - m_n;
                s_min_var += s_min_dev[i] * s_min_dev[i];
            }
            s_profiles_ready = true;
        }
        float best_major = -1e9f, best_minor = -1e9f;
        float corr_sum = 0.f, best_any = -1e9f;
        int   best_t = 0;
        for ( int t = 0; t < 12; ++t )
        {
            float maj_cov = 0.f, min_cov = 0.f;
            for ( int i = 0; i < 12; ++i )
            {
                const float d = m_smoothedChroma[i] - c_mean;
                maj_cov += d * s_maj_dev[( i - t + 12 ) % 12];
                min_cov += d * s_min_dev[( i - t + 12 ) % 12];
            }
            const float maj_corr = maj_cov / std::sqrt( c_var * s_maj_var );
            const float min_corr = min_cov / std::sqrt( c_var * s_min_var );
            if ( maj_corr > best_major )
                best_major = maj_corr;
            if ( min_corr > best_minor )
                best_minor = min_corr;
            corr_sum += maj_corr + min_corr;
            if ( std::max( maj_corr, min_corr ) > best_any )
            {
                best_any = std::max( maj_corr, min_corr );
                best_t = t;
            }
        }
        // Major or minor is decided at the TONIC THIRD, not by which profile
        // correlates best. The profile contest cannot work: C major and A minor
        // contain the same pitches, so the best match over all transpositions is
        // always a relative pair and the difference collapsed to ~0.49 on all 80
        // corpus tracks, twice (dot product AND Pearson). What actually differs
        // between C major and C minor is one semitone: E versus Eb. So find the
        // tonic from the best profile match, then compare the chroma weight on
        // the major third against the minor third above it.
        const float c_m3 = m_smoothedChroma[( best_t + 4 ) % 12];
        const float cm3 = m_smoothedChroma[( best_t + 3 ) % 12];
        float       raw_mode = 0.5f + 0.5f * ( c_m3 - cm3 ) / ( c_m3 + cm3 + 1e-9f );
        // Very slow smoothing (~3 s) so mode reflects atmosphere, not noise.
        m_sMode = 0.97f * m_sMode + 0.03f * raw_mode;

        // Key clarity: with proper Pearson correlations the best match IS the
        // measure -- +1 means the chroma matches a key profile exactly, ~0
        // means no key explains it. The old "peak above mean, divided by the
        // peak" form is unstable now that correlations are signed: best_any can
        // legitimately sit near 0 (atonal), where that division explodes.
        (void)corr_sum;
        float raw_clarity = std::max( 0.f, std::min( best_any, 1.f ) );
        m_sKeyClarity = 0.97f * m_sKeyClarity + 0.03f * raw_clarity;

        // ---- Harmonic Change (HCDF, Harte 2006) ----
        // Project the 12-bin chroma onto the 6-D tonal centroid (three circles:
        // fifths, minor thirds, major thirds), then measure how fast that point
        // moves frame-to-frame.  Spikes on chord/key changes, ~0 on held harmony.
        const float P = 3.14159265358979f;
        float       tc[6] = { 0, 0, 0, 0, 0, 0 };
        for ( int n = 0; n < 12; ++n )
        {
            float c = m_smoothedChroma[n];
            tc[0] += c * std::sin( static_cast<float>( n ) * 7.f * P / 6.f );
            tc[1] += c * std::cos( static_cast<float>( n ) * 7.f * P / 6.f );
            tc[2] += c * std::sin( static_cast<float>( n ) * 3.f * P / 2.f );
            tc[3] += c * std::cos( static_cast<float>( n ) * 3.f * P / 2.f );
            tc[4] += 0.5f * c * std::sin( static_cast<float>( n ) * 2.f * P / 3.f );
            tc[5] += 0.5f * c * std::cos( static_cast<float>( n ) * 2.f * P / 3.f );
        }
        float hcdf = 0.f;
        for ( int i = 0; i < 6; ++i )
        {
            float d = tc[i] - m_tonalCentroid[i];
            hcdf += d * d;
            m_tonalCentroid[i] = tc[i];
        }
        hcdf = std::min( std::sqrt( hcdf ) * 4.f, 1.f ); // normalise to ~[0,1]
        m_sHCDF = 0.85f * m_sHCDF + 0.15f * hcdf;
    }

    // ---- Chroma hue: harmonic "colour" = circular mean of the chroma on the wheel ----
    // Maps the music's harmonic centre onto the colour wheel (0..1), so the key /
    // harmony drives a consistent global hue shift.  Uses the slow smoothed chroma.
    float ch_sin = 0.f, ch_cos = 0.f;
    for ( int i = 0; i < 12; ++i )
    {
        float ang = 6.28318530718f * static_cast<float>( i ) / 12.f;
        ch_sin += m_smoothedChroma[i] * std::sin( ang );
        ch_cos += m_smoothedChroma[i] * std::cos( ang );
    }
    // Smooth the hue VECTOR (not the angle) — this drifts the colour slowly and
    // continuously, even through the wheel's wrap-around, instead of jumping.
    m_hueCos = 0.99f * m_hueCos + 0.01f * ch_cos;
    m_hueSin = 0.99f * m_hueSin + 0.01f * ch_sin;
    float chroma_hue = std::atan2( m_hueSin, m_hueCos ) * 0.15915494f; // /(2π) → -0.5..0.5
    if ( chroma_hue < 0.f )
        chroma_hue += 1.f; // → 0..1

    // ---- Dominant Pitch – Harmonic Product Spectrum (HPS) ----
    // Multiply the magnitude spectrum by downsampled-by-2, -3, -4 copies.
    // The fundamental frequency of a harmonic tone produces the highest product
    // because all its harmonics reinforce at the same point.
    // Search range: 60..1200 Hz (covers bass drone through soprano melody).
    {
        const int bin_lo = std::max(
            3, static_cast<int>( 60.f * static_cast<float>( FFTSize ) / static_cast<float>( sampleRate ) ) );
        const int bin_hi = std::min(
            FFTHalf / 4 - 1,
            static_cast<int>( 1200.f * static_cast<float>( FFTSize ) / static_cast<float>( sampleRate ) ) + 1 );
        float max_hps = -1.f;
        int   pitch_bin = bin_lo;
        for ( int k = bin_lo; k < bin_hi; ++k )
        {
            if ( k * 4 >= FFTHalf )
                break;
            float hps = mags[k] * mags[k * 2] * mags[k * 3] * mags[k * 4];
            if ( hps > max_hps )
            {
                max_hps = hps;
                pitch_bin = k;
            }
        }
        float pitch_hz = static_cast<float>( pitch_bin ) * static_cast<float>( sampleRate )
                         / static_cast<float>( FFTSize );
        // Log-normalise 60..1200 Hz → 0..1
        float pitch_norm = ( std::log2( pitch_hz + 1.f ) - std::log2( 61.f ) )
                           / ( std::log2( 1201.f ) - std::log2( 61.f ) );
        pitch_norm = std::max( 0.f, std::min( pitch_norm, 1.f ) );
        // Suppress output when there is no signal
        float max_mag = 0.f;
        for ( int k = 1; k < FFTHalf; ++k )
            max_mag = std::max( max_mag, mags[k] );
        float confidence = ( max_mag > 1e-5f ) ? 1.f : 0.f;
        // Slow smoothing — HPS can octave-jump frame to frame, and several shaders
        // use the pitch for hue/scale; this keeps those colour/size changes gradual.
        m_sPitch = 0.97f * m_sPitch + 0.03f * pitch_norm * confidence;

        // MELODY: the same product spectrum, searched only from 150 Hz up.
        // Below that the bass line owns the strongest harmonic series and
        // the dominant pitch above follows it -- measured: with a loud bass
        // 34 % of frames sat under 0.15 and 1 % in the lead's range, so the
        // melody ring drew the root, not the tune.  Its own smoothed value,
        // same 0..1 scale, so a scene can pick either.
        {
            const int bin_lo2 = std::max(
                bin_lo, static_cast<int>( 150.f * static_cast<float>( FFTSize ) / static_cast<float>( sampleRate ) ) );
            float best_m = -1.f;
            int   bin_m = bin_lo2;
            for ( int k = bin_lo2; k < bin_hi; ++k )
            {
                if ( k * 4 >= FFTHalf )
                    break;
                float hps = mags[k] * mags[k * 2] * mags[k * 3] * mags[k * 4];
                if ( hps > best_m )
                {
                    best_m = hps;
                    bin_m = k;
                }
            }
            float hz_m = static_cast<float>( bin_m ) * static_cast<float>( sampleRate ) / static_cast<float>( FFTSize );
            float norm_m = ( std::log2( hz_m + 1.f ) - std::log2( 61.f ) )
                           / ( std::log2( 1201.f ) - std::log2( 61.f ) );
            norm_m = std::max( 0.f, std::min( norm_m, 1.f ) );
            m_sMelody = 0.97f * m_sMelody + 0.03f * norm_m * confidence;
        }
    }

    // ---- Delta-pitch: melodic activity (rate of dominant-pitch change) ----
    float d_pitch = std::fabs( m_sPitch - m_prevPitch );
    m_prevPitch = m_sPitch;
    m_sDeltaPitch = 0.85f * m_sDeltaPitch + 0.15f * std::min( d_pitch * 25.f, 1.f );

    // ========================================================================
    // Music vs. speech / silence classifier  ->  musicPresence (master gate)
    // ========================================================================
    // Speech (a talking video or a stream in the background) pauses between
    // words, has no periodic envelope, and packs its energy into the formant
    // bands. Music — beat-driven or a sustained ambient drone — breaks at least
    // one of those three. The score below adds the three up; each is measured
    // on a real corpus, and every constant in it comes from that measurement.
    //
    // The corpus is 40 tracks sampled evenly across a 1336-track library
    // (ambient, folk, trance, pop, rap, Schlager, death metal) plus 5 speech
    // clips, all loudness-normalised to -16 LUFS so playback volume cannot be
    // mistaken for evidence. Tools/speech_gate_corpus.md records how to rebuild
    // it and re-run the measurement.

    // ---- Level statistics over the ~6 s history ----
    // The old test was `level > 0.04`, an ABSOLUTE threshold on a dB-normalised
    // value. Every audible input clears it, so `continuity` was pinned at 1.0
    // and `gappiness` at 0.0 for speech and music alike -- two of the
    // classifier's five inputs measured nothing at all. Measured over 40 real
    // tracks and 5 speech clips: cont = 1.000 and gap = 0.000 for every single
    // one of them.
    //
    // The replacement is the classic LowEnergy feature: the fraction of the
    // window sitting well below the window's OWN mean. Being relative, it is
    // independent of playback volume, which is exactly what the absolute test
    // failed at. Speech pauses between words and sentences; music, even sparse
    // music, mostly does not.
    float env_mean = 0.f;
    for ( float v : m_envHistory )
        env_mean += v;
    env_mean /= static_cast<float>( EnvHistLen );

    float low_energy = 0.f;
    if ( env_mean > 1e-4f )
    {
        const float thr = 0.5f * env_mean;
        for ( float v : m_envHistory )
            if ( v < thr )
                low_energy += 1.f;
        low_energy /= static_cast<float>( EnvHistLen );
    }

    // ---- Beat periodicity: envelope autocorrelation over musical lags ----
    // The single trait that rescues the hard case. Sparse hip-hop -- Tone Loc's
    // "Funky Cold Medina" in the test set -- is rapped speech over a beat with
    // real gaps in it, so it looks as pause-heavy as narration and beats every
    // spectral test. What it has and speech does not is a PERIOD: its envelope
    // repeats at the bar. Lags 0.25-1.5 s cover 40-240 BPM and their halves.
    //
    // Recomputed every 8th block (~12 Hz): it is a statistic over 6 s of
    // history, so updating it faster only burns cycles in the audio thread.
    if ( ++m_beatAcCount >= 8 )
    {
        m_beatAcCount = 0;
        const float block_hz = static_cast<float>( sampleRate ) / static_cast<float>( std::max( 1, numFrames ) );
        const int   lag_lo = std::max( 2, static_cast<int>( 0.25f * block_hz ) );
        const int   lag_hi = std::min( EnvHistLen / 2, static_cast<int>( 1.5f * block_hz ) );
        float       denom = 0.f;
        for ( int i = 0; i < EnvHistLen; ++i )
        {
            const float v = m_envHistory[i] - env_mean;
            denom += v * v;
        }
        float best = 0.f;
        if ( denom > 1e-9f )
        {
            for ( int lag = lag_lo; lag < lag_hi; ++lag )
            {
                float acc = 0.f;
                for ( int i = 0; i + lag < EnvHistLen; ++i )
                {
                    // ring order does not matter for autocorrelation: the wrap
                    // contributes one spurious pair out of ~450, far below the
                    // peak this looks for
                    acc += ( m_envHistory[i] - env_mean )
                           * ( m_envHistory[i + lag] - env_mean );
                }
                best = std::max( best, acc / denom );
            }
        }
        m_sBeatAC = std::max( 0.f, std::min( best, 1.f ) );
    }
    float beat_ac = m_sBeatAC;

    // ---- Spectral shape as LINEAR energy ratios ----
    // The old `bassPresence` was min((sub_bass + bass) * 2, 1) on dB-normalised
    // bands. to_norm maps -60..0 dB onto 0..1, so at any audible level the two
    // bass bands alone sum past 0.5 and the doubling clamps the result to
    // exactly 1.0 -- measured 1.000 on all 45 clips, speech included. It was
    // measuring loudness, not bass, and as the FIRST factor of a product it
    // zeroed the whole score.
    //
    // Taking the ratio in the dB-normalised domain does not fix it either:
    // that compresses a 4:1 energy difference down to about 1.1:1, and
    // measurement put speech at 0.360 against music at 0.359. The ratios have
    // to come from the LINEAR band RMS, for the same reason the drop detector
    // below already spells out.
    const float lin_tot = m_sSubBass + m_sBass + m_sLowMid
                          + m_sMid + m_sUpperMid + m_sHigh + 1e-9f;
    float       bass_ratio = ( m_sSubBass + m_sBass ) / lin_tot;  // music: kick, bass line
    float       mid_ratio = ( m_sLowMid + m_sMid ) / lin_tot;     // speech: formants
    float       high_ratio = ( m_sUpperMid + m_sHigh ) / lin_tot; // music: cymbals, air

    // ---- The decision ----
    // Four traits, each one measured on the corpora rather than guessed, and
    // each pointing the way its physics says it should:
    //   + low_energy  speech pauses between words and sentences; music does not
    //   - beat_ac     a repeating envelope period is music, never speech
    //   - bass_ratio  kick and bass line are music; a voice has almost no bottom
    //   + mid_ratio   formants pack energy into the 150 Hz - 2 kHz bands
    //
    // Measured on 40 tracks and 15 speech clips: every track scored <= -0.038
    // and every speech clip >= +0.086. On the 40 HELD-OUT tracks, which no
    // constant was ever fitted to, the margin comes out LARGER (+0.169) than on
    // the tuning set (+0.124) -- the split generalises rather than memorises.
    // Leave-one-out over the speech clips leaves it unchanged.
    //
    // beat_ac is what makes the hard case work. Sparse rap -- Tone Loc's "Funky
    // Cold Medina" in the test set -- is speech over a beat with real gaps in
    // it, so it beats every spectral test and every pause test. What it has and
    // narration does not is a period.
    //
    // The formula this replaces was a PRODUCT of five vetoes. Three of its
    // inputs were saturated constants across all 45 clips (bassPresence 1.000,
    // continuity 1.000, gappiness 0.000), and since bassPresence entered as
    // (1 - bassPresence) it multiplied the entire score by zero: musicPresence
    // read 1.000 for speech and music alike, i.e. the gate was a constant. A
    // product is the wrong shape here anyway -- one weak factor silently vetoes
    // all the others, which is exactly what hid the breakage.
    float speech_score = low_energy - beat_ac - 0.5f * bass_ratio + 0.25f * mid_ratio;

    // Below SpeechLo everything measured was music, above SpeechHi everything
    // measured was speech. In between, ramp rather than snap.
    constexpr float SpeechLo = -0.03f;
    constexpr float SpeechHi = 0.09f;
    // Measured env_mean: digital silence 0.000000, a realistic idle noise floor
    // 0.000100, and music pulled down by 32 dB still 0.004800. 0.001 sits an
    // order of magnitude above the idle line and well under even that
    // deliberately crippled music.
    constexpr float SilenceFloor = 0.001f;
    float           speechiness = ( speech_score - SpeechLo ) / ( SpeechHi - SpeechLo );
    speechiness = std::max( 0.f, std::min( speechiness, 1.f ) );

    // Silence is not music either. With no signal the ratios above are shaped
    // by whatever the noise floor happens to look like, so decide on the
    // envelope directly.
    if ( env_mean < SilenceFloor )
        speechiness = 1.f;

    float music_conf = 1.f - speechiness;

    // KALEIDO_SPEECH_DEBUG=1 prints the classifier's ingredients once a second.
    // Log the INGREDIENTS, not just the verdict: this gate was a constant 1.000
    // for a long time, and a single number for musicPresence could never have
    // shown which of its inputs had collapsed. Tools/speech_gate_corpus.md
    // describes the sweep these lines feed.
    {
        static const bool Dbg = qEnvironmentVariableIsSet( "KALEIDO_SPEECH_DEBUG" );
        static int        dbg_n = 0;
        if ( Dbg && ( ++dbg_n % 100 ) == 0 )
            fprintf( stderr,
                     "SPEECH mp=%.3f speechy=%.3f score=%.3f | lowE=%.3f beatAC=%.3f midR=%.3f "
                     "bassR=%.3f highR=%.3f envMean=%.4f | rhythm=%.3f key=%.3f "
                     "fluxVar=%.3f lvl=%.3f acConf=%.3f acBPM=%.0f "
                     "odfMean=%.4f odfStd=%.4f\n",
                     m_sMusicPresence, speechiness, speech_score,
                     low_energy, beat_ac, mid_ratio, bass_ratio, high_ratio, env_mean,
                     m_sRhythm, m_sKeyClarity, m_sFluxVar, level, m_acConf, m_acBPM,
                     m_odfEnvMean, m_odfEnvStd );
    }

    // Music-or-speech is a property of the SOURCE: it holds for minutes, so the
    // gate has no reason to react in half a second. The old 0.020/0.012 pair
    // gave time constants near 1 s, and the per-second score is nowhere near
    // that stable -- replayed over the corpus traces, the gate swung between
    // 0.001 and 0.998 within a single speech clip.
    //
    // Simulated over all 45 traces, 2.5 s toward music and 5 s toward speech is
    // the operating point where music is NEVER wrongly silenced (0.0% of blocks
    // below 0.5; the worst track bottoms out at 0.601), while speech still
    // settles within a few seconds. The asymmetry is deliberate and points the
    // safe way: silencing a song the listener is enjoying is a far worse
    // failure than a talk stream driving the visuals for another second.
    //   per-block rate = 1 - (1 - perSecond)^(1/blocksPerSecond), at ~100 blocks/s
    float mp_speed = ( music_conf > m_sMusicPresence ) ? 0.0051f : 0.0022f;
    m_sMusicPresence += mp_speed * ( music_conf - m_sMusicPresence );
    m_sMusicPresence = std::max( 0.f, std::min( m_sMusicPresence, 1.f ) );

    // ========================================================================
    // Build-up / drop detection (EDM dramaturgy)
    // ========================================================================
    // BUILD-UP: the music climbing toward a climax shows as a RISING onset
    // density (faster hits), a RISING spectral centroid (the classic filter
    // sweep), a swelling level and snare rolls.  Each is measured as a fast
    // EMA pulling above a slow one (bias-corrected — zero-init lesson from
    // the section detector).  DROP: while "armed" by a recent build-up, the
    // bass drops far below its own average (the breakdown/gap) and then
    // slams back — that re-entry moment is the drop.
    {
        float a_bias = 1.f / static_cast<float>( m_bldWarm + 1 );
        if ( m_bldWarm < 1000000 )
            ++m_bldWarm;
        const float a_f = std::max( 0.0067f, a_bias ); // tau ~1.5 s at 100 blocks/s
        const float a_s = std::max( 0.001f, a_bias );  // tau ~10 s
        m_bldFastOnset += a_f * ( m_onsetRate - m_bldFastOnset );
        m_bldSlowOnset += a_s * ( m_onsetRate - m_bldSlowOnset );
        m_bldFastCent += a_f * ( smoothed_centroid - m_bldFastCent );
        m_bldSlowCent += a_s * ( smoothed_centroid - m_bldSlowCent );
        m_bldFastLvl += a_f * ( level - m_bldFastLvl );
        m_bldSlowLvl += a_s * ( level - m_bldSlowLvl );
        // Snare rolls re-trigger the mid-group onset envelope so fast that its
        // MEAN stays high — a leaky average of it is a fine roll detector.
        m_bldSnareRoll += 0.03f * ( std::min( m_onsetEnvGrp[1] * 1.5f, 1.f ) - m_bldSnareRoll );

        float onset_rise = std::max( 0.f, m_bldFastOnset - m_bldSlowOnset ); // onsets/s
        float cent_rise = std::max( 0.f, m_bldFastCent - m_bldSlowCent );
        float lvl_rise = std::max( 0.f, m_bldFastLvl / ( m_bldSlowLvl + 1e-4f ) - 1.f );
        float raw = onset_rise * 0.45f // +2 onsets/s over baseline -> 0.9
                    + cent_rise * 3.0f // a full filter sweep -> ~0.6
                    + std::min( lvl_rise, 1.f ) * 0.5f
                    + m_bldSnareRoll * 0.6f;
        raw = std::min( raw, 1.f ) * m_sMusicPresence;         // no build-ups in speech
        float b_speed = ( raw > m_sBuildUp ) ? 0.02f : 0.008f; // rise ~0.5 s, fall ~1.2 s
        m_sBuildUp += b_speed * ( raw - m_sBuildUp );

        // ---- Drop state machine ----
        // The vacuum test uses a FAST bass EMA (~0.15 s) against a slow one
        // that is FROZEN during the gap; the re-entry test uses the current
        // smoothed band energy (fast attack: a kick spikes it within a block
        // or two).  The gap must last >= 250 ms so the inter-kick silence of
        // a normal groove can never count as one.  NOTE: the LINEAR band RMS
        // (m_sSubBass/m_sBass), NOT the dB-normalised 0..1 values — ratios
        // like "1.5x the average" are meaningless after dB compression (and
        // can even be unreachable, since dB-norm saturates at 1.0).
        float bass_e = m_sSubBass + m_sBass;
        m_bassFast += 0.065f * ( bass_e - m_bassFast ); // tau ~0.15 s
        bool vacuum = ( m_dropArmed > 0.f )
                      && ( m_bassFast < 0.35f * m_bassSlow );
        if ( !vacuum )                                      // freeze the slow
            m_bassSlow += 0.002f * ( bass_e - m_bassSlow ); // avg in the gap
        // Arming needs the slow EMAs settled (>= ~12 s after start): a fresh
        // energetic track otherwise reads as a "build-up" while the 10 s
        // averages are still climbing toward its steady state.
        // Arming at 0.45 instead of 0.60: a deliberately strong synthetic
        // build-up (level +60 %, hats to 32nds, riser, kick doubling, snare
        // roll) peaks at 0.50-0.53 on this feature, so 0.60 armed nothing and
        // no drop was ever detected.  The vacuum + bass-slam tests behind the
        // arming are what keep a false drop rare; the arming only opens the
        // window.
        if ( m_sBuildUp > 0.45f && m_bldWarm > 1200 )
            m_dropArmed = 800.f; // ~8 s arming
        if ( m_dropArmed > 0.f )
            m_dropArmed -= 1.f;
        if ( vacuum )
        {
            m_lowGapBlocks += 1.f;
            // Long breakdowns must not disarm mid-gap: hold the arming alive
            // while the vacuum persists.
            m_dropArmed = std::max( m_dropArmed, 200.f );
        }
        else if ( m_bassFast > 0.6f * m_bassSlow ) // hysteresis: the
            m_lowGapBlocks = 0.f;                  // gap is truly over
        if ( m_dropCooldown > 0 )
            --m_dropCooldown;
        if ( m_dropCooldown == 0 && m_dropArmed > 0.f && m_lowGapBlocks >= 25.f && // >= 250 ms of gap
             bass_e > 1.45f * m_bassSlow &&                                        // bass slams back
             ( m_onsetEnvGrp[0] > 0.25f || bass_e > 2.0f * m_bassSlow ) )
        {
            m_dropPulse = 1.f;
            ++m_dropCount;
            m_dropCooldown = 800; // >= 8 s apart
            m_dropArmed = 0.f;
            m_lowGapBlocks = 0.f;
            fprintf( stderr, "DROP #%d (buildup %.2f, bass %.2fx, t=%.1fs)\n",
                     m_dropCount, m_sBuildUp, bass_e / ( m_bassSlow + 1e-5f ),
                     m_bldWarm * 0.01f );
        }
        m_dropPulse *= 0.985f; // ~1.5 s tail

        // ---- Second path: RETURN after a breakdown ----
        // The vacuum test above wants the bass gone for >= 250 ms and back
        // at 1.45x its average -- a synthetic drop.  Real tracks (psytrance,
        // rock, pop alike) break down for 6-30 s with the bass often still
        // running, and the slow bass average adapts inside the gap, so the
        // slam never reads as 1.45x.  On three real tracks the vacuum path
        // fired ZERO times while a plain envelope-jump reference found the
        // returns at 222/289/302 s (DMT), 36/162/289 s (Thunderstruck).
        // This path is that reference: the level mix sits >= 0.10 under its
        // 8-s mean for >= 6 s, then comes back to within 0.05 of where it
        // was before -- that return IS the drop, and it anchors the phrase.
        // Differences, not ratios: `level` is the dB-normalised 0..1 mix.
        {
            m_brkFast += 0.01f * ( level - m_brkFast );    // tau ~1 s
            m_brkSlow += 0.00125f * ( level - m_brkSlow ); // tau ~8 s
            if ( !m_inBreak && m_bldWarm > 1200 && m_brkFast < m_brkSlow - 0.10f )
            {
                m_inBreak = true;
                m_brkBlocks = 0;
                m_brkPre = m_brkSlow;
                m_brkMin = m_brkFast;
            }
            else if ( m_inBreak )
            {
                ++m_brkBlocks;
                m_brkMin = std::min( m_brkMin, m_brkFast );
                const bool back = m_brkFast > m_brkMin + 0.12f && m_brkFast > m_brkPre - 0.05f;
                if ( back && m_brkBlocks >= 600 ) // >= 6 s of breakdown
                {
                    if ( m_dropCooldown == 0 )
                    {
                        m_dropPulse = 1.f;
                        ++m_dropCount;
                        m_dropCooldown = 800;
                        fprintf( stderr, "DROP #%d (return after %.1f s breakdown, level %.2f -> %.2f, t=%.1fs)"
                                         "\n",
                                 m_dropCount, m_brkBlocks * 0.01f, m_brkMin, m_brkFast, m_bldWarm * 0.01f );
                    }
                    m_inBreak = false;
                }
                else if ( back ) // too short: a fill, not a breakdown
                    m_inBreak = false;
                else if ( m_brkBlocks > 6000 ) // 60 s: that is a new section, not a break
                    m_inBreak = false;
            }
        }
    }

    // ========================================================================
    // DJ-STOP detection: the WHOLE spectrum collapses for 0.1..3 s in running
    // beat music, then slams back.  (The drop detector above watches only the
    // BASS and needs a build-up; a stop is sudden total silence, no build-up.)
    // While the stop runs the host freezes the motion (breakHold); the return
    // fires breakSlam (a camera hit + audioDrop pulse for the shaders).
    // ========================================================================
    {
        m_lvlFast += 0.15f * ( level - m_lvlFast ); // ~60 ms
        if ( !m_stopActive )
            m_lvlSlow += 0.004f * ( level - m_lvlSlow ); // frozen in the gap
        bool beat_music = m_sMusicPresence > 0.5f && m_sRhythm > 0.35f
                          && m_ambientFactor < 0.6f && m_lvlSlow > 0.02f;
        if ( !m_stopActive )
        {
            if ( beat_music && m_lvlFast < 0.15f * m_lvlSlow )
            {
                if ( ++m_stopBlocks >= 8 ) // ~80 ms of collapse
                {
                    m_stopActive = true;
                    m_stopBlocks = 0;
                    fprintf( stderr, "BREAK: stop detected (t=%.1fs)\n",
                             m_bldWarm * 0.01f );
                }
            }
            else
                m_stopBlocks = 0;
        }
        else
        {
            ++m_stopBlocks;
            if ( m_lvlFast > 0.55f * m_lvlSlow ) // music slams back
            {
                m_stopActive = false;
                if ( m_stopBlocks <= 300 ) // <= 3 s: a DJ stop
                {
                    m_breakSlam = 1.f;
                    ++m_breakCount;
                    fprintf( stderr, "BREAK: slam-back after %.2fs (t=%.1fs)\n",
                             m_stopBlocks * 0.01f, m_bldWarm * 0.01f );
                }
                m_stopBlocks = 0;
            }
            else if ( m_stopBlocks > 300 ) // too long: track end
            {
                m_stopActive = false;
                m_stopBlocks = 0;
            }
        }
        m_breakSlam *= 0.985f; // ~1 s tail
    }

    // ---- MilkDrop-style relative band levels (instant vs "usual") ----
    // rel ~ 1.0 = as loud as this register usually is; >1 louder, <1 quieter.
    // The continuous companion to the gated onset detectors — perfect for
    // breathing motion (the classic bass/bass_att idiom, done volume-safe on
    // the AGC-normalised levels).
    {
        float fast[3];
        fast[0] = n_bass;
        fast[1] = 0.5f * ( n_low_mid + n_mid );
        fast[2] = 0.5f * ( n_upper_mid + n_high );
        for ( int i = 0; i < 3; ++i )
        {
            m_relSlow[i] = 0.998f * m_relSlow[i] + 0.002f * fast[i];
            float rel = fast[i] / std::max( m_relSlow[i], 0.06f );
            rel = std::max( 0.f, std::min( 2.5f, rel ) );
            m_sRel[i] = 0.55f * m_sRel[i] + 0.45f * rel;
        }
    }

    // ---- Waveform downsample for `audioWave[64]` ----
    // Average the rolling mono ring (oldest -> newest = m_waveWritePos onward)
    // into 64 points; normalise with a decaying |peak| so the wave stays
    // visible at any volume; light temporal smoothing against block jitter.
    {
        const int NP = AudioFeatures::WavePoints;
        const int grp = WaveRing / NP; // 32 samples/point
        float     pts[AudioFeatures::WavePoints];
        float     peak = 1e-4f;
        for ( int p = 0; p < NP; ++p )
        {
            float acc = 0.f;
            int   base = ( m_waveWritePos + p * grp ) & ( WaveRing - 1 );
            for ( int k = 0; k < grp; ++k )
                acc += m_waveRing[( base + k ) & ( WaveRing - 1 )];
            pts[p] = acc / static_cast<float>( grp );
            peak = std::max( peak, std::fabs( pts[p] ) );
        }
        m_waveRef = std::max( m_waveRef * 0.995f, peak );
        m_waveRef = std::max( m_waveRef, 0.02f ); // silence floor
        for ( int p = 0; p < NP; ++p )
        {
            float v = std::max( -1.f, std::min( 1.f, pts[p] / m_waveRef ) );
            m_sWave[p] = 0.35f * m_sWave[p] + 0.65f * v;
        }
    }

    // ---- Publish (mutex-protected) ----
    QMutexLocker lk( &m_mutex );
    // Publish the AGC-normalised levels so the visuals are volume-independent.
    m_features.subBassLevel = n_sub_bass;
    m_features.bassLevel = n_bass;
    m_features.lowMidLevel = n_low_mid;
    m_features.midLevel = n_mid;
    m_features.upperMidLevel = n_upper_mid;
    m_features.highLevel = n_high;
    m_features.overallLevel = n_level;
    for ( int b = 0; b < AudioFeatures::SpectrumBands; ++b )
        m_features.spectrum[b] = m_sSpectrum[b];
    for ( int p = 0; p < AudioFeatures::WavePoints; ++p )
        m_features.wave[p] = m_sWave[p];
    m_features.bassRel = m_sRel[0];
    m_features.midRel = m_sRel[1];
    m_features.trebRel = m_sRel[2];
    m_features.isBeat = is_beat;
    m_features.onsetStrength = onset_strength;
    m_features.downbeat = downbeat;
    m_features.trackChange = track_change;
    m_features.beatStrength = beat_str;
    m_features.beatDecay = beat_decay;
    m_features.ambientFactor = m_ambientFactor;
    m_features.powerScale = power_scale;
    m_features.beatSidesHint = beat_sides_hint;
    m_features.audioFlip = audio_flip;
    m_features.spectralFlux = spectral_flux;
    m_features.spectralCentroid = smoothed_centroid;
    // Paper-inspired timbral features
    m_features.zeroCrossingRate = m_sZCR;
    m_features.spectralFlatness = m_sSFM;
    m_features.logAttackTime = m_attackAccum;
    m_features.estimatedBPM = estimated_bpm;
    m_features.arousal = arousal;
    m_features.valence = valence;
    m_features.keyClarity = m_sKeyClarity;
    m_features.sharpness = m_sSharpness;
    m_features.harmonicChange = m_sHCDF;
    m_features.roughness = m_sRoughness;
    m_features.rhythmStrength = m_sRhythm;
    m_features.beatPhase = beat_phase;

    // Manual TAP tempo (key 't'): override tempo + phase while active.  The
    // host's beat-phase PLL then locks onto the tapped grid; the raised
    // rhythmStrength floor engages the tempo-locked pulse and 4-beat fades.
    {
        int    tap_iv = m_tapIntervalMs.load();
        qint64 until = m_tapUntilMs.load();
        if ( tap_iv > 0 && m_tapClock.elapsed() < until )
        {
            float bpm = 60000.f / static_cast<float>( tap_iv );
            m_features.estimatedBPM = std::max( 0.f, std::min( ( bpm - 40.f ) / 160.f, 1.f ) );
            double ph = static_cast<double>( m_tapClock.elapsed() - m_tapAnchorMs.load() )
                        / static_cast<double>( tap_iv );
            m_features.beatPhase = static_cast<float>( ph - std::floor( ph ) );
            m_features.rhythmStrength = std::max( m_features.rhythmStrength, 0.85f );
        }
    }
    m_features.fluxVariance = m_sFluxVar;
    m_features.stereoWidth = m_sStereoWidth;
    m_features.stereoLowL = m_sStBand[0][0];
    m_features.stereoMidL = m_sStBand[0][1];
    m_features.stereoHighL = m_sStBand[0][2];
    m_features.stereoLowR = m_sStBand[1][0];
    m_features.stereoMidR = m_sStBand[1][1];
    m_features.stereoHighR = m_sStBand[1][2];
    m_features.deltaPitch = m_sDeltaPitch;
    m_features.musicPresence = m_sMusicPresence;
    m_features.timingScale = timing_scale;
    m_features.sectionCount = m_sectionCount;
    m_features.sectionNovelty = m_secNovelty;
    m_features.sectionId = m_secCurId;
    m_features.sectionKnown = m_secKnown;
    m_features.onsetKick = m_onsetEnvGrp[0];
    m_features.onsetSnare = m_onsetEnvGrp[1];
    m_features.onsetHat = m_onsetEnvGrp[2];
    m_features.buildUp = m_sBuildUp;
    m_features.dropPulse = m_dropPulse;
    m_features.dropCount = m_dropCount;
    m_features.breakHold = m_stopActive ? 1.f : 0.f;
    m_features.breakSlam = m_breakSlam;
    // FFT-derived features
    m_features.spectralRolloff = m_sRolloff;
    m_features.spectralSpread = m_sSpread;
    m_features.musicalMode = m_sMode;
    m_features.dominantPitch = m_sPitch;
    m_features.melodyPitch = m_sMelody;
    m_features.chromaHue = chroma_hue;
    // Full 12-bin chroma vector (smoothed, L1-normalised) — for scenes that
    // display the harmony structurally (Planet4D pitch-class hypersphere).
    for ( int i = 0; i < 12; ++i )
        m_features.chroma[i] = m_smoothedChroma[i];
}
