#version 330 core
/*****************************************************************************\
 *                              ChromeForm.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  The model as polished metal: it shows almost nothing of itself and almost everything of the room around it.
 *
 *  The environment it reflects is the same one drawn on the sky shell, and the warm part of it is taken from the
 *  CURRENT PHOTOGRAPH -- so the object mirrors the picture the rest of the show is built on, and changes colour
 *  when the picture does.
 *
 *  A mirror is defined by what it borrows, which makes this family unusually
 *  dependent on having something worth reflecting: the sky is deliberately
 *  structured (a horizon, a light source, banding) rather than a smooth
 *  gradient, because a mirror pointed at a featureless room reads as flat grey
 *  paint. Both the shell and the surface call the SAME environment function, so
 *  the reflection is always consistent with the visible background.
 *
 *    audioAdvance -> the environment drifts past the surface
 *    audioKick    -> the light source flares
 *    audioSwell   -> reflection strength
 *    audioHigh    -> anisotropic streaking (brushed rather than mirrored)
 *
 *  Per-instance: sizeP, spinP, brushP (0 = mirror, 1 = brushed), tintP.
 *  Per-activation variety: hueP float palette offset (0..6.28).
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform sampler2D tex0; ///< The current photo.
uniform sampler2D tex1; ///< The next photo (cross-faded in by interpolation).

uniform float time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;     ///< High band level, 0..1.

uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float tintP;  ///< Tint knob, 0..1.
uniform float brushP; ///< Brush knob: 0 = mirror, 1 = brushed, 0..0.8.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).

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
    const vec3 k = vec3( 0.57735 );
    float      ca = cos( a );
    return c * ca + cross( k, c ) * sin( a ) + k * dot( k, c ) * ( 1.0 - ca );
}

/**  Pseudo-random number 0..1 from a float.
 *
 * @param n  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float n )
{
    return fract( sin( n * 12.9898 ) * 43758.5453 );
}

/**  Smooth 2D value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise2( vec2 p )
{
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float n = i.x + i.y * 57.0;
    return mix( mix( hash11( n ), hash11( n + 1.0 ), f.x ),
                mix( hash11( n + 57.0 ), hash11( n + 58.0 ), f.x ), f.y );
}

/**  The two photographs the rest of the catalogue is drawing from, cross-faded exactly as every 2D scene sees them.
 *
 * @param uv  Coordinate in the photo (clamped). (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 photo( vec2 uv )
{
    uv = clamp( uv, 0.0, 1.0 );
    // interpolation 1 = tex0 (the photo on screen), 0 = tex1; until 27.11.2026 the weight was 1 - interpolation:
    // at rest the NEXT photo, and a jump at both ends of every photo fade.
    return mix( texture( tex1, uv ).rgb, texture( tex0, uv ).rgb, interpolation );
}

/**  THE room.
 *
 * @param dir   The direction. (in)
 * @param tint  Tint of the room. (in)
 *
 * @return
 *   The colour (RGB).
 *
 * Called for both the sky shell and the reflection, so what the object mirrors is provably the background the viewer
 * can see -- if these were two different functions the metal would reflect a place that is not there, which is exactly
 * what makes cheap chrome look wrong.
 **/
vec3 environment( vec3 dir, vec3 tint )
{
    float h = dir.y;

    // Ground below, sky above, a hard horizon between: the horizon line is the
    // single most useful feature a reflective surface can have, because it is
    // what lets the eye read the curvature.
    vec3 sky = mix( vec3( 0.10, 0.13, 0.20 ), vec3( 0.02, 0.03, 0.06 ),
                    smoothstep( 0.0, 0.9, h ) );
    vec3 ground = mix( vec3( 0.05, 0.045, 0.05 ), vec3( 0.010, 0.010, 0.014 ),
                       smoothstep( 0.0, -0.7, h ) );
    vec3 col = ( h > 0.0 ) ? sky : ground;
    // The beat lives in the ENVIRONMENT: the chrome stays rigid, but what
    // it reflects pulses -- so the music dances across the surface without
    // the object itself moving a millimetre.
    col += tint * 0.30 * ( 0.75 + 0.55 * audioKick ) * exp( -abs( h ) * 26.0 ); // horizon glow

    // Slow horizontal banding: gives the reflection something to slide along,
    // which is how a curved mirror shows that it is turning.
    float band = 0.5 + 0.5 * sin( h * 15.0 - time * 0.25 - audioAdvance * 0.12 );
    col += tint * pow( band, 8.0 ) * 0.16;

    // A light source, and its flare on the beat.
    vec3  key = normalize( vec3( -0.45, 0.42, 0.79 ) );
    float d = max( dot( dir, key ), 0.0 );
    col += vec3( 1.0, 0.94, 0.86 ) * pow( d, 900.0 ) * ( 5.0 + 9.0 * audioKick );
    col += tint * pow( d, 14.0 ) * ( 0.35 + 0.5 * audioKick );

    // The current photograph, wrapped around the upper half. This is the point
    // of the family: the metal carries the colour of the picture on screen.
    vec2 pu = vec2( atan( dir.z, dir.x ) / 6.2831853 + 0.5, clamp( h * 0.5 + 0.5, 0.0, 1.0 ) );
    vec3 ph = photo( pu );
    if ( envP > 0.0 )
        ph = envReflect( dir, 0.12 + 0.5 * clamp( brushP, 0.0, 1.0 ) ); // the photo environment (patch_env3d.py)
    col = mix( col, col + ph * 0.55, smoothstep( -0.1, 0.5, h ) );

    return col;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hue = ( hueP > 0.01 ? hueP : 0.0 );
    vec3  tint = hueRot( vec3( 0.55, 0.75, 1.0 ), tintP );

    if ( vBg > 0.5 )
    {
        fragColor = vec4( environment( normalize( vPos ), tint ) * 0.85, 1.0 );
        return;
    }

    vec3 n = normalize( vNormal );
    vec3 view_dir = normalize( -vPos );

    // Brushed metal: perturb the normal along one surface direction only, so
    // the reflection smears into streaks instead of blurring evenly. Anisotropy
    // is what separates "brushed" from "dirty".
    float brush = clamp( brushP, 0.0, 1.0 );
    if ( brush > 0.001 )
    {
        float g = noise2( vUV * vec2( 220.0, 6.0 ) ) - 0.5;
        vec3  t = normalize( cross( n, vec3( 0.0, 1.0, 0.0 ) ) + 1e-5 );
        n = normalize( n + t * g * brush * ( 0.35 + 0.5 * audioHigh ) );
    }

    vec3 r = reflect( -view_dir, n );
    vec3 col = environment( r, tint ) * ( 0.85 + 0.55 * audioSwell );

    // Fresnel: grazing angles reflect nearly everything, which is what gives
    // polished metal its bright edges. A constant reflectivity looks like
    // plastic.
    float f = pow( 1.0 - max( dot( n, view_dir ), 0.0 ), 4.0 );
    col = mix( col * 0.72, col * 1.5 + tint * 0.35, f );

    // A trace of the body's own colour, so it is metal rather than a soap
    // bubble -- a perfect mirror has no identity at all.
    col *= mix( vec3( 1.0 ), tint * 0.6 + 0.6, 0.35 );

    if ( hue > 0.001 )
        col = hueRot( col, 0.12 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
