/**
 * @file SpoutIn.cpp
 * @brief Implementation of the Spout receive facade (SpoutIn.h); wraps the Spout2 SDK's Spout class.
 */
// SpoutIn.cpp — see SpoutIn.h.  Includes Spout headers (like SpoutOut.cpp,
// never mixed with GLee translation units).
#include "SpoutIn.h"
#ifdef _WIN32
#include "../ThirdParty/SpoutGL/Spout.h"

#include <cstring>

static Spout   *s_rx  = nullptr;   ///< The Spout2 SDK receiver object; nullptr until spoutInInit() creates it.
static GLuint   s_tex = 0;         ///< GL texture id that receives the sender's frame; 0 until allocTexture() first runs.
static unsigned s_w   = 0, s_h = 0;   ///< Current size of s_tex, as of the last allocTexture() call.

bool spoutInInit( const char *senderName )
{
	if( s_rx )
		return true;
	s_rx = new Spout();
	if( senderName && *senderName && std::strcmp( senderName, "any" ) != 0 )
		s_rx->SetReceiverName( senderName );
	fprintf( stderr, "SPOUT-IN: receiving '%s'\n",
	         ( senderName && *senderName ) ? senderName : "<active sender>" );
	return true;
}

/**
 * @brief (Re)allocates s_tex at the given size, GL_RGBA8, and sets its sampling/wrap parameters.
 * @param w New texture width in pixels.
 * @param h New texture height in pixels.
 */
static void allocTexture( unsigned w, unsigned h )
{
	if( !s_tex ) glGenTextures( 1, &s_tex );
	glBindTexture( GL_TEXTURE_2D, s_tex );
	glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0,
	              GL_RGBA, GL_UNSIGNED_BYTE, nullptr );
	// The kaleidoscope folds TILE the source image, so wrap like the photos.
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
	glBindTexture( GL_TEXTURE_2D, 0 );
	s_w = w; s_h = h;
}

unsigned int spoutInReceive( unsigned int *width, unsigned int *height )
{
	if( !s_rx )
		return 0;
	if( !s_tex )
		allocTexture( 16, 16 );   // placeholder size until the first real sender frame arrives
	if( s_rx->ReceiveTexture( s_tex, GL_TEXTURE_2D ) )
	{
		if( s_rx->IsUpdated() )               // sender (re)connected / resized
		{
			// The SDK just reallocated its own shared texture at the new size, so this frame's
			// ReceiveTexture() copy target is stale; reallocate s_tex to match and skip this
			// frame (return 0) — the caller falls back to its previous source for one frame,
			// then gets valid data starting next call.
			allocTexture( s_rx->GetSenderWidth(), s_rx->GetSenderHeight() );
			return 0;                          // valid from the next frame on
		}
		if( width )  *width  = s_w;
		if( height ) *height = s_h;
		return s_tex;
	}
	return 0;                                  // no sender running -> fallback
}

void spoutInRelease()
{
	if( s_rx )
	{
		s_rx->ReleaseReceiver();
		delete s_rx;
		s_rx = nullptr;
	}
	if( s_tex )
	{
		glDeleteTextures( 1, &s_tex );
		s_tex = 0;
	}
	s_w = s_h = 0;
}
#else
// -------------------------------------------------------------------------
// Spout is a Windows-only technology: it shares a D3D11 texture through a
// DXGI handle, and neither the handle nor the shared-memory sender registry
// exists elsewhere. Rather than pretend, the facade answers honestly -- the
// callers already treat 'no sender' as normal, so -o/-i simply do nothing.
// (The Linux equivalent would be Syphon-style DMA-BUF sharing; out of scope.)
// -------------------------------------------------------------------------
bool         spoutInInit( const char * )                           { return false; }
unsigned int spoutInReceive( unsigned int *w, unsigned int *h )
{
	if( w ) *w = 0;
	if( h ) *h = 0;
	return 0;   // 0 = no live texture, so the photos stay the source
}
void         spoutInRelease()                                      {}
#endif // _WIN32
