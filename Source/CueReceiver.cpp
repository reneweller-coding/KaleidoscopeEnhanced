/**
 * @file CueReceiver.cpp
 * @brief Implementation of the score-cue receiver: the bridge to the scheduler and the UDP socket
 *        (the decoder and the accumulator are in ScoreCues.cpp).
 */
#include "CueReceiver.h"

#include <QtCore/QByteArray>
#include <QtNetwork/QHostAddress>
#include <QtNetwork/QUdpSocket>

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

// ---------------------------------------------------------------------------- the scheduler hook

void applyScoreCues( const ScoreCues::Frame &cue, ScoreCueBridge &bridge, SceneScheduler::Tick &t )
{
    if ( !cue.live )
    {
        // Nothing to say. The tick is left exactly as the audio built it -- this branch is what
        // makes the feature invisible when it is off, and `Kaleidoscope.exe -q` compares the bytes.
        bridge.wasLive = false;
        bridge.lastSections = t.sectionCount;
        bridge.lastDrops = t.dropCount;
        return;
    }

    // Taking over: continue counting from whatever the scheduler was handed last frame, so the
    // first cue still reads as a rising edge of exactly one and not as a jump it would ignore.
    if ( !bridge.wasLive )
    {
        bridge.sections = bridge.lastSections;
        bridge.drops = bridge.lastDrops;
        bridge.wasLive = true;
    }
    if ( cue.section )
        bridge.sections++;
    if ( cue.drop )
        bridge.drops++;

    t.sectionCount = bridge.sections;
    t.dropCount = bridge.drops;
    t.downbeatTick = cue.downbeat;
    // The song-structure memory is keyed on the analyser's recycled eight-slot LRU id. A cue has no
    // such id, and handing it the section TYPE instead would key every drop of a whole set to one
    // slot -- the "always the same scenes" failure that index has produced before. A cue-driven
    // section rolls fresh; see the header for the full reasoning.
    t.sectionId = -1;
    t.sectionKnown = false;

    bridge.lastSections = t.sectionCount;
    bridge.lastDrops = t.dropCount;
}

// ---------------------------------------------------------------------------- the socket

CueReceiver::CueReceiver( QObject *parent, const QString &bindAddress, int port )
    : QObject( parent )
{
    if ( port <= 0 || port > 65535 )
        return;
    QHostAddress addr;
    if ( !addr.setAddress( bindAddress ) )
        addr = QHostAddress::AnyIPv4;
    m_socket = new QUdpSocket( this );
    // ShareAddress for the same reason WebRemote's discovery socket uses it: two Kaleidoscope
    // instances on one machine should both be able to watch the same generator.
    if ( m_socket->bind( addr, static_cast<quint16>( port ),
                         QUdpSocket::ShareAddress | QUdpSocket::ReuseAddressHint ) )
    {
        QObject::connect( m_socket, &QUdpSocket::readyRead, this, [this]()
        { handleDatagrams(); } );
        m_listening = true;
        fprintf( stderr, "SCORE CUES: listening on UDP %s:%d\n",
                 bindAddress.toLocal8Bit().constData(), port );
    }
    else
        fprintf( stderr, "SCORE CUES: could not bind UDP %s:%d (%s) - the scheduler keeps using the audio.\n",
                 bindAddress.toLocal8Bit().constData(), port,
                 m_socket->errorString().toLocal8Bit().constData() );
}

void CueReceiver::handleDatagrams()
{
    while ( m_socket->hasPendingDatagrams() )
    {
        QByteArray buf;
        buf.resize( static_cast<int>( m_socket->pendingDatagramSize() ) );
        const qint64 n = m_socket->readDatagram( buf.data(), buf.size() );
        if ( n <= 0 )
            continue;
        ScoreCue c;
        if ( decodeScoreCue( buf.constData(), static_cast<int>( n ), c ) )
            ScoreCues::instance().apply( c );
        else
            ScoreCues::instance().noteRejected();
    }
}
