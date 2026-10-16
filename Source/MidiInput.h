//---------------------------------------------------------------------------
//                              MidiInput
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  MIDI-Learn input: binds incoming MIDI CC/note messages from a hardware controller to shader parameters.
 *
 *  @author René Weller
 */

#pragma once

#include <QtCore/QMutex>
#include <QtCore/QString>
#include <vector>

/** @class MidiInput
 *
 * Optional MIDI control: opens the first MIDI-in device and queues its CC/Note-On messages.
 *
 * Opens the first available MIDI input device (a knob / pad controller) via the Win32 winmm API
 * and queues incoming Control-Change and Note-On messages. The host drains them each frame
 * (drain()) and maps them to actions (knobs -> reactivity/trails/mood, pads -> next effect).
 *
 * If no MIDI device is present, start() returns false and everything is a no-op, so the
 * visualizer is unaffected. Message decoding happens on the winmm callback thread
 * (handleMessage()); the event queue is protected by a mutex so drain() can run safely on the
 * host/render thread.
 **/
class MidiInput
{
public:
    /** One decoded MIDI short-message event, queued for the host to consume via drain(). */
    struct Event
    {
        int    type;      ///< Status nibble: 0xB0 = Control-Change, 0x90 = Note-On.
        int    data1;     ///< First MIDI data byte (CC number for CC messages, note number for Note-On).
        int    data2;     ///< Second MIDI data byte (CC value for CC messages, velocity for Note-On).
        qint64 refMs = 0; ///< 0xF8 (a quarter note of MIDI clock): when it arrived (QElapsedTimer reference ms).
        float  bpm = 0.f; ///< 0xF8: the clock's tempo over its last two beats.
    };

    /** Constructs the object without opening any device; call start() to open one. */
    MidiInput();
    /** Closes the MIDI device if still open (calls stop()). */
    ~MidiInput();

    /**  Opens a MIDI input device and starts receiving messages from it.
     *
     * @param want  Part of the device name to look for (ini key midiDevice, any case); empty or not found takes the
     *              first device. (in)
     *
     * @return
     *   true if a device was found and successfully opened, false if no MIDI device is present or opening it
     *   failed.
     **/
    bool start( const QString &want = QString() );
    /**  Stops and closes the MIDI input device, if one is open.
     *
     * Safe to call when nothing is open.
     **/
    void stop();
    /**  The product name of the opened MIDI device, as reported by the driver.
     *
     * @return
     *   The device name, or an empty string if no device is open.
     **/
    QString deviceName() const { return m_name; }

    /**  Thread-safe hand-off of all events queued since the last call.
     *
     * @return
     *   The events accumulated since the previous drain() call, in arrival order; the internal queue is cleared.
     **/
    std::vector<Event> drain();

    /**  Decodes one packed MIDI short message and, if it is a message this class cares about, queues it.
     *
     * @param dwParam1  The packed short message as delivered by the winmm MIM_DATA callback: status byte in bits
     *                  0-7, data1 in bits 8-15, data2 in bits 16-23. (in)
     *
     * Called from the winmm callback thread with a packed MIDI short message.
     **/
    void handleMessage( unsigned long dwParam1 );

private:
    /**  Appends one decoded event to the queue under lock.
     *
     * @param type  Status nibble (0xB0 or 0x90). (in)
     * @param d1    First MIDI data byte. (in)
     * @param d2    Second MIDI data byte. (in)
     **/
    void push( int type, int d1, int d2 );
    /**  One tick of MIDI clock (24 a quarter note), winmm callback thread: every 24th queues a clock beat.
     *
     * @param nowMs  When it arrived (QElapsedTimer reference ms). (in)
     **/
    void clockTick( qint64 nowMs );

    void *m_handle = nullptr;    ///< HMIDIIN of the open device (kept as an opaque void* to avoid pulling in windows.h
                                 ///< here); nullptr when closed.
    mutable QMutex m_mutex;      ///< Guards m_events against concurrent access from the winmm callback thread and the
                                 ///< draining thread.
    std::vector<Event> m_events; ///< Queue of decoded events awaiting the next drain() call (capped at 256, see
                                 ///< push()).
    QString m_name;              ///< Display name of the opened MIDI device, as reported by midiInGetDevCapsW().
    // ---- MIDI clock, winmm callback thread only ----
    qint64 m_tickMs[49] = {};      ///< Ring of the last 49 tick times (two beats of intervals).
    int    m_tickN = 0;            ///< Ticks seen since the clock (re)started.
    int    m_clockPos = 0;         ///< Tick position within the song, from Start (0xFA) or a song position (0xF2).
    bool   m_clockPhase = false;   ///< m_clockPos is a real position (Start or a song position came).
    bool   m_clockStopped = false; ///< Stop (0xFC) came: ticks are ignored until Start or Continue.
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    MidiInput( const MidiInput & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    MidiInput &operator=( const MidiInput & ) = delete;
};
