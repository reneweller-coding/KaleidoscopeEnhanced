//---------------------------------------------------------------------------
//                              DrumSeparator
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  The kick, snare and hi-hat onset envelopes the shaders read (audioKick, audioSnare, audioHat), separated from the
 *  rest of the music in real time: a percussive spectrum (the vertical median filter of harmonic/percussive
 *  separation), its onset spectrum (the rise of every band over the previous block), and that rise decomposed onto
 *  fixed drum templates and two absorbers for what is no drum (NMF with fixed bases).  Replaces the onsets of three
 *  band groups (27.11.2026); Tools/drum_lab.py replays the same steps in Python and scores them against drums whose
 *  onsets are known (docs/engine-internals-70-analyzer.md).
 *
 *  @author René Weller
 */

#ifndef DRUMSEPARATOR_H
#define DRUMSEPARATOR_H

/**  Kick, snare and hi-hat onset envelopes from the analyser's magnitude spectrum, one block at a time.
 *
 * Causal and without look-ahead: every block's result depends only on this block's spectrum and the past.  Fed by
 * AudioAnalyzer once per analysis block (10 ms) with the magnitudes of its 2048-point Hann FFT of the mono mix.
 * envelope() is what AudioFeatures::onsetKick / onsetSnare / onsetHat publish: 0..1, a hit sets it to its strength,
 * it decays by #Decay per block -- the same form and peak picking as the band-group onsets it replaces, so the
 * conditioning after it (AudioConditioner) and the scenes tuned on it see the same kind of signal.
 *
 * The steps per block:
 *  1. Percussive spectrum: above #SplitHz every bin is replaced by the median of the #MedianBins bins around it
 *     (FitzGerald 2010's percussion-enhancing filter across frequency) -- a tone's partial is a narrow peak and
 *     falls out, a drum's noise is broad and stays.  It needs no future frames (the median across time, the other
 *     half of the method, would: a new note has no past to be called harmonic against).  Below #SplitHz a 21-Hz bin
 *     cannot tell a partial from a noise band; there the templates decide.
 *  2. Log bands (four per octave, 30 Hz..16 kHz) and their rise (positive spectral flux): sustained energy never
 *     enters it, so a held bass cannot sit in the kick.  Above #RiseSplitHz the rise over the previous block; below
 *     it over the band's recent peak (#RiseRelease per block) -- the old kick's reference: a wobbling or beating bass
 *     stays under its own recent maximum, a kick rises above it.
 *  3. The rise decomposed onto five fixed templates by KL multiplicative updates (#Iterations, from a flat start):
 *     kick (35-200 Hz and a faint click), snare (a shell around 200 Hz and noise 1-9 kHz), hat (noise above
 *     6.5 kHz), a bass-note absorber (the kick's low plateau plus harmonics 250 Hz..3 kHz falling as 1/f, half the
 *     low part's mass) and a tonal mid absorber (around 1.2 kHz).  The absorbers are the free components of a
 *     partially fixed NMF (Wu & Lerch 2015), fixed here: what a bass note's or a tone's onset adds is theirs.
 *  4. Per drum the activation's part in its own band (kick 35-200 Hz, snare 1-8 kHz, hat 6-17 kHz) against that
 *     band's level (the bands' peak-hold, ~0.65-s release) -- the old ODF pos/ref with the rise of the whole band
 *     replaced by the drum's share of it -- and the old peak picking, its running average floored at #AvgFloor so a
 *     crumb of activation in music without that drum stays a crumb.
 **/
class DrumSeparator
{
public:
    /** Log bands: four per octave from #LoHz to #HiHz (bottom bands that share FFT bins merged). */
    static constexpr int MaxBands = 40;
    /** Number of templates: kick, snare, hat, the bass absorber, the mid absorber. */
    static constexpr int Templates = 5;
    /** Lowest band edge, in Hz. */
    static constexpr double LoHz = 30.0;
    /** Highest band edge, in Hz. */
    static constexpr double HiHz = 16000.0;
    /** Above this the percussive spectrum is the median across frequency, in Hz. */
    static constexpr double SplitHz = 250.0;
    /** Width of the median across frequency, in bins (FitzGerald 2010: 17). */
    static constexpr int MedianBins = 17;
    /** Multiplicative updates per block. */
    static constexpr int Iterations = 30;
    /** The bass absorber's harmonics, their mass against its low plateau's. */
    static constexpr double BassRho = 0.5;
    /** Below this the rise is read against the band's recent peak, above it against the previous block, in Hz. */
    static constexpr double RiseSplitHz = 250.0;
    /** Per-block release of that recent peak (the low bands' rise reference). */
    static constexpr double RiseRelease = 0.95;
    /** Per-block release of the bands' peak-hold level (~0.65 s at 100 blocks/s, as the old ODF's reference). */
    static constexpr double RefRelease = 0.985;
    /** A hit needs the ODF above max(average, #AvgFloor) * ThrK + #Floor; per drum (kick, snare, hat).  The old
     *  detector's 2.2, the snare's 3.0: its template is the broadest, the most often lit by something else. */
    static constexpr double ThrK[3] = { 2.2, 3.0, 2.2 };
    /** Absolute part of the threshold (the old detector's 0.06). */
    static constexpr double Floor = 0.06;
    /** The running average's floor in the threshold and the strength. */
    static constexpr double AvgFloor = 0.03;
    /** Envelope decay per block (~150 ms, the old envelope's). */
    static constexpr float Decay = 0.93f;
    /** Blocks between two hits of one drum (>= 120 ms, the old detector's). */
    static constexpr int Cooldown = 12;

    /** Forgets the music: levels, averages, envelopes (the band layout is kept). */
    void reset();

    /**  One analysis block.
     *
     * @param mags        Magnitudes of the block's FFT, bins 0..fftSize/2. (in)
     * @param fftSize     The FFT's length (2048 in the analyser). (in)
     * @param sampleRate  The audio's sample rate, in Hz (the bands are laid out again when it changes). (in)
     **/
    void process( const float *mags, int fftSize, int sampleRate );

    /**  The published envelope of a drum.
     *
     * @param d  0 kick, 1 snare, 2 hat. (in)
     *
     * @return
     *   0..1: the last hit's strength, decaying by #Decay per block.
     **/
    float envelope( int d ) const { return m_env[d]; }

    /**  This block's onset detection function of a drum (for the trace).
     *
     * @param d  0 kick, 1 snare, 2 hat. (in)
     *
     * @return
     *   The drum's activation in its band against the band's level.
     **/
    float odf( int d ) const { return static_cast<float>( m_odf[d] ); }

    /**  This block's activation of a drum's template in the onset spectrum (for the trace).
     *
     * @param d  0 kick, 1 snare, 2 hat. (in)
     *
     * @return
     *   The template's weight, in band-amplitude units.
     **/
    float activation( int d ) const { return m_act[d]; }

    /** @return Whether a drum's envelope was set by a hit in this block. */
    bool hit( int d ) const { return m_hit[d]; }

    /** @return The number of log bands of the current layout. */
    int bands() const { return m_nb; }

private:
    /**  Lays out the bands, the templates and the drums' own bands for a sample rate and FFT size.
     *
     * @param fftSize     The FFT's length. (in)
     * @param sampleRate  The sample rate, in Hz. (in)
     **/
    void layout( int fftSize, int sampleRate );

    int    m_rate = 0;                    ///< Sample rate of the current layout (0 = none yet).
    int    m_fft = 0;                     ///< FFT size of the current layout.
    int    m_nb = 0;                      ///< Number of log bands.
    int    m_split = 0;                   ///< First bin of the median across frequency.
    int    m_k0[MaxBands] = {};           ///< First FFT bin of each band.
    int    m_k1[MaxBands] = {};           ///< One past the last FFT bin of each band.
    double m_w[MaxBands][Templates] = {}; ///< Templates, each column summing to 1.
    double m_wsum[Templates] = {};        ///< Column sums of #m_w (the multiplicative update's denominators).
    bool   m_own[3][MaxBands] = {};       ///< Each drum's own band (where its ODF is read).
    double m_frac[3] = {};                ///< Each template's mass inside its drum's own band.
    double m_prev[MaxBands] = {}; ///< Each band's rise reference: its recent peak (low bands) or last amplitude.
    double m_riseRel[MaxBands] = {};      ///< Per-band release of #m_prev (#RiseRelease below #RiseSplitHz, else 0).
    double m_ref[MaxBands] = {};          ///< Peak-hold band levels (#RefRelease per block).
    double m_avg[3] = {};                 ///< Running averages of the ODFs.
    double m_odf[3] = {};                 ///< This block's ODFs.
    int    m_cool[3] = {};                ///< Re-trigger cooldowns, in blocks.
    float  m_env[3] = {};                 ///< The published envelopes.
    float  m_act[3] = {};                 ///< This block's drum activations.
    bool   m_hit[3] = {};                 ///< A hit in this block.
    float  m_perc[4097] = {};             ///< Scratch: the percussive spectrum (fftSize/2 + 1 <= 4097 bins).
};

#endif // DRUMSEPARATOR_H
