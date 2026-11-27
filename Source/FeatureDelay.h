//---------------------------------------------------------------------------
//                              FeatureDelay
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  The analysis held back by a set time: the picture waits for a sound that reaches the ear late (Bluetooth
 *  headphones, a television) -- docs/PLAN_2026-11-26.md, Z1.
 *
 *  The loopback tap hears the music the moment the program hands it to the output device; a Bluetooth headset plays
 *  it 150-250 ms later, a television 50-150 ms.  The latency lead (RenderPipeline::M_LatencyLead, positive) can only
 *  move the beat PHASE forward, so for those devices the picture was early and nothing could hold it back.  This ring
 *  keeps the analyzer's snapshots for the last second of AUDIO time and hands out the one that is the set delay
 *  older than the newest: every feature -- levels, onsets, the counters of beats, sections and drops, the tempo and
 *  its phase -- arrives exactly that much later, and everything computed from them (the conditioner, the scheduler's
 *  phrase grid and drop prediction, the OSC output) lives on the same delayed timeline.
 *
 *  Kept Qt-free so `Kaleidoscope.exe -q` checks it without an analyzer thread.
 *
 *  Rules it keeps:
 *  - Off (target 0 and nothing left to slew) it stores nothing and the reader gets the newest snapshot as before.
 *  - A change of the delay moves the effective delay at FeatureDelay::Slew seconds per second of audio: the delayed
 *    timeline then runs at half or one and a half times speed for a moment, never backwards, so no counter ever steps
 *    back (a counter that went back would read as a beat, a section or a track change to AudioEventLatch and the
 *    scheduler).
 *  - Set before the first block (setTarget( secs, true )), the delay holds from the start: until that much audio has
 *    been analysed the reader gets a silent snapshot -- nothing has reached the ear yet.
 *
 *  @author René Weller
 */

#pragma once

#include "AudioFeatures.h"

#include <vector>

/** @class FeatureDelay
 *
 * A ring of analysis snapshots on the audio clock and the one #target() seconds behind the newest.
 *
 * Not thread-safe by itself: AudioAnalyzer calls push() and reads delayed() under its feature mutex.
 **/
class FeatureDelay
{
public:
    /** The longest delay, in seconds (the setting reaches -0.5 s). */
    static constexpr float MaxSecs = 0.5f;
    /** How fast the effective delay follows a new target: seconds of delay per second of audio. */
    static constexpr float Slew = 0.5f;
    /** Slots in the ring; with #MinStep a slot each at least ~1 s of audio, twice #MaxSecs. */
    static constexpr int Capacity = 512;
    /** A block that ends less than this after its slot opened replaces that slot's snapshot (WASAPI sometimes hands
     * over packets of 1 ms; 10 ms is the usual). */
    static constexpr double MinStep = 0.002;

    FeatureDelay() = default;

    /**  Sets the delay.
     *
     * @param secs  The delay in seconds, clamped to 0..#MaxSecs. (in)
     * @param snap  Take it at once instead of slewing to it -- only right before the first block (otherwise the
     *              timeline would jump). (in)
     **/
    void setTarget( float secs, bool snap = false )
    {
        m_target = secs < 0.f ? 0.f : ( secs > MaxSecs ? MaxSecs : secs );
        if ( snap )
            m_eff = m_target;
    }
    /**  The delay asked for.
     *
     * @return
     *   Seconds.
     **/
    float target() const { return m_target; }
    /**  The delay in effect now (it slews toward target()).
     *
     * @return
     *   Seconds.
     **/
    float effective() const { return m_eff; }
    /**  Whether the reader must take delayed() instead of the newest snapshot.
     *
     * @return
     *   True while a delay is asked for or still in effect.
     **/
    bool active() const { return m_target > 0.f || m_eff > 0.f; }
    /**  Whether any block has gone through push() yet.
     *
     * @return
     *   True after the first block.
     **/
    bool started() const { return m_started; }

    /**  One analysed block.
     *
     * @param f     The snapshot after the block. (in)
     * @param secs  The block's length in seconds of audio. (in)
     **/
    void push( const AudioFeatures &f, double secs )
    {
        m_started = true;
        if ( secs < 0.0 )
            secs = 0.0;
        m_now += secs;
        const float step = Slew * static_cast<float>( secs );
        if ( m_eff < m_target )
            m_eff = ( m_target - m_eff < step ) ? m_target : m_eff + step;
        else if ( m_eff > m_target )
            m_eff = ( m_eff - m_target < step ) ? m_target : m_eff - step;
        if ( !active() )
        {
            // Off: nothing kept.  Switched on again, the ring fills from then on -- and the delay slews up slower
            // than the history grows, so there is always a snapshot old enough.
            m_count = 0;
            m_out = -1;
            return;
        }
        if ( m_ring.empty() )
        {
            m_ring.resize( Capacity );
            m_at.assign( Capacity, 0.0 );
        }
        if ( m_count == 0 || m_now - m_opened >= MinStep )
        {
            m_head = ( m_head + 1 ) % Capacity;
            if ( m_count < Capacity )
                ++m_count;
            m_opened = m_now;
        }
        m_ring[m_head] = f;
        m_at[m_head] = m_now;
        // The newest snapshot at or before now - delay (a microsecond of slack for the sum of block lengths).
        const double want = m_now - static_cast<double>( m_eff ) + 1e-6;
        m_out = -1;
        for ( int k = 0; k < m_count; ++k )
        {
            const int i = ( m_head - k + Capacity ) % Capacity;
            if ( m_at[i] <= want )
            {
                m_out = i;
                m_snappedSilence = false; // the music has reached the ear: never silence again
                break;
            }
        }
        // Nothing old enough: the delay was set before the music began (silence) -- or, switched on mid-show, the
        // slew outran nothing yet; then the oldest snapshot stands in.
        if ( m_out < 0 && !m_snappedSilence )
            m_out = ( m_head - m_count + 1 + Capacity ) % Capacity;
    }

    /**  The snapshot the reader gets while active().
     *
     * @return
     *   The snapshot #effective() seconds behind the newest; a silent one while the audio analysed so far is
     *   shorter than the delay set at the start.
     **/
    const AudioFeatures &delayed() const { return m_out >= 0 ? m_ring[m_out] : m_silent; }

    /** Forgets the history (the delay setting stays). */
    void clear()
    {
        m_count = 0;
        m_out = -1;
    }

    /**  Whether the silence before the first snapshot old enough is wanted (the delay was set before the first
     * block); otherwise the oldest kept snapshot stands in.
     *
     * @param on  True for silence. (in)
     **/
    void setSilenceFirst( bool on ) { m_snappedSilence = on; }

private:
    std::vector<AudioFeatures> m_ring;                   ///< The snapshots, #Capacity slots once a delay was asked for.
    std::vector<double>        m_at;                     ///< The audio time at the end of each slot's block.
    int                        m_head = -1;              ///< The newest slot.
    int                        m_count = 0;              ///< Slots filled.
    double                     m_now = 0.0;              ///< Audio analysed so far, seconds.
    double                     m_opened = 0.0;           ///< When the newest slot was opened.
    float                      m_target = 0.f;           ///< target()
    float                      m_eff = 0.f;              ///< effective()
    int                        m_out = -1;               ///< The slot delayed() hands out; -1 = the silent snapshot.
    bool                       m_started = false;        ///< started()
    bool                       m_snappedSilence = false; ///< setSilenceFirst()
    AudioFeatures              m_silent;                 ///< What nobody has heard yet.
};
