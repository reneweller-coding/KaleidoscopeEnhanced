/**
 * @file MidiInput.h
 * @brief MIDI-Learn input: binds incoming MIDI CC/note messages from a hardware controller to shader parameters.
 */
#pragma once

#include <QtCore/QMutex>
#include <QtCore/QString>
#include <vector>

/**
 * @brief Optional MIDI control: opens the first MIDI-in device and queues its CC/Note-On messages.
 *
 * Opens the first available MIDI input device (a knob / pad controller) via the Win32 winmm API
 * and queues incoming Control-Change and Note-On messages. The host drains them each frame
 * (drain()) and maps them to actions (knobs -> reactivity/trails/mood, pads -> next effect).
 *
 * If no MIDI device is present, start() returns false and everything is a no-op, so the
 * visualizer is unaffected. Message decoding happens on the winmm callback thread
 * (handleMessage()); the event queue is protected by a mutex so drain() can run safely on the
 * host/render thread.
 */
class MidiInput
{
public:
    /** @brief One decoded MIDI short-message event, queued for the host to consume via drain(). */
    struct Event
    {
        int type;    ///< Status nibble: 0xB0 = Control-Change, 0x90 = Note-On.
        int data1;   ///< First MIDI data byte (CC number for CC messages, note number for Note-On).
        int data2;   ///< Second MIDI data byte (CC value for CC messages, velocity for Note-On).
    };

    /** @brief Constructs the object without opening any device; call start() to open one. */
    MidiInput();
    /** @brief Closes the MIDI device if still open (calls stop()). */
    ~MidiInput();

    /**
     * @brief Opens the first available MIDI input device and starts receiving messages from it.
     * @return true if a device was found and successfully opened, false if no MIDI device is present or opening it failed.
     */
    bool    start();
    /** @brief Stops and closes the MIDI input device, if one is open. Safe to call when nothing is open. */
    void    stop();
    /**
     * @brief The product name of the opened MIDI device, as reported by the driver.
     * @return The device name, or an empty string if no device is open.
     */
    QString deviceName() const { return m_name; }

    /**
     * @brief Thread-safe hand-off of all events queued since the last call.
     * @return The events accumulated since the previous drain() call, in arrival order; the internal queue is cleared.
     */
    std::vector<Event> drain();

    /**
     * @brief Decodes one packed MIDI short message and, if it is a message this class cares about, queues it.
     *
     * Called from the winmm callback thread with a packed MIDI short message.
     * @param dwParam1 The packed short message as delivered by the winmm MIM_DATA callback: status byte in bits 0-7, data1 in bits 8-15, data2 in bits 16-23.
     */
    void    handleMessage( unsigned long dwParam1 );

private:
    /**
     * @brief Appends one decoded event to the queue under lock.
     * @param type Status nibble (0xB0 or 0x90).
     * @param d1 First MIDI data byte.
     * @param d2 Second MIDI data byte.
     */
    void    push( int type, int d1, int d2 );

    void              *m_handle = nullptr;   ///< HMIDIIN of the open device (kept as an opaque void* to avoid pulling in windows.h here); nullptr when closed.
    mutable QMutex     m_mutex;              ///< Guards m_events against concurrent access from the winmm callback thread and the draining thread.
    std::vector<Event> m_events;             ///< Queue of decoded events awaiting the next drain() call (capped at 256, see push()).
    QString            m_name;               ///< Display name of the opened MIDI device, as reported by midiInGetDevCapsW().
};
