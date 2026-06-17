#pragma once

#include <QtCore/QMutex>
#include <QtCore/QString>
#include <vector>

/**
 * MidiInput
 * ---------------------------------------------------------------------------
 * Optional MIDI control.  Opens the first available MIDI input device (a knob /
 * pad controller) via the Win32 winmm API and queues incoming Control-Change and
 * Note-On messages.  The host drains them each frame and maps them to actions
 * (knobs -> reactivity/trails/mood, pads -> next effect).
 *
 * If no MIDI device is present, start() returns false and everything is a no-op,
 * so the visualizer is unaffected.
 * ---------------------------------------------------------------------------
 */
class MidiInput
{
public:
    struct Event { int type; int data1; int data2; };   // type: 0xB0 CC, 0x90 NoteOn

    MidiInput();
    ~MidiInput();

    bool    start();                 // open the first MIDI-in device (false if none)
    void    stop();
    QString deviceName() const { return m_name; }

    std::vector<Event> drain();      // thread-safe: return + clear queued events

    // Called from the winmm callback thread with a packed MIDI short message.
    void    handleMessage( unsigned long dwParam1 );

private:
    void    push( int type, int d1, int d2 );

    void              *m_handle = nullptr;   // HMIDIIN (kept opaque to avoid windows.h here)
    mutable QMutex     m_mutex;
    std::vector<Event> m_events;
    QString            m_name;
};
