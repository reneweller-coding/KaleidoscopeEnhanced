//---------------------------------------------------------------------------
//                              TempoTracker
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  The tempo of the music: an autocorrelation of the SuperFlux onset envelope, fused with the intervals between the
 *  kicks.  Moved out of AudioAnalyzer::processBlock (20.11.2026) so that the tempo can be replayed, measured and
 *  changed on its own (Tools/tempo_lab.py replays the same inputs in Python).
 *
 *  @author René Weller
 */

#ifndef TEMPOTRACKER_H
#define TEMPOTRACKER_H

/**  The tempo from the onset envelope and the kicks.
 *
 * Fed by AudioAnalyzer once per analysis block (10 ms): pushOnset() with each onset-envelope sample that fell into
 * the block (at #EnvRate), then update() with the block's kick and track change.  tempo() is the published tempo
 * (folded into 70..180 BPM, 0 before there is one).
 **/
class TempoTracker
{
public:
    /** Onset-envelope sample rate, in Hz. */
    static constexpr int EnvRate = 100;
    /** The gate's window: ~4 s of envelope. */
    static constexpr int EnvLen = 400;
    /** The autocorrelation is evaluated every this many blocks (10 Hz). */
    static constexpr int AcEvery = 10;
    /** Width of the log-Gaussian tempo prior around 120 BPM, in octaves. */
    static constexpr float AcPriorOctaves = 1.0f;
    /** The last this many kick intervals are kept. */
    static constexpr int IoiLen = 12;
    /** The window of the tempo choice: ~12 s of envelope (choose()). */
    static constexpr int LongLen = 1200;
    /** Autocorrelation peaks of the long window taken as candidates. */
    static constexpr int Peaks = 5;
    /** Weight of the pulse trains at twice and half a candidate's period (the metrical levels around it). */
    static constexpr double MultiW = 0.3;
    /** A reading outside the 4-s pick's octave family has to score this much higher to replace it. */
    static constexpr double Margin = 1.25;
    /** Beat tracking: blocks of cumulative score kept (5 s). */
    static constexpr int BtHist = 512;
    /** Beat tracking: weight of the past in the cumulative score (Stark et al. 2009: 0.9). */
    static constexpr double BtAlpha = 0.9;
    /** Beat tracking: tightness of the log-Gaussian transition weighting (Stark et al. 2009: 5). */
    static constexpr double BtTight = 5.0;
    /** Envelope samples one block may carry for the beat tracker (16 = 160 ms; a longer block loses the rest). */
    static constexpr int MaxBlockOnsets = 16;

    /** A new song: the kick intervals and the autocorrelation tempo start over (AudioAnalyzer::beginSong()). */
    void reset();

    /**  One sample of the onset envelope (SuperFlux), at #EnvRate.
     *
     * @param sf  The onset strength. (in)
     **/
    void pushOnset( float sf );

    /**  The block's tempo step: the autocorrelation every #AcEvery blocks, the kick, the fusion, the beat.
     *
     * @param isBeat         A kick was detected in this block. (in)
     * @param beatIntervalS  Seconds since the previous kick (used when isBeat). (in)
     * @param trackChange    A new track started (the kick intervals start over). (in)
     * @param blockSeconds   The block's length in seconds. (in)
     **/
    void update( bool isBeat, float beatIntervalS, bool trackChange, float blockSeconds );

    /** @return The beat phase 0..1 (0 on the beat) from the beat tracker; 0 without a tempo. */
    float phase() const { return m_btPhase; }

    /** @return The published tempo in BPM, folded into 70..180 (0 before there is one). */
    float tempo() const { return m_smoothedBPM; }
    /** @return The autocorrelation's tempo in BPM (0 before there is one). */
    float acTempo() const { return m_acBPM; }
    /** @return The share of the last ~4 s the onset envelope was clearly periodic, 0..1. */
    float acConfidence() const { return m_acConf; }
    /** @return The tempo of the last kick-interval estimate alone, in BPM (diagnostics). */
    float kickTempo() const { return m_kickBPM; }
    /** @return The share of the recent kick intervals the kick period explains, 0..1. */
    float kickExplained() const { return m_ioiExplained; }
    /** @return How many kick intervals are kept (0..#IoiLen). */
    int kickCount() const { return m_ioiCount; }

private:
    /** One evaluation of the autocorrelation over the last #EnvLen envelope samples. */
    void autocorrelate();

    /**  The tempo lag the pulse trains prefer over the last #LongLen envelope samples.
     *
     * @param lag4  The 4-s autocorrelation's pick, in envelope samples (refined by its parabola). (in)
     *
     * @return
     *   The chosen lag in envelope samples (lag4 itself while less than 4 s of envelope is there).
     **/
    double choose( double lag4 ) const;

    /**  How far the envelope at a pulse train of this period stands above its mean over all phases.
     *
     * @param env     The envelope, mean removed and max-filtered over +-1 sample. (in)
     * @param n       Its length. (in)
     * @param period  The train's period in samples. (in)
     *
     * @return
     *   max over the phases of the mean at the pulses, minus the mean over the phases; 0 for fewer than 3 pulses.
     **/
    static double pulseScore( const double *env, int n, double period );

    /**  The beat tracker's step for one sample of the onset envelope (BTrack: cumulative score, predicted beat).
     *
     * @param onset  The envelope sample. (in)
     *
     * @return
     *   True if the predicted beat falls on this sample.
     **/
    bool beatStep( double onset );

    /**  The most likely transition into the next block's cumulative score: the past #m_cs from 2 beats to half a
     * beat back, under the log-Gaussian weighting around one beat.
     *
     * @param past  Function returning the cumulative score j blocks before the new one (j >= 1). (in)
     * @param tau   The beat period in blocks. (in)
     *
     * @return
     *   max over j of the weighted past score.
     **/
    template <typename Past>
    static double transition( const Past &past, double tau );

    /**  Blocks from now to the predicted next beat: the cumulative score continued one period into the future
     * without onsets, weighted by a Gaussian around half a period ahead.
     *
     * @param tau  The beat period in blocks. (in)
     *
     * @return
     *   The number of blocks until the beat (0 = this block).
     **/
    int predictBeat( double tau ) const;

    /**  The period that explains the kept kick intervals as multiples of one beat.
     *
     * @param prevPeriod  The current tempo's period in seconds, 0 if none (continuity bonus). (in)
     * @param explained   Receives the share of the intervals the period explains. (out)
     *
     * @return
     *   The period in seconds, 0 when fewer than three intervals are kept.
     **/
    float ioiPeriod( float prevPeriod, float &explained ) const;

    float m_sfEnv[EnvLen] = {};    ///< Ring of the onset envelope.
    int   m_envIdx = 0;            ///< Next write index into #m_sfEnv.
    float m_longEnv[LongLen] = {}; ///< Ring of the onset envelope over the tempo choice's window.
    int   m_longIdx = 0;           ///< Next write index into #m_longEnv.
    int   m_longFilled = 0;        ///< Valid samples in #m_longEnv (up to #LongLen).
    int   m_acBlock = 0;           ///< Blocks since the last autocorrelation (#AcEvery).
    int   m_acRival = 0;           ///< Evaluations in a row whose tempo disagrees with #m_acBPM.
    int   m_acDebugN = 0;          ///< Evaluations counted for the KALEIDO_AC_DEBUG line.
    float m_acBPM = 0.f;           ///< Autocorrelation tempo estimate, in BPM.
    float m_acConf = 0.f;          ///< Share of the last ~4 s the onset function was clearly periodic, 0..1.
    float m_ioi[IoiLen] = {};      ///< Ring of the last intervals between kicks, in seconds.
    int   m_ioiIdx = 0;            ///< Next write index into #m_ioi.
    int   m_ioiCount = 0;          ///< Valid entries in #m_ioi.
    float m_ioiExplained = 0.f;    ///< Share of #m_ioi the tempo's period explains (the rhythm's strength).
    float m_smoothedBPM = 0.f;     ///< The published tempo (folded into 70..180).
    float m_kickBPM = 0.f;         ///< The tempo of the last kick-interval estimate alone (diagnostics).

    // ---- beat tracker (beatStep()) ----
    double m_cs[BtHist] = {};       ///< Ring of the cumulative score, one value per block.
    int    m_csIdx = 0;             ///< Next write index into #m_cs.
    float  m_blockOnsets[MaxBlockOnsets] = {}; ///< The onset-envelope samples of the current block (for the beat tracker).
    int    m_blockOnsetN = 0;      ///< Valid entries in #m_blockOnsets.
    int    m_btCountdown = -1;      ///< Blocks until the predicted beat (-1: none predicted).
    int    m_btToPredict = -1;      ///< Blocks until the next prediction (-1: none scheduled).
    double m_btClock = 0.0;         ///< Seconds since the start (the block's start time).
    double m_btLastBeat = -1e9;     ///< Time of the last tracked beat (-1e9: none yet).
    float  m_btPhase = 0.f;         ///< The beat phase, see phase().
};

#endif // TEMPOTRACKER_H
