/*****************************************************************************\
 *                              MidiInput
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of MidiInput: Win32 winmm device open/close, callback-thread message decode, and thread-safe
 *  event queue.
 *
 *  @author René Weller
 */

#include "MidiInput.h"

#include <QtCore/QElapsedTimer>

#include <algorithm>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mmsystem.h>

/**  winmm callback (runs on a system thread).
 *
 * @param wMsg        The winmm callback reason; only MIM_DATA (an incoming short message) is handled. (in)
 * @param dwInstance  The `this` pointer of the owning MidiInput, as passed to midiInOpen()'s dwCallbackInstance.
 *                    (in)
 * @param dwParam1    The packed MIDI short message for MIM_DATA. (in)
 *
 * Forwards MIM_DATA short messages to the owning MidiInput instance passed as dwInstance.
 **/
static void CALLBACK midiProc( HMIDIIN, UINT wMsg, DWORD_PTR dwInstance,
                               DWORD_PTR dwParam1, DWORD_PTR /*dwParam2*/ )
{
    if ( wMsg == MIM_DATA && dwInstance )
        reinterpret_cast<MidiInput *>( dwInstance )->handleMessage( static_cast<unsigned long>( dwParam1 ) );
}
#endif // _WIN32

MidiInput::MidiInput()
{
}

MidiInput::~MidiInput()
{
    stop();
}

bool MidiInput::start( const QString &want )
{
#ifndef _WIN32
    (void)want;
    // No winmm outside Windows. The natural Linux counterpart is ALSA raw
    // MIDI (and CoreMIDI on macOS), but winmm hands us a CALLBACK while both
    // of those need a polling thread of their own -- that is new behaviour,
    // not a port, so it is left out rather than shipped unverified.
    // Returning false is the same answer the caller gets from a Windows box
    // with no controller attached, which it already handles.
    return false;
#else
    const UINT n = midiInGetNumDevs();
    if ( n == 0 )
        return false;

    // The device named in the ini (midiDevice, a part of its name) -- with a keyboard and a controller attached the
    // OS-assigned first one was often the wrong one -- else the first. The list goes to the log, so the name to put
    // there can be read off it.
    UINT pick = 0;
    for ( UINT i = 0; i < n; ++i )
    {
        MIDIINCAPSW c;
        if ( midiInGetDevCapsW( i, &c, sizeof( c ) ) != MMSYSERR_NOERROR )
            continue;
        const QString name = QString::fromWCharArray( c.szPname );
        fprintf( stderr, "MIDI input %u: %s\n", i, name.toLocal8Bit().constData() );
        if ( !want.isEmpty() && pick == 0 && name.contains( want, Qt::CaseInsensitive ) )
            pick = i;
    }

    HMIDIIN  h = nullptr;
    MMRESULT r = midiInOpen( &h, pick, reinterpret_cast<DWORD_PTR>( midiProc ), reinterpret_cast<DWORD_PTR>( this ),
                             CALLBACK_FUNCTION );
    if ( r != MMSYSERR_NOERROR )
        return false;

    MIDIINCAPSW caps;
    if ( midiInGetDevCapsW( pick, &caps, sizeof( caps ) ) == MMSYSERR_NOERROR )
        m_name = QString::fromWCharArray( caps.szPname );

    m_handle = h;
    midiInStart( h );
    return true;
#endif
}

void MidiInput::stop()
{
#ifdef _WIN32
    if ( m_handle )
    {
        HMIDIIN h = reinterpret_cast<HMIDIIN>( m_handle );
        midiInStop( h );
        midiInReset( h );
        midiInClose( h );
        m_handle = nullptr;
    }
#endif
}

void MidiInput::handleMessage( unsigned long dwParam1 )
{
    int status = dwParam1 & 0xFF;
    int d1 = ( dwParam1 >> 8 ) & 0xFF;
    int d2 = ( dwParam1 >> 16 ) & 0xFF;
    int type = status & 0xF0;

    // MIDI clock (16.10.2026): 24 ticks a quarter note, Start/Continue/Stop, and the song position (in 16ths).
    // The ticks were dropped; a DAW or a DJ program that sends clock now sets the tempo -- and, once Start or a
    // song position said where the song is, the beat phase (AudioAnalyzer::externalBeat()).
    switch ( status )
    {
        case 0xF8:
        {
            QElapsedTimer now;
            now.start();
            clockTick( now.msecsSinceReference() );
            return;
        }
        case 0xFA: // Start: the next tick is the song's first
            m_clockPos = 0;
            m_clockPhase = true;
            m_clockStopped = false;
            m_tickN = 0;
            return;
        case 0xFB: // Continue
            m_clockStopped = false;
            return;
        case 0xFC: // Stop
            m_clockStopped = true;
            return;
        case 0xF2: // Song position pointer: 16ths since the start, six ticks each
            m_clockPos = ( d1 | ( d2 << 7 ) ) * 6;
            m_clockPhase = true;
            return;
        default:
            break;
    }

    // Control-Change, or Note-On with non-zero velocity (a Note-On with velocity 0 is the
    // conventional MIDI encoding of Note-Off, which this class ignores entirely).
    if ( type == 0xB0 || ( type == 0x90 && d2 > 0 ) )
        push( type, d1, d2 );
}

void MidiInput::clockTick( qint64 nowMs )
{
    if ( m_clockStopped )
        return;
    if ( m_tickN > 0 && nowMs - m_tickMs[( m_tickN - 1 ) % 49] > 2000 )
        m_tickN = 0; // the clock paused: start counting again
    m_tickMs[m_tickN % 49] = nowMs;
    ++m_tickN;
    const int pos = m_clockPos++;
    if ( pos % 24 != 0 )
        return;
    // The tempo over the last two beats (48 intervals): single tick intervals are a few ms at millisecond
    // resolution, too coarse to be read one by one.
    const int span = std::min( m_tickN - 1, 48 );
    if ( span < 24 )
        return;
    const float  ms = static_cast<float>( nowMs - m_tickMs[( m_tickN - 1 - span ) % 49] );
    const float  bpm = ms > 0.f ? 60000.f * static_cast<float>( span ) / ( 24.f * ms ) : 0.f;
    QMutexLocker lk( &m_mutex );
    if ( m_events.size() < 256 )
        m_events.push_back( Event{ 0xF8, m_clockPhase ? 1 : 0, 0, nowMs, bpm } );
}

void MidiInput::push( int type, int d1, int d2 )
{
    QMutexLocker lk( &m_mutex );
    if ( m_events.size() < 256 ) // guard against runaway backlog
        m_events.push_back( Event{ type, d1, d2 } );
}

std::vector<MidiInput::Event> MidiInput::drain()
{
    QMutexLocker       lk( &m_mutex );
    std::vector<Event> out;
    out.swap( m_events ); // hand off + clear atomically under the lock
    return out;
}
