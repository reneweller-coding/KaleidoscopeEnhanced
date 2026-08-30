/**
 * @file SpoutOut.cpp
 * @brief Implementation of the Spout send facade (SpoutOut.h); wraps the Spout2 SDK's Spout class.
 */
// SpoutOut.cpp — see SpoutOut.h.  The ONLY file that includes Spout headers.
#include "SpoutOut.h"
#ifdef _WIN32
#include "../ThirdParty/SpoutGL/Spout.h"

static Spout *s_spout = nullptr;   ///< The Spout2 SDK sender object; nullptr until spoutOutInit() creates it.

bool spoutOutInit( const char *senderName )
{
	if( s_spout )
		return true;
	s_spout = new Spout();
	s_spout->SetSenderName( senderName );
	fprintf( stderr, "SPOUT: sender '%s' ready\n", senderName );
	return true;
}

void spoutOutSend( unsigned int glTexture, unsigned int width, unsigned int height )
{
	if( !s_spout || glTexture == 0 || width == 0 || height == 0 )
		return;
	// GL_TEXTURE_2D; needs the app's GL context to be current (paint()).
	s_spout->SendTexture( glTexture, GL_TEXTURE_2D, width, height );
}

void spoutOutRelease()
{
	if( s_spout )
	{
		s_spout->ReleaseSender();
		delete s_spout;
		s_spout = nullptr;
	}
}
#else
// -------------------------------------------------------------------------
// Spout is a Windows-only technology: it shares a D3D11 texture through a
// DXGI handle, and neither the handle nor the shared-memory sender registry
// exists elsewhere. Rather than pretend, the facade answers honestly -- the
// callers already treat 'no sender' as normal, so -o/-i simply do nothing.
// (The Linux equivalent would be Syphon-style DMA-BUF sharing; out of scope.)
// -------------------------------------------------------------------------
bool spoutOutInit( const char * )                                 { return false; }
void spoutOutSend( unsigned int, unsigned int, unsigned int )      {}
void spoutOutRelease()                                             {}
#endif // _WIN32
