//---------------------------------------------------------------------------
//                              OscSender
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Minimal OSC-over-UDP output of the live audio analysis (mood, beats, bands).
 *
 *  OSC (Open Sound Control) is the de-facto transport between audio analysis
 *  and visual engines: TouchDesigner, Resolume, Max/MSP, Unity and browser
 *  frontends all speak it natively. This sender lets those tools consume THIS
 *  visualizer's analysis — the measured mood axes above all — instead of
 *  re-deriving a cruder one from an FFT of their own.
 *
 *  Deliberately tiny: OSC 1.0 messages and one bundle framing, floats and
 *  strings only, no external library. See docs/mood-and-mapping.md for the
 *  address list and rates.
 *
 *  @author René Weller
 */

#pragma once

#include <QtCore/QString>
#include <QtCore/QByteArray>
#include <QtNetwork/QUdpSocket>

#include "AudioFeatures.h"

/** @class OscSender
 *
 * Sends the per-frame AudioFeatures as OSC messages over UDP.
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
 **/
class OscSender
{
public:
    /**  Configure the target; port 0 disables sending.
     *
     * @param host  Destination host (name or dotted quad). (in)
     * @param port  Destination UDP port; 0 = off. (in)
     **/
    void configure( const QString &host, int port );

    /**  True when a non-zero port has been configured.
     *
     * @return
     *   True if a port above 0 is set.
     **/
    bool enabled() const { return m_port > 0; }

    /**  Feed one frame's features; sends whatever is due this frame.
     *
     * @param f      The features snapshot the render loop already fetched. (in)
     * @param dtSec  Wall-clock seconds since the previous tick. (in)
     **/
    void tick( const AudioFeatures &f, float dtSec );

    /** What the show does now (RenderPipeline::showState()), for show(). */
    struct ShowState
    {
        QByteArray scene;          ///< The scene on screen.
        QByteArray preset;         ///< The preset.
        bool       fading = false; ///< A scene fade runs.
        QByteArray transition;     ///< Its transition.
        float      fadeSecs = 0.f; ///< Its length.
        float      blackout = 0.f; ///< Slewed blackout, 0 lit .. 1 black.
        float      rgb[3] = {};    ///< The picture's mean colour, 0..1.
        float      riseRate = 2.f; ///< How fast the colour may rise a second: the limiter's 2.0, 1.0 when strict.
    };
    /**  The show's state (16.10.2026): /scene/name, /preset and /transition/start when they change, /blackout and
     * /color/mean at up to 10 Hz -- the colour times the blackout and held to the brightness limiter's rule (it rises
     * no faster than the picture's mean may: ShowState::riseRate), so a light that follows the picture never
     * flashes where the picture may not.
     *
     * @param s      The state. (in)
     * @param dtSec  Wall-clock seconds since the previous call. (in)
     **/
    void show( const ShowState &s, float dtSec );

private:
    /**  One OSC message: address + float arguments, 4-byte aligned throughout.
     *
     * @param address  OSC address, e.g. "/kaleido/beat". (in)
     * @param args     The float arguments. (in)
     * @param n        Their number. (in)
     *
     * @return
     *   The encoded message.
     **/
    static QByteArray message( const char *address, const float *args, int n );
    /**  One OSC message with a single string argument.
     *
     * @param address  OSC address. (in)
     * @param value    The string argument (UTF-8). (in)
     *
     * @return
     *   The encoded message.
     **/
    static QByteArray messageStr( const char *address, const QByteArray &value );
    /**  One OSC message with a string and a float argument.
     *
     * @param address  OSC address. (in)
     * @param value    The string argument (UTF-8). (in)
     * @param f        The float argument. (in)
     *
     * @return
     *   The encoded message.
     **/
    static QByteArray messageStrF( const char *address, const QByteArray &value, float f );
    /**  Wrap already-encoded messages into an OSC bundle (immediate timetag).
     *
     * @param messages  Encoded messages, as message() and messageStr() build them. (in)
     *
     * @return
     *   The encoded bundle.
     **/
    static QByteArray bundle( const QList<QByteArray> &messages );
    /**  Pad a blob to the next 4-byte boundary with zeros (OSC alignment rule).
     *
     * @param b  The blob, padded in place. (in,out)
     **/
    static void pad4( QByteArray &b );

    /**  Fire-and-forget: writes one already-framed message or bundle as a single UDP datagram to m_addr:m_port.
     *
     * @param datagram  One encoded message or bundle, sent as it is. (in)
     **/
    void send( const QByteArray &datagram );

    QUdpSocket   m_socket;             ///< Unbound UDP socket every datagram goes out of; never receives.
    QHostAddress m_addr; ///< Destination resolved once by configure() (127.0.0.1 if the host was not an IP literal).
    int          m_port = 0;           ///< Destination UDP port; 0 = sending disabled (tick() returns early).
    float        m_fastAcc = 0.f;      ///< Time since the last ~30 Hz /audio bundle.
    float        m_moodAcc = 999.f;    ///< Time since the last ~5 Hz /mood bundle (999 = fire immediately).
    float        m_prevDownbeat = 0.f; ///< Previous downbeat pulse, for edge detection.
    QByteArray   m_lastScene;          ///< The scene last announced.
    QByteArray   m_lastPreset;         ///< The preset last announced.
    bool         m_wasFading = false;  ///< A fade ran at the previous show() call.
    float        m_showAcc = 999.f;    ///< Time since the last /blackout and /color/mean (999 = at once).
    float        m_lastBlack = -1.f;   ///< The blackout last sent.
    float        m_rgb[3] = {};        ///< The colour as sent: the picture's mean, rise-limited.
public:
    /** Default construction, which the declared copy operations would otherwise suppress. */
    OscSender() = default;

private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    OscSender( const OscSender & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    OscSender &operator=( const OscSender & ) = delete;
};
