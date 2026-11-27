//---------------------------------------------------------------------------
//                              DrumSeparator
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Kick, snare and hi-hat onset envelopes in real time (see DrumSeparator.h; Tools/drum_lab.py is the same in Python).
 *
 *  @author René Weller
 */

#include "DrumSeparator.h"

#include <algorithm>
#include <cmath>

namespace
{
/**  A logistic step over log frequency.
 *
 * @param lf     log2 of the frequency. (in)
 * @param f      The step's centre, in Hz. (in)
 * @param slope  Its steepness per octave. (in)
 *
 * @return
 *   0..1, 0.5 at f.
 **/
double step( double lf, double f, double slope )
{
    return 1.0 / ( 1.0 + std::exp( -( lf - std::log2( f ) ) * slope ) );
}

/**  A Gaussian bump over log frequency.
 *
 * @param lf     log2 of the frequency. (in)
 * @param f      Its centre, in Hz. (in)
 * @param width  Its standard deviation, in octaves. (in)
 *
 * @return
 *   0..1, 1 at f.
 **/
double bump( double lf, double f, double width )
{
    const double z = ( lf - std::log2( f ) ) / width;
    return std::exp( -0.5 * z * z );
}
} // namespace

void DrumSeparator::reset()
{
    std::fill( m_prev, m_prev + MaxBands, 0.0 );
    std::fill( m_ref, m_ref + MaxBands, 0.0 );
    for ( int d = 0; d < 3; ++d )
    {
        m_avg[d] = m_odf[d] = 0.0;
        m_cool[d] = 0;
        m_env[d] = m_act[d] = 0.f;
        m_hit[d] = false;
    }
}

void DrumSeparator::layout( int fftSize, int sampleRate )
{
    m_rate = sampleRate;
    m_fft = fftSize;
    const int    half = fftSize / 2 + 1;
    const double bin_hz = static_cast<double>( sampleRate ) / fftSize;
    const int    per_oct = 4;
    const int    raw = static_cast<int>( std::ceil( std::log2( HiHz / LoHz ) * per_oct ) );
    m_nb = 0;
    for ( int b = 0; b < raw; ++b )
    {
        const double f0 = LoHz * std::pow( 2.0, static_cast<double>( b ) / per_oct );
        const double f1 = LoHz * std::pow( 2.0, static_cast<double>( b + 1 ) / per_oct );
        const int    k0 = std::max( 1, static_cast<int>( std::floor( f0 / bin_hz + 0.5 ) ) );
        const int    k1 = std::min( std::max( k0 + 1, static_cast<int>( std::floor( f1 / bin_hz + 0.5 ) ) ), half - 1 );
        if ( m_nb > 0 && k0 < m_k1[m_nb - 1] )
            m_k1[m_nb - 1] = std::max( m_k1[m_nb - 1], k1 ); // bottom bands sharing bins: one band
        else if ( m_nb < MaxBands )
        {
            m_k0[m_nb] = k0;
            m_k1[m_nb] = k1;
            ++m_nb;
        }
    }
    m_split = static_cast<int>( std::floor( SplitHz / bin_hz + 0.5 ) );

    // The templates over the bands' centres (see the class comment); each column sums to 1.
    double lf[MaxBands], fc[MaxBands], low[MaxBands], harm[MaxBands];
    double low_sum = 0.0, harm_sum = 0.0;
    for ( int b = 0; b < m_nb; ++b )
    {
        fc[b] = std::sqrt( std::max( static_cast<double>( m_k0[b] ), 0.5 ) * m_k1[b] ) * bin_hz;
        lf[b] = std::log2( fc[b] );
        m_riseRel[b] = fc[b] < RiseSplitHz ? RiseRelease : 0.0;
        low[b] = step( lf[b], 35.0, 6.0 ) * ( 1.0 - step( lf[b], 160.0, 6.0 ) );
        harm[b] = step( lf[b], 250.0, 6.0 ) * std::pow( std::max( fc[b], 250.0 ) / 250.0, -1.0 )
                  * ( 1.0 - step( lf[b], 3000.0, 3.0 ) );
        low_sum += low[b];
        harm_sum += harm[b];
    }
    for ( int b = 0; b < m_nb; ++b )
    {
        m_w[b][0] = step( lf[b], 35.0, 6.0 ) * ( 1.0 - step( lf[b], 200.0, 6.0 ) ) + 0.03 * bump( lf[b], 3000.0, 1.0 );
        m_w[b][1] = 0.5 * bump( lf[b], 200.0, 0.5 ) + step( lf[b], 900.0, 3.0 ) * ( 1.0 - step( lf[b], 9000.0, 3.0 ) );
        m_w[b][2] = step( lf[b], 6500.0, 4.0 );
        m_w[b][3] = low[b] / low_sum + BassRho * harm[b] / harm_sum;
        m_w[b][4] = bump( lf[b], 1200.0, 1.0 );
    }
    for ( int k = 0; k < Templates; ++k )
    {
        double s = 0.0;
        for ( int b = 0; b < m_nb; ++b )
            s += m_w[b][k] + 1e-4;
        for ( int b = 0; b < m_nb; ++b )
            m_w[b][k] = ( m_w[b][k] + 1e-4 ) / s;
        m_wsum[k] = 0.0;
        for ( int b = 0; b < m_nb; ++b )
            m_wsum[k] += m_w[b][k];
    }

    // Each drum's own band: the kick's body, the snare's noise, the hat's noise.
    static const double Own[3][2] = { { 35.0, 200.0 }, { 1000.0, 8000.0 }, { 6000.0, 17000.0 } };
    for ( int d = 0; d < 3; ++d )
    {
        m_frac[d] = 0.0;
        for ( int b = 0; b < m_nb; ++b )
        {
            m_own[d][b] = fc[b] >= Own[d][0] && fc[b] < Own[d][1];
            if ( m_own[d][b] )
                m_frac[d] += m_w[b][d];
        }
    }
    reset();
}

void DrumSeparator::process( const float *mags, int fftSize, int sampleRate )
{
    if ( fftSize != m_fft || sampleRate != m_rate )
        layout( fftSize, sampleRate );
    const int half = std::min( fftSize / 2 + 1, 4097 );

    // 1. The percussive spectrum: the median across #MedianBins bins above the split (edges repeated).
    {
        const int r = MedianBins / 2;
        float     win[MedianBins];
        for ( int k = 0; k < half; ++k )
        {
            if ( k < m_split )
            {
                m_perc[k] = mags[k];
                continue;
            }
            for ( int j = 0; j < MedianBins; ++j )
                win[j] = mags[std::min( half - 1, std::max( 0, k - r + j ) )];
            std::nth_element( win, win + r, win + MedianBins );
            m_perc[k] = win[r];
        }
    }

    // 2. The bands (RMS of their bins, in amplitude units) and their rise over the previous block; each drum's own
    //    band level from the peak-hold.
    double v[MaxBands], rise[MaxBands], region[3] = { 0.0, 0.0, 0.0 }, total = 0.0;
    for ( int b = 0; b < m_nb; ++b )
    {
        double acc = 0.0;
        for ( int k = m_k0[b]; k < m_k1[b]; ++k )
            acc += static_cast<double>( m_perc[k] ) * m_perc[k];
        v[b] = std::sqrt( acc / ( m_k1[b] - m_k0[b] ) ) * ( 4.0 / fftSize );
        rise[b] = std::max( 0.0, v[b] - m_prev[b] );
        m_prev[b] = std::max( v[b], m_prev[b] * m_riseRel[b] );
        total += rise[b];
        // The level includes this block: a hit out of silence reads about 1, not its rise over nothing (that
        // flooded the running average and deafened the detector for seconds -- the band groups still do it).
        m_ref[b] = std::max( v[b], m_ref[b] * RefRelease );
        for ( int d = 0; d < 3; ++d )
            if ( m_own[d][b] )
                region[d] += m_ref[b];
    }

    // 3. The rise onto the templates: KL multiplicative updates of the activations, the templates fixed.
    double h[Templates];
    for ( int k = 0; k < Templates; ++k )
        h[k] = total / Templates + 1e-12;
    for ( int it = 0; it < Iterations; ++it )
    {
        double ratio[MaxBands];
        for ( int b = 0; b < m_nb; ++b )
        {
            double wh = 1e-12;
            for ( int k = 0; k < Templates; ++k )
                wh += m_w[b][k] * h[k];
            ratio[b] = ( rise[b] + 1e-12 ) / wh;
        }
        for ( int k = 0; k < Templates; ++k )
        {
            double num = 0.0;
            for ( int b = 0; b < m_nb; ++b )
                num += m_w[b][k] * ratio[b];
            h[k] *= num / m_wsum[k];
        }
    }

    // 4. Per drum: its part of its own band's rise against that band's level, and the old peak picking with the
    //    average floored.
    for ( int d = 0; d < 3; ++d )
    {
        m_act[d] = static_cast<float>( h[d] );
        const double odf = static_cast<double>( m_act[d] ) * m_frac[d] / ( region[d] + 1e-6 );
        m_odf[d] = odf;
        m_hit[d] = false;
        const double base = std::max( m_avg[d], AvgFloor );
        if ( m_cool[d] > 0 )
            --m_cool[d];
        else if ( odf > base * ThrK[d] + Floor )
        {
            const float s = static_cast<float>( std::min( odf / ( base * ThrK[d] + 1e-4 ) - 1.0, 1.0 ) );
            m_env[d] = std::max( m_env[d], s );
            m_cool[d] = Cooldown;
            m_hit[d] = true;
        }
        m_avg[d] = 0.95 * m_avg[d] + 0.05 * odf;
        m_env[d] *= Decay;
    }
}
