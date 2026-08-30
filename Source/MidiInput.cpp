/**
 * @file MidiInput.cpp
 * @brief Implementation of MidiInput: Win32 winmm device open/close, callback-thread message decode, and thread-safe event queue.
 */
#include "MidiInput.h"

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mmsystem.h>

/**
 * @brief winmm callback (runs on a system thread). Forwards MIM_DATA short messages to the owning MidiInput instance passed as dwInstance.
 * @param wMsg The winmm callback reason; only MIM_DATA (an incoming short message) is handled.
 * @param dwInstance The `this` pointer of the owning MidiInput, as passed to midiInOpen()'s dwCallbackInstance.
 * @param dwParam1 The packed MIDI short message for MIM_DATA.
 */
static void CALLBACK midiProc( HMIDIIN, UINT wMsg, DWORD_PTR dwInstance,
                               DWORD_PTR dwParam1, DWORD_PTR /*dwParam2*/ )
{
    if ( wMsg == MIM_DATA && dwInstance )
        reinterpret_cast<MidiInput*>(dwInstance)->handleMessage( (unsigned long)dwParam1 );
}
#endif // _WIN32

MidiInput::MidiInput() {}

MidiInput::~MidiInput()
{
    stop();
}

bool MidiInput::start()
{
#ifndef _WIN32
    // No winmm outside Windows. The natural Linux counterpart is ALSA raw
    // MIDI (and CoreMIDI on macOS), but winmm hands us a CALLBACK while both
    // of those need a polling thread of their own -- that is new behaviour,
    // not a port, so it is left out rather than shipped unverified.
    // Returning false is the same answer the caller gets from a Windows box
    // with no controller attached, which it already handles.
    return false;
#else
    if ( midiInGetNumDevs() == 0 )
        return false;

    // Always device index 0 ("the first available" device) — this app does not offer a device
    // picker, so if several controllers are attached the OS-assigned first one wins.
    HMIDIIN h = nullptr;
    MMRESULT r = midiInOpen( &h, 0, (DWORD_PTR)midiProc, (DWORD_PTR)this, CALLBACK_FUNCTION );
    if ( r != MMSYSERR_NOERROR )
        return false;

    MIDIINCAPSW caps;
    if ( midiInGetDevCapsW( 0, &caps, sizeof(caps) ) == MMSYSERR_NOERROR )
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
        HMIDIIN h = reinterpret_cast<HMIDIIN>(m_handle);
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
    int d1     = (dwParam1 >> 8)  & 0xFF;
    int d2     = (dwParam1 >> 16) & 0xFF;
    int type   = status & 0xF0;

    // Control-Change, or Note-On with non-zero velocity (a Note-On with velocity 0 is the
    // conventional MIDI encoding of Note-Off, which this class ignores entirely).
    if ( type == 0xB0 || (type == 0x90 && d2 > 0) )
        push( type, d1, d2 );
}

void MidiInput::push( int type, int d1, int d2 )
{
    QMutexLocker lk(&m_mutex);
    if ( m_events.size() < 256 )                 // guard against runaway backlog
        m_events.push_back( Event{ type, d1, d2 } );
}

std::vector<MidiInput::Event> MidiInput::drain()
{
    QMutexLocker lk(&m_mutex);
    std::vector<Event> out;
    out.swap( m_events );   // hand off + clear atomically under the lock
    return out;
}
