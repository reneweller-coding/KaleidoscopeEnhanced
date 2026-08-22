/**
 * @file OscSender.cpp
 * @brief Implementation of OscSender: hand-rolled OSC 1.0 encoding, no dependencies.
 */
#include "OscSender.h"

#include <QtCore/QtEndian>

void OscSender::pad4( QByteArray &b )
{
	while( b.size() & 3 )
		b.append( '\0' );
}

QByteArray OscSender::message( const char *address, const float *args, int n )
{
	QByteArray b( address );
	b.append( '\0' );
	pad4( b );
	QByteArray tags( "," );
	for( int i = 0; i < n; ++i )
		tags.append( 'f' );
	b.append( tags );
	b.append( '\0' );
	pad4( b );
	for( int i = 0; i < n; ++i )
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

QByteArray OscSender::bundle( const QList<QByteArray> &messages )
{
	QByteArray b( "#bundle" );
	b.append( '\0' );
	// Timetag "immediately" (1): consumers apply the bundle on receipt.
	const char immediate[8] = { 0, 0, 0, 0, 0, 0, 0, 1 };
	b.append( immediate, 8 );
	for( const QByteArray &m : messages )
	{
		quint32 len = qToBigEndian( quint32( m.size() ) );
		b.append( reinterpret_cast<const char *>( &len ), 4 );
		b.append( m );
	}
	return b;
}

void OscSender::configure( const QString &host, int port )
{
	m_port = ( port > 0 && port < 65536 ) ? port : 0;
	if( m_port )
	{
		m_addr = QHostAddress( host );
		if( m_addr.isNull() )                      // a hostname, not an IP
		{
			// One blocking lookup at startup is fine; a per-send lookup is not.
			const QHostAddress fallback( QHostAddress::LocalHost );
			m_addr = fallback;
			fprintf( stderr, "OSC: host '%s' is not an IP address - using 127.0.0.1\n",
			         host.toLocal8Bit().constData() );
		}
		fprintf( stderr, "OSC output enabled -> %s:%d\n",
		         m_addr.toString().toLocal8Bit().constData(), m_port );
	}
}

void OscSender::send( const QByteArray &datagram )
{
	m_socket.writeDatagram( datagram, m_addr, quint16( m_port ) );
}

void OscSender::tick( const AudioFeatures &f, float dtSec )
{
	if( m_port <= 0 )
		return;

	// --- Events first: a beat must not wait for a bundle period. ---
	if( f.isBeat )
	{
		const float s = f.beatStrength;
		send( message( "/beat", &s, 1 ) );
	}
	// The downbeat is published as a decaying pulse; the rising edge is the event.
	if( f.downbeat > 0.5f && m_prevDownbeat <= 0.5f )
	{
		const float one = 1.f;
		send( message( "/beat/downbeat", &one, 1 ) );
	}
	m_prevDownbeat = f.downbeat;

	// --- Fast signal layer, ~30 Hz. ---
	m_fastAcc += dtSec;
	if( m_fastAcc >= 1.f / 30.f )
	{
		m_fastAcc = 0.f;
		QList<QByteArray> msgs;
		const float level = f.overallLevel;
		const float onset = f.onsetStrength;
		const float flux  = f.spectralFlux;
		float bands[6] = { f.subBassLevel, f.bassLevel, f.lowMidLevel,
		                   f.midLevel, f.upperMidLevel, f.highLevel };
		msgs << message( "/audio/level",  &level, 1 )
		     << message( "/audio/onset",  &onset, 1 )
		     << message( "/audio/flux",   &flux,  1 )
		     << message( "/audio/bands",  bands,  6 );
		send( bundle( msgs ) );
	}

	// --- Semantic mood layer, ~5 Hz (the axes are smoothed over seconds
	//     anyway; faster updates would only repeat the same value). ---
	m_moodAcc += dtSec;
	if( m_moodAcc >= 1.f / 5.f )
	{
		m_moodAcc = 0.f;
		QList<QByteArray> msgs;
		const float v = f.valence, a = f.arousal;
		// estimatedBPM is normalised 0..1 over 40..200; consumers expect real
		// BPM. 0 stays 0 ("no beat detected"), everything else is mapped back.
		const float bpm  = ( f.estimatedBPM > 0.f ) ? 40.f + 160.f * f.estimatedBPM : 0.f;
		const float gate = f.musicPresence;
		const float amb  = f.ambientFactor;
		// Quadrant tag along the literature mapping (and our scene tags):
		// Q1 bright, Q2 aggressive, Q3 dark, Q4 calm.
		const char *quad = ( a >= 0.5f ) ? ( v >= 0.5f ? "bright" : "aggressive" )
		                                 : ( v >= 0.5f ? "calm"   : "dark" );
		msgs << message( "/mood/valence",  &v,    1 )
		     << message( "/mood/arousal",  &a,    1 )
		     << messageStr( "/mood/quadrant", quad )
		     << message( "/tempo/bpm",     &bpm,  1 )
		     << message( "/music/presence", &gate, 1 )
		     << message( "/music/ambient",  &amb,  1 );
		send( bundle( msgs ) );
	}
}
