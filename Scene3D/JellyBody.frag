#version 330 core
/*****************************************************************************\
 *                              JellyBody.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Lighting for a single translucent jelly body: deep saturated colour, fresnel rim, wet specular highlight, and
 *  light seeming to pass through from behind.
 *
 *  The body's shape and per-vertex deformation (vDefo) and hue (vHue) are
 *  computed upstream in JellyBody.vert from the instrument-triggered modal
 *  ringing (audioKick/audioSnare/audioHat); this stage only reads
 *  audioSwell and audioDrop, using them to brighten the subsurface glow
 *  that pools where the body is currently deformed, making the ring-down
 *  itself visible as travelling light.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// JellyBody.frag — translucent wobbling jelly: deep saturated body colour,
// strong fresnel rim (the classic gummy look), wet specular, and a subtle
// subsurface glow that brightens where the body is currently deformed —
// the ring-down becomes visible as travelling light.

uniform float audioSwell; ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioDrop;  ///< Drop envelope: high after a detected drop, decaying.

in vec3  vNorm; ///< Norm (from the vertex stage).
in vec3  vView; ///< View vector (from the vertex stage).
in float vDefo; ///< Defo (from the vertex stage).
in float vHue;  ///< Hue (from the vertex stage).

// ---- photo environment light (Tools/scenegen/patch_env3d.py) ----
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
// The photo stands behind the viewer and lights the scene: the normal finds diffuse light in a very coarse mip, the
// reflected ray a reflection in a mip chosen by roughness.  At envP = 0 none of it runs and the scene renders as
// before.
uniform float envP; ///< Photo environment light: 0 = off (the old look) .. 1 = full; rolled per activation.

/**  Where a direction looks in the photo environment.
 *
 * @param d  The direction (any length): x screen right, y screen up; the sign of z does not matter. (in)
 *
 * @return
 *   The coordinate in the photo.
 *
 * The photo stands behind the viewer, its centre straight back toward the eye, and the far half of the sphere of
 * directions is the near half mirrored at the plane z = 0 -- so the map is continuous over the whole sphere (no seam,
 * no pole) and folds only where a direction turns from toward the viewer to away from it.  Past the photo's edge the
 * texture's mirrored repeat continues it.
 **/
vec2 envUV( vec3 d )
{
    return 0.5 + 0.6 * normalize( d ).xy;
}

/**  The photo as the environment sees it: tex0 and tex1 cross-faded with interpolation like img(), at a mip level,
 * colour only (the alpha channel carries the photo's depth).
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level: 0 = full size, 7 = 8 x 8 texels of a 1024 photo. (in)
 *
 * @return
 *   The photo's colour (RGB).
 **/
vec3 envPhoto( vec2 uv, float lod )
{
    return interpolation * textureLod( tex0, uv, lod ).rgb + ( 1.0 - interpolation ) * textureLod( tex1, uv, lod ).rgb;
}

/**  Diffuse light from the photo: its very coarse mip in the normal's direction stands in for the light gathered over
 * the half sphere around the normal.
 *
 * @param n  The surface normal (frame as for envUV()). (in)
 *
 * @return
 *   The diffuse light (RGB), 0..1.
 **/
vec3 envDiffuse( vec3 n )
{
    return envPhoto( envUV( n ), 7.0 );
}

/**  The photo reflected along a ray, in a mip chosen by the roughness and never finer than the pixel's footprint in
 * the photo -- a small or strongly curved mirror does not shimmer.
 *
 * @param r      The reflected ray (frame as for envUV()). (in)
 * @param rough  Roughness: 0 = mirror .. 1 = matt (the diffuse mip). (in)
 *
 * @return
 *   The reflected light (RGB), 0..1.
 *
 * The footprint comes from screen-space derivatives: call it outside pixel-dependent branches.
 **/
vec3 envReflect( vec3 r, float rough )
{
    vec2  uv = envUV( r );
    vec2  ts = vec2( textureSize( tex0, 0 ) );
    vec2  dx = dFdx( uv ) * ts, dy = dFdy( uv ) * ts;
    float px = 0.5 * log2( max( max( dot( dx, dx ), dot( dy, dy ) ), 1.0 ) );
    return envPhoto( uv, max( px, 1.0 + 6.0 * clamp( rough, 0.0, 1.0 ) ) );
}

/**  How much light a surface reflects at this angle (Schlick's approximation of Fresnel's equations).
 *
 * @param n   The surface normal (unit length). (in)
 * @param v   The direction toward the eye (unit length). (in)
 * @param f0  The reflectance looking straight on. (in)
 *
 * @return
 *   The reflectance, f0..1.
 **/
float envFresnel( vec3 n, vec3 v, float f0 )
{
    return f0 + ( 1.0 - f0 ) * pow( 1.0 - clamp( dot( n, v ), 0.0, 1.0 ), 5.0 );
}
// ---- end of the photo environment light ----

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3 N = normalize( vNorm );
    vec3 V = normalize( vView );
    vec3 L = normalize( vec3( 0.4, 0.8, 0.5 ) );

    float diff = max( dot( N, L ), 0.0 );
    float fres = pow( clamp( 1.0 - max( dot( N, V ), 0.0 ), 0.0, 1.0 ), 2.2 );
    float spec = pow( max( dot( reflect( -L, N ), V ), 0.0 ), 42.0 );

    // Deep jelly body, keyed to the music.
    vec3 body = hueRot( vec3( 0.55, 0.10, 0.28 ), vHue );
    vec3 col = body * ( 0.30 + 0.75 * diff );

    // Subsurface: light seems to pool where the body is deformed.
    col += hueRot( vec3( 1.0, 0.45, 0.55 ), vHue ) * vDefo
           * ( 0.8 + 1.0 * audioSwell + 1.6 * audioDrop );

    // TRANSLUCENCY: light passing THROUGH the body from behind — this is
    // what makes it read as jelly rather than painted rubber.
    float through = pow( max( dot( -N, L ), 0.0 ), 2.0 );
    col += hueRot( vec3( 1.0, 0.5, 0.62 ), vHue ) * through * 0.65;

    // Gummy rim + a restrained wet highlight (the old 1.1 white blob).
    col += hueRot( vec3( 1.0, 0.6, 0.75 ), vHue ) * fres * 0.9;
    col += vec3( 1.0 ) * spec * 0.40;

    if ( envP > 0.0 )
    {
        // The photo as the room (patch_env3d.py): it lights the jelly and shines off its wet skin.
        col += body * envDiffuse( N ) * ( 0.9 * envP );
        col += envReflect( reflect( -V, N ), 0.08 ) * envFresnel( N, V, 0.06 ) * ( 1.3 * envP );
    }
    vec3 outc = col * 1.35;
    outc /= 1.0 + 0.35 * max( outc.r, max( outc.g, outc.b ) );
    fragColor = vec4( outc, 1.0 );
}
