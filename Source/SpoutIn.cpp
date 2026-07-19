// SpoutIn.cpp — see SpoutIn.h.  Includes Spout headers (like SpoutOut.cpp,
// never mixed with GLee translation units).
#include "SpoutIn.h"
#include "../ThirdParty/SpoutGL/Spout.h"

#include <cstring>

static Spout   *s_rx  = nullptr;
static GLuint   s_tex = 0;
static unsigned s_w   = 0, s_h = 0;

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
		allocTexture( 16, 16 );
	if( s_rx->ReceiveTexture( s_tex, GL_TEXTURE_2D ) )
	{
		if( s_rx->IsUpdated() )               // sender (re)connected / resized
		{
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
