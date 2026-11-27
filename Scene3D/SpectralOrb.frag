#version 330 core
/*****************************************************************************\
 *                              SpectralOrb.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Companion to SpectralOrb.vert.
 *
 *  Lights the vibrating orb like a physical resonating body — a cool key light, a warm rim, and an emissive glow
 *  that follows the absolute displacement vDefo, so the antinodes where the audio actually excites the surface
 *  light up while the nodal lines stay dark metal.
 *
 *  audioSwell and audioDrop scale the antinode glow's intensity, making the
 *  excited regions flare brighter on swells and drops; vHue (from
 *  SpectralOrb.vert) keys both the body metal tint and the glow colour to the
 *  current musical hue.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// SpectralOrb.frag — companion to SpectralOrb.vert.  Lit like a physical
// resonating body: a cool key light, a warm rim, and an emissive glow that
// follows |displacement| so the ANTINODES — where the audio actually excites
// the surface — light up while the nodal lines stay dark metal.

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
    vec3 L = normalize( vec3( 0.45, 0.75, 0.55 ) );

    float diff = max( dot( N, L ), 0.0 );
    float rim = pow( 1.0 - max( dot( N, V ), 0.0 ), 2.5 );
    float spec = pow( max( dot( reflect( -L, N ), V ), 0.0 ), 24.0 );

    // Body metal, keyed to the musical hue.
    vec3 base = hueRot( vec3( 0.20, 0.28, 0.42 ), vHue );
    vec3 col = base * ( 0.35 + 0.95 * diff );

    // Antinode glow: the vibrating regions radiate (raised power keeps the
    // nodal lines darker than the antinodes without crushing the signal).
    vec3 glow = hueRot( vec3( 0.25, 0.75, 1.00 ), vHue + 0.6 );
    col += glow * pow( vDefo, 1.5 ) * ( 2.2 + 1.8 * audioSwell + 2.6 * audioDrop );

    col += vec3( 0.9, 0.95, 1.0 ) * spec * 0.8;
    col += hueRot( vec3( 0.9, 0.45, 0.20 ), vHue ) * rim * 0.55;

    if ( envP > 0.0 )
    {
        // The photo as the room (patch_env3d.py): its diffuse light on the body metal and its mirror image,
        // strongest at grazing angles; the antinode glow stays on top.
        col += base * envDiffuse( N ) * ( 1.1 * envP );
        col += envReflect( reflect( -V, N ), 0.22 ) * envFresnel( N, V, 0.35 ) * ( 0.9 * envP );
    }
    vec3 outc = col * 1.8;
    outc /= 1.0 + 0.35 * max( outc.r, max( outc.g, outc.b ) );
    fragColor = vec4( outc, 1.0 );
}
