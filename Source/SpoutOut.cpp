/*****************************************************************************\
 *                              SpoutOut
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of the Spout send facade (SpoutOut.h); wraps the Spout2 SDK's Spout class.
 *
 *  See SpoutOut.h.  The ONLY file that includes Spout headers.
 *
 *  @author René Weller
 */

#include "SpoutOut.h"
#ifdef _WIN32
#include "../ThirdParty/SpoutGL/Spout.h"

static Spout *s_spout = nullptr; ///< The Spout2 SDK sender object; nullptr until spoutOutInit() creates it.

bool spoutOutInit( const char *senderName )
{
    if ( s_spout )
        return true;
    s_spout = new Spout();
    s_spout->SetSenderName( senderName );
    fprintf( stderr, "SPOUT: sender '%s' ready\n", senderName );
    return true;
}

void spoutOutSend( unsigned int glTexture, unsigned int width, unsigned int height )
{
    if ( !s_spout || glTexture == 0 || width == 0 || height == 0 )
        return;
    // GL_TEXTURE_2D; needs the app's GL context to be current (paint()).
    s_spout->SendTexture( glTexture, GL_TEXTURE_2D, width, height );
}

void spoutOutSendFbo( unsigned int fbo, unsigned int width, unsigned int height )
{
    if ( !s_spout || width == 0 || height == 0 )
        return;
    // Blits from the bound framebuffer into the shared texture (flipped to DirectX's top-down rows) and binds fbo
    // again afterwards.  A failure is said once per run of failures, not 60 times a second.
    static bool failing = false;
    const bool  ok = s_spout->SendFbo( fbo, width, height );
    if ( !ok && !failing )
        fprintf( stderr, "SPOUT: sending the %ux%u frame failed\n", width, height );
    failing = !ok;
}

void spoutOutRelease()
{
    if ( s_spout )
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
bool spoutOutInit( const char * )
{
    return false;
}
void spoutOutSend( unsigned int, unsigned int, unsigned int )
{
}
void spoutOutSendFbo( unsigned int, unsigned int, unsigned int )
{
}
void spoutOutRelease()
{
}
#endif // _WIN32
