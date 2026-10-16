//---------------------------------------------------------------------------
//                              AudioAnalyzer
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Real-time WASAPI-loopback audio capture and analysis: 6-band spectrum, beat/onset/section/drop detection, tempo,
 *  mood.
 *
 *  @author René Weller
 */

#pragma once

#include <QtCore/QThread>
#include <QtCore/QMutex>
#include <QtCore/QString>
#include <QtCore/QList>
#include <QtCore/QElapsedTimer>
#include <atomic>
#include <vector>

#include "AudioFeatures.h"

struct IMMDeviceEnumerator; // fwd (WASAPI) — only a pointer is used in the header

/** One selectable audio source: an output endpoint (captured via loopback) or an input endpoint (mic / line-in).
 *
 * Populated by AudioAnalyzer::enumerateDevices() and exposed through
 * AudioAnalyzer::devices() for the device-selection UI; AudioAnalyzer::requestDevice()
 * takes the AudioDevice::id back to switch the active capture source at runtime.
 **/
struct AudioDevice
{
    QString id;                ///< WASAPI endpoint id.
    QString name;              ///< Friendly name shown in the overlay.
    bool    isCapture = false; ///< true = input device (mic/line-in), false = output (captured via loopback).
};

/** @class AudioAnalyzer
 *
 * Real-time audio capture + analysis engine: turns raw PCM into a rich AudioFeatures snapshot every ~10 ms.
 *
 * Runs as a QThread that captures system audio via WASAPI loopback (works with
 * Spotify, foobar2000, VLC – any Windows audio output), or optionally a
 * selected input device, and analyses it block-by-block in processBlock().
 * The producing thread only ever writes AudioFeatures under m_mutex; consumers
 * (the render thread) read a thread-safe snapshot via getFeatures(). It also
 * doubles as an offline analysis engine (analyzeWavOffline(), analyzeWavToTimeline())
 * so the exact same DSP pipeline can be driven deterministically from a WAV
 * file for testing, batch rendering, or preset tuning.
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
 **/
class AudioAnalyzer : public QThread
{
    Q_OBJECT

public:
    /**  Constructs the analyzer (does not start capture — call start()).
     *
     * @param parent  Optional Qt parent object. (in)
     **/
    explicit AudioAnalyzer( QObject *parent = nullptr );
    /** Stops capture (if running) and waits for the thread to finish. */
    ~AudioAnalyzer() override;

    /**  Thread-safe snapshot of the latest analysis result.
     *
     * @return
     *   A copy of the current AudioFeatures (safe to call from any thread).
     **/
    AudioFeatures getFeatures() const;

    /**  Selectable audio sources (outputs + inputs), refreshed by the capture thread.
     *
     * @return
     *   The current device list (thread-safe copy).
     **/
    QList<AudioDevice> devices() const;

    /**  Friendly name of the source currently being captured.
     *
     * @return
     *   The device name, or the default-loopback label.
     **/
    QString currentDeviceName() const;

    /**  Switch the captured source at runtime.
     *
     * @param id         Endpoint id to capture; empty string reverts to the default loopback device. (in)
     * @param isCapture  true if `id` names an input (capture) endpoint, false for an output (loopback) endpoint.
     *                   (in)
     **/
    void requestDevice( const QString &id, bool isCapture );
    /** The default output device changed (endpoint watcher, any thread): a capture on the default follows it. */
    void defaultDeviceChanged();
    /**  A new song began (the media session's title changed): see beginSong(), applied at the next analysis block.
     *
     * Safe from any thread.
     **/
    void newSong() { m_newSongRequested.store( true ); }
    /** A device appeared, disappeared or changed state (endpoint watcher, any thread): a chosen device that was
     * missing is tried again.
     **/
    void deviceListChanged();
    /**  The endpoint id of the source the user chose, empty for the default output (for the settings file).
     *
     * @param isCapture  Receives whether it is an input. (out)
     *
     * @return
     *   The id, even while the device is missing and the default stands in.
     **/
    QString requestedDevice( bool &isCapture ) const;

    /**  Start recording the captured audio (the music) to a 16-bit stereo WAV file.
     *
     * @param wavPath  Destination path; the file is opened lazily by the capture thread. (in)
     **/
    void startRecording( const QString &wavPath );
    /** Stop recording and wait briefly for the capture thread to flush + close the file. */
    void stopRecording();

    /**  Instant replay: dump the last `seconds` of captured audio (kept in a rolling ring, always on) as a 16-bit
     * WAV.
     *
     * @param path     Destination WAV path. (in)
     * @param seconds  How many trailing seconds to dump (clamped to what has actually been captured). (in)
     *
     * @return
     *   false if nothing has been captured yet or the file could not be opened, true on success.
     **/
    bool dumpReplayWav( const QString &path, float seconds );

    /** Graceful shutdown flag – call before wait(). */
    void stop();

    /**  TAP TEMPO (key 't', GUI thread): register one tap.
     *
     * The median of the last taps overrides the estimated tempo + beat phase
     * for ~45 s after the last tap — for material where automatic detection
     * struggles. A pause > 2.5 s starts a fresh series.
     **/
    void tapTempo();

    /**  An external beat (GUI thread): a /phos/beat cue, a quarter note of MIDI clock.
     *
     * @param source  For the log: who keeps the time ("score cues", "MIDI clock"). (in)
     * @param refMs   When it arrived, as QElapsedTimer::msecsSinceReference() of a timer started then. (in)
     * @param bpm     The tempo if the source knows it (MIDI clock: from its ticks); 0 = from the beats' spacing. (in)
     * @param phase   Whether the beat is a beat-one boundary of the source (MIDI clock before Start or a song
     *                position: false -- the tempo is known, the phase is not). (in)
     *
     * Like a tap that keeps tapping: tempo and (with @p phase) the beat phase follow the source while its beats
     * keep coming, and the analysis takes over 2 s after the last one.  A manual tap still wins.  The beat is
     * placed #M_ClockDelay seconds after it arrived: a generator's cue and a DAW's clock come before the sound
     * that the loopback hears.  Off with #M_ExternalClock.
     **/
    void externalBeat( const char *source, qint64 refMs, float bpm, bool phase );
    /** ini externalClock (default on): external beats (score cues, MIDI clock) may set tempo and phase. */
    static bool M_ExternalClock;
    /** ini clockDelay, seconds (default 0.06): how much later a beat is heard than its cue or clock arrives. */
    static float M_ClockDelay;

    /**  Offline (Preset-Editor) analysis: run a 16-bit PCM WAV through the FULL analysis pipeline at full speed.
     *
     * @param path  Path to a 16-bit PCM WAV file. (in)
     *
     * @return
     *   One AudioFeatures snapshot per 10 ms block of audio (empty if the file could not be read).
     *
     * No capture thread, no WASAPI — returns one AudioFeatures snapshot per
     * 10 ms block. The editor plays these back in sync with the sound so
     * presets can be tuned against real music with the real analyzer, not the
     * synthetic profile.
     **/
    static std::vector<AudioFeatures> analyzeWavToTimeline( const QString &path );
    /**  Offline analysis of samples in memory: the same pipeline as analyzeWavToTimeline(), for checks that build
     * their own signal (`Kaleidoscope.exe -q`).
     *
     * @param data        Interleaved float samples, -1..1. (in)
     * @param frames      Number of sample frames. (in)
     * @param channels    Channels per frame (1 or 2). (in)
     * @param sampleRate  Sample rate in Hz. (in)
     *
     * @return
     *   One AudioFeatures snapshot per 480-frame block (10 ms at 48 kHz).
     **/
    static std::vector<AudioFeatures> analyzeSamples( const float *data, int frames, int channels, int sampleRate );
    /**  Caller-driven analysis on a never-started analyzer (the video export): one block through processBlock(), on
     * the caller's thread; getFeatures() then reads the result.
     *
     * @param data        Interleaved float samples, -1..1. (in)
     * @param frames      Sample frames in the block (480 = 10 ms at 48 kHz, the live capture block). (in)
     * @param channels    Channels per frame (1 or 2). (in)
     * @param sampleRate  Sample rate in Hz. (in)
     *
     * The export feeds the track block by block up to each frame's time, so the analysis is exactly as far as the
     * picture -- the same pipeline as live capture, without a capture thread or a wall clock.
     **/
    void feedBlock( const float *data, int frames, int channels, int sampleRate );

    /** Offline analysis mode (CLI -w <file.wav>): path to a WAV to feed through processBlock() instead of capturing
     * WASAPI loopback.
     *
     * When non-empty, the analysis thread feeds this WAV through processBlock()
     * in capture-sized chunks and exits. Deterministic (independent of
     * whatever the system is playing) — used to test/calibrate the
     * classifiers.
     **/
    static QString M_OfflineWav;

protected:
    /**  QThread entry point: runs the WASAPI loopback capture loop (or, if M_OfflineWav is set, the offline analysis
     * pass).
     **/
    void run() override;
    /**  Feeds a WAV file through processBlock() in capture-sized chunks, paced to real time.
     *
     * @param path  Path to a 16-bit PCM WAV file. (in)
     **/
    void analyzeWavOffline( const QString &path );

private:
    // ---- 5 one-pole IIR low-pass filter states (mono) ----
    float m_lp60 = 0.f;  ///< LP filter state at  60 Hz cutoff.
    float m_lp150 = 0.f; ///< LP filter state at 150 Hz cutoff.
    float m_lp500 = 0.f; ///< LP filter state at 500 Hz cutoff.
    float m_lp2k = 0.f;  ///< LP filter state at 2000 Hz cutoff.
    float m_lp6k = 0.f;  ///< LP filter state at 6000 Hz cutoff.

    // ---- Smoothed band energies (one-pole attack/release IIR) ----
    float m_sSubBass = 0.f;  ///< Smoothed 20–60 Hz band energy (linear RMS).
    float m_sBass = 0.f;     ///< Smoothed 60–150 Hz band energy (linear RMS); beat detection target.
    float m_sLowMid = 0.f;   ///< Smoothed 150–500 Hz band energy (linear RMS).
    float m_sMid = 0.f;      ///< Smoothed 500–2k Hz band energy (linear RMS).
    float m_sUpperMid = 0.f; ///< Smoothed 2k–6k Hz band energy (linear RMS).
    float m_sHigh = 0.f;     ///< Smoothed 6k+ Hz band energy (linear RMS).

    // ---- Beat detection ----
    /** Length of #m_bassHistory: ~1.5 s at ~10 ms poll interval. */
    static constexpr int HistoryLen = 64;
    float m_bassHistory[HistoryLen] = {}; ///< Ring of combined subBass+bass linear RMS, for the adaptive beat
                                          ///< threshold.
    int                    m_histIdx = 0;                ///< Next write index into #m_bassHistory.
    float                  m_beatCooldown = 0.f;         ///< Blocks remaining before another beat may fire.
    static constexpr float BeatThresholdRatio = 1.32f;   ///< Base beat-band/history-mean ratio required to fire (more
                                                         ///< sensitive — catches softer kicks).
    static constexpr float BeatCooldownFrames = 18.f; ///< ~180 ms cooldown — a kick's decay tail must not re-trigger.
    float                  m_prevBeatBand = 0.f;         ///< Previous-block beat band value (rising-edge test).

    // ---- Ambient detection, and the music/speech classifier's envelope ring ----
    /** Length of #m_envHistory: 600 blocks, i.e. ~6 s at the usual 10 ms block. */
    static constexpr int EnvHistLen = 600;
    /** Rolling RAW LINEAR broadband envelope, one entry per block (music/speech classifier).
     *
     *  Deliberately NOT the dB-normalised, attack/release-smoothed `level`: both of
     *  those destroy exactly what this ring is read for. dB compression squeezes a
     *  speech pause at -40 dB up to 0.33 of full scale, and the release smoothing
     *  (up to ~1 s) fills the pause in before the next word starts, so gaps stop
     *  looking like gaps.
     **/
    float m_envHistory[EnvHistLen] = {};
    int   m_envIdx = 0;          ///< Next write index into #m_envHistory.
    float m_sBeatAC = 0.f;       ///< Envelope-autocorrelation peak over musical lags (music/speech classifier).
    int   m_beatAcCount = 0;     ///< Block counter that paces the #m_sBeatAC recomputation.
    float m_ambientFactor = 0.f; ///< 0 = beat-driven, 1 = ambient/drone; see AudioFeatures::ambientFactor.

    // ---- Speed / power envelope state ----
    float m_beatPulse = 0.f;     ///< Decays exponentially after each beat; drives speed/power envelopes.
    float m_speedEnvelope = 1.f; ///< (Reserved) speed envelope state.
    float m_powerEnvelope = 1.f; ///< (Reserved) power envelope state.

    // ---- Spectral flux state (6 previous-frame band values) ----
    float m_prevSubBass = 0.f;  ///< Previous block's normalised subBass level (for flux delta).
    float m_prevBass = 0.f;     ///< Previous block's normalised bass level (for flux delta).
    float m_prevLowMid = 0.f;   ///< Previous block's normalised lowMid level (for flux delta).
    float m_prevMid = 0.f;      ///< Previous block's normalised mid level (for flux delta).
    float m_prevUpperMid = 0.f; ///< Previous block's normalised upperMid level (for flux delta).
    float m_prevHigh = 0.f;     ///< Previous block's normalised high level (for flux delta).
    float m_sFlux = 0.f;        ///< Smoothed 6-band spectral-flux accumulator.

    // ---- Beat-triggered discrete state ----
    int   m_currentSides = 6; ///< Current kaleidoscope symmetry (changes every 16 beats).
    float m_flipDir = 1.f;    ///< Rotation direction: +1 or -1 (flips on strong beats).
    int   m_beatCount = 0;    ///< Cumulative beat counter (for sub-sampling discrete changes).

    // ---- BPM estimation ----
    /** Length of #m_ioi: the last 12 intervals between kicks. */
    static constexpr int IoiLen = 12;
    float                m_ioi[IoiLen] = {};   ///< Ring of the last intervals between kicks, in seconds.
    int                  m_ioiIdx = 0;         ///< Next write index into #m_ioi.
    int                  m_ioiCount = 0;       ///< Valid entries in #m_ioi (an empty slot never counts).
    float                m_ioiExplained = 0.f; ///< Share of #m_ioi the tempo's period explains (the rhythm's strength).
    /**  The beat period that best explains the recent kick intervals (#m_ioi) as multiples of it.
     *
     * @param prevPeriod  The period so far in seconds (0: none), favoured among equals. (in)
     * @param explained   The share of the intervals it explains, 0..1. (out)
     *
     * @return
     *   The period in seconds, between 60/180 and 60/70 s; 0 if fewer than three intervals are known.
     *
     * Every interval, divided by 1, 1.5, 2, 2.5, 3 or 4, proposes a period in the 70-180 BPM range; each proposal
     * is scored by how many intervals it explains as one of those multiples (within 30 ms + 4 %), then by how
     * simple the multiples are, then by its nearness to prevPeriod; the winner is refined by least squares over
     * the intervals it explains.  Until 16.10.2026 every interval was folded into 70-180 BPM on its own and the
     * folded BPMs averaged: a boom-bap 90 (1.5, 1, 1.5 beats) read 110, a two-step 174 about 128.
     **/
    float ioiPeriod( float prevPeriod, float &explained ) const;
    float m_lastBeatFrame = 0.f; ///< Frame counter value at the last detected beat.
    float m_frameCounter = 0.f;  ///< Total frames processed since start (monotonic).
    float m_smoothedBPM = 0.f;   ///< Smoothed BPM estimate (from inter-beat intervals, refined by autocorrelation).

    // ---- Log attack time state ----
    float m_prevLevel = 0.f;                ///< Previous overall level (for rise-rate / attack detection).
    float m_attackAccum = 0.f;              ///< Smoothed attack sharpness; see AudioFeatures::logAttackTime.
    float m_sZCR = 0.f;                     ///< Smoothed zero-crossing rate; see AudioFeatures::zeroCrossingRate.
    float m_sSFM = 0.f;                     ///< Smoothed spectral flatness; see AudioFeatures::spectralFlatness.
    float m_sSharpness = 0.f;               ///< Smoothed Zwicker-style sharpness; see AudioFeatures::sharpness.
    float m_sKeyClarity = 0.f;              ///< Smoothed key clarity (Krumhansl-Kessler best-vs-mean); see
                                            ///< AudioFeatures::keyClarity.
    static const int HcdfSpan = 40; ///< HCDF compares the tonal centroid with the one this many blocks ago (400 ms).
    float m_hcdfChroma[12] = {};    ///< The chroma behind HCDF: L1-normalised, smoothed over ~0.4 s (a kick or a
                                    ///< passing note averages out, a chord stays).
    /// Scale of the HCDF distance to ~0..1, calibrated on Tools/make_chord_wav.py: 3.3 for the old all-bins
    /// chroma; 1.3 since the peak chroma of 16.10.2026 (24 of 38 changes seen, 4 false alarms; 3.3 saturated it).
    static constexpr float HcdfGain = 1.3f;
    float m_tonalRing[HcdfSpan][6] = {}; ///< The last HcdfSpan Harte 6-D tonal centroids (ring, for HCDF).
    int                    m_tonalPos = 0;                ///< Next write slot of m_tonalRing (its oldest entry).
    int                    m_tonalFill = 0;               ///< Entries of m_tonalRing written so far (up to HcdfSpan).
    float m_sHCDF = 0.f;         ///< Smoothed harmonic change detection function; see AudioFeatures::harmonicChange.
    float m_sRoughness = 0.f;    ///< Smoothed sensory dissonance (Sethares); see AudioFeatures::roughness.
    float m_loudnessRef = 0.10f; ///< Slow loudness reference for AGC (keeps visuals volume-independent).

    // ---- Full-spectrum onset detection + downbeat ----
    float m_onsetAvg = 0.f;      ///< Recent average of the onset detection function (m_odfFFT).
    float m_prevODF = 0.f;       ///< Previous-frame ODF (rising-edge test).
    float m_onsetCooldown = 0.f; ///< Blocks remaining before another onset may fire (min spacing between onsets).
    float m_onsetRate = 0.f;     ///< Leaky onsets-per-second (percussive density).
    float m_kickRate = 0.f;      ///< Leaky BASS-DRUM beats/second (kick dominance).

    /** HPSS-inspired harmonic/percussive content measure: cosine similarity of consecutive FFT magnitude spectra.
     *
     * Sustained harmonic material (drones, pads, held chords) keeps the
     * spectrum similar frame-to-frame (measured ~0.8+ — leakage interference
     * between close partials keeps it below 1); percussive transients punch
     * broadband "vertical" energy into it and the similarity dips hard
     * (measured ~0.3 on a kick pattern). Asymmetrically smoothed (dips
     * tracked fast, recovery slow) so a beat every 0.5 s keeps the value
     * visibly down.
     **/
    float m_sSpecSim = 1.f;

    /** FFT-based onset detection function (normalised positive spectral flux of the 2048-sample magnitude spectra).
     *
     * The old per-block 6-band RMS deltas RIPPLED on low-frequency content
     * (a 55 Hz sine's period beats against the ~10 ms block rate), firing
     * ~10 phantom onsets/sec on a pure drone — which also fooled the
     * autocorrelation into "detecting" a rhythm. The 43 ms FFT window
     * integrates over several periods and is stable.
     **/
    float m_odfFFT = 0.f;
    float m_bandRef32[32] = {};  ///< Per-band peak-hold reference (~200 ms release), used for the FFT-based ODF.
    float m_downbeatPulse = 0.f; ///< Decaying accent on the bar's "1"; see AudioFeatures::downbeat.
    int   m_kickCount = 0;       ///< Counts detected kicks (for downbeat every 4).
    float m_prevBeatPhase = 0.f; ///< Previous beatPhase value (for downbeat wrap detection).
    int   m_barBeat = 0;         ///< Beat-within-bar counter, 0..3.
    float m_barAccum[4] = {};    ///< Per-bar-position accent strength (argmax = the musical "1").

    // ---- Autocorrelation tempo (fixed-rate onset envelope) ----
    /** Onset-envelope sample rate, in Hz. */
    static constexpr int EnvRate = 100;
    /** Length of #m_odfEnv: ~4 s of envelope. */
    static constexpr int OdfEnvLen = 400;
    /** The autocorrelation is evaluated every this many blocks (10 Hz): a 4 s window needs no more. */
    static constexpr int AcEvery = 10;
    /** Width of the log-Gaussian tempo prior around 120 BPM, in octaves (the lag pick, not the gate). */
    static constexpr float AcPriorOctaves = 1.0f;
    // ---- SuperFlux onset function: what the tempo autocorrelation runs on (16.10.2026) ----
    float m_sfPrev[2048 / 2 + 1] = {}; ///< Previous frame's log-compressed magnitudes (FFTHalf bins, declared below).
    float m_odfSF = 0.f;               ///< SuperFlux: rise of the log spectrum over the max-filtered previous frame.
    float m_sfEnv[OdfEnvLen] = {};     ///< Fixed-rate ring of m_odfSF (same cadence and write index as m_odfEnv).
    int   m_acBlock = 0;               ///< Blocks since the last autocorrelation (#AcEvery).
    int   m_acRival = 0;               ///< Evaluations in a row whose tempo disagrees with #m_acBPM.
    int   m_acDebugN = 0;              ///< Evaluations counted for the KALEIDO_AC_DEBUG line.
    float m_odfEnv[OdfEnvLen] = {};    ///< Fixed-rate ring of the onset detection function (diagnostic only:
                                       ///< KALEIDO_SPEECH_DEBUG's odfMean/odfStd).
    int   m_odfEnvIdx = 0;             ///< Next write index into #m_odfEnv.
    int   m_envFrameAcc = 0;           ///< Sample-frame accumulator that paces writes into #m_odfEnv to #EnvRate.
    float m_acBPM = 0.f;               ///< Autocorrelation tempo estimate, in BPM.
    float m_acConf = 0.f;              ///< Share of the last ~4 s the onset function was clearly periodic, 0..1.
    float m_odfEnvMean = 0.f;          ///< Last ODF-envelope mean (diagnostic for the tempo gate).
    float m_odfEnvStd = 0.f;           ///< Last ODF-envelope std-dev (diagnostic for the tempo gate).
    float m_roughRaw = 0.f; ///< Unscaled roughness ratio (diagnostic; the scale constant came from measuring this).

    /** Smoothed chroma-hue VECTOR (cosine component).
     *
     * Smoothing the vector (not the angle) lets the harmony→hue drift slowly
     * without the angle jumping across the colour-wheel wrap-around → no
     * abrupt colour changes.
     **/
    float m_hueCos = 0.f;
    float m_hueSin = 0.f; ///< Smoothed chroma-hue vector (sine component); see #m_hueCos.

    // ---- Rhythm / dynamics / stereo / classifier state ----
    float m_sRhythm = 0.f;      ///< Smoothed rhythm strength (beat regularity); see AudioFeatures::rhythmStrength.
    float m_sStereoWidth = 0.f; ///< Smoothed stereo side/mid width; see AudioFeatures::stereoWidth.

    // ---- Stereo per-channel band split (stereo-separated spectrum) ----
    float m_lpStL[2] = {};      ///< L-channel LP filter states (~250 Hz, ~2500 Hz cutoffs).
    float m_lpStR[2] = {};      ///< R-channel LP filter states (~250 Hz, ~2500 Hz cutoffs).
    float m_sStBand[2][3] = {}; ///< Smoothed [L/R][low/mid/high] per-channel band energies.

    // ---- Track-change detection (sustained silence -> first onset) ----
    float m_silenceFrames = 0.f; ///< Consecutive near-silent update cycles.
    bool  m_wasSilent = false;   ///< Armed once the silence is long enough to count as a track boundary.

    float m_prevPitch = 0.f;   ///< Previous dominant pitch (for delta-pitch).
    float m_sDeltaPitch = 0.f; ///< Smoothed melodic activity; see AudioFeatures::deltaPitch.
    /** Length of #m_fluxHistory: ~1 s of spectral-flux samples. */
    static constexpr int FluxHistLen = 100;
    float m_fluxHistory[FluxHistLen] = {}; ///< Ring of recent spectral-flux values, for the flux-variance
                                           ///< ("restlessness") measure.
    int   m_fluxIdx = 0;                                  ///< Next write index into #m_fluxHistory.
    float m_sFluxVar = 0.f;       ///< Smoothed flux variance ("restlessness"); see AudioFeatures::fluxVariance.
    float m_sMusicPresence = 1.f; ///< Smoothed music-vs-speech gate (hysteresis); see AudioFeatures::musicPresence.

    // ---- FFT analysis (Radix-2 Cooley-Tukey, real-valued audio input) ----
    // Window: 2048 samples ≈ 42 ms at 48 kHz → 23.4 Hz / bin.
    // Enables: spectral rolloff, spectral spread, chroma-based major/minor
    // detection (Krumhansl-Kessler profiles), and dominant pitch via HPS.
    /** FFT window size in samples (2048 ≈ 42 ms at 48 kHz → 23.4 Hz / bin).
     *
     * Must be a power of two.
     **/
    static constexpr int FFTSize = 2048;
    /** Number of unique FFT bins after a real-valued FFT (FFTSize/2 + 1). */
    static constexpr int FFTHalf = FFTSize / 2 + 1;

    float m_ringBuf[FFTSize] = {}; ///< Circular buffer of most-recent mono samples, feeding the FFT window.
    int   m_ringWrite = 0;         ///< Next write index in #m_ringBuf.

    float m_fftRe[FFTSize] = {};  ///< Real-part working buffer (in-place FFT input/output).
    float m_fftIm[FFTSize] = {};  ///< Imaginary-part working buffer (zero before FFT).
    float m_fftWin[FFTSize] = {}; ///< Precomputed Hann window coefficients (filled in the constructor).

    float m_prevMags[FFTHalf] = {}; ///< Magnitude spectrum from the previous frame (for FFT-based flux / harmonicity).
    // ---- pitch voicing (the harmonic product spectrum's peak against its median, in log units) ----
    float m_voiceMel = 0.f;    ///< Melody search's voicing, smoothed over ~0.2 s.
    float m_voiceDom = 0.f;    ///< Full-range search's voicing, smoothed over ~0.2 s.
    bool  m_melVoiced = false; ///< Melody voiced (hysteresis 10 / 7 on m_voiceMel).
    bool  m_domVoiced = false; ///< Dominant pitch voiced (the same on m_voiceDom).
    float m_melodyRaw[5] = {}; ///< The last five raw melody pitches (for the note's median).
    int   m_melodyRawIdx = 0;  ///< Next write index in m_melodyRaw.
    float m_melodyNote = 0.f;  ///< The published melody note (median while voiced, 0 otherwise).

    // ---- the chroma's own, longer FFT (computeChroma()) ----
    /** Window of the chroma's FFT: 8192 samples, 5.9 Hz a bin at 48 kHz (the 2048-point FFT's 23 Hz bin is wider
     * than a semitone below ~400 Hz, and filed a C major triad in octave 3 as C#, F#, A#).
     **/
    static constexpr int ChromaFFT = 8192;
    std::vector<float>   m_chromaRing;    ///< The last ChromaFFT mono samples, circular (on the heap: an analyzer may
                                          ///< live on the stack).
    int                m_chromaWrite = 0; ///< Next write index in m_chromaRing.
    std::vector<float> m_chromaRe;        ///< FFT working buffer, real part.
    std::vector<float> m_chromaIm;        ///< FFT working buffer, imaginary part.
    std::vector<float> m_chromaWin;       ///< Hann window of ChromaFFT points.
    int                m_chromaBlock = 0; ///< Blocks since the last chroma FFT (it runs every 4th, 40 ms).
    float              m_chroma[12] = {}; ///< The last computed chroma, L1-normalised, held between its FFTs.
    /**  The chroma of the last ChromaFFT samples, into m_chroma.
     *
     * @param sampleRate  The analysis rate in Hz. (in)
     *
     * Spectral peaks from 55 Hz to 5 kHz (within 40 dB of the strongest), their frequency interpolated
     * parabolically on the log magnitude, their weight mildly compressed (log(1 + 10 * amplitude); on the chord
     * track 1, 10, 30 and 100 measured alike), each spread over its two nearest pitch classes with a cos^2 window of
     * 4/3 semitones (HPCP, Gomez 2006).  Peaks instead of every bin: the old sum filed every bin's leakage and noise
     * into a class, and the number of bins per class ran from 12 (E) to 25 (C#).
     **/
    void  computeChroma( float sampleRate );
    float m_smoothedChroma[12] = {}; ///< Smoothed 12-bin chroma vector (C .. B), L1-normalised.

    // Smoothed FFT-derived outputs
    /** 32-band log-spaced spectrum for the analyzer effects (self-normalised); see AudioFeatures::spectrum. */
    float m_sSpectrum[AudioFeatures::SpectrumBands] = {};
    float m_specRef = 1e-4f; ///< Decaying-peak reference for #m_sSpectrum auto-scaling.

    /** MilkDrop-style relative band levels: instant / slow-average ratio per register (bass / mid / treble), ~1.0 =
     * as loud as usual.
     *
     * The slow EMA (~5 s, #m_relSlow) is the "usual"; the ratio (#m_sRel) is
     * lightly smoothed.
     **/
    float m_relSlow[3] = { 0.2f, 0.2f, 0.2f };
    float m_sRel[3] = { 1.0f, 1.0f, 1.0f }; ///< Smoothed relative band levels; see
                                            ///< AudioFeatures::bassRel/midRel/trebRel.

    /** Rolling mono ring (last 2048 samples) feeding the `audioWave[64]` waveform output.
     *
     * Downsampled to 64 averaged points per block and normalised with a
     * decaying-peak reference (see AudioFeatures::wave).
     **/
    static const int WaveRing = 2048;
    float            m_waveRing[WaveRing] = {}; ///< Rolling mono sample ring feeding the waveform downsampler.
    int              m_waveWritePos = 0;                      ///< Next write index into #m_waveRing.
    float            m_waveRef = 0.05f; ///< Decaying |peak| reference (keeps the wave visible independent of volume).
    float m_sWave[AudioFeatures::WavePoints] = {}; ///< Smoothed, downsampled waveform points; see AudioFeatures::wave.

    /** Section-change detector state (see AudioFeatures::sectionCount): fast/slow EMAs of the normalised 32-band
     * shape and total band energy.
     **/
    float m_secFast[AudioFeatures::SpectrumBands] = {};     ///< Fast (~2.5 s) EMA of the normalised 32-band spectral
                                                            ///< shape.
    float m_secSlow[AudioFeatures::SpectrumBands] = {}; ///< Slow (~18 s) EMA of the normalised 32-band spectral shape.
    float m_secFastLvl = 0.f;                               ///< Fast (~2.5 s) EMA of total band energy.
    float m_secSlowLvl = 0.f;                               ///< Slow (~18 s) EMA of total band energy.
    float m_secNovelty = 0.f; ///< Current novelty score (fast-vs-slow shape/level distance); see
                              ///< AudioFeatures::sectionNovelty.
    int   m_secWarm = 0;      ///< Blocks since start (EMAs must settle before triggers are allowed).
    int   m_secCooldown = 0;                                ///< Blocks until the next section trigger is allowed.
    float m_secFreeFast[AudioFeatures::SpectrumBands] = {}; ///< Like m_secFast, but never re-anchored (drift
                                                            ///< estimate).
    float m_secFreeSlow[AudioFeatures::SpectrumBands] = {}; ///< Like m_secSlow, but never re-anchored.
    float m_secFreeFastLvl = 0.f;                           ///< Like m_secFastLvl, never re-anchored.
    float m_secFreeSlowLvl = 0.f;                           ///< Like m_secSlowLvl, never re-anchored.
    float m_secDrift = 0.f;   ///< Running median of the never re-anchored novelty: how much the music drifts on its
                              ///< own; the trigger threshold rises with it.
    int   m_secReanchor = 0;  ///< Blocks until the second re-anchoring after a trigger (0: none pending).
    float m_secThr = 0.2f;    ///< The current trigger threshold (see AudioFeatures::sectionThreshold).
    int   m_sectionCount = 0; ///< Cumulative section-change count; see AudioFeatures::sectionCount.

    /** Song-structure memory: spectral fingerprints of the sections heard so far.
     *
     * #m_secPrint is a ~1 s EMA of the shape (at trigger time it is already
     * ~90% the NEW section, unlike the laggier 2.5 s average). On a section
     * trigger it is matched against the stored prints (cosine similarity) —
     * the same chorus is recognised when it returns.
     **/
    static const int MaxSectionPrints = 8;
    float m_secPrint[AudioFeatures::SpectrumBands] = {}; ///< ~1 s EMA of the spectral shape (used as the section
                                                         ///< fingerprint).
    float m_secPrints[MaxSectionPrints][AudioFeatures::SpectrumBands] = {}; ///< Stored fingerprints of
                                                                            ///< previously-seen sections.
    int m_secPrintUse[MaxSectionPrints] = {}; ///< Last-used stamp per stored fingerprint (LRU replacement policy).
    int               m_secPrintN = 0;                                      ///< Number of stored fingerprints so far.
    int m_secPrintEpoch[MaxSectionPrints] = {}; ///< The song (m_songEpoch) each stored fingerprint was heard in.
    int m_songEpoch = 0;     ///< Songs begun so far (beginSong()): a section is only recognised within its song.
    int m_agcFastBlocks = 0; ///< Blocks the gain still adapts quickly after a song began (5 s).
    std::atomic<bool> m_newSongRequested{ false }; ///< newSong() was called; beginSong() runs at the next block.
    /**  The analysis side of a new song: the kick intervals start afresh, the gain adapts quickly for 5 s, and the
     * section memory recognises only this song's sections.  Runs on the analysis thread.
     **/
    void beginSong();
    int  m_secCurId = -1;    ///< Current section's id (index into #m_secPrints); see AudioFeatures::sectionId.
    bool m_secKnown = false; ///< Whether the current section matched a stored print (vs. was newly stored, possibly in
                             ///< a recycled slot); see AudioFeatures::sectionKnown.

    /** Instrument-separated onsets (see AudioFeatures::onsetKick/Snare/Hat): per-group positive flux (low/mid/high
     * bands) with its own spike test.
     **/
    float m_onsetAvgGrp[3] = {};  ///< Running ODF averages per instrument group (kick/snare/hat).
    int   m_onsetCoolGrp[3] = {}; ///< Per-group re-trigger cooldowns, in blocks.
    float m_onsetEnvGrp[3] = {};  ///< Decaying output envelopes per instrument group.

    /** Build-up / drop detection state (see AudioFeatures::buildUp/dropPulse).
     *
     * Build-up evidence: fast-vs-slow (bias-corrected) EMAs of onset rate,
     * centroid and level, plus a leaky snare-roll density. Drop: a bass
     * vacuum while armed (recent build-up) followed by the bass slamming
     * back.
     **/
    float m_bldFastOnset = 0.f, m_bldSlowOnset = 0.f; ///< Fast (~1.5 s) / slow (~10 s) EMAs of onset rate.
    /** Fast (~1.5 s) EMA of the smoothed spectral centroid (0..1); its rise over #m_bldSlowCent is the "filter
     * sweep" build-up evidence.
     **/
    float m_bldFastCent = 0.f, m_bldSlowCent = 0.f; ///< Slow (~10 s) EMA of spectral centroid, the baseline the fast
                                                    ///< one is compared against.
    /** Fast (~1.5 s) EMA of the overall level (0..1); its ratio to #m_bldSlowLvl is the "swelling level" build-up
     * evidence.
     **/
    float m_bldFastLvl = 0.f, m_bldSlowLvl = 0.f; ///< Slow (~10 s) EMA of overall level, the baseline the fast one is
                                                  ///< compared against.
    float m_bldSnareRoll = 0.f;                   ///< Smoothed snare-onset envelope mean (snare-roll density).
    int   m_bldWarm = 0; ///< Bias-correction counter (EMA warm-up), also used as a block-count clock for build-up/drop
                         ///< logging.
    float m_sBuildUp = 0.f;                       ///< Smoothed 0..1 build-up output; see AudioFeatures::buildUp.
    /** Fast (~0.15 s) EMA of the LINEAR sub-bass + bass RMS (not the dB-normalised 0..1 bands); a value under 0.35 x
     * #m_bassSlow while armed is the drop "vacuum".
     **/
    float m_bassFast = 0.f, m_bassSlow = 0.f; ///< Slow (~5 s) EMA of the same linear bass energy, FROZEN while a vacuum
                                              ///< is open so the gap cannot drag the average down.
    float m_dropArmed = 0.f;                  ///< Blocks of arming left (recent build-up qualifies a drop).
    float m_lowGapBlocks = 0.f;               ///< Consecutive blocks of bass vacuum (the breakdown gap).
    float m_dropPulse = 0.f;                  ///< Decaying drop output (1.0 at the hit); see AudioFeatures::dropPulse.
    int   m_dropCooldown = 0;                 ///< Blocks until the next drop may fire.
    // ---- return after a breakdown (the drop most real tracks actually have) ----
    float m_brkFast = 0.f;   ///< ~1 s EMA of the level mix (0..1 scale).
    float m_brkSlow = 0.f;   ///< ~8 s EMA of the level mix.
    bool  m_inBreak = false; ///< Currently inside a breakdown (fast level well under the slow one).
    int   m_brkBlocks = 0;   ///< Blocks spent in the current breakdown.
    float m_brkPre = 0.f;    ///< Slow level when the breakdown began (what 'back' means).
    float m_brkMin = 1.f;    ///< Lowest fast level inside the breakdown.
    int   m_dropCount = 0;   ///< Cumulative drops (host-poll counter); see AudioFeatures::dropCount.

    // ---- DJ-STOP detection (see AudioFeatures::breakHold/breakSlam) ----
    float m_lvlFast = 0.f;      ///< ~60 ms full-band level EMA.
    float m_lvlSlow = 0.f;      ///< ~2.5 s reference level EMA (frozen during a stop).
    int   m_stopBlocks = 0;     ///< Blocks spent in the current stop/collapse/slam state.
    bool  m_stopActive = false; ///< True while a DJ stop (full-spectrum collapse) is in progress.
    float m_breakSlam = 0.f;    ///< Decaying slam-back pulse; see AudioFeatures::breakSlam.
    int   m_breakCount = 0;     ///< Cumulative detected DJ stops.

    /** Instant-replay audio ring: the last ~32 s of captured PCM (stereo s16).
     *
     * Fed in processBlock() (capture thread), dumped by dumpReplayWav() (main
     * thread) — guarded by #m_replayMx.
     **/
    static const int   ReplaySeconds = 32;
    std::vector<short> m_replayRing; ///< Ring buffer of captured PCM (stereo, interleaved s16); sized lazily as rate *
                                     ///< 2ch * seconds.
    size_t m_replayPos = 0;          ///< Next write index (frames * 2).
    size_t m_replayCount = 0;        ///< Frames written so far (saturates at the ring capacity).
    int    m_replayRate = 48000;     ///< Sample rate of the audio currently feeding #m_replayRing.
    QMutex m_replayMx;               ///< Guards #m_replayRing / #m_replayPos / #m_replayCount / #m_replayRate.

    float m_sRolloff = 0.5f; ///< Smoothed spectral rolloff (fraction of Nyquist, 0..1); see
                             ///< AudioFeatures::spectralRolloff.
    float m_sSpread = 0.f;   ///< Smoothed spectral spread, normalised by 5 kHz; see AudioFeatures::spectralSpread.
    float m_sMode = 0.5f;    ///< Smoothed musical mode, 0 = minor/dark .. 1 = major/bright; see
                             ///< AudioFeatures::musicalMode.
    float m_sPitch = 0.f;    ///< Smoothed dominant pitch, log-normalised 60..1200 Hz → 0..1; see
                             ///< AudioFeatures::dominantPitch.
    float m_sMelody = 0.f; ///< Smoothed MELODY pitch: the same HPS restricted to >= 150 Hz, so a loud bass line cannot
                           ///< claim it; see AudioFeatures::melodyPitch.

    /**  In-place Radix-2 DIT complex FFT.
     *
     * @param re  Real-part array, length N: input windowed samples, output real part of the DFT coefficients
     *            X[0..N-1]. (out)
     * @param im  Imaginary-part array, length N: input all-zero for real-valued audio, output imaginary part of
     *            X[0..N-1]. (out)
     * @param N   Transform size; MUST be a power of two (e.g. 2048). (in)
     **/
    static void radix2fft( float *re, float *im, int N );

    // ---- Audio source selection (runtime device switching) ----
    /**  (Re)populates #m_devices with the current output (loopback) and input endpoints.
     *
     * @param pEnum  WASAPI device enumerator to query. (in)
     **/
    void               enumerateDevices( IMMDeviceEnumerator *pEnum );
    QList<AudioDevice> m_devices;                 ///< Available audio sources (mutex-protected; see devices()).
    QString            m_curDeviceName;           ///< Name of the source currently being captured (mutex-protected; see
                                                  ///< currentDeviceName()).
    QString           m_reqDeviceId;              ///< Requested endpoint id ("" = default loopback).
    bool              m_reqIsCapture = false;     ///< Whether the requested device (#m_reqDeviceId) is an input.
    bool              m_useReqDevice = false;     ///< Whether to use #m_reqDeviceId instead of the default device.
    std::atomic<bool> m_deviceChangeReq{ false }; ///< Set by requestDevice() to make the capture loop re-initialise.
    std::atomic<bool> m_reqUnavailable{ false }; ///< The chosen device could not be opened: the default stands in until
                                                 ///< the device list changes (deviceListChanged()).
    std::atomic<bool> m_onDefault{ true };        ///< The capture runs on the default output right now.

    // ---- Input stage (ingest()) ----
    /** A 2:1 decimating half-band FIR for one interleaved stream of 1 or 2 channels, keeping its history across
     * blocks (88.2..192 kHz devices are brought down to the rate the analysis was tuned for).
     **/
    struct HalfbandDecimator
    {
        std::vector<float> hist;      ///< The last taps.size() input frames, interleaved, oldest first.
        int                phase = 0; ///< 0 = the next input frame produces an output frame.
    };
    HalfbandDecimator  m_decim[3];                    ///< One stage per halving (192 kHz -> 96 -> 48).
    std::vector<float> m_decOut[3];                   ///< Output of each stage.
    std::vector<float> m_mixBuf;                      ///< Stereo downmix of a multichannel block.
    std::vector<float> m_fixBuf;   ///< Sanitised copy of a block that held NaN, infinity or wild values.
    std::vector<float> m_mixGains; ///< Per input channel: gain into left, gain into right (2 floats each).
    int                m_mixChannels = 0;             ///< Channel count #m_mixGains was made for.
    unsigned           m_mixMask = 0;                 ///< Speaker mask #m_mixGains was made for (0 = the usual order).
    long long          m_badSamples = 0;              ///< Samples sanitised since the last report.
    int                m_blocksSinceBadLog = 1 << 30; ///< Blocks since the last report (one line a minute at most).
    /**  Everything the device or a file hands over goes through here before the analysis: non-finite or wild samples
     * are made safe, more than two channels mixed down to stereo, 88.2 kHz and up decimated.
     *
     * @param data         Interleaved float samples. (in)
     * @param numFrames    Frames in @p data. (in)
     * @param numChannels  Channels per frame (any count). (in)
     * @param sampleRate   Sample rate of @p data in Hz. (in)
     * @param record       Also append to the recording WAV if one is requested (the live and -w/-x paths). (in)
     * @param speakerMask  WAVEFORMATEXTENSIBLE channel mask, or 0 for the usual order of that channel count. (in)
     *
     * Stereo at 44.1 or 48 kHz passes through untouched, so the offline analysis stays bit-identical.
     **/
    void ingest( const float *data, int numFrames, int numChannels, int sampleRate, bool record,
                 unsigned speakerMask = 0 );

    // ---- Audio recording (loopback -> 16-bit stereo WAV), written in run() ----
    std::atomic<bool> m_recReq{ false };   ///< Recording requested (set from the GUI thread).
    std::atomic<bool> m_wavOpen{ false };  ///< Whether the recording file is currently open (run thread only).
    QString           m_recWavPath;        ///< Requested recording path (set under #m_mutex).
    void             *m_wavFile = nullptr; ///< Recording file handle (FILE*, run thread only).
    unsigned int      m_wavDataBytes = 0;  ///< Bytes written to the WAV data chunk so far.
    /**  Opens #m_wavFile at #m_recWavPath and writes a placeholder 44-byte WAV header.
     *
     * @param sampleRate  Sample rate to record at (written into the header, fixed up on close). (in)
     **/
    void recOpen( int sampleRate );
    /**  Appends captured samples to the open recording, converting to 16-bit stereo.
     *
     * @param src          Interleaved float samples, range roughly [-1, 1] (clipped to 16-bit on conversion). (in)
     * @param numFrames    Number of frames in `src`. (in)
     * @param numChannels  Number of interleaved channels in `src` (channel 2+ is ignored; mono is duplicated to
     *                     stereo). (in)
     **/
    void recWrite( const float *src, int numFrames, int numChannels );
    /** Finalises the WAV header (chunk sizes) and closes #m_wavFile. */
    void recClose();

    // ---- Tap tempo (manual override; see tapTempo()) ----
    QElapsedTimer       m_tapClock;           ///< Started in the constructor (thread-safe reads from both threads).
    qint64              m_tapTimes[8] = {};   ///< GUI-thread-only ring of tap timestamps (ms).
    int                 m_tapN = 0;           ///< Total taps registered in the current series.
    std::atomic<int>    m_tapIntervalMs{ 0 }; ///< Manually tapped interval in ms; 0 = no manual tempo override active.
    std::atomic<qint64> m_tapAnchorMs{ 0 };   ///< Phase anchor timestamp (the last tap), for beat-phase reconstruction.
    std::atomic<qint64> m_tapUntilMs{ 0 };    ///< Timestamp at which the manual tap-tempo override expires.
    // ---- External clock (externalBeat()): GUI thread writes, the analysis reads the atomics ----
    qint64              m_extTimes[8] = {};    ///< GUI-thread-only ring of external beat times (m_tapClock ms).
    int                 m_extN = 0;            ///< External beats in the current series.
    std::atomic<int>    m_extIntervalMs{ 0 };  ///< The external beat interval in ms; 0 = none.
    std::atomic<qint64> m_extAnchorMs{ 0 };    ///< The last external beat as heard (m_tapClock ms, delay added).
    std::atomic<qint64> m_extUntilMs{ 0 };     ///< When the external clock stops counting (2 s after its last beat).
    std::atomic<bool>   m_extPhase{ false };   ///< The external beats carry the phase too.
    const char         *m_extSource = nullptr; ///< Who keeps the time (GUI thread, for the log).
    bool                m_extWasOn = false;    ///< The analysis thread's view: the clock was in charge last block.

    // ---- Shared output ----
    mutable QMutex m_mutex;    ///< Guards #m_features (and the device-selection / recording-path fields above).
    AudioFeatures  m_features; ///< Latest published analysis result; see getFeatures().

    // ---- Lifecycle ----
    std::atomic<bool> m_running{ false }; ///< Set true at the start of run(); cleared by stop() to end the
                                          ///< capture/analysis loop.

    // ---- Helpers ----
    /**  Core per-block DSP pipeline: 6-band IIR analysis, beat detection, ambient classification, FFT features,
     * publishes AudioFeatures.
     *
     * @param data         Interleaved float PCM samples for this block. (in)
     * @param numFrames    Number of frames in `data`. (in)
     * @param numChannels  Number of interleaved channels in `data` (1 or 2). (in)
     * @param sampleRate   Sample rate of `data`, in Hz. (in)
     *
     * @sideeffects
     *   Changes s_maj_dev, s_maj_var, s_min_dev, s_min_var, s_profiles_ready.
     **/
    void processBlock( const float *data, int numFrames, int numChannels,
                       int sampleRate );
    /**  One-pole IIR low-pass filter coefficient for a given cutoff and sample rate.
     *
     * @param cutoffHz    Filter cutoff frequency, in Hz. (in)
     * @param sampleRate  Sample rate, in Hz. (in)
     *
     * @return
     *   Coefficient `a` such that `y[n] = a*y[n-1] + (1-a)*x[n]`; larger `a` = slower response (lower cutoff).
     **/
    static float coeff( float cutoffHz, int sampleRate );

private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    AudioAnalyzer( const AudioAnalyzer & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    AudioAnalyzer &operator=( const AudioAnalyzer & ) = delete;
};
