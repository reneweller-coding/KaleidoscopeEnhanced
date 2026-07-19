#include "MidiInput.h"

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mmsystem.h>

// winmm callback (runs on a system thread).  Forward MIM_DATA short messages to
// the owning MidiInput instance passed as dwInstance.
static void CALLBACK midiProc( HMIDIIN, UINT wMsg, DWORD_PTR dwInstance,
                               DWORD_PTR dwParam1, DWORD_PTR /*dwParam2*/ )
{
    if ( wMsg == MIM_DATA && dwInstance )
        reinterpret_cast<MidiInput*>(dwInstance)->handleMessage( (unsigned long)dwParam1 );
}

MidiInput::MidiInput() {}

MidiInput::~MidiInput()
{
    stop();
}

bool MidiInput::start()
{
    if ( midiInGetNumDevs() == 0 )
        return false;

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
}

void MidiInput::stop()
{
    if ( m_handle )
    {
        HMIDIIN h = reinterpret_cast<HMIDIIN>(m_handle);
        midiInStop( h );
        midiInReset( h );
        midiInClose( h );
        m_handle = nullptr;
    }
}

void MidiInput::handleMessage( unsigned long dwParam1 )
{
    int status = dwParam1 & 0xFF;
    int d1     = (dwParam1 >> 8)  & 0xFF;
    int d2     = (dwParam1 >> 16) & 0xFF;
    int type   = status & 0xF0;

    // Control-Change, or Note-On with non-zero velocity.
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
    out.swap( m_events );
    return out;
}
