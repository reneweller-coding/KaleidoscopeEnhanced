#version 330 core
/*****************************************************************************\
 *                              ChromeFlow.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Renders a rolling sheet of molten chrome that mirrors the current slideshow photo via a true reflect()
 *  environment lookup, overlaid with two sweeping polish-streak sheen bands and a fixed moonlight specular
 *  highlight.
 *
 *  audioSwell strengthens the first sheen band and audioCentroid strengthens
 *  the second; audioAdvance and audioChromaHue feed imgPalette() (via
 *  palTint()) so the warm/cool sheen tints drift with the musical key, with
 *  audioValence shaping that palette's saturation. time animates both sheen
 *  bands' phase along the reflection vector. The reflection direction itself
 *  is a fixed camera-relative ray (not audio-driven); distance fog fades the
 *  sheet toward the horizon via vDist.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// ChromeFlow.frag - LIQUID CHROME: a rolling sheet of molten metal that
// MIRRORS the current photo (true reflect() environment lookup), with
// polish-streak sheen bands and four wave trains for real curvature.
//   audioBass/Swell -> wave weight    audioAdvance -> flow phase
uniform float     time;           ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float     audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float     audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                  ///< backwards).
uniform float audioValence;       ///< Mood valence: 0 dark .. 1 bright.

in vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNrm;  ///< Nrm (from the vertex stage).
in float vDist; ///< Distance (from the vertex stage).

// ---- photo environment light (Tools/scenegen/patch_env3d.py) ----
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

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}


/**  House tint: bend a colour toward the photo palette while keeping its luminance -- the identity look survives,
 * only the hue follows the photos.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
}
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
    vec3 n = normalize( vNrm );

    // TRUE mirror: reflect the view ray and look the reflection up in the
    // photo as a wrap-around environment — this is what makes it CHROME.
    vec3 rd = normalize( vec3( ( vUV.x - 0.5 ) * 1.6, -0.35, 1.0 ) );
    vec3 R = reflect( rd, n );
    vec2 env_uv = vec2( atan( R.x, R.z ) / 6.2831853 + 0.5,
                        clamp( 0.55 - R.y * 0.55, 0.02, 0.98 ) );
    vec3 env_photo = img( env_uv );
    if ( envP > 0.0 )
        env_photo = envReflect( R, 0.10 ); // the photo environment (patch_env3d.py): no seam
    float fres = pow( 1.0 - clamp( dot( -rd, n ), 0.0, 1.0 ), 3.0 );

    // Sheen bands sweep with the reflection vector (metal polish streaks)
    float env_y = R.y * 3.0 + R.x * 1.6;
    float band1 = pow( clamp( sin( env_y * 9.0 + time * 0.2 ) * 0.5 + 0.5, 0.0, 1.0 ), 3.0 );
    float band2 = pow( clamp( sin( env_y * 4.0 - time * 0.13 + 2.0 ) * 0.5 + 0.5, 0.0, 1.0 ), 5.0 );

    vec3 warm = palTint( vec3( 0.95, 0.65, 0.30 ), 0.10, 0.30 );
    vec3 cool = palTint( vec3( 0.30, 0.50, 0.95 ), 0.60, 0.30 );

    vec3 col = env_photo * ( 0.50 + 0.85 * fres )
               + warm * band1 * ( 0.40 + 0.22 * audioSwell )
               + cool * band2 * ( 0.30 + 0.18 * audioCentroid );

    // Broad specular from a fixed moon-light.
    float spec = pow( clamp( dot( n, normalize( vec3( 0.35, 0.9, -0.25 ) ) ),
                             0.0, 1.0 ),
                      24.0 );
    col += vec3( 0.9, 0.92, 0.95 ) * spec * 0.7;

    col *= exp( -vDist * 0.008 );
    col /= 1.0 + 0.28 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( col * 1.15, 1.0 );
}
