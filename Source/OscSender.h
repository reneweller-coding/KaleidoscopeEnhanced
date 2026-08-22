/**
 * @file OscSender.h
 * @brief Minimal OSC-over-UDP output of the live audio analysis (mood, beats, bands).
 *
 * OSC (Open Sound Control) is the de-facto transport between audio analysis
 * and visual engines: TouchDesigner, Resolume, Max/MSP, Unity and browser
 * frontends all speak it natively. This sender lets those tools consume THIS
 * visualizer's analysis — the measured mood axes above all — instead of
 * re-deriving a cruder one from an FFT of their own.
 *
 * Deliberately tiny: OSC 1.0 messages and one bundle framing, floats and
 * strings only, no external library. See docs/mood-and-mapping.md for the
 * address list and rates.
 */
#pragma once

#include <QtCore/QString>
#include <QtCore/QByteArray>
#include <QtNetwork/QUdpSocket>

#include "AudioFeatures.h"

/**
 * @brief Sends the per-frame AudioFeatures as OSC messages over UDP.
 *
 * Three cadences, matching the two-layer design the real-time-MER literature
 * recommends (fast signal layer, slow semantic layer, discrete events):
 *  - /audio/... bundle at ~30 Hz: bands, level, flux, onset
 *  - /mood/...  bundle at  ~5 Hz: valence, arousal, quadrant tag, BPM, gate
 *  - /beat and /beat/downbeat immediately on the event, outside any bundle,
 *    so their latency is one render frame rather than one bundle period
 *
 * Disabled entirely while the port is 0 — tick() then returns before touching
 * the socket.
 */
class OscSender
{
public:
    /**
     * @brief Configure the target; port 0 disables sending.
     * @param host Destination host (name or dotted quad).
     * @param port Destination UDP port; 0 = off.
     */
    void configure( const QString &host, int port );

    /** @brief True when a non-zero port has been configured. */
    bool enabled() const { return m_port > 0; }

    /**
     * @brief Feed one frame's features; sends whatever is due this frame.
     * @param f      The features snapshot the render loop already fetched.
     * @param dtSec  Wall-clock seconds since the previous tick.
     */
    void tick( const AudioFeatures &f, float dtSec );

private:
    /** @brief One OSC message: address + float arguments, 4-byte aligned throughout. */
    static QByteArray message( const char *address, const float *args, int n );
    /** @brief One OSC message with a single string argument. */
    static QByteArray messageStr( const char *address, const QByteArray &value );
    /** @brief Wrap already-encoded messages into an OSC bundle (immediate timetag). */
    static QByteArray bundle( const QList<QByteArray> &messages );
    /** @brief Pad a blob to the next 4-byte boundary with zeros (OSC alignment rule). */
    static void pad4( QByteArray &b );

    void send( const QByteArray &datagram );

    QUdpSocket   m_socket;
    QHostAddress m_addr;
    int          m_port      = 0;
    float        m_fastAcc   = 0.f;   ///< Time since the last ~30 Hz /audio bundle.
    float        m_moodAcc   = 999.f; ///< Time since the last ~5 Hz /mood bundle (999 = fire immediately).
    float        m_prevDownbeat = 0.f;///< Previous downbeat pulse, for edge detection.
};
