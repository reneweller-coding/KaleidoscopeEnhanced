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
        bpm = 60.f * EnvRate / ( best_lag + shift );
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

void TempoTracker::update( bool isBeat, float beatIntervalS, bool trackChange )
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
}
