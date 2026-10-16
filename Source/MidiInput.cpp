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

    // Control-Change, or Note-On with non-zero velocity (a Note-On with velocity 0 is the
    // conventional MIDI encoding of Note-Off, which this class ignores entirely).
    if ( type == 0xB0 || ( type == 0x90 && d2 > 0 ) )
        push( type, d1, d2 );
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
