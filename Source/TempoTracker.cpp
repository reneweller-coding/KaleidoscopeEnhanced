//---------------------------------------------------------------------------
//                              TempoTracker
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  The tempo of the music (see TempoTracker.h).  The code came out of AudioAnalyzer::processBlock unchanged on
 *  20.11.2026; its history is in the comments, which moved with it.
 *
 *  @author René Weller
 */

#include "TempoTracker.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>

void TempoTracker::reset()
{
    m_ioiCount = 0;
    m_acBPM = 0.f;
    m_acRival = 0;
}

void TempoTracker::pushOnset( float sf )
{
    m_sfEnv[m_envIdx] = sf;
    m_envIdx = ( m_envIdx + 1 ) % EnvLen;
    m_longEnv[m_longIdx] = sf;
    m_longIdx = ( m_longIdx + 1 ) % LongLen;
    m_longFilled = std::min( m_longFilled + 1, LongLen );
    if ( !m_blockOnsetSet )
    {
        m_blockOnset = sf;
        m_blockOnsetSet = true;
    }
}

template <typename Past>
double TempoTracker::transition( const Past &past, double tau )
{
    const int lo = static_cast<int>( std::nearbyint( 2.0 * tau ) );
    const int hi = static_cast<int>( std::nearbyint( tau / 2.0 ) );
    double    best = 0.0;
    for ( int j = lo; j >= hi; --j )
    {
        const double l = BtTight * std::log( j / tau );
        best = std::max( best, past( j ) * std::exp( -0.5 * l * l ) );
    }
    return best;
}

int TempoTracker::predictBeat( double tau ) const
{
    const int win = std::max( 1, static_cast<int>( tau ) );
    const int lo = static_cast<int>( std::nearbyint( 2.0 * tau ) );
    double    fut[2 * BtHist]; // lo + win <= 511 + 255: beatStep() keeps tau <= (BtHist - 1) / 2
    // the last lo values of the cumulative score, then the future (without onsets)
    for ( int j = 0; j < lo; ++j )
        fut[j] = m_cs[( m_csIdx - lo + j + 2 * BtHist ) % BtHist];
    for ( int k = 0; k < win; ++k )
        fut[lo + k] = transition( [&fut, lo, k]( int j )
        { return fut[lo + k - j]; }, tau );
    int    best = 0;
    double best_v = 0.0;
    for ( int k = 0; k < win; ++k )
    {
        const double d = ( k + 1 ) - tau / 2.0;
        const double v = fut[lo + k] * std::exp( -d * d / ( 2.0 * ( tau / 2.0 ) * ( tau / 2.0 ) ) );
        if ( v > best_v )
        {
            best_v = v;
            best = k;
        }
    }
    return best;
}

void TempoTracker::beatStep( double onset, double blockSeconds )
{
    // The beat phase by beat tracking (20.11.2026, A3 of docs/PLAN_2026-11-20.md): the cumulative score and the
    // predicted next beat of BTrack (Stark, Davies & Plumley 2009, "Real-Time Beat-Synchronous Analysis of
    // Musical Audio"), on the SuperFlux envelope and the published tempo.  Until then the phase restarted at every
    // kick and ran at the tempo in between: a syncopated kick moved it off the beat, and a break without kicks let it
    // drift.  C(m) = 0.1 O(m) + 0.9 max over 2 to 1/2 beats back of W(v) C(m + v), W log-Gaussian around one beat
    // (tightness 5); half a beat after each beat the next one is predicted from C continued one beat ahead without
    // onsets, weighted by a Gaussian around one beat after the last.  Measured with Tools/beat_lab.py through the
    // conditioner's PLL (what the shaders see) on 25,034 annotated beats of 41 demos: F-measure 27.9 -> 48.5 %,
    // CMLt 25.8 -> 43.8 %, AMLt 32.9 -> 61.1 %; in stretches of 8 s and more without a kick the phase is within an
    // eighth of a beat 25 -> 39 % of the time (chance is 25 %).  Tightness 2 or 3 measured within two points.
    const double bpm = m_smoothedBPM;
    if ( bpm < 1.0 )
    {
        m_cs[m_csIdx] = ( 1.0 - BtAlpha ) * onset;
        m_csIdx = ( m_csIdx + 1 ) % BtHist;
        m_btCountdown = m_btToPredict = -1;
        m_btPhase = 0.f;
        m_btClock += blockSeconds;
        return;
    }
    // The beat period in blocks.  The ring and predictBeat()'s scratch hold two beats back and one ahead in BLOCKS,
    // and a block is whatever the capture hands over: 10 ms as a rule, but a WASAPI loopback packet can be a
    // millisecond.  On 20.11.2026 such a packet at 120 BPM made tau 500 blocks; predictBeat() wrote 1,500 values
    // into its 1,024 and the stack cookie ended the program (0xC0000409, 3.6 and 4.5 minutes into a soak run).
    // Beyond what the arrays hold the period is clamped: a short packet misjudges one block instead of the stack.
    const double tau = std::min( 60.0 / bpm / blockSeconds, ( BtHist - 1 ) / 2.0 );
    const double past = transition( [this]( int j )
    { return m_cs[( m_csIdx - j + BtHist ) % BtHist]; }, tau );
    m_cs[m_csIdx] = ( 1.0 - BtAlpha ) * onset + BtAlpha * past;
    m_csIdx = ( m_csIdx + 1 ) % BtHist;
    if ( m_btCountdown < 0 && m_btToPredict < 0 )
        m_btToPredict = 0;
    if ( m_btToPredict >= 0 )
    {
        if ( m_btToPredict == 0 )
        {
            m_btCountdown = predictBeat( tau );
            m_btToPredict = -1;
        }
        else
            --m_btToPredict;
    }
    if ( m_btCountdown >= 0 )
    {
        if ( m_btCountdown == 0 )
        {
            m_btLastBeat = m_btClock;
            m_btCountdown = -1;
            m_btToPredict = static_cast<int>( std::nearbyint( tau / 2.0 ) );
        }
        else
            --m_btCountdown;
    }
    if ( m_btLastBeat > -1e8 )
    {
        const double ph = ( m_btClock - m_btLastBeat ) * bpm / 60.0;
        m_btPhase = static_cast<float>( ph - std::floor( ph ) );
    }
    else
        m_btPhase = 0.f;
    m_btClock += blockSeconds;
}

double TempoTracker::pulseScore( const double *env, int n, double period )
{
    const int p = static_cast<int>( std::ceil( period ) );
    const int k_n = static_cast<int>( ( n - p ) / period );
    if ( k_n < 3 || p < 1 )
        return 0.0;
    double best = -1e300, sum = 0.0;
    for ( int phase = 0; phase < p; ++phase )
    {
        double s = 0.0;
        for ( int k = 0; k < k_n; ++k )
            s += env[static_cast<int>( std::nearbyint( phase + k * period ) )];
        s /= k_n;
        best = std::max( best, s );
        sum += s;
    }
    return best - sum / p;
}

double TempoTracker::choose( double lag4 ) const
{
    // The tempo by pulse trains (20.11.2026, A2 of docs/PLAN_2026-11-20.md).  The 4-s autocorrelation picks one
    // lag under a prior around 120 BPM, and in four seconds three beats of a fast track correlate as well as two:
    // dotted readings (92 for 138) and their kin were a fifth of the errors.  Here the strongest peaks of the
    // autocorrelation over the last 12 s and their metrical relatives (x2, /2, x3/2, x2/3) are candidates, and each
    // is scored by a pulse train laid over the onset envelope at its best phase -- how far the envelope at the
    // pulses stands above its mean over all phases (Percival & Tzanetakis 2014, "Streamlined Tempo Estimation Based
    // on Autocorrelation and Cross-correlation With Pulses") -- plus 0.3 x the trains at twice and half the period
    // (the metrical levels around a beat agree with it; a dotted period's do not), times the same prior.  A dotted
    // period puts every second pulse between the beats.  A reading outside the 4-s pick's octave family (not a power
    // of two away) has to score 1.25 times as high, or the family's best stays: without that margin a ternary
    // groove (Ironic) and a cross-rhythm in a psytrance breakdown (104 for 140) switched to their 3:4 readings.
    // Measured with Tools/tempo_lab.py on the 43 demos (strict, within 4 % of the cues' tempo): right 49 -> 66 %,
    // at 90..135 BPM 81 -> 87 %, over 135 78 -> 80 %, under 90 25 -> 51 %, folded 55 -> 71 %.  The gate (peak,
    // prominence, kurtosis) is untouched, so calm music reads no more rhythm than before.
    if ( m_longFilled < EnvLen )
        return lag4;
    const int n = m_longFilled;
    double    env[LongLen], envm[LongLen];
    double    mean = 0.0;
    for ( int i = 0; i < n; ++i )
    {
        env[i] = m_longEnv[( m_longIdx - n + i + LongLen ) % LongLen]; // oldest first
        mean += env[i];
    }
    mean /= n;
    double var = 1e-9;
    for ( int i = 0; i < n; ++i )
    {
        env[i] -= mean;
        var += env[i] * env[i];
    }
    for ( int i = 0; i < n; ++i ) // +-1 sample of timing slack (wrapping at the ends, as the lab does)
        envm[i] = std::max( env[i], std::max( env[( i + n - 1 ) % n], env[( i + 1 ) % n] ) );
    const int lag_lo = ( 60 * EnvRate ) / 180, lag_hi = ( 60 * EnvRate ) / 70;
    double    ac[( 60 * EnvRate ) / 70 + 2] = {};
    for ( int lag = lag_lo - 1; lag <= lag_hi + 1; ++lag )
    {
        double sum = 0.0;
        for ( int i = 0; i + lag < n; ++i )
            sum += env[i] * env[i + lag];
        ac[lag] = sum / var;
    }
    // the strongest local maxima of the autocorrelation (inside lag_lo..lag_hi, so each has two neighbours there)
    int peaks[( 60 * EnvRate ) / 70 + 2];
    int np = 0;
    for ( int lag = lag_lo + 1; lag < lag_hi; ++lag )
        if ( ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1] )
            peaks[np++] = lag;
    std::stable_sort( peaks, peaks + np, [&ac]( int a, int b )
    { return ac[a] > ac[b]; } );
    np = std::min( np, Peaks );
    double cands[1 + Peaks];
    int    nc = 0;
    cands[nc++] = lag4;
    for ( int j = 0; j < np; ++j )
    {
        const int    l = peaks[j];
        const double a = ac[l - 1], b = ac[l], c = ac[l + 1];
        const double curve = a - 2.0 * b + c;
        const double shift = curve < 0.0 ? std::clamp( 0.5 * ( a - c ) / curve, -0.5, 0.5 ) : 0.0;
        cands[nc++] = l + shift;
    }
    static const double Relatives[] = { 1.0, 2.0, 0.5, 1.5, 2.0 / 3.0 };
    double              lags[( 1 + Peaks ) * 5];
    int                 nl = 0;
    for ( int j = 0; j < nc; ++j )
        for ( double r : Relatives )
        {
            const double lag = std::nearbyint( cands[j] / r * 100.0 ) / 100.0;
            if ( lag >= lag_lo && lag <= lag_hi && std::find( lags, lags + nl, lag ) == lags + nl )
                lags[nl++] = lag;
        }
    std::sort( lags, lags + nl );
    double best_s = -1e300, best = lag4, fam_s = -1e300, fam = 0.0;
    for ( int j = 0; j < nl; ++j )
    {
        const double lag = lags[j];
        const double octs = std::log2( 60.0 * EnvRate / ( 120.0 * lag ) ) / AcPriorOctaves;
        double       s = pulseScore( envm, n, lag );
        s += MultiW * ( pulseScore( envm, n, 2.0 * lag ) + pulseScore( envm, n, 0.5 * lag ) );
        s *= std::exp( -0.5 * octs * octs );
        if ( s > best_s || ( s == best_s && lag > best ) )
        {
            best_s = s;
            best = lag;
        }
        const double rel = std::log2( lag / lag4 );
        if ( std::fabs( rel - std::nearbyint( rel ) ) < 0.06 && ( s > fam_s || ( s == fam_s && lag > fam ) ) )
        {
            fam_s = s;
            fam = lag;
        }
    }
    if ( fam > 0.0 && best_s < Margin * fam_s )
        best = fam;
    return best;
}

float TempoTracker::ioiPeriod( float prevPeriod, float &explained ) const
{
    explained = 0.f;
    if ( m_ioiCount < 3 )
        return 0.f;
    static const float Mult[] = { 1.f, 1.5f, 2.f, 2.5f, 3.f, 4.f };
    const float        p_lo = 60.f / 180.f, p_hi = 60.f / 70.f;
    float              best = 0.f, best_score = -1.f, best_share = 0.f;
    for ( int i = 0; i < m_ioiCount; ++i )
        for ( float n : Mult )
        {
            const float p = m_ioi[i] / n;
            if ( p < p_lo || p > p_hi )
                continue;
            int    hits = 0;
            float  simple = 0.f;
            double num = 0.0, den = 0.0;
            for ( int j = 0; j < m_ioiCount; ++j )
            {
                const float y = m_ioi[j];
                float       err = 1e9f, m_best = 1.f;
                for ( float m : Mult )
                    if ( std::fabs( y - m * p ) < err )
                    {
                        err = std::fabs( y - m * p );
                        m_best = m;
                    }
                if ( err < 0.03f + 0.04f * y )
                {
                    ++hits;
                    simple += 1.f / m_best;
                    num += static_cast<double>( y ) * m_best;
                    den += static_cast<double>( m_best ) * m_best;
                }
            }
            // First how many it explains, then how simply, then whether it is the tempo it was.
            const float continuity = prevPeriod > 0.f && std::fabs( p - prevPeriod ) < 0.03f * prevPeriod ? 0.6f : 0.f;
            const float score = static_cast<float>( hits ) + 0.3f * simple / static_cast<float>( m_ioiCount )
                                + continuity;
            if ( score > best_score && den > 0.0 )
            {
                best_score = score;
                best = std::clamp( static_cast<float>( num / den ), p_lo, p_hi );
                best_share = static_cast<float>( hits ) / static_cast<float>( m_ioiCount );
            }
        }
    explained = best_share;
    return best;
}

void TempoTracker::autocorrelate()
{
    const int lag_lo = ( 60 * EnvRate ) / 180; // 33 samples (180 BPM)
    const int lag_hi = ( 60 * EnvRate ) / 70;  // 85 samples (70 BPM)
    // The tempo autocorrelation runs on the SuperFlux onset function (16.10.2026).  The FFT flux above could not
    // tell beat from drone -- an ambient piece read a clearer period than The Prodigy (docs/engine-internals.md,
    // "Autocorrelation tempo") -- and its gate had been closed for good.  SuperFlux can, measured on seven beat
    // tracks against three Noctuary ambient renders and synthetic drones/pads: its peak sits at 0.36..0.62 on
    // the beat, 0.11..0.30 on the ambient.  Three bars, all measured: the peak; the prominence (peak over the
    // mean positive value), because the peak alone let a beating synthetic drone through (0.79); and the
    // kurtosis of the onset function, because a tremolo is periodic too -- Harmonic Hours holds a steady 0.34 s
    // modulation that passed peak and prominence in 27 % of its seconds.  Drum onsets are spikes (median
    // kurtosis 8..36 on the beat tracks), a modulation is a smooth wave (2.4..5.7 on the calm material); with
    // the third bar Harmonic Hours passes 3 % of its seconds and the beat tracks 47..100 %.  acConf is the
    // share of the last ~4 s that passed, so a stray second does not make a rhythm.  The lag is picked under a
    // log-Gaussian tempo prior around 120 BPM (Ellis 2007) and refined by a parabola through its neighbours; a
    // different tempo has to hold for two seconds before it replaces the estimate.
    float env[EnvLen];
    float mean = 0.f;
    for ( int i = 0; i < EnvLen; ++i )
    {
        env[i] = m_sfEnv[( m_envIdx + i ) % EnvLen]; // oldest first: the ring's seam is no lag
        mean += env[i];
    }
    mean /= EnvLen;
    float var = 1e-9f, m4 = 0.f;
    for ( int i = 0; i < EnvLen; ++i )
    {
        env[i] -= mean;
        var += env[i] * env[i];
        m4 += env[i] * env[i] * env[i] * env[i];
    }
    const float kurtosis = m4 * EnvLen / ( var * var );
    float       ac[( 60 * EnvRate ) / 70 + 2] = {};
    for ( int lag = lag_lo - 1; lag <= lag_hi + 1; ++lag )
    {
        float sum = 0.f;
        for ( int i = 0; i + lag < EnvLen; ++i )
            sum += env[i] * env[i + lag];
        ac[lag] = sum / var;
    }
    // Tried and dropped (10.11.2026): letting the double lag support a lag (Ellis' duple weighting), against
    // the dotted-quarter readings (92 for a trance at 138).  Right tempo 81 -> 84 % at 90..135 BPM, but
    // 78 -> 54 % above 135: in the 4-s window three beats of a fast track correlate as well as two.
    float peak = 0.f, positive = 0.f, best_score = 0.f;
    int   best_lag = 0;
    for ( int lag = lag_lo; lag <= lag_hi; ++lag )
    {
        peak = std::max( peak, ac[lag] );
        positive += std::max( ac[lag], 0.f );
        const float octaves = std::log2( 60.f * EnvRate / ( 120.f * lag ) ) / AcPriorOctaves;
        const float score = ac[lag] * std::exp( -0.5f * octaves * octaves );
        if ( score > best_score )
        {
            best_score = score;
            best_lag = lag;
        }
    }
    const float prominence = peak / std::max( 1e-6f, positive / ( lag_hi - lag_lo + 1 ) );
    const bool  periodic = best_lag > 0 && peak >= 0.30f && prominence >= 5.0f && kurtosis >= 8.f;
    m_acConf += 0.025f * ( ( periodic ? 1.f : 0.f ) - m_acConf ); // ~4 s at 10 Hz
    float bpm = 0.f;
    if ( periodic )
    {
        const float a = ac[best_lag - 1], b = ac[best_lag], c = ac[best_lag + 1];
        const float curve = a - 2.f * b + c;
        const float shift = curve < 0.f ? std::clamp( 0.5f * ( a - c ) / curve, -0.5f, 0.5f ) : 0.f;
        bpm = static_cast<float>( 60.0 * EnvRate / choose( best_lag + shift ) ); // see choose()
        if ( m_acBPM < 1.f || std::fabs( std::log2( bpm / m_acBPM ) ) < 0.1f )
        {
            m_acBPM = ( m_acBPM < 1.f ) ? bpm : 0.9f * m_acBPM + 0.1f * bpm;
            m_acRival = 0;
        }
        else if ( ++m_acRival >= 2 * AcEvery )
        {
            m_acBPM = bpm;
            m_acRival = 0;
        }
    }
    // KALEIDO_AC_DEBUG=1: once a second, what the gate saw.
    static const bool AcDebug = getenv( "KALEIDO_AC_DEBUG" ) != nullptr;
    if ( AcDebug && ( ++m_acDebugN % 10 ) == 0 )
        fprintf( stderr, "ACDBG peak %.3f prom %.2f kurt %.1f bpm %.1f conf %.3f acbpm %.1f\n", peak, prominence,
                 kurtosis, bpm, m_acConf, m_acBPM );
}

void TempoTracker::update( bool isBeat, float beatIntervalS, bool trackChange, float blockSeconds )
{
    if ( ++m_acBlock >= AcEvery )
    {
        m_acBlock = 0;
        autocorrelate();
    }

    // ---- BPM estimation from inter-beat intervals ----
    // The last IoiLen intervals between kicks, explained as multiples of one period (ioiPeriod()); the BPM from
    // it is smoothed to avoid jitter.
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
    // A new track starts its own tempo: the old one's intervals would only argue with it.
    if ( trackChange )
        m_ioiCount = 0;
    if ( isBeat )
    {
        const float interval_s = beatIntervalS;
        if ( interval_s > 0.12f && interval_s < 3.f )
        {
            m_ioi[m_ioiIdx] = interval_s;
            m_ioiIdx = ( m_ioiIdx + 1 ) % IoiLen;
            m_ioiCount = std::min( m_ioiCount + 1, IoiLen );
            // The period that explains the recent intervals as multiples (ioiPeriod()).
            const float period = ioiPeriod( m_smoothedBPM > 1.f ? 60.f / m_smoothedBPM : 0.f, m_ioiExplained );
            if ( period > 0.f )
            {
                const float bpm = 60.f / period;
                m_kickBPM = bpm;
                // The kick intervals set the tempo only until the autocorrelation has one (10.11.2026, see below):
                // smooth and slow, the first estimate taken as it is.
                if ( m_acBPM < 1.f )
                    m_smoothedBPM = m_smoothedBPM < 1.f ? bpm : 0.85f * m_smoothedBPM + 0.15f * bpm;
            }
        }
    }
    // Refine the tempo with the autocorrelation estimate when it is confident
    // (robust for tracks where the kick-based inter-beat estimate is noisy) --
    // and only then: where the kicks explain their own intervals (ioiPeriod()),
    // their tempo stands.  On a synthetic two-step 174 the autocorrelation was
    // "confident" of 116.6 and pulled a correct kick tempo there in a second.
    //
    // The autocorrelation gives the number, the kicks only the metre
    // (22.10.2026).  Measured against the beat cues of the generators' 43
    // demos, the kick tempo wandered wherever the kicks are syncopated -- a
    // breakbeat at 125 read 125..137 while the autocorrelation held 125.0, a
    // lounge groove at 90 read 92..179 -- and their explained share stayed
    // high all the same; the published tempo was right (within 4 %, both folded
    // to 70..180) in 34 % of the rhythmic time.  Where the kicks explain their
    // intervals and sit at a simple ratio to the autocorrelation -- its double
    // or half, or the 3:2 of a two-step (174 against 116.6) -- that ratio is
    // the metre, and the tempo is the autocorrelation's times it.
    //
    // The autocorrelation leads at any confidence (10.11.2026).  With the two
    // sources logged per block (AudioFeatures::tempoAc / tempoKick,
    // Tools/tempo_vs_cues.py) the kick tempo alone was right in 17 % of the
    // rhythmic time of the 43 demos and the autocorrelation alone in 50 %, yet
    // below a confidence of 0.35 the kicks used to set the tempo, and on every
    // kick they pulled at it.  Now they set it only until the autocorrelation
    // has a tempo at all; an unsure autocorrelation is followed slowly (two
    // seconds), so the tempo neither jitters nor sticks.  Of the metres only
    // the two-step's 3:2 stays: the kicks' double and half turned more right
    // tempos into octave errors than the reverse, and their 2:3 was wrong
    // whenever it fired (an uplifting trance read 92 for 138 in 30 % of its
    // time).  Replayed on the logged sources: right 43 -> 50 %, on the beat
    // grid (right, double or half) 66 -> 69 %, above 90 BPM 74 -> 80 %.  The
    // 3:2 needs kicks that explain 95 % of their intervals (a clean two-step):
    // from 75 % it was wrong as often as right on the demos and read a real
    // psytrance track at 180 for 120 in a quarter of its time.
    const bool kicks_explain = m_ioiCount >= 6 && m_ioiExplained >= 0.95f;
    if ( m_acBPM > 1.f )
    {
        float target = fold_bpm( m_acBPM );
        if ( kicks_explain && m_kickBPM > 1.f && std::fabs( m_kickBPM / target / 1.5f - 1.f ) < 0.03f )
            target *= 1.5f;
        if ( m_smoothedBPM < 1.f )
            m_smoothedBPM = target;
        else
        {
            const float follow = ( m_acConf > 0.2f ) ? 0.1f : 0.005f;
            m_smoothedBPM = ( 1.f - follow ) * m_smoothedBPM + follow * target;
        }
    }
    m_smoothedBPM = fold_bpm( m_smoothedBPM );

    // The beat, on the tempo just published.
    beatStep( m_blockOnsetSet ? m_blockOnset : 0.0, blockSeconds );
    m_blockOnsetSet = false;
}
