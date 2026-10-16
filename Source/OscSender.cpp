/*****************************************************************************\
 *                              OscSender
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of OscSender: hand-rolled OSC 1.0 encoding, no dependencies.
 *
 *  @author René Weller
 */

#include "OscSender.h"

#include <QtCore/QtEndian>
#include <QtNetwork/QHostInfo>

#include <algorithm>

void OscSender::pad4( QByteArray &b )
{
    while ( b.size() & 3 )
        b.append( '\0' );
}

QByteArray OscSender::message( const char *address, const float *args, int n )
{
    QByteArray b( address );
    b.append( '\0' );
    pad4( b );
    QByteArray tags( "," );
    for ( int i = 0; i < n; ++i )
        tags.append( 'f' );
    b.append( tags );
    b.append( '\0' );
    pad4( b );
    for ( int i = 0; i < n; ++i )
    {
        // OSC floats are IEEE 754 big-endian; qToBigEndian on the bit pattern.
        quint32 bits;
        memcpy( &bits, &args[i], 4 );
        bits = qToBigEndian( bits );
        b.append( reinterpret_cast<const char *>( &bits ), 4 );
    }
    return b;
}

QByteArray OscSender::messageStr( const char *address, const QByteArray &value )
{
    QByteArray b( address );
    b.append( '\0' );
    pad4( b );
    b.append( ",s" );
    b.append( '\0' );
    pad4( b );
    b.append( value );
    b.append( '\0' );
    pad4( b );
    return b;
}

QByteArray OscSender::messageStrF( const char *address, const QByteArray &value, float f )
{
    QByteArray b( address );
    b.append( '\0' );
    pad4( b );
    b.append( ",sf" );
    b.append( '\0' );
    pad4( b );
    b.append( value );
    b.append( '\0' );
    pad4( b );
    quint32 bits;
    memcpy( &bits, &f, 4 );
    bits = qToBigEndian( bits );
    b.append( reinterpret_cast<const char *>( &bits ), 4 );
    return b;
}

QByteArray OscSender::bundle( const QList<QByteArray> &messages )
{
    QByteArray b( "#bundle" );
    b.append( '\0' );
    // Timetag "immediately" (1): consumers apply the bundle on receipt.
    const char immediate[8] = { 0, 0, 0, 0, 0, 0, 0, 1 };
    b.append( immediate, 8 );
    for ( const QByteArray &m : messages )
    {
        quint32 len = qToBigEndian( static_cast<quint32>( m.size() ) );
        b.append( reinterpret_cast<const char *>( &len ), 4 );
        b.append( m );
    }
    return b;
}

void OscSender::configure( const QString &host, int port )
{
    m_port = ( port > 0 && port < 65536 ) ? port : 0;
    if ( m_port )
    {
        m_addr = QHostAddress( host );
        if ( m_addr.isNull() ) // a hostname, not an IP
        {
            // One blocking lookup at startup is fine; a per-send lookup is not.  (It said so and fell back to
            // 127.0.0.1 without looking -- a lighting desk named "qlc-pc" never got a datagram.)
            for ( const QHostAddress &a : QHostInfo::fromName( host ).addresses() )
                if ( a.protocol() == QAbstractSocket::IPv4Protocol )
                {
                    m_addr = a;
                    break;
                }
            if ( m_addr.isNull() )
            {
                m_addr = QHostAddress( QHostAddress::LocalHost );
                fprintf( stderr, "OSC: host '%s' not found - using 127.0.0.1\n", host.toLocal8Bit().constData() );
            }
        }
        fprintf( stderr, "OSC output enabled -> %s:%d\n",
                 m_addr.toString().toLocal8Bit().constData(), m_port );
    }
}

void OscSender::send( const QByteArray &datagram )
{
    m_socket.writeDatagram( datagram, m_addr, static_cast<quint16>( m_port ) );
}

void OscSender::show( const ShowState &s, float dtSec )
{
    if ( m_port <= 0 )
        return;
    if ( s.scene != m_lastScene && !s.scene.isEmpty() )
    {
        send( messageStr( "/scene/name", s.scene ) );
        m_lastScene = s.scene;
    }
    if ( s.preset != m_lastPreset && !s.preset.isEmpty() )
    {
        send( messageStr( "/preset", s.preset ) );
        m_lastPreset = s.preset;
    }
    if ( s.fading && !m_wasFading )
        send( messageStrF( "/transition/start", s.transition, s.fadeSecs ) );
    m_wasFading = s.fading;

    m_showAcc += dtSec;
    if ( m_showAcc < 0.1f )
        return;
    const float dt = std::min( m_showAcc, 1.f );
    m_showAcc = 0.f;
    QList<QByteArray> msgs;
    if ( std::fabs( s.blackout - m_lastBlack ) > 0.005f )
    {
        msgs << message( "/blackout", &s.blackout, 1 );
        m_lastBlack = s.blackout;
    }
    // The colour: times the blackout, rising no faster than the picture's mean may (the limiter's rule, 2.0 of the
    // range a second; it was 2 of 255, a light took two minutes to come up), falling in half a second at most.
    for ( int i = 0; i < 3; ++i )
    {
        const float want = s.rgb[i] * ( 1.f - s.blackout );
        m_rgb[i] = std::min( std::max( want, m_rgb[i] - 2.f * dt ), m_rgb[i] + s.riseRate * dt );
    }
    msgs << message( "/color/mean", m_rgb, 3 );
    send( bundle( msgs ) );
    // KALEIDO_OSC_LOG=1: once a second, the picture's mean as read and the colour as sent.
    static const bool Log = getenv( "KALEIDO_OSC_LOG" ) != nullptr;
    static float      logAcc = 0.f;
    if ( Log && ( logAcc += dt ) >= 1.f )
    {
        logAcc = 0.f;
        fprintf( stderr, "OSC colour: picture %.3f %.3f %.3f, sent %.3f %.3f %.3f, blackout %.2f\n", s.rgb[0], s.rgb[1],
                 s.rgb[2], m_rgb[0], m_rgb[1], m_rgb[2], s.blackout );
    }
}

void OscSender::tick( const AudioFeatures &f, float dtSec )
{
    if ( m_port <= 0 )
        return;

    // --- Events first: a beat must not wait for a bundle period. ---
    if ( f.isBeat )
    {
        const float s = f.beatStrength;
        send( message( "/beat", &s, 1 ) );
    }
    // The downbeat is published as a decaying pulse; the rising edge is the event.
    if ( f.downbeat > 0.5f && m_prevDownbeat <= 0.5f )
    {
        const float one = 1.f;
        send( message( "/beat/downbeat", &one, 1 ) );
    }
    m_prevDownbeat = f.downbeat;

    // --- Fast signal layer, ~30 Hz. ---
    m_fastAcc += dtSec;
    if ( m_fastAcc >= 1.f / 30.f )
    {
        m_fastAcc = 0.f;
        QList<QByteArray> msgs;
        const float       level = f.overallLevel;
        const float       onset = f.onsetStrength;
        const float       flux = f.spectralFlux;
        float             bands[6] = { f.subBassLevel, f.bassLevel, f.lowMidLevel,
                                       f.midLevel, f.upperMidLevel, f.highLevel };
        msgs << message( "/audio/level", &level, 1 )
             << message( "/audio/onset", &onset, 1 )
             << message( "/audio/flux", &flux, 1 )
             << message( "/audio/bands", bands, 6 );
        send( bundle( msgs ) );
    }

    // --- Semantic mood layer, ~5 Hz (the axes are smoothed over seconds
    //     anyway; faster updates would only repeat the same value). ---
    m_moodAcc += dtSec;
    if ( m_moodAcc >= 1.f / 5.f )
    {
        m_moodAcc = 0.f;
        QList<QByteArray> msgs;
        const float       v = f.valence, a = f.arousal;
        // estimatedBPM is normalised 0..1 over 40..200; consumers expect real
        // BPM. 0 stays 0 ("no beat detected"), everything else is mapped back.
        const float bpm = ( f.estimatedBPM > 0.f ) ? 40.f + 160.f * f.estimatedBPM : 0.f;
        const float gate = f.musicPresence;
        const float amb = f.ambientFactor;
        // Quadrant tag along the literature mapping (and our scene tags):
        // Q1 bright, Q2 aggressive, Q3 dark, Q4 calm.
        const char *quad = ( a >= 0.5f ) ? ( v >= 0.5f ? "bright" : "aggressive" )
                                         : ( v >= 0.5f ? "calm" : "dark" );
        msgs << message( "/mood/valence", &v, 1 )
             << message( "/mood/arousal", &a, 1 )
             << messageStr( "/mood/quadrant", quad )
             << message( "/tempo/bpm", &bpm, 1 )
             << message( "/music/presence", &gate, 1 )
             << message( "/music/ambient", &amb, 1 );
        send( bundle( msgs ) );
    }
}
