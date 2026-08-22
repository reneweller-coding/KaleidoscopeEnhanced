/**
 * @file AudioAnalyzer.cpp
 * @brief Implementation of AudioAnalyzer: WASAPI loopback capture, the per-block DSP pipeline (processBlock), and offline/replay/recording helpers.
 */
#include "AudioAnalyzer.h"

// Windows / WASAPI headers
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <combaseapi.h>

#include <cmath>
#include <algorithm>
#include <cstring>
#include <cstdio>

#include <QtCore/QElapsedTimer>

/**
 * @brief One-pole IIR low-pass coefficient for given cutoff and sample rate.
 *
 *   a = exp(-2*pi*fc/fs)
 *   y[n] = a*y[n-1] + (1-a)*x[n]
 * Larger 'a' → slower response (lower cutoff).
 */
float AudioAnalyzer::coeff(float cutoffHz, int sampleRate)
{
    return std::exp(-2.f * 3.14159265f * cutoffHz / float(sampleRate));
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
 * @param re Real part array, length N. Input: windowed audio samples. Output: real part of DFT coefficients X[0..N-1].
 * @param im Imaginary part array, length N. Input: all zeros for real-valued audio. Output: imaginary part of X[0..N-1].
 * @param N Transform size, MUST be a power of two (e.g. 2048).
 */
/*static*/ void AudioAnalyzer::radix2fft(float *re, float *im, int N)
{
    // ---- Bit-reversal permutation ----
    // Reorders the input array so the butterfly passes work correctly.
    for (int i = 1, j = 0; i < N; ++i) {
        int bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            std::swap(re[i], re[j]);
            std::swap(im[i], im[j]);
        }
    }

    // ---- Butterfly stages ----
    // len doubles each iteration: 2 → 4 → 8 → … → N.
    // Each stage computes the DFT of sub-sequences of length len using
    // the DFT results of sub-sequences of length len/2 (Cooley-Tukey).
    for (int len = 2; len <= N; len <<= 1) {
        const float ang = -2.f * 3.14159265358979f / float(len);  // negative: forward FFT
        const float wRe = std::cos(ang);  // twiddle factor increment (real)
        const float wIm = std::sin(ang);  // twiddle factor increment (imag)

        for (int i = 0; i < N; i += len) {
            float curRe = 1.f, curIm = 0.f;  // current twiddle = W^0 = 1
            for (int j = 0; j < len / 2; ++j) {
                // Butterfly:  (u, v) → (u + W^j·v,  u - W^j·v)
                const float uRe = re[i + j];
                const float uIm = im[i + j];
                // W^j · x[i+j+len/2]  (complex multiply)
                const float vRe = re[i + j + len/2] * curRe
                                - im[i + j + len/2] * curIm;
                const float vIm = re[i + j + len/2] * curIm
                                + im[i + j + len/2] * curRe;
                re[i + j]          = uRe + vRe;
                im[i + j]          = uIm + vIm;
                re[i + j + len/2]  = uRe - vRe;
                im[i + j + len/2]  = uIm - vIm;
                // Advance twiddle factor:  cur *= W  (complex multiply)
                const float nextRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = nextRe;
            }
        }
    }
}

/**
 * @brief Constructs the analyzer: zeroes all DSP state and precomputes the FFT window.
 */
AudioAnalyzer::AudioAnalyzer(QObject *parent)
    : QThread(parent)
{
    m_tapClock.start();   // tap-tempo clock (read from both threads, set once)
    std::memset(m_bassHistory,     0, sizeof(m_bassHistory));
    std::memset(m_envHistory,    0, sizeof(m_envHistory));
    std::memset(m_ringBuf,         0, sizeof(m_ringBuf));
    std::memset(m_fftRe,           0, sizeof(m_fftRe));
    std::memset(m_fftIm,           0, sizeof(m_fftIm));
    std::memset(m_prevMags,        0, sizeof(m_prevMags));
    std::memset(m_smoothedChroma,  0, sizeof(m_smoothedChroma));

    // Precompute Hann window for FFT:  w[i] = 0.5 · (1 - cos(2π·i/(N-1)))
    // Reduces spectral leakage from block edges.
    for (int i = 0; i < kFFTSize; ++i)
        m_fftWin[i] = 0.5f * (1.f - std::cos(
            2.f * 3.14159265358979f * float(i) / float(kFFTSize - 1)));
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
    QMutexLocker lk(&m_mutex);
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
    QList<AudioDevice> devs;
    auto addFlow = [&]( EDataFlow flow, bool isCap ) {
        IMMDeviceCollection *coll = nullptr;
        if ( FAILED(pEnum->EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE, &coll)) || !coll )
            return;
        UINT n = 0; coll->GetCount(&n);
        for ( UINT i = 0; i < n; ++i ) {
            IMMDevice *d = nullptr;
            if ( FAILED(coll->Item(i, &d)) || !d ) continue;
            LPWSTR id = nullptr; QString qid, qname;
            if ( SUCCEEDED(d->GetId(&id)) && id ) { qid = QString::fromWCharArray(id); CoTaskMemFree(id); }
            IPropertyStore *ps = nullptr;
            if ( SUCCEEDED(d->OpenPropertyStore(STGM_READ, &ps)) && ps ) {
                PROPVARIANT v; PropVariantInit(&v);
                if ( SUCCEEDED(ps->GetValue(PKEY_Device_FriendlyName, &v)) && v.vt == VT_LPWSTR )
                    qname = QString::fromWCharArray(v.pwszVal);
                PropVariantClear(&v); ps->Release();
            }
            if ( !qid.isEmpty() ) {
                AudioDevice ad; ad.id = qid; ad.name = qname.isEmpty() ? qid : qname; ad.isCapture = isCap;
                devs.append(ad);
            }
            d->Release();
        }
        coll->Release();
    };
    addFlow( eRender,  false );   // outputs (loopback)
    addFlow( eCapture, true  );   // inputs (mic / line-in)

    QMutexLocker lk(&m_mutex);
    m_devices = devs;
}

/** @brief Returns a thread-safe copy of the current selectable-device list. */
QList<AudioDevice> AudioAnalyzer::devices() const
{
    QMutexLocker lk(&m_mutex);
    return m_devices;
}

/** @brief Returns the friendly name of the source currently being captured. */
QString AudioAnalyzer::currentDeviceName() const
{
    QMutexLocker lk(&m_mutex);
    return m_curDeviceName;
}

// ---------------------------------------------------------------------------
// Audio recording: capture the loopback (the music) to a 16-bit stereo WAV.
// open / write / close all happen on the capture (run) thread.
// ---------------------------------------------------------------------------
/** @brief Writes one little-endian 32-bit value to a raw file (WAV header/chunk-size helper). */
static void wr32(FILE *f, unsigned int v) { fwrite(&v, 4, 1, f); }
/** @brief Writes one little-endian 16-bit value to a raw file (WAV header helper). */
static void wr16(FILE *f, unsigned short v) { fwrite(&v, 2, 1, f); }

/**
 * @brief Opens m_wavFile at the requested path and writes a placeholder 44-byte PCM16 stereo WAV header.
 * @param sampleRate Sample rate to record at (written into the header; chunk sizes are fixed up on close by recClose()).
 */
void AudioAnalyzer::recOpen( int sampleRate )
{
    QString p; { QMutexLocker lk(&m_mutex); p = m_recWavPath; }
    FILE *f = fopen( p.toLocal8Bit().constData(), "wb" );
    if (!f) return;
    // 44-byte WAV header, 16-bit stereo, placeholder sizes (fixed up on close).
    fwrite("RIFF", 1, 4, f); wr32(f, 0); fwrite("WAVE", 1, 4, f);
    fwrite("fmt ", 1, 4, f); wr32(f, 16); wr16(f, 1); wr16(f, 2);
    wr32(f, (unsigned)sampleRate); wr32(f, (unsigned)(sampleRate * 4)); wr16(f, 4); wr16(f, 16);
    fwrite("data", 1, 4, f); wr32(f, 0);
    m_wavFile = f; m_wavDataBytes = 0; m_wavOpen = true;
}

/**
 * @brief Converts and appends captured samples to the currently open recording as interleaved 16-bit stereo PCM.
 * @param src Interleaved float samples, range roughly [-1, 1].
 * @param numFrames Number of frames in `src`.
 * @param numChannels Number of interleaved channels in `src` (channel 2+ ignored; mono is mirrored to both output channels).
 */
void AudioAnalyzer::recWrite( const float *src, int numFrames, int numChannels )
{
    FILE *f = (FILE*)m_wavFile;
    if (!f) return;
    for (int i = 0; i < numFrames; ++i) {
        float l = src[i * numChannels + 0];
        float r = (numChannels > 1) ? src[i * numChannels + 1] : l;
        short sl = (short)std::max(-32768.f, std::min(32767.f, l * 32767.f));
        short sr = (short)std::max(-32768.f, std::min(32767.f, r * 32767.f));
        wr16(f, (unsigned short)sl); wr16(f, (unsigned short)sr);
    }
    m_wavDataBytes += (unsigned)(numFrames * 4);
}

/** @brief Finalises the WAV header's chunk sizes and closes the recording file. */
void AudioAnalyzer::recClose()
{
    FILE *f = (FILE*)m_wavFile;
    if (!f) return;
    fseek(f, 4, SEEK_SET);  wr32(f, 36 + m_wavDataBytes);   // RIFF chunk size
    fseek(f, 40, SEEK_SET); wr32(f, m_wavDataBytes);        // data chunk size
    fclose(f);
    m_wavFile = nullptr; m_wavOpen = false;
}

/**
 * @brief Requests that the capture thread start recording to a WAV file (opened lazily on the next captured block).
 * @param wavPath Destination path for the 16-bit stereo WAV.
 */
void AudioAnalyzer::startRecording( const QString &wavPath )
{
    { QMutexLocker lk(&m_mutex); m_recWavPath = wavPath; }
    m_recReq = true;
}

/** @brief Requests recording to stop and blocks (up to ~500 ms) until the capture thread has flushed and closed the file. */
void AudioAnalyzer::stopRecording()
{
    m_recReq = false;
    // Wait briefly for the capture thread to flush + close the file.
    for (int i = 0; i < 100 && m_wavOpen; ++i)
        QThread::msleep(5);
}

/**
 * @brief Requests that the capture loop switch to a different audio source.
 * @param id Endpoint id to capture; empty reverts to the default loopback device.
 * @param isCapture true if `id` names an input (capture) endpoint, false for an output (loopback) endpoint.
 */
void AudioAnalyzer::requestDevice( const QString &id, bool isCapture )
{
    {
        QMutexLocker lk(&m_mutex);
        if ( id.isEmpty() ) { m_useReqDevice = false; m_reqDeviceId.clear(); }
        else                { m_useReqDevice = true;  m_reqDeviceId = id; m_reqIsCapture = isCapture; }
    }
    m_deviceChangeReq = true;     // ask the capture loop to re-initialise now
}

/**
 * @brief TAP TEMPO (key 't', GUI thread): registers one tap; the median inter-tap interval overrides tempo + beat phase for ~45 s.
 *
 * A pause > 2.5 s starts a fresh series. The override is applied at publish
 * time in processBlock() (see the "Manual TAP tempo" block near the end).
 */
void AudioAnalyzer::tapTempo()
{
    qint64 now = m_tapClock.elapsed();
    if (m_tapN > 0 && now - m_tapTimes[(m_tapN - 1) & 7] > 2500)
        m_tapN = 0;                                   // series broken
    m_tapTimes[m_tapN & 7] = now;
    ++m_tapN;

    int cnt = std::min(m_tapN, 8);
    if (cnt < 2) { fprintf(stderr, "TAP: weiter tippen...\n"); return; }

    // Median of the (up to 7) intervals between the last taps.
    float iv[7]; int n = 0;
    for (int i = cnt - 1; i >= 1; --i) {
        qint64 a = m_tapTimes[(m_tapN - i - 1) & 7];
        qint64 b = m_tapTimes[(m_tapN - i)     & 7];
        iv[n++] = float(b - a);
    }
    std::sort(iv, iv + n);
    float med = iv[n / 2];
    med = std::max(250.f, std::min(med, 1500.f));     // 40..240 BPM
    m_tapIntervalMs = int(med + 0.5f);
    m_tapAnchorMs   = now;
    m_tapUntilMs    = now + 45000;
    fprintf(stderr, "TAP tempo: %.1f BPM (%d taps)\n", 60000.f / med, cnt);
}

/** @brief Definition of the static offline-WAV path flag (see AudioAnalyzer::s_offlineWav in the header). */
QString AudioAnalyzer::s_offlineWav;

/**
 * @brief Offline analysis (CLI -w): feeds a 16-bit PCM WAV through processBlock() in 480-frame chunks, paced to real time.
 *
 * Block-for-block identical to live capture (all smoothing constants are
 * per-block), but deterministic and immune to whatever the system happens to
 * be playing.  Used to test/calibrate the classifiers.
 * @param path Path to a 16-bit PCM WAV file.
 */
void AudioAnalyzer::analyzeWavOffline( const QString &path )
{
    FILE *f = fopen( path.toLocal8Bit().constData(), "rb" );
    if( !f ) { fprintf( stderr, "OFFLINE: cannot open %s\n", qPrintable(path) ); return; }

    // Minimal RIFF parse: find fmt + data chunks (16-bit PCM only).
    char id[5] = {0}; unsigned int sz = 0;
    unsigned short fmtTag = 0, channels = 0, bits = 0;
    unsigned int sampleRate = 48000; long dataPos = 0; unsigned int dataLen = 0;
    fseek( f, 12, SEEK_SET );                       // skip RIFF....WAVE
    while( fread( id, 1, 4, f ) == 4 && fread( &sz, 4, 1, f ) == 1 )
    {
        if( strncmp( id, "fmt ", 4 ) == 0 )
        {
            unsigned char buf[16];
            fread( buf, 1, 16, f );
            fmtTag     = *(unsigned short*)(buf + 0);
            channels   = *(unsigned short*)(buf + 2);
            sampleRate = *(unsigned int*)  (buf + 4);
            bits       = *(unsigned short*)(buf + 14);
            if( sz > 16 ) fseek( f, sz - 16, SEEK_CUR );
        }
        else if( strncmp( id, "data", 4 ) == 0 ) { dataPos = ftell( f ); dataLen = sz; break; }
        else fseek( f, sz, SEEK_CUR );
    }
    if( fmtTag != 1 || bits != 16 || channels < 1 || dataPos == 0 )
    {
        fprintf( stderr, "OFFLINE: unsupported WAV (PCM16 required)\n" );
        fclose( f ); return;
    }

    fprintf( stderr, "OFFLINE: %s  %u Hz, %u ch, %.1f s\n", qPrintable(path),
             sampleRate, channels, dataLen / float(sampleRate * channels * 2) );

    const int chunk = 480;                          // = one live capture block
    short *pcm  = new short[chunk * channels];
    float *conv = new float[chunk * channels];
    fseek( f, dataPos, SEEK_SET );
    unsigned int remain = dataLen / (channels * 2);
    QElapsedTimer clock; clock.start();
    qint64 fed = 0;                                 // frames delivered so far
    while( remain > 0 && m_running )
    {
        int n = (remain < (unsigned int)chunk) ? (int)remain : chunk;
        if( fread( pcm, 2 * channels, n, f ) != (size_t)n ) break;
        for( int i = 0; i < n * channels; ++i ) conv[i] = pcm[i] / 32768.f;
        processBlock( conv, n, (channels > 2) ? 2 : channels, sampleRate );

        // Recording (-x batch render): mirror the live loop's WAV writer so
        // the mux gets the music.
        if( m_recReq && !m_wavFile ) recOpen( sampleRate );
        if( m_wavFile )              recWrite( conv, n, channels );

        remain -= n;

        // Pace to the wall clock: the render loop (and an -x recording) runs
        // in real time, so the features must arrive at capture speed too.
        // KALEIDO_OFFLINE_FAST=1 drops the pacing. Everything in processBlock
        // is per-BLOCK (EMAs, ring buffers, counters), so the analysis output
        // is identical either way -- only the visuals, which depend on wall
        // clock, are meaningless. That makes sweeping a few dozen tracks for
        // classifier tuning minutes instead of hours.
        static const bool fast = qEnvironmentVariableIsSet( "KALEIDO_OFFLINE_FAST" );
        fed += n;
        if( !fast )
        {
            qint64 ahead = fed * 1000 / sampleRate - clock.elapsed();
            if( ahead > 2 ) msleep( (unsigned long)ahead );
        }
    }
    if( m_wavFile ) recClose();                     // finalise a still-open WAV
    delete[] pcm; delete[] conv;
    fclose( f );
    fprintf( stderr, "OFFLINE: done\n" );
}

/**
 * @brief Instant replay: writes the last `seconds` of the rolling PCM ring (see kReplaySeconds) as a 16-bit stereo WAV.
 * @param path Destination WAV path.
 * @param seconds How many trailing seconds to dump (clamped to what has actually been captured).
 * @return false if nothing has been captured yet or the file could not be opened, true on success.
 */
bool AudioAnalyzer::dumpReplayWav( const QString &path, float seconds )
{
    QMutexLocker rl(&m_replayMx);
    if( m_replayCount == 0 || m_replayRing.empty() )
        return false;

    size_t wantFrames = (size_t)(seconds * m_replayRate);
    size_t haveFrames = std::min( wantFrames, m_replayCount );
    const size_t cap  = m_replayRing.size();

    FILE *f = fopen( path.toLocal8Bit().constData(), "wb" );
    if( !f ) return false;

    unsigned int dataLen = (unsigned int)(haveFrames * 2 * 2);
    unsigned int riffLen = 36 + dataLen;
    unsigned short fmt = 1, ch = 2, bits = 16, align = 4;
    unsigned int rate = (unsigned int)m_replayRate, bytesSec = rate * align;
    fwrite( "RIFF", 1, 4, f ); fwrite( &riffLen, 4, 1, f );
    fwrite( "WAVEfmt ", 1, 8, f );
    unsigned int fmtLen = 16;
    fwrite( &fmtLen, 4, 1, f ); fwrite( &fmt, 2, 1, f ); fwrite( &ch, 2, 1, f );
    fwrite( &rate, 4, 1, f ); fwrite( &bytesSec, 4, 1, f );
    fwrite( &align, 2, 1, f ); fwrite( &bits, 2, 1, f );
    fwrite( "data", 1, 4, f ); fwrite( &dataLen, 4, 1, f );

    // Oldest wanted sample sits haveFrames*2 behind the write cursor.
    size_t start = (m_replayPos + cap - haveFrames * 2) % cap;
    for( size_t i = 0; i < haveFrames * 2; ++i )
        fwrite( &m_replayRing[(start + i) % cap], 2, 1, f );
    fclose( f );
    return true;
}

/**
 * @brief Offline (Preset-Editor) analysis: runs the full pipeline at full speed, returning one AudioFeatures snapshot per 10 ms block.
 *
 * A local, never-started AudioAnalyzer instance (`az`) keeps this completely
 * independent of any live capture.
 * @param path Path to a 16-bit PCM WAV file.
 * @return One AudioFeatures snapshot per 10 ms block of audio (empty if the file could not be read).
 */
std::vector<AudioFeatures> AudioAnalyzer::analyzeWavToTimeline( const QString &path )
{
    std::vector<AudioFeatures> timeline;

    FILE *f = fopen( path.toLocal8Bit().constData(), "rb" );
    if( !f ) { fprintf( stderr, "TIMELINE: cannot open %s\n", qPrintable(path) ); return timeline; }

    char id[5] = {0}; unsigned int sz = 0;
    unsigned short fmtTag = 0, channels = 0, bits = 0;
    unsigned int sampleRate = 48000; long dataPos = 0; unsigned int dataLen = 0;
    fseek( f, 12, SEEK_SET );
    while( fread( id, 1, 4, f ) == 4 && fread( &sz, 4, 1, f ) == 1 )
    {
        if( strncmp( id, "fmt ", 4 ) == 0 )
        {
            unsigned char buf[16];
            fread( buf, 1, 16, f );
            fmtTag     = *(unsigned short*)(buf + 0);
            channels   = *(unsigned short*)(buf + 2);
            sampleRate = *(unsigned int*)  (buf + 4);
            bits       = *(unsigned short*)(buf + 14);
            if( sz > 16 ) fseek( f, sz - 16, SEEK_CUR );
        }
        else if( strncmp( id, "data", 4 ) == 0 ) { dataPos = ftell( f ); dataLen = sz; break; }
        else fseek( f, sz, SEEK_CUR );
    }
    if( fmtTag != 1 || bits != 16 || channels < 1 || dataPos == 0 )
    {
        fprintf( stderr, "TIMELINE: unsupported WAV (PCM16 required)\n" );
        fclose( f ); return timeline;
    }

    AudioAnalyzer az;                 // never start()ed: pure DSP state
    az.m_running = true;              // processBlock guards check this

    const int chunk = 480;
    short *pcm  = new short[chunk * channels];
    float *conv = new float[chunk * channels];
    fseek( f, dataPos, SEEK_SET );
    unsigned int remain = dataLen / (channels * 2);
    timeline.reserve( remain / chunk + 1 );
    while( remain > 0 )
    {
        int n = (remain < (unsigned int)chunk) ? (int)remain : chunk;
        if( fread( pcm, 2 * channels, n, f ) != (size_t)n ) break;
        for( int i = 0; i < n * channels; ++i ) conv[i] = pcm[i] / 32768.f;
        az.processBlock( conv, n, (channels > 2) ? 2 : channels, sampleRate );
        timeline.push_back( az.getFeatures() );
        remain -= n;
    }
    delete[] pcm; delete[] conv;
    fclose( f );
    fprintf( stderr, "TIMELINE: %d blocks (%.1f s)\n",
             (int)timeline.size(), timeline.size() * 0.01f );
    return timeline;
}

/**
 * @brief QThread entry point: the WASAPI loopback capture loop (or, if s_offlineWav is set, delegates to analyzeWavOffline() and returns).
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
    if( !s_offlineWav.isEmpty() )
    {
        analyzeWavOffline( s_offlineWav );
        return;
    }

    // --- COM init for this thread ---
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr)) { m_running = false; return; }

    IMMDeviceEnumerator *pEnum = nullptr;
    hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                          __uuidof(IMMDeviceEnumerator), (void**)&pEnum);
    if (FAILED(hr)) { CoUninitialize(); m_running = false; return; }

    // Temporary float conversion buffer (max 4096 frames × 8 channels)
    static float convBuf[4096 * 8];

    // Outer reconnect loop.  If the capture device is invalidated (the user
    // switches the default output, unplugs headphones, an HDMI display sleeps,
    // …), the per-device objects are released and the default endpoint is
    // re-acquired — so audio reactivity recovers automatically instead of dying.
    while (m_running)
    {
        IMMDevice           *pDevice  = nullptr;
        IAudioClient        *pClient  = nullptr;
        IAudioCaptureClient *pCapture = nullptr;
        WAVEFORMATEX        *pwfx     = nullptr;

        auto deviceCleanup = [&]() {
            if (pCapture) { pCapture->Release(); pCapture = nullptr; }
            if (pClient)  { pClient->Stop(); pClient->Release(); pClient = nullptr; }
            if (pwfx)     { CoTaskMemFree(pwfx); pwfx = nullptr; }
            if (pDevice)  { pDevice->Release(); pDevice = nullptr; }
        };

        // Refresh the selectable-device list (cheap; keeps it current across
        // plug/unplug), and read the runtime selection.
        enumerateDevices(pEnum);
        QString reqId; bool reqCap = false; bool useReq = false;
        {
            QMutexLocker lk(&m_mutex);
            useReq = m_useReqDevice; reqId = m_reqDeviceId; reqCap = m_reqIsCapture;
        }
        m_deviceChangeReq = false;

        // The selected endpoint, or the default render endpoint (loopback) if none.
        // Loopback only applies to OUTPUT endpoints; an input device (mic/line-in)
        // is captured normally.
        bool isCaptureEndpoint = false;
        if (useReq && !reqId.isEmpty()) {
            hr = pEnum->GetDevice((LPCWSTR)reqId.utf16(), &pDevice);
            isCaptureEndpoint = reqCap;
        } else {
            hr = pEnum->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
            isCaptureEndpoint = false;
        }
        if (SUCCEEDED(hr))
            hr = pDevice->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&pClient);
        if (SUCCEEDED(hr))
            hr = pClient->GetMixFormat(&pwfx);
        if (SUCCEEDED(hr))
        {
            REFERENCE_TIME bufferDuration = 200000; // 100ns units → 20 ms
            DWORD streamFlags = isCaptureEndpoint ? 0 : AUDCLNT_STREAMFLAGS_LOOPBACK;
            hr = pClient->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags,
                                     bufferDuration, 0, pwfx, nullptr);
        }
        if (SUCCEEDED(hr))
            hr = pClient->GetService(__uuidof(IAudioCaptureClient), (void**)&pCapture);
        if (SUCCEEDED(hr))
            hr = pClient->Start();

        if (FAILED(hr))
        {
            // Setup failed.  If a *selected* device failed, drop back to the
            // default so we don't get stuck retrying a dead source.
            deviceCleanup();
            if (useReq) { QMutexLocker lk(&m_mutex); m_useReqDevice = false; }
            msleep(500);
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
            QMutexLocker lk(&m_mutex);
            m_curDeviceName.clear();
            if (useReq) for (const AudioDevice &ad : m_devices)
                if (ad.id == reqId) { m_curDeviceName = ad.name; break; }
        }

        const int  sampleRate  = pwfx->nSamplesPerSec;
        const int  numChannels = pwfx->nChannels;
        // Detect IEEE float vs PCM16 format
        const bool isFloat = (pwfx->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) ||
                             (pwfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE &&
                              reinterpret_cast<WAVEFORMATEXTENSIBLE*>(pwfx)->SubFormat ==
                              KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);

        bool deviceLost = false;
        while (m_running && !deviceLost)
        {
            if (m_deviceChangeReq) { deviceLost = true; break; }   // runtime source switch

            UINT32 packetSize = 0;
            hr = pCapture->GetNextPacketSize(&packetSize);
            if (FAILED(hr)) { deviceLost = true; break; }   // e.g. AUDCLNT_E_DEVICE_INVALIDATED

            while (packetSize > 0 && m_running)
            {
                BYTE  *pData     = nullptr;
                UINT32 numFrames = 0;
                DWORD  flags     = 0;

                hr = pCapture->GetBuffer(&pData, &numFrames, &flags, nullptr, nullptr);
                if (FAILED(hr)) { deviceLost = true; break; }

                if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT) && numFrames > 0)
                {
                    const int totalSamples = numFrames * numChannels;
                    const float *src = nullptr;

                    if (isFloat) {
                        src = reinterpret_cast<const float*>(pData);
                    } else {
                        // PCM 16-bit → float
                        const int16_t *pcm = reinterpret_cast<const int16_t*>(pData);
                        int count = std::min(totalSamples, 4096 * 8);
                        for (int i = 0; i < count; ++i)
                            convBuf[i] = pcm[i] / 32768.f;
                        src = convBuf;
                    }

                    processBlock(src, numFrames, std::min(numChannels, 2), sampleRate);

                    // Recording: open on first request, then append the samples.
                    if (m_recReq && !m_wavFile) recOpen(sampleRate);
                    if (m_wavFile)              recWrite(src, numFrames, numChannels);
                }

                pCapture->ReleaseBuffer(numFrames);
                hr = pCapture->GetNextPacketSize(&packetSize);
                if (FAILED(hr)) { deviceLost = true; break; }
            }

            if (m_wavFile && !m_recReq) recClose();   // finalise the WAV when stopped

            msleep(10); // poll every 10 ms
        }

        if (m_wavFile) recClose();   // finalise if recording when the device drops / app stops
        deviceCleanup();
        if (deviceLost && m_running)
            msleep(300); // brief pause before attempting to reconnect
    }

    if (pEnum) pEnum->Release();
    CoUninitialize();
}

/**
 * @brief Core per-block DSP pipeline: 6-band IIR analysis, beat/onset/tempo/section/drop detection, FFT features, mood proxies — publishes AudioFeatures.
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
 * @param data Interleaved float PCM samples for this block.
 * @param numFrames Number of frames in `data`.
 * @param numChannels Number of interleaved channels in `data` (1 or 2).
 * @param sampleRate Sample rate of `data`, in Hz.
 */
void AudioAnalyzer::processBlock(const float *data, int numFrames,
                                 int numChannels, int sampleRate)
{
    // ---- 5 one-pole LP coefficients ----
    // One-pole IIR: y[n] = a*y[n-1] + (1-a)*x[n]
    // ---- Instant-replay ring: keep the last ~32 s of PCM (stereo s16) ----
    {
        QMutexLocker rl(&m_replayMx);
        if( m_replayRing.empty() || m_replayRate != sampleRate )
        {
            m_replayRate = sampleRate;
            m_replayRing.assign( (size_t)sampleRate * 2 * kReplaySeconds, 0 );
            m_replayPos = m_replayCount = 0;
        }
        const size_t cap = m_replayRing.size();
        for( int i = 0; i < numFrames; ++i )
        {
            float l = data[i * numChannels];
            float r = (numChannels > 1) ? data[i * numChannels + 1] : l;
            m_replayRing[m_replayPos]     = (short)(std::max(-1.f, std::min(1.f, l)) * 32000.f);
            m_replayRing[m_replayPos + 1] = (short)(std::max(-1.f, std::min(1.f, r)) * 32000.f);
            m_replayPos = (m_replayPos + 2) % cap;
        }
        m_replayCount = std::min( m_replayCount + (size_t)numFrames,
                                  (size_t)sampleRate * kReplaySeconds );
    }

    // Band extraction by subtraction of adjacent LP outputs.
    const float a60  = coeff(  60.f, sampleRate);
    const float a150 = coeff( 150.f, sampleRate);
    const float a500 = coeff( 500.f, sampleRate);
    const float a2k  = coeff(2000.f, sampleRate);
    const float a6k  = coeff(6000.f, sampleRate);

    // Stereo per-channel 3-band split (low <250 Hz, mid 250-2500 Hz, high >2500 Hz)
    const float aStLo = coeff( 250.f, sampleRate);
    const float aStHi = coeff(2500.f, sampleRate);

    // ---- Ambient-adaptive smoothing (one-pole attack / release) ----
    // Beat mode: fast release (≈0.88-0.93) – visuals snap with each kick.
    // Ambient mode: very slow release (≈0.985-0.99) – majestic long swell.
    // The ambientFactor (0=beat, 1=ambient) blends the two coefficients.
    // At 100 update cycles/sec: release=0.99 → ~37% decay in ~100 frames ≈ 1 s.
    const float af = m_ambientFactor;  // 0=beat, 1=ambient

    // Attack coefficients (same for both modes – fast rise is always desired)
    const float atkSub  = 0.80f;
    const float atkBass = 0.70f;
    const float atkLow  = 0.65f;
    const float atkMid  = 0.60f;
    const float atkUpp  = 0.55f;
    const float atkHigh = 0.50f;

    // Release coefficients: lerp between beat-mode and ambient-mode values
    auto lerpRel = [&](float beat, float amb) { return beat + af * (amb - beat); };
    const float relSub  = lerpRel(0.94f, 0.993f);
    const float relBass = lerpRel(0.93f, 0.990f);
    const float relLow  = lerpRel(0.92f, 0.990f);
    const float relMid  = lerpRel(0.91f, 0.988f);
    const float relUpp  = lerpRel(0.89f, 0.987f);
    const float relHigh = lerpRel(0.88f, 0.985f); // slightly faster so shimmer can breathe

    // ---- Per-sample IIR pass: accumulate squared band energies + ZCR ----
    float accSub  = 0.f, accBass = 0.f, accLow  = 0.f;
    float accMid  = 0.f, accUpp  = 0.f, accHigh = 0.f;
    float accStereoSide = 0.f, accStereoMid = 0.f;   // for stereo width
    float accStLo[2] = {0.f, 0.f}, accStMid[2] = {0.f, 0.f}, accStHi[2] = {0.f, 0.f};
    int   crossings = 0;
    float prevMono  = 0.f;

    for (int i = 0; i < numFrames; ++i)
    {
        // Mix to mono
        float mono = 0.f;
        for (int c = 0; c < numChannels; ++c)
            mono += data[i * numChannels + c];
        mono /= float(numChannels);

        // Waveform ring for `audioWave[64]` (oscilloscope effects).
        m_waveRing[m_waveWritePos] = mono;
        m_waveWritePos = (m_waveWritePos + 1) & (kWaveRing - 1);

        // Per-channel samples (R falls back to L for mono → mirrored spectrum).
        const float L = data[i * numChannels + 0];
        const float R = (numChannels >= 2) ? data[i * numChannels + 1] : L;

        // Stereo width: energy of the side (L-R) vs. mid (L+R) signal.
        if (numChannels >= 2) {
            float side = 0.5f * (L - R);
            float midS = 0.5f * (L + R);
            accStereoSide += side * side;
            accStereoMid  += midS * midS;
        }

        // Stereo-separated spectrum: cheap 3-band split per channel (2 LPs each).
        m_lpStL[0] = aStLo * m_lpStL[0] + (1.f - aStLo) * L;
        m_lpStL[1] = aStHi * m_lpStL[1] + (1.f - aStHi) * L;
        m_lpStR[0] = aStLo * m_lpStR[0] + (1.f - aStLo) * R;
        m_lpStR[1] = aStHi * m_lpStR[1] + (1.f - aStHi) * R;
        const float loL = m_lpStL[0], miL = m_lpStL[1] - m_lpStL[0], hiL = L - m_lpStL[1];
        const float loR = m_lpStR[0], miR = m_lpStR[1] - m_lpStR[0], hiR = R - m_lpStR[1];
        accStLo[0] += loL * loL; accStMid[0] += miL * miL; accStHi[0] += hiL * hiL;
        accStLo[1] += loR * loR; accStMid[1] += miR * miR; accStHi[1] += hiR * hiR;

        // Zero-crossing rate: count sign changes (Temporal feature from paper)
        if ((mono > 0.f && prevMono < 0.f) || (mono < 0.f && prevMono > 0.f))
            crossings++;
        prevMono = mono;

        // Feed ring buffer for FFT (circular, kFFTSize = 2048 samples)
        m_ringBuf[m_ringWrite] = mono;
        m_ringWrite = (m_ringWrite + 1) % kFFTSize;

        // Feed 5 LP filters in parallel (same input, different cutoffs)
        m_lp60  = a60  * m_lp60  + (1.f - a60)  * mono;
        m_lp150 = a150 * m_lp150 + (1.f - a150) * mono;
        m_lp500 = a500 * m_lp500 + (1.f - a500) * mono;
        m_lp2k  = a2k  * m_lp2k  + (1.f - a2k)  * mono;
        m_lp6k  = a6k  * m_lp6k  + (1.f - a6k)  * mono;

        // Extract 6 bands by subtraction of adjacent LP outputs
        float vSub  = m_lp60;                    // 20–60 Hz   sub-bass rumble
        float vBass = m_lp150 - m_lp60;          // 60–150 Hz  drone body / kick
        float vLow  = m_lp500 - m_lp150;         // 150–500 Hz harmonic warmth
        float vMid  = m_lp2k  - m_lp500;         // 500–2k Hz  melody / texture
        float vUpp  = m_lp6k  - m_lp2k;          // 2k–6k Hz   metallic / scrape
        float vHigh = mono    - m_lp6k;          // 6k+ Hz     air / shimmer

        // Accumulate squared amplitudes for RMS calculation
        accSub  += vSub  * vSub;
        accBass += vBass * vBass;
        accLow  += vLow  * vLow;
        accMid  += vMid  * vMid;
        accUpp  += vUpp  * vUpp;
        accHigh += vHigh * vHigh;
    }

    m_frameCounter += float(numFrames);

    // ---- RMS per band ----
    const float inv  = (numFrames > 0) ? 1.f / float(numFrames) : 0.f;
    float rSub  = std::sqrt(accSub  * inv);
    float rBass = std::sqrt(accBass * inv);
    float rLow  = std::sqrt(accLow  * inv);
    float rMid  = std::sqrt(accMid  * inv);
    float rUpp  = std::sqrt(accUpp  * inv);
    float rHigh = std::sqrt(accHigh * inv);

    // ---- Asymmetric attack/release smoothing per band ----
    auto smooth = [](float &s, float v, float atk, float rel) {
        float a = (v > s) ? atk : rel;
        s = a * s + (1.f - a) * v;
    };
    smooth(m_sSubBass,  rSub,  atkSub,  relSub);
    smooth(m_sBass,     rBass, atkBass, relBass);
    smooth(m_sLowMid,   rLow,  atkLow,  relLow);
    smooth(m_sMid,      rMid,  atkMid,  relMid);
    smooth(m_sUpperMid, rUpp,  atkUpp,  relUpp);
    smooth(m_sHigh,     rHigh, atkHigh, relHigh);

    // ---- Beat detection on combined subBass + bass (linear RMS) ----
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
    float beatBand = rSub * 0.35f + rBass * 0.65f;

    m_bassHistory[m_histIdx] = beatBand;
    m_histIdx = (m_histIdx + 1) % kHistoryLen;

    float histMean = 0.f;
    for (float v : m_bassHistory) histMean += v;
    histMean /= float(kHistoryLen);

    bool  isBeat  = false;
    float beatStr = 0.f;

    // Ambient-adaptive beat threshold.
    // Beat music (ambientFactor≈0): threshold = 1.5× histMean  (normal sensitivity).
    // Drone music (ambientFactor≈1): threshold = 4.5× histMean  (requires a true
    // transient 3× above the drone level — small sustain fluctuations never qualify).
    // This is the primary defence against false beats on Köner / Lustmord / Heemann.
    const float dynThresh = kBeatThresholdRatio + m_ambientFactor * 3.0f;

    if (m_beatCooldown > 0.f) {
        m_beatCooldown -= 1.f;
    } else if (histMean > 1e-4f && beatBand > dynThresh * histMean
               && beatBand > m_prevBeatBand * 1.15f) {
        // The rising-edge test (vs. the previous block) makes sure we trigger on
        // the kick's ATTACK only — a long kick/808 tail that is still above the
        // threshold when the cooldown expires must not fire a phantom 2nd beat.
        isBeat         = true;
        beatStr        = std::min((beatBand / (histMean * dynThresh)) - 1.f, 1.f);
        m_beatCooldown = kBeatCooldownFrames;
    }
    m_prevBeatBand = beatBand;

    // ---- Logarithmic (dB) normalisation for shader outputs ----
    // Human hearing is logarithmic. dB mapping gives far better perceived
    // dynamic range for driving visual parameters.
    //   dB = 20 * log10(rms + ε)
    //   Map [-60 dB .. 0 dB] → [0 .. 1]
    auto toNorm = [](float rms) -> float {
        const float dB = 20.f * std::log10(rms + 1e-5f);
        return std::max(0.f, std::min(1.f, (dB + 60.f) / 60.f));
    };

    float subBass  = toNorm(m_sSubBass);
    float bass     = toNorm(m_sBass);
    float lowMid   = toNorm(m_sLowMid);
    float mid      = toNorm(m_sMid);
    float upperMid = toNorm(m_sUpperMid);
    float high     = toNorm(m_sHigh);

    // Overall level: perceptually weighted mix (bass-heavy, as drones tend to be)
    float level = subBass  * 0.15f
                + bass     * 0.30f
                + lowMid   * 0.25f
                + mid      * 0.15f
                + upperMid * 0.10f
                + high     * 0.05f;

    // Rolling ~6 s envelope history, read by the music/speech classifier.
    // Stores the RAW LINEAR per-block band sum, not `level`: `level` is dB-
    // normalised and attack/release smoothed, and both steps erase the pauses
    // this ring exists to find. Measured across 45 clips, the dB/smoothed
    // version put speech and music within 0.001 of each other on every
    // spectral ratio derived from it.
    m_envHistory[m_envIdx] = rSub + rBass + rLow + rMid + rUpp + rHigh;
    m_envIdx = ( m_envIdx + 1 ) % kEnvHistLen;

    // ---- Sharpness (Zwicker-style high-frequency weighting) ----
    // Ratio of high-frequency energy to total: dark drones → ~0, bright/harsh → ~1.
    float sharpNum = 0.40f * mid + 0.70f * upperMid + 1.00f * high;
    float sharpDen = subBass + bass + lowMid + mid + upperMid + high + 1e-6f;
    m_sSharpness   = 0.95f * m_sSharpness + 0.05f * std::min(sharpNum / sharpDen, 1.f);

    // ---- Stereo width: RMS(side) / (RMS(mid) + RMS(side)) ----
    float rawWidth = 0.f;
    if (accStereoMid > 1e-9f) {
        float rmsSide = std::sqrt(accStereoSide * inv);
        float rmsMid  = std::sqrt(accStereoMid  * inv);
        rawWidth = rmsSide / (rmsMid + rmsSide + 1e-6f);
    }
    m_sStereoWidth = 0.90f * m_sStereoWidth + 0.10f * std::min(rawWidth * 2.f, 1.f);

    // ---- Automatic gain control (volume independence) ----
    // Track a slow loudness reference (only while there is signal, with a floor)
    // and normalise the levels the VISUALS see to it, so the same track played
    // quietly or loudly drives the visualisation identically.  A single gain is
    // applied to overall level + all bands, so the spectral SHAPE is preserved;
    // beat / ambient / music-speech detection keep using the raw values.
    if (level > 0.02f)
        m_loudnessRef = 0.9995f * m_loudnessRef + 0.0005f * level;  // ~ tens of seconds
    m_loudnessRef = std::max(m_loudnessRef, 0.04f);                 // don't amplify near-silence
    const float kTargetLevel = 0.40f;                              // average music → ~0.40
    float agcGain = std::max(0.3f, std::min(kTargetLevel / m_loudnessRef, 5.0f));

    float nLevel    = std::min(level    * agcGain, 1.f);
    float nSubBass  = std::min(subBass  * agcGain, 1.f);
    float nBass     = std::min(bass     * agcGain, 1.f);
    float nLowMid   = std::min(lowMid   * agcGain, 1.f);
    float nMid      = std::min(mid      * agcGain, 1.f);
    float nUpperMid = std::min(upperMid * agcGain, 1.f);
    float nHigh     = std::min(high     * agcGain, 1.f);

    // ---- Stereo per-channel band levels (AGC-normalised, lightly smoothed) ----
    {
        auto smCh = [](float &s, float v) { s = 0.7f * s + 0.3f * v; };
        for (int ch = 0; ch < 2; ++ch) {
            smCh(m_sStBand[ch][0], std::min(std::sqrt(accStLo[ch]  * inv) * agcGain, 1.f));
            smCh(m_sStBand[ch][1], std::min(std::sqrt(accStMid[ch] * inv) * agcGain, 1.f));
            smCh(m_sStBand[ch][2], std::min(std::sqrt(accStHi[ch]  * inv) * agcGain, 1.f));
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
    if (level > 0.05f && m_sMusicPresence > 0.45f)
    {
        // Calibrated against the offline test WAVs: a 120 BPM kick pattern
        // measures sim ~0.32, a sustained 4-partial drone ~0.82.
        float harm = (m_sSpecSim - 0.50f) / 0.25f;
        harm = std::max(0.f, std::min(harm, 1.f));
        float perc = std::min(m_onsetRate / 2.5f, 1.f);       // >=2.5 onsets/s = fully percussive
        float targetAmbient = harm * (1.f - perc) * (1.f - m_sRhythm);

        // Transition speeds: rising into ambient stays deliberate (~2 s); the
        // fall back to beat mode is nearly as fast (~2.5 s) so the beat
        // threshold recovers quickly when a rhythm starts.
        const float ambSpeedRise = 0.005f;  // 200 blocks ≈ 2 s
        const float ambSpeedFall = 0.004f;  // 250 blocks ≈ 2.5 s
        float ambientSpeed = (targetAmbient > m_ambientFactor) ? ambSpeedRise : ambSpeedFall;
        m_ambientFactor += ambientSpeed * (targetAmbient - m_ambientFactor);
    }

    // ---- Speed scale envelope ----
    // On beat: m_beatPulse jumps then decays at 0.85×/cycle → 4-frame ramp.
    // In ambient mode: speed tracks spectral flux (drone moves when it changes).
    // beatPulse magnitude is gated by ambientFactor:
    //   ambientFactor=0 → full pulse (1 + beatStr*2, up to 3.0)
    //   ambientFactor=1 → almost no pulse (×0.05 = max 0.15)
    // Even if the raised threshold above lets a drone fluctuation through as a "beat",
    // the resulting visual flash is negligible because beatDecay ≤ 0.15/3 = 0.05.
    if (isBeat) m_beatPulse = (1.f + beatStr * 2.f) * (1.f - m_ambientFactor * 0.95f);
    m_beatPulse = std::max(m_beatPulse * 0.85f, 0.f);

    // Kick dominance: a leaky rate of DETECTED BASS-DRUM beats.  While a
    // steady kick grid is running (>= ~1 kick/s) the full-spectrum onsets
    // below (snares/hats/melodic hits) contribute far less to the global
    // pulse — the picture pumps ON the kick grid instead of on every hi-hat
    // ("hectic, off-rhythm" feel).  Without a kick (kickRate -> 0) the
    // onsets keep their full drive, so kick-less genres stay reactive.
    if (isBeat) m_kickRate += 0.333f;
    m_kickRate *= 0.99667f;                  // tau ~3 s -> ~kicks per second

    // ---- Downbeat accent: accent the bar's "1" ----
    // Triggered below from the continuous beat phase (every 4th beat), which is
    // far more reliable than counting kick transients (works for kick-light music
    // via the autocorrelation tempo too); here we just decay the pulse.
    m_downbeatPulse = std::max(m_downbeatPulse * 0.92f, 0.f);

    // ---- Power (distortion) scale ----
    float powerScale = (1.f + high * 2.f)    * (1.f - m_ambientFactor)
                     + (1.f + level * 0.5f)  * m_ambientFactor;

    // ---- beatDecay: smooth decaying pulse 0..1 for shaders ----
    // Jumps to >0 on a beat and decays in ~4-5 frames (40-50 ms).
    // Shaders can use this for a sustained visual pop, unlike the one-frame isBeat flag.
    float beatDecay = std::min(m_beatPulse / 3.f, 1.f);

    // ---- Spectral Flux (6-band) ----
    // Measures positive-only inter-frame change across all bands.
    // Zero for a perfectly static held drone; peaks when layers enter or leave.
    // Primary motion driver for the dark ambient tunnel shader.
    float rawFlux = std::max(0.f, subBass  - m_prevSubBass)
                  + std::max(0.f, bass     - m_prevBass)
                  + std::max(0.f, lowMid   - m_prevLowMid)
                  + std::max(0.f, mid      - m_prevMid)
                  + std::max(0.f, upperMid - m_prevUpperMid)
                  + std::max(0.f, high     - m_prevHigh);

    m_prevSubBass  = subBass;
    m_prevBass     = bass;
    m_prevLowMid   = lowMid;
    m_prevMid      = mid;
    m_prevUpperMid = upperMid;
    m_prevHigh     = high;

    m_sFlux = 0.7f * m_sFlux + 0.3f * rawFlux;
    float spectralFlux = std::min(m_sFlux / 0.15f, 1.f);

    // ---- Spectral-flux variance over ~1 s ("restlessness") ----
    m_fluxHistory[m_fluxIdx] = spectralFlux;
    m_fluxIdx = (m_fluxIdx + 1) % kFluxHistLen;
    float fMean = 0.f;
    for (float v : m_fluxHistory) fMean += v;
    fMean /= float(kFluxHistLen);
    float fVar = 0.f;
    for (float v : m_fluxHistory) { float d = v - fMean; fVar += d * d; }
    fVar /= float(kFluxHistLen);
    m_sFluxVar = 0.90f * m_sFluxVar + 0.10f * std::min(std::sqrt(fVar) * 4.f, 1.f);

    // ---- Full-spectrum onset detection (snares / claps / melodic, not just kicks) ----
    // Peak-pick the onset detection function: an onset is a clear rising jump
    // above its recent average.  The ODF is the FFT-based normalised spectral
    // flux (m_odfFFT) — the old per-block band-RMS deltas rippled on sustained
    // low-frequency content and fired ~10 phantom onsets/sec on pure drones,
    // which in turn faked a "rhythm" and kept ambientFactor at 0.  A detected
    // onset boosts the visual beat pulse, so the SAME beat-driven reactions
    // (zoom, rotation kick) fire across every genre.
    float onsetStrength = 0.f;
    if (m_onsetCooldown > 0.f) {
        m_onsetCooldown -= 1.f;
    } else if (m_odfFFT > m_onsetAvg * 2.2f + 0.060f && m_odfFFT > m_prevODF) {
        // SPIKE test: a real onset is a jump far above its own short-term average
        // (2.2x + 0.06 abs).  Slowly swelling drones keep the ODF *steadily*
        // elevated — near its average — so they no longer fire; a kick from
        // silence exceeds many times its decayed average.
        onsetStrength  = std::min((m_odfFFT / (m_onsetAvg * 2.2f + 1e-4f)) - 1.f, 1.f);
        m_onsetCooldown = 5.f;
        // Kick-dominant global pulse: with a running bass-drum grid the
        // non-kick onsets only NUDGE the pulse (25%), on kick-less material
        // they carry it fully (see m_kickRate above).
        float kickDom    = std::min(m_kickRate / 1.2f, 1.f);
        float onsetPulse = (0.6f + 0.8f * onsetStrength)
                         * (1.f - m_ambientFactor * 0.9f)
                         * (1.f - 0.75f * kickDom);
        m_beatPulse = std::max(m_beatPulse, onsetPulse);
        m_onsetRate += 0.333f;               // leaky integrator: += 1/tau per event
    }
    m_onsetRate *= 0.99667f;                 // tau ~3 s at ~100 blocks/s -> ~onsets/sec
    m_onsetAvg = 0.95f * m_onsetAvg + 0.05f * m_odfFFT;
    m_prevODF  = m_odfFFT;

    // Re-derive the decaying beat pulse now that onsets are folded into m_beatPulse.
    beatDecay = std::min(m_beatPulse / 3.f, 1.f);

    // ---- Track-change detection (sustained silence -> first onset/energy) ----
    // When the audio goes near-silent for a while (track ends / is changed) and
    // then sound returns, fire a one-shot flag so the host can start the new
    // track with a clean, fresh transition instead of mid-effect.
    bool trackChange = false;
    {
        const float silenceThresh = 0.015f;   // raw level below this ≈ silence
        if (level < silenceThresh) {
            m_silenceFrames += 1.f;
            if (m_silenceFrames > 60.f)        // ~0.6 s+ of silence → armed
                m_wasSilent = true;
        } else {
            // A DJ STOP claims short gaps (the break machinery below freezes
            // and slam-resumes) — only an unclaimed silence means a new track.
            if (m_wasSilent && !m_stopActive
                && (onsetStrength > 0.25f || level > 0.05f))
                trackChange = true;            // first real sound after the gap
            m_silenceFrames = 0.f;
            m_wasSilent = false;
        }
    }

    // ---- Autocorrelation tempo ----
    // Feed the onset detection function into a fixed-rate envelope, then autocorrelate
    // it over the natural-tempo lag range (70..180 BPM).  The peak lag gives a robust
    // tempo estimate (and confidence) that refines the inter-beat BPM below.
    {
        int framesPerEnv = std::max(1, sampleRate / kEnvRate);
        m_envFrameAcc += numFrames;
        while (m_envFrameAcc >= framesPerEnv) {
            m_envFrameAcc -= framesPerEnv;
            // FFT-based ODF: the old band-RMS flux rippled on sustained bass and
            // made the autocorrelation "find" a phantom tempo in pure drones.
            m_odfEnv[m_odfEnvIdx] = m_odfFFT;
            m_odfEnvIdx = (m_odfEnvIdx + 1) % kOdfEnvLen;
        }
        const int lagLo = (60 * kEnvRate) / 180;   // 33 samples (180 BPM)
        const int lagHi = (60 * kEnvRate) / 70;    // 85 samples (70 BPM)
        float envSum = 0.f;
        for (int i = 0; i < kOdfEnvLen; ++i) envSum += m_odfEnv[i];
        float envMean = envSum / float(kOdfEnvLen);
        // MEAN-REMOVED variance: the raw ODF envelope is all-positive (DC-heavy)
        // and the normalised AC of a DC-dominated signal is ~1 at EVERY lag.
        float acZ = 1e-6f;
        for (int i = 0; i < kOdfEnvLen; ++i) {
            float z = m_odfEnv[i] - envMean;
            acZ += z * z;
        }
        float envStd = std::sqrt(acZ / float(kOdfEnvLen));
        // Published for KALEIDO_SPEECH_DEBUG so the state below stays checkable.
        m_odfEnvMean = envMean;
        m_odfEnvStd  = envStd;

        // KNOWN DEAD, measured 2026-08-22 -- left in place deliberately, see
        // docs/engine-internals.md ("Autocorrelation tempo").
        //
        // `envStd < 0.050f` was calibrated against the BAND-RMS onset function
        // this block used to consume ("a kick envelope measures std ~0.14").
        // The ODF was later swapped for the FFT-based one without re-deriving
        // the threshold, and on that scale real music sits at 0.021..0.038 --
        // so this gate has been closed permanently ever since and m_acConf
        // reads exactly 0.000 on all 45 corpus clips. Since
        // `rhythm = max(kickRhythm, m_acConf)` and the BPM fusion below is
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
        if (envMean < 0.010f || envStd < 0.050f)
        {
            m_acConf *= 0.98f;
        }
        else
        {
            float bestAc = 0.f; int bestLag = 0;
            for (int lag = lagLo; lag <= lagHi; ++lag) {
                float ac = 0.f;
                for (int i = 0; i + lag < kOdfEnvLen; ++i)
                    ac += (m_odfEnv[i] - envMean) * (m_odfEnv[i + lag] - envMean);
                if (ac > bestAc) { bestAc = ac; bestLag = lag; }
            }
            if (bestLag > 0) {
                float bpm  = float(60 * kEnvRate) / float(bestLag);
                float conf = bestAc / acZ;
                m_acConf = 0.90f * m_acConf + 0.10f * std::min(conf * 2.f, 1.f);
                m_acBPM  = (m_acBPM < 1.f) ? bpm : 0.90f * m_acBPM + 0.10f * bpm;
            }
        }
    }

    // ---- Spectral Centroid (6-band, log-spaced frequency weights) ----
    // Each weight is the log-normalised centre frequency of that band,
    // mapped to [0..1] over the audible range (20 Hz – 20 kHz).
    //   pos = (log10(fc) - log10(20)) / (log10(20000) - log10(20))
    //   subBass  fc≈ 40 Hz  → 0.10
    //   bass     fc≈100 Hz  → 0.23
    //   lowMid   fc≈275 Hz  → 0.38
    //   mid      fc≈1000 Hz → 0.57
    //   upperMid fc≈3500 Hz → 0.75
    //   high     fc≈13000 Hz→ 0.94
    static const float kCentroidWeights[6] = { 0.10f, 0.23f, 0.38f, 0.57f, 0.75f, 0.94f };
    float bands6[6] = { subBass, bass, lowMid, mid, upperMid, high };

    float totalEnergy = 1e-6f;
    float rawCentroid = 0.f;
    for (int k = 0; k < 6; ++k) {
        totalEnergy += bands6[k];
        rawCentroid += bands6[k] * kCentroidWeights[k];
    }
    rawCentroid /= totalEnergy;

    // Very slow smoothing: colour temperature should drift like sunrise/sunset,
    // not flash with every transient.
    float smoothedCentroid = 0.98f * m_features.spectralCentroid + 0.02f * rawCentroid;

    // ---- Zero-Crossing Rate (ZCR) ----
    // Normalise: typical tonal music sits at 0-0.10 crossings/sample,
    // noise/harsh textures reach 0.25+.  Clip to [0,1].
    float rawZCR = (numFrames > 0) ? float(crossings) / float(numFrames) : 0.f;
    m_sZCR = 0.92f * m_sZCR + 0.08f * std::min(rawZCR / 0.25f, 1.f);

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
        float logSum = 0.f, sumB = 1e-6f;
        for (int k = 0; k < 6; ++k) { logSum += std::log(b[k] + 1e-6f); sumB += b[k]; }
        float geoMean   = std::exp(logSum / 6.f);
        float arithMean = sumB / 6.f;
        float rawSFM    = (arithMean > 1e-6f) ? geoMean / arithMean : 0.f;
        m_sSFM = 0.93f * m_sSFM + 0.07f * std::min(rawSFM, 1.f);
    }

    // ---- Log Attack Time (onset sharpness) ----
    // Measures how quickly the overall level rises frame-to-frame.
    // Fast rise (> threshold in one cycle) = sharp attack (kick, metal hit).
    // Very slow rise = pad swell, drone layer entry.
    {
        float rise = std::max(level - m_prevLevel, 0.f);
        // 0.05 per cycle = moderate attack; clip fast transients to 1.
        float rawAttack = std::min(rise / 0.05f, 1.f);
        m_attackAccum = 0.85f * m_attackAccum + 0.15f * rawAttack;
        m_prevLevel   = level;
    }

    // ---- BPM estimation from inter-beat intervals ----
    // Store the time (in samples) between the last kBPMHistLen beats.
    // Smooth the resulting BPM to avoid jitter.
    // Octave folding: tempo estimators readily lock onto half or double the true
    // tempo (kicks on every 2nd beat, or a busy hi-hat grid).  Fold every
    // estimate into the canonical [70..180) BPM dance range — visually, pulsing
    // at exactly half/double tempo is still ON the grid, so a folded estimate is
    // always safe, while an unfolded 240 would pulse between the beats.
    auto foldBPM = [](float bpm) {
        if (bpm < 1.f) return bpm;
        while (bpm <  70.f) bpm *= 2.f;
        while (bpm >= 180.f) bpm *= 0.5f;
        return bpm;
    };
    float estimatedBPM = m_smoothedBPM;
    if (isBeat) {
        float intervalFrames = m_frameCounter - m_lastBeatFrame;
        m_lastBeatFrame = m_frameCounter;
        if (intervalFrames > 0.f && intervalFrames < float(sampleRate) * 3.f) {
            // Convert sample interval to BPM
            float bpm = foldBPM(float(sampleRate) * 60.f / intervalFrames);
            m_beatIntervals[m_bpmIdx] = bpm;
            m_bpmIdx = (m_bpmIdx + 1) % kBPMHistLen;

            float bpmSum = 0.f;
            for (float v : m_beatIntervals) bpmSum += v;
            float meanBPM = bpmSum / float(kBPMHistLen);

            // Smooth BPM estimate (slow — tempo should drift, not jump)
            m_smoothedBPM = 0.85f * m_smoothedBPM + 0.15f * meanBPM;
        }
    }
    // Refine the tempo with the autocorrelation estimate when it is confident
    // (robust for tracks where the kick-based inter-beat estimate is noisy).
    if (m_acConf > 0.35f && m_acBPM > 1.f) {
        float acFolded = foldBPM(m_acBPM);
        if (m_smoothedBPM < 1.f) m_smoothedBPM = acFolded;
        else                     m_smoothedBPM = 0.97f * m_smoothedBPM + 0.03f * acFolded;
    }
    m_smoothedBPM = foldBPM(m_smoothedBPM);

    // Normalise BPM to [0,1] over 40..200 BPM — every frame, not only on beats.
    estimatedBPM = std::max(0.f, std::min((m_smoothedBPM - 40.f) / 160.f, 1.f));

    // ---- Rhythm strength: beat-interval (tempo) consistency × recency ----
    // Regular, recent beats → ~1; irregular / no recent beats / speech → ~0.
    float framesSinceBeat = m_frameCounter - m_lastBeatFrame;
    float recency = std::exp(-framesSinceBeat / (2.0f * float(sampleRate)));  // ~2 s
    float ibMean = 0.f;
    for (float v : m_beatIntervals) ibMean += v;
    ibMean /= float(kBPMHistLen);
    float ibVar = 0.f;
    for (float v : m_beatIntervals) { float d = v - ibMean; ibVar += d * d; }
    ibVar /= float(kBPMHistLen);
    float ibCV       = (ibMean > 1e-3f) ? std::sqrt(ibVar) / ibMean : 1.f;
    float kickRhythm = std::max(0.f, 1.f - ibCV) * recency;
    // A steady onset envelope (autocorrelation confidence) also means "rhythmic",
    // so genres without a strong kick still register a rhythm.
    float rhythm = std::max(kickRhythm, m_acConf);
    m_sRhythm = 0.90f * m_sRhythm + 0.10f * rhythm;

    // ---- Continuous beat phase 0..1 (wraps every beat) from the tempo ----
    float beatPhase = 0.f;
    if (m_smoothedBPM > 1.f) {
        float beatPeriodFrames = float(sampleRate) * 60.f / m_smoothedBPM;
        if (beatPeriodFrames > 1.f) {
            float ph = framesSinceBeat / beatPeriodFrames;
            beatPhase = ph - std::floor(ph);
        }
    }

    // True downbeat (bar tracking).  Every detected beat's strength is
    // accumulated into its position within the 4-beat bar (with per-bar decay);
    // the consistently-strongest position is the musical "1" — instead of the
    // old "every 4th wrap from an arbitrary start", the accent now lands on the
    // actual bar line (kick/accent on the 1 outweighs snares on 2 & 4).
    if (isBeat) {
        // A beat firing just before the phase wrap belongs to the NEXT position.
        int slot = (m_prevBeatPhase > 0.5f) ? ((m_barBeat + 1) & 3) : m_barBeat;
        m_barAccum[slot] = 0.80f * m_barAccum[slot] + (0.4f + beatStr);
    }
    if (m_smoothedBPM > 1.f && m_prevBeatPhase > 0.65f && beatPhase < 0.35f) {
        m_barBeat = (m_barBeat + 1) & 3;
        int best = 0;
        for (int k = 1; k < 4; ++k)
            if (m_barAccum[k] > m_barAccum[best]) best = k;
        if (m_barBeat == best) m_downbeatPulse = 1.f;
    }
    m_prevBeatPhase = beatPhase;
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
    auto nrm = []( float v, float lo, float hi ) {
        return std::max( 0.f, std::min( ( v - lo ) / ( hi - lo ), 1.f ) );
    };

    // Arousal: AUC on the corpus -- flux 0.911, rhythm 0.885, tempo 0.849,
    // sharpness 0.802. The old formula's biggest term was the AGC-normalised
    // level at AUC 0.557: the AGC exists to remove exactly the loudness
    // differences that term was supposed to measure, so it measured nothing.
    float arousal = 0.30f * nrm( spectralFlux,  0.019f, 0.086f )
                  + 0.30f * m_sRhythm
                  + 0.22f * nrm( estimatedBPM,  0.313f, 0.578f )
                  + 0.18f * nrm( m_sSharpness,  0.279f, 0.326f );

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
        static const QByteArray forced = qgetenv( "KALEIDO_FORCE_MOOD" );
        if( !forced.isEmpty() )
        {
            const QList<QByteArray> parts = forced.split( ',' );
            if( parts.size() == 2 )
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
        static const bool dbg = qEnvironmentVariableIsSet( "KALEIDO_MOOD_DEBUG" );
        static int dbgN = 0;
        if( dbg && ( ++dbgN % 100 ) == 0 )
            fprintf( stderr,
                     "MOOD val=%.3f aro=%.3f | mode=%.3f keyClar=%.3f centroid=%.3f "
                     "sfm=%.3f rough=%.3f roughRaw=%.4f rhythm=%.3f | nLvl=%.3f bpmN=%.3f flux=%.3f sharp=%.3f "
                     "ambient=%.3f\n",
                     valence, arousal, m_sMode, m_sKeyClarity, smoothedCentroid,
                     m_sSFM, m_sRoughness, m_roughRaw, m_sRhythm, nLevel, estimatedBPM, spectralFlux,
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
    float beatScale   = 0.7f + 0.9f * arousal + 1.2f * estimatedBPM;   // 0.7 .. ~2.8
    float timingScale = beatScale * (1.f - m_ambientFactor)
                      + 0.10f * m_ambientFactor;             // ambient: down to 0.10×
    // Smooth slowly so transitions aren't abrupt
    float prevTimingScale = m_features.timingScale;
    timingScale = 0.998f * prevTimingScale + 0.002f * timingScale;

    // ---- Beat-triggered discrete changes (sub-sampled to avoid restlessness) ----
    // FIX for "too restless": sides change only every 4 beats, flip every 8.
    // In ambient mode (few/no beats) these rarely trigger anyway.
    int   beatSidesHint = m_currentSides;
    float audioFlip     = m_flipDir;

    // Discrete visual changes are gated by ambientFactor.
    // In ambient / drone mode (ambientFactor > 0.4) these changes are suppressed
    // entirely — a static drone like Köner's Daikan should produce a single,
    // slowly evolving geometry that holds for minutes, not one that flips every
    // few seconds due to false beats.
    if (isBeat && m_ambientFactor < 0.4f) {
        m_beatCount++;

        // Change kaleidoscope symmetry only every 16 beats (≈ every 4 bars) so it
        // is a rare, deliberate event rather than a constant churn.
        if (m_beatCount % 16 == 0) {
            static const int kSidesSet[]  = { 3, 4, 6, 8, 10, 12 };
            static const int kSidesCount  = 6;
            int idx;
            do { idx = rand() % kSidesCount; } while (kSidesSet[idx] == m_currentSides);
            m_currentSides = kSidesSet[idx];
            beatSidesHint  = m_currentSides;
        }

        // Flip rotation only every 8 beats, only on very strong beats (strength > 0.6)
        if (m_beatCount % 8 == 0 && beatStr > 0.6f && (rand() % 10) < 4) {
            m_flipDir = -m_flipDir;
            audioFlip = m_flipDir;
        }
    }

    // ========================================================================
    // FFT-based spectral analysis
    // ========================================================================
    // Linearise ring buffer: oldest sample first → in-place FFT input.
    // After the per-sample loop above, m_ringWrite points to the slot that
    // will be overwritten NEXT, so (m_ringWrite + i) % kFFTSize gives sample i
    // in chronological order (oldest i=0, newest i=kFFTSize-1).
    for (int i = 0; i < kFFTSize; ++i) {
        int src    = (m_ringWrite + i) % kFFTSize;
        m_fftRe[i] = m_ringBuf[src] * m_fftWin[i];  // apply Hann window
        m_fftIm[i] = 0.f;
    }
    radix2fft(m_fftRe, m_fftIm, kFFTSize);

    // Compute magnitude spectrum for k = 0 .. kFFTHalf-1.
    // (The upper half k > kFFTHalf is conjugate-symmetric; discard it.)
    float mags[kFFTHalf];
    float totalMagSq = 1e-10f;
    for (int k = 0; k < kFFTHalf; ++k) {
        float mag  = std::sqrt(m_fftRe[k]*m_fftRe[k] + m_fftIm[k]*m_fftIm[k]);
        mags[k]    = mag;
        totalMagSq += mag * mag;
    }

    // ---- HPSS-inspired harmonicity (see m_sSpecSim in the header) ----
    // Cosine similarity of this frame's magnitude spectrum vs. the previous one.
    // This measures CONTENT (harmonic-sustained vs. percussive-transient), which
    // is what actually separates drone/ambient music from beat music — unlike
    // the old loudness-variance test, which misfiled steady full-mix electronic
    // music as "ambient".  (Cheap stand-in for full median-filter HPSS.)
    {
        float dot = 0.f, na = 1e-9f, nb = 1e-9f;
        for (int k = 1; k < kFFTHalf; ++k) {
            dot += mags[k] * m_prevMags[k];
            na  += mags[k] * mags[k];
            nb  += m_prevMags[k] * m_prevMags[k];
        }
        if (totalMagSq > 1e-6f)   // silence: hold (nothing to classify)
        {
            float sim = dot / std::sqrt(na * nb);
            if (sim < m_sSpecSim) m_sSpecSim = 0.70f * m_sSpecSim + 0.30f * sim;   // dip fast
            else                  m_sSpecSim = 0.995f * m_sSpecSim + 0.005f * sim; // recover slow
        }

        std::memcpy(m_prevMags, mags, sizeof(mags));
    }

    // ---- 32-band log-spaced spectrum for the analyzer effects ----
    // Group the FFT magnitudes into perceptually-spaced bands (~40 Hz..16 kHz)
    // and self-normalise with a decaying-peak reference so the loudest band sits
    // near 1.0 and the rest scale under it (a lively, volume-independent analyzer).
    {
        const int   NB    = AudioFeatures::kSpectrumBands;
        const float fLo   = 40.f, fHi = 16000.f;
        const float binHz = float(sampleRate) / float(kFFTSize);
        float raw[AudioFeatures::kSpectrumBands];
        float frameMax = 1e-6f;
        for (int b = 0; b < NB; ++b) {
            float f0 = fLo * std::pow(fHi / fLo, float(b)     / float(NB));
            float f1 = fLo * std::pow(fHi / fLo, float(b + 1) / float(NB));
            int   k0 = std::max(1, int(f0 / binHz));
            int   k1 = std::min(kFFTHalf - 1, std::max(k0 + 1, int(f1 / binHz)));
            float acc = 0.f; int cnt = 0;
            for (int k = k0; k < k1; ++k) { acc += mags[k] * mags[k]; ++cnt; }
            raw[b]   = (cnt > 0) ? std::sqrt(acc / float(cnt)) : 0.f;
            frameMax = std::max(frameMax, raw[b]);
        }
        m_specRef = std::max(m_specRef * 0.98f, frameMax);   // slow-decaying peak
        m_specRef = std::max(m_specRef, 1e-4f);              // floor → silence stays low
        for (int b = 0; b < NB; ++b) {
            float v = std::min(raw[b] / m_specRef, 1.f);
            v = std::pow(v, 0.6f);                            // lift mid bands for visibility
            m_sSpectrum[b] = 0.55f * m_sSpectrum[b] + 0.45f * v;   // fast attack, mild smoothing
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
            float posG[3] = { 0.f, 0.f, 0.f };
            float refG[3] = { 1e-6f, 1e-6f, 1e-6f };
            for (int b = 0; b < NB; ++b) {
                float r = m_bandRef32[b];
                float d = raw[b] - r;
                int   g = (b < 8) ? 0 : (b < 20) ? 1 : 2;   // kick / snare / hat bands
                if (d > 0.f) { pos += d; posG[g] += d; }
                ref += r;  refG[g] += r;
                m_bandRef32[b] = std::max(raw[b], r * 0.985f);  // ~650 ms release: slow
                // enough that beating drone partials stay under their recent peak
                // (a kick still exceeds its half-decayed reference many times over)
            }
            m_odfFFT = (frameMax > 1e-4f) ? (pos / ref) : 0.f;

            // Instrument-separated onsets: the same spike test as the global
            // onset, but per band group, each against its own running average.
            for (int g = 0; g < 3; ++g) {
                float odf = (frameMax > 1e-4f) ? (posG[g] / refG[g]) : 0.f;
                if (m_onsetCoolGrp[g] > 0) {
                    --m_onsetCoolGrp[g];
                } else if (odf > m_onsetAvgGrp[g] * 2.2f + 0.060f) {
                    float str = std::min(odf / (m_onsetAvgGrp[g] * 2.2f + 1e-4f) - 1.f, 1.f);
                    m_onsetEnvGrp[g] = std::max(m_onsetEnvGrp[g], str);
                    m_onsetCoolGrp[g] = 12;                  // >= 120 ms between hits
                }
                m_onsetAvgGrp[g] = 0.95f * m_onsetAvgGrp[g] + 0.05f * odf;
                m_onsetEnvGrp[g] *= 0.93f;                   // ~150 ms decay
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
            for (int b = 0; b < NB; ++b) sum += raw[b];
            // Bias-corrected EMAs: alpha = max(nominal, 1/(n+1)) makes both
            // averages track the true mean from the very first block instead
            // of converging up from their zero initialisation.  (Without this
            // the slow level average lags for ~1 min and the level term reads
            // as permanent "novelty" -> phantom triggers on the cooldown grid.)
            float aBias = 1.f / float(m_secWarm + 1);
            float aF = std::max(0.004f,   aBias);   // tau ~2.5 s at 100 blocks/s
            float aS = std::max(0.00056f, aBias);   // tau ~18 s
            float aP = std::max(0.01f,    aBias);   // tau ~1 s (fingerprint)
            for (int b = 0; b < NB; ++b) {
                float sh = raw[b] / sum;
                m_secFast[b]  += aF * (sh - m_secFast[b]);
                m_secSlow[b]  += aS * (sh - m_secSlow[b]);
                m_secPrint[b] += aP * (sh - m_secPrint[b]);
            }
            m_secFastLvl += aF * (sum - m_secFastLvl);
            m_secSlowLvl += aS * (sum - m_secSlowLvl);

            float dotFS = 0.f, nF = 1e-9f, nS = 1e-9f;
            for (int b = 0; b < NB; ++b) {
                dotFS += m_secFast[b] * m_secSlow[b];
                nF    += m_secFast[b] * m_secFast[b];
                nS    += m_secSlow[b] * m_secSlow[b];
            }
            float shapeDist = 1.f - dotFS / std::sqrt(nF * nS);
            float lvlDist   = std::fabs(std::log((m_secFastLvl + 1e-5f)
                                               / (m_secSlowLvl + 1e-5f)));
            m_secNovelty = shapeDist * 3.0f + lvlDist * 0.5f;

            if (m_secWarm < 1000000) ++m_secWarm;
            if (m_secCooldown > 0)   --m_secCooldown;

            // Trigger: enough history for the averages to mean something
            // (>= 8 s), music actually playing, not silence, novelty clearly
            // above the steady-state floor.  The cooldown keeps sections
            // >= ~12 s apart (no verse is shorter).
            if (m_secWarm > 800 && m_secCooldown == 0 &&
                m_sMusicPresence > 0.5f && sum > 1e-3f &&
                m_secNovelty > 0.20f)
            {
                ++m_sectionCount;
                m_secCooldown = 1200;
                // Re-anchor the long-term average fully onto the new section
                // so the novelty tail dies out (no echo triggers).
                for (int b = 0; b < NB; ++b)
                    m_secSlow[b] = m_secFast[b];
                m_secSlowLvl = m_secFastLvl;

                // ---- Song-structure memory: recognise returning sections ----
                // Match the ~1 s fingerprint against every stored section
                // print (cosine similarity).  A close match means this section
                // has been heard before (chorus #2 = chorus #1) -> same id;
                // otherwise store it as a new section (LRU replacement).
                {
                    int   best = -1; float bestSim = 0.f;
                    float nP = 1e-9f;
                    for (int b = 0; b < NB; ++b) nP += m_secPrint[b] * m_secPrint[b];
                    for (int i = 0; i < m_secPrintN; ++i) {
                        float d = 0.f, nQ = 1e-9f;
                        for (int b = 0; b < NB; ++b) {
                            d  += m_secPrint[b] * m_secPrints[i][b];
                            nQ += m_secPrints[i][b] * m_secPrints[i][b];
                        }
                        float sim = d / std::sqrt(nP * nQ);
                        if (sim > bestSim) { bestSim = sim; best = i; }
                    }
                    if (best >= 0 && bestSim > 0.988f) {
                        // Returning section: refresh its print (running blend).
                        m_secCurId = best;
                        for (int b = 0; b < NB; ++b)
                            m_secPrints[best][b] += 0.3f * (m_secPrint[b] - m_secPrints[best][b]);
                    } else {
                        // New section: store (replace the least recently used).
                        int slot = m_secPrintN;
                        if (m_secPrintN < kMaxSectionPrints) ++m_secPrintN;
                        else {
                            slot = 0;
                            for (int i = 1; i < kMaxSectionPrints; ++i)
                                if (m_secPrintUse[i] < m_secPrintUse[slot]) slot = i;
                        }
                        std::memcpy(m_secPrints[slot], m_secPrint, sizeof(m_secPrint));
                        m_secCurId = slot;
                    }
                    m_secPrintUse[m_secCurId] = m_sectionCount;   // LRU stamp
                    fprintf(stderr, "SECTION change #%d -> id %d (%s, sim %.3f, "
                            "novelty %.3f, t=%.1fs)\n",
                            m_sectionCount, m_secCurId,
                            (best >= 0 && bestSim > 0.988f) ? "known" : "new",
                            bestSim, m_secNovelty, float(m_secWarm) * 0.01f);
                }
            }
        }
    }

    // ---- Spectral Rolloff ----
    // Find the bin below which 85% of total spectral energy lies.
    // Low rolloff: dark sub-bass drone.  High rolloff: cymbals / bright pads.
    {
        float cumMagSq = 0.f;
        int   rBin     = kFFTHalf - 1;
        for (int k = 1; k < kFFTHalf; ++k) {
            cumMagSq += mags[k] * mags[k];
            if (cumMagSq >= 0.85f * totalMagSq) { rBin = k; break; }
        }
        float rollHz   = float(rBin) * float(sampleRate) / float(kFFTSize);
        float rollNorm = std::min(rollHz / (float(sampleRate) * 0.5f), 1.f);
        m_sRolloff = 0.95f * m_sRolloff + 0.05f * rollNorm;
    }

    // ---- Spectral Spread (standard deviation around FFT centroid) ----
    // Narrow spread: pure sine / single drone tone.  Wide: full-band noise.
    {
        float wSum = 0.f, mSum = 1e-6f;
        for (int k = 1; k < kFFTHalf; ++k) {
            float f = float(k) * float(sampleRate) / float(kFFTSize);
            wSum += f * mags[k];
            mSum += mags[k];
        }
        float centHz = wSum / mSum;

        float varSum = 0.f;
        for (int k = 1; k < kFFTHalf; ++k) {
            float f = float(k) * float(sampleRate) / float(kFFTSize);
            float d = f - centHz;
            varSum += d * d * mags[k];
        }
        float spreadNorm = std::min(std::sqrt(varSum / mSum) / 5000.f, 1.f);
        m_sSpread = 0.95f * m_sSpread + 0.05f * spreadNorm;
    }

    // ---- Roughness (sensory dissonance, Plomp-Levelt / Sethares) ----
    // Beating between nearby partials creates roughness.  For each bin we sum the
    // dissonance contribution of a few higher neighbours, weighted by the
    // amplitude product and the Plomp-Levelt curve.  Restricted to the musical
    // band and a small window so it stays real-time.
    {
        const int rLo  = std::max(2, int(50.f   * float(kFFTSize) / float(sampleRate)));
        const int rHi  = std::min(kFFTHalf - 1, int(5000.f * float(kFFTSize) / float(sampleRate)));
        const int rWin = 10;
        float rough = 0.f;
        for (int k = rLo; k < rHi; ++k) {
            float ak = mags[k];
            if (ak < 1e-6f) continue;
            float fk = float(k) * float(sampleRate) / float(kFFTSize);
            float s  = 0.24f / (0.0207f * fk + 18.96f);   // critical-band scaling
            int   jHi = std::min(k + rWin, rHi - 1);
            for (int j = k + 1; j <= jHi; ++j) {
                float fj = float(j) * float(sampleRate) / float(kFFTSize);
                float x  = s * (fj - fk);
                float d  = std::exp(-3.5f * x) - std::exp(-5.75f * x);  // dissonance
                rough += ak * mags[j] * d;
            }
        }
        // The old scale (ratio * 4, clamped at 1) saturated on every track of
        // an 80-track corpus -- the clamp WAS the output. Keep the raw ratio
        // for the debug trace and map through a measured range instead.
        m_roughRaw = rough / (totalMagSq + 1e-6f);
        // Anchors are the p10/p90 of per-track medians over the 80-track corpus
        // (0.241 / 0.399): consonant pop sits near 0, distorted metal near 1.
        float rawRough = std::max( 0.f, std::min( ( m_roughRaw - 0.24f ) / 0.16f, 1.f ) );
        m_sRoughness = 0.93f * m_sRoughness + 0.07f * rawRough;
    }

    // ---- Chroma vector + Key/Mode (Krumhansl-Kessler 1982 profiles) ----
    // Each FFT bin is mapped to one of 12 pitch classes (C=0 .. B=11)
    // using MIDI note arithmetic.  Energy is accumulated per pitch class,
    // then compared against the KK major and minor profiles.
    // Best-matching profile family (major vs. minor) across all 12 key
    // transpositions determines musicalMode (0=minor, 1=major).
    {
        float chroma[12] = {};
        for (int k = 3; k < kFFTHalf; ++k) {
            float f = float(k) * float(sampleRate) / float(kFFTSize);
            if (f < 60.f || f > 5000.f) continue;  // musical pitch range only
            // MIDI note: 69 + 12 * log2(f / 440)  → pitch class 0..11
            float midi       = 69.f + 12.f * std::log2(f / 440.f);
            int   pitchClass = int(std::round(midi)) % 12;
            if (pitchClass < 0) pitchClass += 12;
            chroma[pitchClass] += mags[k];
        }
        // L1-normalise then blend into slow-moving smoothed chroma
        float cSum = 1e-6f;
        for (int i = 0; i < 12; ++i) cSum += chroma[i];
        for (int i = 0; i < 12; ++i) {
            chroma[i] /= cSum;
            m_smoothedChroma[i] = 0.92f * m_smoothedChroma[i] + 0.08f * chroma[i];
        }

        // Krumhansl-Kessler key profiles (original 1982 tonal hierarchy ratings)
        static const float kMajorKK[12] = {
            6.35f, 2.23f, 3.48f, 2.33f, 4.38f, 4.09f,
            2.52f, 5.19f, 2.39f, 3.66f, 2.29f, 2.88f };
        static const float kMinorKK[12] = {
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
        float cMean = 0.f;
        for (int i = 0; i < 12; ++i) cMean += m_smoothedChroma[i];
        cMean /= 12.f;
        float cVar = 1e-9f;
        for (int i = 0; i < 12; ++i) {
            const float d = m_smoothedChroma[i] - cMean;
            cVar += d * d;
        }
        // Profile deviations and their variances are compile-time constants.
        static float sMajDev[12], sMinDev[12], sMajVar = 0.f, sMinVar = 0.f;
        static bool sProfilesReady = false;
        if (!sProfilesReady) {
            float mM = 0.f, mN = 0.f;
            for (int i = 0; i < 12; ++i) { mM += kMajorKK[i]; mN += kMinorKK[i]; }
            mM /= 12.f; mN /= 12.f;
            for (int i = 0; i < 12; ++i) {
                sMajDev[i] = kMajorKK[i] - mM;  sMajVar += sMajDev[i] * sMajDev[i];
                sMinDev[i] = kMinorKK[i] - mN;  sMinVar += sMinDev[i] * sMinDev[i];
            }
            sProfilesReady = true;
        }
        float bestMajor = -1e9f, bestMinor = -1e9f;
        float corrSum = 0.f, bestAny = -1e9f;
        int bestT = 0;
        for (int t = 0; t < 12; ++t) {
            float majCov = 0.f, minCov = 0.f;
            for (int i = 0; i < 12; ++i) {
                const float d = m_smoothedChroma[i] - cMean;
                majCov += d * sMajDev[(i - t + 12) % 12];
                minCov += d * sMinDev[(i - t + 12) % 12];
            }
            const float majCorr = majCov / std::sqrt(cVar * sMajVar);
            const float minCorr = minCov / std::sqrt(cVar * sMinVar);
            if (majCorr > bestMajor) bestMajor = majCorr;
            if (minCorr > bestMinor) bestMinor = minCorr;
            corrSum += majCorr + minCorr;
            if (std::max(majCorr, minCorr) > bestAny) {
                bestAny = std::max(majCorr, minCorr);
                bestT   = t;
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
        const float cM3 = m_smoothedChroma[(bestT + 4) % 12];
        const float cm3 = m_smoothedChroma[(bestT + 3) % 12];
        float rawMode = 0.5f + 0.5f * (cM3 - cm3) / (cM3 + cm3 + 1e-9f);
        // Very slow smoothing (~3 s) so mode reflects atmosphere, not noise.
        m_sMode = 0.97f * m_sMode + 0.03f * rawMode;

        // Key clarity: with proper Pearson correlations the best match IS the
        // measure -- +1 means the chroma matches a key profile exactly, ~0
        // means no key explains it. The old "peak above mean, divided by the
        // peak" form is unstable now that correlations are signed: bestAny can
        // legitimately sit near 0 (atonal), where that division explodes.
        (void)corrSum;
        float rawClarity = std::max(0.f, std::min(bestAny, 1.f));
        m_sKeyClarity = 0.97f * m_sKeyClarity + 0.03f * rawClarity;

        // ---- Harmonic Change (HCDF, Harte 2006) ----
        // Project the 12-bin chroma onto the 6-D tonal centroid (three circles:
        // fifths, minor thirds, major thirds), then measure how fast that point
        // moves frame-to-frame.  Spikes on chord/key changes, ~0 on held harmony.
        const float P = 3.14159265358979f;
        float tc[6] = {0,0,0,0,0,0};
        for (int n = 0; n < 12; ++n) {
            float c = m_smoothedChroma[n];
            tc[0] += c * std::sin(float(n) * 7.f * P / 6.f);
            tc[1] += c * std::cos(float(n) * 7.f * P / 6.f);
            tc[2] += c * std::sin(float(n) * 3.f * P / 2.f);
            tc[3] += c * std::cos(float(n) * 3.f * P / 2.f);
            tc[4] += 0.5f * c * std::sin(float(n) * 2.f * P / 3.f);
            tc[5] += 0.5f * c * std::cos(float(n) * 2.f * P / 3.f);
        }
        float hcdf = 0.f;
        for (int i = 0; i < 6; ++i) {
            float d = tc[i] - m_tonalCentroid[i];
            hcdf += d * d;
            m_tonalCentroid[i] = tc[i];
        }
        hcdf = std::min(std::sqrt(hcdf) * 4.f, 1.f);   // normalise to ~[0,1]
        m_sHCDF = 0.85f * m_sHCDF + 0.15f * hcdf;
    }

    // ---- Chroma hue: harmonic "colour" = circular mean of the chroma on the wheel ----
    // Maps the music's harmonic centre onto the colour wheel (0..1), so the key /
    // harmony drives a consistent global hue shift.  Uses the slow smoothed chroma.
    float chSin = 0.f, chCos = 0.f;
    for (int i = 0; i < 12; ++i) {
        float ang = 6.28318530718f * float(i) / 12.f;
        chSin += m_smoothedChroma[i] * std::sin(ang);
        chCos += m_smoothedChroma[i] * std::cos(ang);
    }
    // Smooth the hue VECTOR (not the angle) — this drifts the colour slowly and
    // continuously, even through the wheel's wrap-around, instead of jumping.
    m_hueCos = 0.99f * m_hueCos + 0.01f * chCos;
    m_hueSin = 0.99f * m_hueSin + 0.01f * chSin;
    float chromaHue = std::atan2(m_hueSin, m_hueCos) * 0.15915494f;  // /(2π) → -0.5..0.5
    if (chromaHue < 0.f) chromaHue += 1.f;                            // → 0..1

    // ---- Dominant Pitch – Harmonic Product Spectrum (HPS) ----
    // Multiply the magnitude spectrum by downsampled-by-2, -3, -4 copies.
    // The fundamental frequency of a harmonic tone produces the highest product
    // because all its harmonics reinforce at the same point.
    // Search range: 60..1200 Hz (covers bass drone through soprano melody).
    {
        const int binLo = std::max(3,
                            int(60.f  * float(kFFTSize) / float(sampleRate)));
        const int binHi = std::min(kFFTHalf / 4 - 1,
                            int(1200.f * float(kFFTSize) / float(sampleRate)) + 1);
        float maxHPS   = -1.f;
        int   pitchBin = binLo;
        for (int k = binLo; k < binHi; ++k) {
            if (k*4 >= kFFTHalf) break;
            float hps = mags[k] * mags[k*2] * mags[k*3] * mags[k*4];
            if (hps > maxHPS) { maxHPS = hps; pitchBin = k; }
        }
        float pitchHz = float(pitchBin) * float(sampleRate) / float(kFFTSize);
        // Log-normalise 60..1200 Hz → 0..1
        float pitchNorm = (std::log2(pitchHz + 1.f) - std::log2(61.f))
                        / (std::log2(1201.f) - std::log2(61.f));
        pitchNorm = std::max(0.f, std::min(pitchNorm, 1.f));
        // Suppress output when there is no signal
        float maxMag    = 0.f;
        for (int k = 1; k < kFFTHalf; ++k) maxMag = std::max(maxMag, mags[k]);
        float confidence = (maxMag > 1e-5f) ? 1.f : 0.f;
        // Slow smoothing — HPS can octave-jump frame to frame, and several shaders
        // use the pitch for hue/scale; this keeps those colour/size changes gradual.
        m_sPitch = 0.97f * m_sPitch + 0.03f * pitchNorm * confidence;
    }

    // ---- Delta-pitch: melodic activity (rate of dominant-pitch change) ----
    float dPitch = std::fabs(m_sPitch - m_prevPitch);
    m_prevPitch = m_sPitch;
    m_sDeltaPitch = 0.85f * m_sDeltaPitch + 0.15f * std::min(dPitch * 25.f, 1.f);

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
    float envMean = 0.f;
    for (float v : m_envHistory) envMean += v;
    envMean /= float(kEnvHistLen);

    float lowEnergy = 0.f;
    if (envMean > 1e-4f) {
        const float thr = 0.5f * envMean;
        for (float v : m_envHistory) if (v < thr) lowEnergy += 1.f;
        lowEnergy /= float(kEnvHistLen);
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
    if (++m_beatAcCount >= 8) {
        m_beatAcCount = 0;
        const float blockHz = float(sampleRate) / float(std::max(1, numFrames));
        const int   lagLo   = std::max(2,   int(0.25f * blockHz));
        const int   lagHi   = std::min(kEnvHistLen / 2, int(1.5f * blockHz));
        float denom = 0.f;
        for (int i = 0; i < kEnvHistLen; ++i) {
            const float v = m_envHistory[i] - envMean;
            denom += v * v;
        }
        float best = 0.f;
        if (denom > 1e-9f) {
            for (int lag = lagLo; lag < lagHi; ++lag) {
                float acc = 0.f;
                for (int i = 0; i + lag < kEnvHistLen; ++i) {
                    // ring order does not matter for autocorrelation: the wrap
                    // contributes one spurious pair out of ~450, far below the
                    // peak this looks for
                    acc += (m_envHistory[i] - envMean)
                         * (m_envHistory[i + lag] - envMean);
                }
                best = std::max(best, acc / denom);
            }
        }
        m_sBeatAC = std::max(0.f, std::min(best, 1.f));
    }
    float beatAC = m_sBeatAC;

    // ---- Spectral shape as LINEAR energy ratios ----
    // The old `bassPresence` was min((subBass + bass) * 2, 1) on dB-normalised
    // bands. toNorm maps -60..0 dB onto 0..1, so at any audible level the two
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
    const float linTot = m_sSubBass + m_sBass + m_sLowMid
                       + m_sMid + m_sUpperMid + m_sHigh + 1e-9f;
    float bassRatio    = (m_sSubBass + m_sBass)   / linTot;   // music: kick, bass line
    float midRatio     = (m_sLowMid  + m_sMid)    / linTot;   // speech: formants
    float highRatio    = (m_sUpperMid + m_sHigh)  / linTot;   // music: cymbals, air

    // ---- The decision ----
    // Four traits, each one measured on the corpora rather than guessed, and
    // each pointing the way its physics says it should:
    //   + lowEnergy  speech pauses between words and sentences; music does not
    //   - beatAC     a repeating envelope period is music, never speech
    //   - bassRatio  kick and bass line are music; a voice has almost no bottom
    //   + midRatio   formants pack energy into the 150 Hz - 2 kHz bands
    //
    // Measured on 40 tracks and 15 speech clips: every track scored <= -0.038
    // and every speech clip >= +0.086. On the 40 HELD-OUT tracks, which no
    // constant was ever fitted to, the margin comes out LARGER (+0.169) than on
    // the tuning set (+0.124) -- the split generalises rather than memorises.
    // Leave-one-out over the speech clips leaves it unchanged.
    //
    // beatAC is what makes the hard case work. Sparse rap -- Tone Loc's "Funky
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
    float speechScore = lowEnergy - beatAC - 0.5f * bassRatio + 0.25f * midRatio;

    // Below kSpeechLo everything measured was music, above kSpeechHi everything
    // measured was speech. In between, ramp rather than snap.
    constexpr float kSpeechLo     = -0.03f;
    constexpr float kSpeechHi     =  0.09f;
    // Measured envMean: digital silence 0.000000, a realistic idle noise floor
    // 0.000100, and music pulled down by 32 dB still 0.004800. 0.001 sits an
    // order of magnitude above the idle line and well under even that
    // deliberately crippled music.
    constexpr float kSilenceFloor = 0.001f;
    float speechiness = (speechScore - kSpeechLo) / (kSpeechHi - kSpeechLo);
    speechiness = std::max(0.f, std::min(speechiness, 1.f));

    // Silence is not music either. With no signal the ratios above are shaped
    // by whatever the noise floor happens to look like, so decide on the
    // envelope directly.
    if (envMean < kSilenceFloor)
        speechiness = 1.f;

    float musicConf = 1.f - speechiness;

    // KALEIDO_SPEECH_DEBUG=1 prints the classifier's ingredients once a second.
    // Log the INGREDIENTS, not just the verdict: this gate was a constant 1.000
    // for a long time, and a single number for musicPresence could never have
    // shown which of its inputs had collapsed. Tools/speech_gate_corpus.md
    // describes the sweep these lines feed.
    {
        static const bool dbg = qEnvironmentVariableIsSet( "KALEIDO_SPEECH_DEBUG" );
        static int dbgN = 0;
        if( dbg && ( ++dbgN % 100 ) == 0 )
            fprintf( stderr,
                     "SPEECH mp=%.3f speechy=%.3f score=%.3f | lowE=%.3f beatAC=%.3f midR=%.3f "
                     "bassR=%.3f highR=%.3f envMean=%.4f | rhythm=%.3f key=%.3f "
                     "fluxVar=%.3f lvl=%.3f acConf=%.3f acBPM=%.0f "
                     "odfMean=%.4f odfStd=%.4f\n",
                     m_sMusicPresence, speechiness, speechScore,
                     lowEnergy, beatAC, midRatio, bassRatio, highRatio, envMean,
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
    float mpSpeed = (musicConf > m_sMusicPresence) ? 0.0051f : 0.0022f;
    m_sMusicPresence += mpSpeed * (musicConf - m_sMusicPresence);
    m_sMusicPresence = std::max(0.f, std::min(m_sMusicPresence, 1.f));

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
        float aBias = 1.f / float(m_bldWarm + 1);
        if (m_bldWarm < 1000000) ++m_bldWarm;
        const float aF = std::max(0.0067f, aBias);   // tau ~1.5 s at 100 blocks/s
        const float aS = std::max(0.001f,  aBias);   // tau ~10 s
        m_bldFastOnset += aF * (m_onsetRate       - m_bldFastOnset);
        m_bldSlowOnset += aS * (m_onsetRate       - m_bldSlowOnset);
        m_bldFastCent  += aF * (smoothedCentroid  - m_bldFastCent);
        m_bldSlowCent  += aS * (smoothedCentroid  - m_bldSlowCent);
        m_bldFastLvl   += aF * (level             - m_bldFastLvl);
        m_bldSlowLvl   += aS * (level             - m_bldSlowLvl);
        // Snare rolls re-trigger the mid-group onset envelope so fast that its
        // MEAN stays high — a leaky average of it is a fine roll detector.
        m_bldSnareRoll += 0.03f * (std::min(m_onsetEnvGrp[1] * 1.5f, 1.f) - m_bldSnareRoll);

        float onsetRise = std::max(0.f, m_bldFastOnset - m_bldSlowOnset);  // onsets/s
        float centRise  = std::max(0.f, m_bldFastCent  - m_bldSlowCent);
        float lvlRise   = std::max(0.f, m_bldFastLvl / (m_bldSlowLvl + 1e-4f) - 1.f);
        float raw = onsetRise * 0.45f            // +2 onsets/s over baseline -> 0.9
                  + centRise  * 3.0f             // a full filter sweep -> ~0.6
                  + std::min(lvlRise, 1.f) * 0.5f
                  + m_bldSnareRoll * 0.6f;
        raw = std::min(raw, 1.f) * m_sMusicPresence;   // no build-ups in speech
        float bSpeed = (raw > m_sBuildUp) ? 0.02f : 0.008f;  // rise ~0.5 s, fall ~1.2 s
        m_sBuildUp += bSpeed * (raw - m_sBuildUp);

        // ---- Drop state machine ----
        // The vacuum test uses a FAST bass EMA (~0.15 s) against a slow one
        // that is FROZEN during the gap; the re-entry test uses the current
        // smoothed band energy (fast attack: a kick spikes it within a block
        // or two).  The gap must last >= 250 ms so the inter-kick silence of
        // a normal groove can never count as one.  NOTE: the LINEAR band RMS
        // (m_sSubBass/m_sBass), NOT the dB-normalised 0..1 values — ratios
        // like "1.5x the average" are meaningless after dB compression (and
        // can even be unreachable, since dB-norm saturates at 1.0).
        float bassE = m_sSubBass + m_sBass;
        m_bassFast += 0.065f * (bassE - m_bassFast);          // tau ~0.15 s
        bool vacuum = (m_dropArmed > 0.f)
                   && (m_bassFast < 0.35f * m_bassSlow);
        if (!vacuum)                                          // freeze the slow
            m_bassSlow += 0.002f * (bassE - m_bassSlow);      // avg in the gap
        // Arming needs the slow EMAs settled (>= ~12 s after start): a fresh
        // energetic track otherwise reads as a "build-up" while the 10 s
        // averages are still climbing toward its steady state.
        if (m_sBuildUp > 0.60f && m_bldWarm > 1200)
            m_dropArmed = 800.f;                              // ~8 s arming
        if (m_dropArmed > 0.f)  m_dropArmed -= 1.f;
        if (vacuum) {
            m_lowGapBlocks += 1.f;
            // Long breakdowns must not disarm mid-gap: hold the arming alive
            // while the vacuum persists.
            m_dropArmed = std::max(m_dropArmed, 200.f);
        }
        else if (m_bassFast > 0.6f * m_bassSlow)              // hysteresis: the
            m_lowGapBlocks = 0.f;                             // gap is truly over
        if (m_dropCooldown > 0) --m_dropCooldown;
        if (m_dropCooldown == 0 && m_dropArmed > 0.f &&
            m_lowGapBlocks >= 25.f &&                          // >= 250 ms of gap
            bassE > 1.45f * m_bassSlow &&                      // bass slams back
            (m_onsetEnvGrp[0] > 0.25f || bassE > 2.0f * m_bassSlow))
        {
            m_dropPulse    = 1.f;
            ++m_dropCount;
            m_dropCooldown = 800;                              // >= 8 s apart
            m_dropArmed    = 0.f;
            m_lowGapBlocks = 0.f;
            fprintf(stderr, "DROP #%d (buildup %.2f, bass %.2fx, t=%.1fs)\n",
                    m_dropCount, m_sBuildUp, bassE / (m_bassSlow + 1e-5f),
                    m_bldWarm * 0.01f);
        }
        m_dropPulse *= 0.985f;                                 // ~1.5 s tail
    }

    // ========================================================================
    // DJ-STOP detection: the WHOLE spectrum collapses for 0.1..3 s in running
    // beat music, then slams back.  (The drop detector above watches only the
    // BASS and needs a build-up; a stop is sudden total silence, no build-up.)
    // While the stop runs the host freezes the motion (breakHold); the return
    // fires breakSlam (a camera hit + audioDrop pulse for the shaders).
    // ========================================================================
    {
        m_lvlFast += 0.15f * (level - m_lvlFast);              // ~60 ms
        if (!m_stopActive)
            m_lvlSlow += 0.004f * (level - m_lvlSlow);         // frozen in the gap
        bool beatMusic = m_sMusicPresence > 0.5f && m_sRhythm > 0.35f
                      && m_ambientFactor < 0.6f && m_lvlSlow > 0.02f;
        if (!m_stopActive)
        {
            if (beatMusic && m_lvlFast < 0.15f * m_lvlSlow)
            {
                if (++m_stopBlocks >= 8)                       // ~80 ms of collapse
                {
                    m_stopActive = true;
                    m_stopBlocks = 0;
                    fprintf(stderr, "BREAK: stop detected (t=%.1fs)\n",
                            m_bldWarm * 0.01f);
                }
            }
            else m_stopBlocks = 0;
        }
        else
        {
            ++m_stopBlocks;
            if (m_lvlFast > 0.55f * m_lvlSlow)                 // music slams back
            {
                m_stopActive = false;
                if (m_stopBlocks <= 300)                       // <= 3 s: a DJ stop
                {
                    m_breakSlam = 1.f;
                    ++m_breakCount;
                    fprintf(stderr, "BREAK: slam-back after %.2fs (t=%.1fs)\n",
                            m_stopBlocks * 0.01f, m_bldWarm * 0.01f);
                }
                m_stopBlocks = 0;
            }
            else if (m_stopBlocks > 300)                       // too long: track end
            {
                m_stopActive = false;
                m_stopBlocks = 0;
            }
        }
        m_breakSlam *= 0.985f;                                 // ~1 s tail
    }

    // ---- MilkDrop-style relative band levels (instant vs "usual") ----
    // rel ~ 1.0 = as loud as this register usually is; >1 louder, <1 quieter.
    // The continuous companion to the gated onset detectors — perfect for
    // breathing motion (the classic bass/bass_att idiom, done volume-safe on
    // the AGC-normalised levels).
    {
        float fast[3];
        fast[0] = nBass;
        fast[1] = 0.5f * (nLowMid + nMid);
        fast[2] = 0.5f * (nUpperMid + nHigh);
        for (int i = 0; i < 3; ++i)
        {
            m_relSlow[i] = 0.998f * m_relSlow[i] + 0.002f * fast[i];
            float rel = fast[i] / std::max(m_relSlow[i], 0.06f);
            rel = std::max(0.f, std::min(2.5f, rel));
            m_sRel[i] = 0.55f * m_sRel[i] + 0.45f * rel;
        }
    }

    // ---- Waveform downsample for `audioWave[64]` ----
    // Average the rolling mono ring (oldest -> newest = m_waveWritePos onward)
    // into 64 points; normalise with a decaying |peak| so the wave stays
    // visible at any volume; light temporal smoothing against block jitter.
    {
        const int  NP   = AudioFeatures::kWavePoints;
        const int  grp  = kWaveRing / NP;                  // 32 samples/point
        float pts[AudioFeatures::kWavePoints];
        float peak = 1e-4f;
        for (int p = 0; p < NP; ++p)
        {
            float acc = 0.f;
            int   base = (m_waveWritePos + p * grp) & (kWaveRing - 1);
            for (int k = 0; k < grp; ++k)
                acc += m_waveRing[(base + k) & (kWaveRing - 1)];
            pts[p] = acc / float(grp);
            peak = std::max(peak, std::fabs(pts[p]));
        }
        m_waveRef = std::max(m_waveRef * 0.995f, peak);
        m_waveRef = std::max(m_waveRef, 0.02f);            // silence floor
        for (int p = 0; p < NP; ++p)
        {
            float v = std::max(-1.f, std::min(1.f, pts[p] / m_waveRef));
            m_sWave[p] = 0.35f * m_sWave[p] + 0.65f * v;
        }
    }

    // ---- Publish (mutex-protected) ----
    QMutexLocker lk(&m_mutex);
    // Publish the AGC-normalised levels so the visuals are volume-independent.
    m_features.subBassLevel   = nSubBass;
    m_features.bassLevel      = nBass;
    m_features.lowMidLevel    = nLowMid;
    m_features.midLevel       = nMid;
    m_features.upperMidLevel  = nUpperMid;
    m_features.highLevel      = nHigh;
    m_features.overallLevel   = nLevel;
    for (int b = 0; b < AudioFeatures::kSpectrumBands; ++b)
        m_features.spectrum[b] = m_sSpectrum[b];
    for (int p = 0; p < AudioFeatures::kWavePoints; ++p)
        m_features.wave[p] = m_sWave[p];
    m_features.bassRel = m_sRel[0];
    m_features.midRel  = m_sRel[1];
    m_features.trebRel = m_sRel[2];
    m_features.isBeat         = isBeat;
    m_features.onsetStrength   = onsetStrength;
    m_features.downbeat        = downbeat;
    m_features.trackChange     = trackChange;
    m_features.beatStrength   = beatStr;
    m_features.beatDecay      = beatDecay;
    m_features.ambientFactor  = m_ambientFactor;
    m_features.powerScale     = powerScale;
    m_features.beatSidesHint  = beatSidesHint;
    m_features.audioFlip      = audioFlip;
    m_features.spectralFlux   = spectralFlux;
    m_features.spectralCentroid = smoothedCentroid;
    // Paper-inspired timbral features
    m_features.zeroCrossingRate = m_sZCR;
    m_features.spectralFlatness = m_sSFM;
    m_features.logAttackTime    = m_attackAccum;
    m_features.estimatedBPM     = estimatedBPM;
    m_features.arousal          = arousal;
    m_features.valence          = valence;
    m_features.keyClarity       = m_sKeyClarity;
    m_features.sharpness        = m_sSharpness;
    m_features.harmonicChange   = m_sHCDF;
    m_features.roughness        = m_sRoughness;
    m_features.rhythmStrength    = m_sRhythm;
    m_features.beatPhase         = beatPhase;

    // Manual TAP tempo (key 't'): override tempo + phase while active.  The
    // host's beat-phase PLL then locks onto the tapped grid; the raised
    // rhythmStrength floor engages the tempo-locked pulse and 4-beat fades.
    {
        int    tapIv  = m_tapIntervalMs.load();
        qint64 until  = m_tapUntilMs.load();
        if (tapIv > 0 && m_tapClock.elapsed() < until)
        {
            float bpm = 60000.f / float(tapIv);
            m_features.estimatedBPM = std::max(0.f, std::min((bpm - 40.f) / 160.f, 1.f));
            double ph = double(m_tapClock.elapsed() - m_tapAnchorMs.load())
                      / double(tapIv);
            m_features.beatPhase = float(ph - std::floor(ph));
            m_features.rhythmStrength = std::max(m_features.rhythmStrength, 0.85f);
        }
    }
    m_features.fluxVariance      = m_sFluxVar;
    m_features.stereoWidth       = m_sStereoWidth;
    m_features.stereoLowL         = m_sStBand[0][0];
    m_features.stereoMidL         = m_sStBand[0][1];
    m_features.stereoHighL        = m_sStBand[0][2];
    m_features.stereoLowR         = m_sStBand[1][0];
    m_features.stereoMidR         = m_sStBand[1][1];
    m_features.stereoHighR        = m_sStBand[1][2];
    m_features.deltaPitch        = m_sDeltaPitch;
    m_features.musicPresence     = m_sMusicPresence;
    m_features.timingScale      = timingScale;
    m_features.sectionCount     = m_sectionCount;
    m_features.sectionNovelty   = m_secNovelty;
    m_features.sectionId        = m_secCurId;
    m_features.onsetKick        = m_onsetEnvGrp[0];
    m_features.onsetSnare       = m_onsetEnvGrp[1];
    m_features.onsetHat         = m_onsetEnvGrp[2];
    m_features.buildUp          = m_sBuildUp;
    m_features.dropPulse        = m_dropPulse;
    m_features.dropCount        = m_dropCount;
    m_features.breakHold        = m_stopActive ? 1.f : 0.f;
    m_features.breakSlam        = m_breakSlam;
    // FFT-derived features
    m_features.spectralRolloff  = m_sRolloff;
    m_features.spectralSpread   = m_sSpread;
    m_features.musicalMode      = m_sMode;
    m_features.dominantPitch    = m_sPitch;
    m_features.chromaHue        = chromaHue;
    // Full 12-bin chroma vector (smoothed, L1-normalised) — for scenes that
    // display the harmony structurally (Planet4D pitch-class hypersphere).
    for (int i = 0; i < 12; ++i)
        m_features.chroma[i] = m_smoothedChroma[i];
}
