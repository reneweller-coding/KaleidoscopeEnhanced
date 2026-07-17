#pragma once

#include <QtCore/QThread>
#include <QtCore/QMutex>
#include <QtCore/QString>
#include <QtCore/QList>
#include <atomic>

#include "AudioFeatures.h"

struct IMMDeviceEnumerator;   // fwd (WASAPI) — only a pointer is used in the header

// A selectable audio source: any output endpoint (captured via loopback) or any
// input endpoint (microphone / line-in, captured normally).
struct AudioDevice
{
    QString id;                 // WASAPI endpoint id
    QString name;               // friendly name shown in the overlay
    bool    isCapture = false;  // true = input device, false = output (loopback)
};

/**
 * AudioAnalyzer
 * ---------------------------------------------------------------------------
 * Captures system audio via WASAPI loopback (works with Spotify, foobar2000,
 * VLC – any Windows audio output) and analyses it in real-time.
 *
 * Analysis pipeline:
 *   Raw PCM → 5 one-pole IIR LP filters → 6 band energies (RMS)
 *           → ambient-adaptive smoothing → dB-normalised outputs
 *           → energy-history beat detection (linear RMS, bass+subBass)
 *           → ambient / beat mode classifier (rolling variance)
 *           → spectral flux + centroid (6-band)
 *           → AudioFeatures struct (mutex-protected)
 *
 * 6-band decomposition via cascade subtraction:
 *   LP( 60 Hz)                        → subBass   (physical rumble, 20-60 Hz)
 *   LP(150 Hz) - LP( 60 Hz)           → bass      (drone body / kick, 60-150 Hz)
 *   LP(500 Hz) - LP(150 Hz)           → lowMid    (harmonic warmth, 150-500 Hz)
 *   LP(2k  Hz) - LP(500 Hz)           → mid       (melody / texture, 0.5-2 kHz)
 *   LP(6k  Hz) - LP(2k  Hz)           → upperMid  (metallic edge, 2-6 kHz)
 *   mono       - LP(6k  Hz)           → high      (air / shimmer, 6k+ Hz)
 *
 * No external libraries required – only Windows SDK (mmdeviceapi, audioclient).
 *
 * Usage:
 *   AudioAnalyzer *az = new AudioAnalyzer(this);
 *   az->start();
 *   ...
 *   AudioFeatures f = az->getFeatures();  // call from render thread each frame
 *   az->stop();
 *   az->wait();
 * ---------------------------------------------------------------------------
 */
class AudioAnalyzer : public QThread
{
    Q_OBJECT

public:
    explicit AudioAnalyzer(QObject *parent = nullptr);
    ~AudioAnalyzer() override;

    /** Thread-safe snapshot of the latest analysis result. */
    AudioFeatures getFeatures() const;

    /** Selectable audio sources (outputs + inputs), refreshed by the capture thread. */
    QList<AudioDevice> devices() const;

    /** Friendly name of the source currently being captured. */
    QString currentDeviceName() const;

    /** Switch the captured source at runtime.  Empty id = back to default loopback. */
    void requestDevice( const QString &id, bool isCapture );

    /** Record the captured audio (the music) to a 16-bit stereo WAV file. */
    void startRecording( const QString &wavPath );
    void stopRecording();

    /** Graceful shutdown – call before wait(). */
    void stop();

    /** Offline analysis mode (CLI -w <file.wav>): instead of capturing WASAPI
     *  loopback, the analysis thread feeds this WAV through processBlock() in
     *  capture-sized chunks and exits.  Deterministic (independent of whatever
     *  the system is playing) — used to test/calibrate the classifiers. */
    static QString s_offlineWav;

protected:
    void run() override;
    void analyzeWavOffline( const QString &path );

private:
    // ---- 5 one-pole IIR low-pass filter states (mono) ----
    float m_lp60  = 0.f;   // LP at  60 Hz
    float m_lp150 = 0.f;   // LP at 150 Hz
    float m_lp500 = 0.f;   // LP at 500 Hz
    float m_lp2k  = 0.f;   // LP at 2000 Hz
    float m_lp6k  = 0.f;   // LP at 6000 Hz

    // ---- Smoothed band energies (one-pole attack/release IIR) ----
    float m_sSubBass  = 0.f;   // 20–60 Hz
    float m_sBass     = 0.f;   // 60–150 Hz   (beat detection target)
    float m_sLowMid   = 0.f;   // 150–500 Hz
    float m_sMid      = 0.f;   // 500–2k Hz
    float m_sUpperMid = 0.f;   // 2k–6k Hz
    float m_sHigh     = 0.f;   // 6k+ Hz

    // ---- Beat detection ----
    // History of combined subBass+bass linear RMS for adaptive threshold.
    static constexpr int kHistoryLen = 64;  // ~1.5 s at ~10 ms poll interval
    float m_bassHistory[kHistoryLen] = {};
    int   m_histIdx       = 0;
    float m_beatCooldown  = 0.f;
    static constexpr float kBeatThresholdRatio = 1.32f;   // more sensitive (catches softer kicks)
    static constexpr float kBeatCooldownFrames = 18.f;    // ~180 ms — a kick's decay tail must not re-trigger
    float m_prevBeatBand = 0.f;   // previous-block beat band (rising-edge test)

    // ---- Ambient detection ----
    static constexpr int kAmbientHistLen = 256; // ~6 s
    float m_levelHistory[kAmbientHistLen] = {};
    int   m_ambientIdx   = 0;
    float m_ambientFactor = 0.f;

    // ---- Speed / power envelope state ----
    float m_beatPulse     = 0.f;   // decays exponentially after each beat
    float m_speedEnvelope = 1.f;
    float m_powerEnvelope = 1.f;

    // ---- Spectral flux state (6 previous-frame band values) ----
    float m_prevSubBass  = 0.f;
    float m_prevBass     = 0.f;
    float m_prevLowMid   = 0.f;
    float m_prevMid      = 0.f;
    float m_prevUpperMid = 0.f;
    float m_prevHigh     = 0.f;
    float m_sFlux        = 0.f;   // smoothed flux accumulator

    // ---- Beat-triggered discrete state ----
    int   m_currentSides = 6;    // current kaleidoscope symmetry
    float m_flipDir      = 1.f;  // rotation direction: +1 or -1
    int   m_beatCount    = 0;    // cumulative beat counter (for sub-sampling discrete changes)

    // ---- BPM estimation ----
    static constexpr int kBPMHistLen = 8;  // last 8 inter-beat intervals
    float m_beatIntervals[kBPMHistLen] = {};
    int   m_bpmIdx          = 0;
    float m_lastBeatFrame   = 0.f;    // frame counter at last beat
    float m_frameCounter    = 0.f;    // total frames processed
    float m_smoothedBPM     = 0.f;    // smoothed BPM estimate

    // ---- Log attack time state ----
    float m_prevLevel       = 0.f;    // previous overall level (for rise-rate)
    float m_attackAccum     = 0.f;    // smoothed attack sharpness
    float m_sZCR            = 0.f;    // smoothed zero-crossing rate
    float m_sSFM            = 0.f;    // smoothed spectral flatness
    float m_sSharpness      = 0.f;    // smoothed Zwicker-style sharpness
    float m_sKeyClarity     = 0.f;    // smoothed key clarity (KK best-vs-mean)
    float m_tonalCentroid[6] = {};    // previous-frame Harte 6-D tonal centroid
    float m_sHCDF           = 0.f;    // smoothed harmonic change detection function
    float m_sRoughness      = 0.f;    // smoothed sensory dissonance (Sethares)
    float m_loudnessRef     = 0.10f;  // slow loudness reference for AGC (volume independence)

    // ---- Full-spectrum onset detection + downbeat ----
    float m_onsetAvg        = 0.f;    // recent average of the onset detection function
    float m_prevODF         = 0.f;    // previous-frame ODF (rising-edge test)
    float m_onsetCooldown   = 0.f;    // min spacing between onsets
    float m_onsetRate       = 0.f;    // leaky onsets-per-second (percussive density)

    // HPSS-inspired harmonic/percussive content measure: the cosine similarity of
    // consecutive FFT magnitude spectra.  Sustained harmonic material (drones,
    // pads, held chords) keeps the spectrum similar frame-to-frame (measured
    // ~0.8+ — leakage interference between close partials keeps it below 1);
    // percussive transients punch broadband "vertical" energy into it and the
    // similarity dips hard (measured ~0.3 on a kick pattern).  Asymmetrically
    // smoothed (dips tracked fast, recovery slow) so a beat every 0.5 s keeps
    // the value visibly down.
    float m_sSpecSim        = 1.f;

    // FFT-based onset detection function (normalised positive spectral flux of
    // the 2048-sample magnitude spectra).  The old per-block 6-band RMS deltas
    // RIPPLED on low-frequency content (a 55 Hz sine's period beats against the
    // ~10 ms block rate), firing ~10 phantom onsets/sec on a pure drone — which
    // also fooled the autocorrelation into "detecting" a rhythm.  The 43 ms FFT
    // window integrates over several periods and is stable.
    float m_odfFFT          = 0.f;
    float m_bandRef32[32]   = {};     // per-band peak-hold reference (~200 ms release)
    float m_downbeatPulse   = 0.f;    // decaying accent on the bar's "1"
    int   m_kickCount       = 0;      // counts detected kicks (for downbeat every 4)
    float m_prevBeatPhase   = 0.f;    // previous beatPhase (for downbeat wrap detection)
    int   m_barBeat         = 0;      // beat-within-bar counter 0..3
    float m_barAccum[4]     = {};     // per-bar-position accent strength (argmax = the "1")

    // ---- Autocorrelation tempo (fixed-rate onset envelope) ----
    static constexpr int kEnvRate   = 100;   // onset-envelope sample rate (Hz)
    static constexpr int kOdfEnvLen = 400;   // ~4 s of envelope
    float m_odfEnv[kOdfEnvLen] = {};
    int   m_odfEnvIdx   = 0;
    int   m_envFrameAcc = 0;
    float m_acBPM       = 0.f;        // autocorrelation tempo estimate
    float m_acConf      = 0.f;        // its confidence 0..1

    // Smoothed chroma-hue VECTOR (so the harmony→hue drifts slowly without the
    // angle jumping across the colour-wheel wrap-around → no abrupt colour changes).
    float m_hueCos      = 0.f;
    float m_hueSin      = 0.f;

    // ---- Rhythm / dynamics / stereo / classifier state ----
    float m_sRhythm         = 0.f;    // smoothed rhythm strength (beat regularity)
    float m_sStereoWidth    = 0.f;    // smoothed stereo side/mid width

    // ---- Stereo per-channel band split (stereo-separated spectrum) ----
    float m_lpStL[2]        = {};     // L-channel LP states (~250 Hz, ~2500 Hz)
    float m_lpStR[2]        = {};     // R-channel LP states
    float m_sStBand[2][3]   = {};     // smoothed [L/R][low/mid/high] energies

    // ---- Track-change detection (sustained silence -> first onset) ----
    float m_silenceFrames   = 0.f;    // consecutive near-silent update cycles
    bool  m_wasSilent       = false;  // armed once the silence is long enough

    float m_prevPitch       = 0.f;    // previous dominant pitch (for delta-pitch)
    float m_sDeltaPitch     = 0.f;    // smoothed melodic activity
    static constexpr int kFluxHistLen = 100; // ~1 s of spectral-flux samples
    float m_fluxHistory[kFluxHistLen] = {};
    int   m_fluxIdx         = 0;
    float m_sFluxVar        = 0.f;    // smoothed flux variance ("restlessness")
    float m_sMusicPresence  = 1.f;    // smoothed music-vs-speech gate (hysteresis)

    // ---- FFT analysis (Radix-2 Cooley-Tukey, real-valued audio input) ----
    // Window: 2048 samples ≈ 42 ms at 48 kHz → 23.4 Hz / bin.
    // Enables: spectral rolloff, spectral spread, chroma-based major/minor
    // detection (Krumhansl-Kessler profiles), and dominant pitch via HPS.
    static constexpr int kFFTSize = 2048;
    static constexpr int kFFTHalf = kFFTSize / 2 + 1;  // unique bins after real FFT

    float m_ringBuf[kFFTSize]  = {};  // circular buffer of most-recent mono samples
    int   m_ringWrite          = 0;   // next write index in m_ringBuf

    float m_fftRe[kFFTSize]    = {};  // real part working buffer (in-place FFT input/output)
    float m_fftIm[kFFTSize]    = {};  // imag part working buffer (zero before FFT)
    float m_fftWin[kFFTSize]   = {};  // Hann window coefficients (precomputed in ctor)

    float m_prevMags[kFFTHalf] = {};  // magnitude spectrum from previous frame (for FFT flux)
    float m_smoothedChroma[12] = {};  // smoothed 12-bin chroma vector (C .. B)

    // Smoothed FFT-derived outputs
    // 32-band log-spaced spectrum for the analyzer effects (self-normalised).
    float m_sSpectrum[AudioFeatures::kSpectrumBands] = {};
    float m_specRef  = 1e-4f; // decaying-peak reference for spectrum auto-scaling

    float m_sRolloff = 0.5f;  // spectral rolloff (fraction of Nyquist, 0..1)
    float m_sSpread  = 0.f;   // spectral spread normalised by 5 kHz
    float m_sMode    = 0.5f;  // musical mode 0=minor/dark .. 1=major/bright
    float m_sPitch   = 0.f;   // dominant pitch, log-normalised 60..1200 Hz → 0..1

    // In-place Radix-2 DIT complex FFT (implementation in AudioAnalyzer.cpp).
    // N must be a power of two.  Input: re[]=windowed samples, im[]=0.
    // Output: re[k]/im[k] = complex spectrum coefficient X[k].
    static void radix2fft(float *re, float *im, int N);

    // ---- Audio source selection (runtime device switching) ----
    void enumerateDevices( IMMDeviceEnumerator *pEnum );  // (re)populate m_devices
    QList<AudioDevice> m_devices;          // available sources (mutex-protected)
    QString  m_curDeviceName;              // name of the source being captured
    QString  m_reqDeviceId;                // requested endpoint id ("" = default)
    bool     m_reqIsCapture = false;       // requested device is an input
    bool     m_useReqDevice = false;       // use the requested device vs. default
    std::atomic<bool> m_deviceChangeReq { false };  // make the capture loop re-init

    // ---- Audio recording (loopback -> 16-bit stereo WAV), written in run() ----
    std::atomic<bool> m_recReq  { false };  // recording requested (GUI thread)
    std::atomic<bool> m_wavOpen { false };  // file currently open (run thread)
    QString  m_recWavPath;                  // requested path (set under m_mutex)
    void    *m_wavFile = nullptr;           // FILE* (run thread only)
    unsigned int m_wavDataBytes = 0;        // bytes written to the data chunk
    void recOpen( int sampleRate );
    void recWrite( const float *src, int numFrames, int numChannels );
    void recClose();

    // ---- Shared output ----
    mutable QMutex m_mutex;
    AudioFeatures  m_features;

    // ---- Lifecycle ----
    std::atomic<bool> m_running { false };

    // ---- Helpers ----
    void processBlock(const float *data, int numFrames, int numChannels,
                      int sampleRate);
    static float coeff(float cutoffHz, int sampleRate);
};
