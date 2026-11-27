#version 330 core
/*****************************************************************************\
 *                              FxSunShafts.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  FX SUN SHAFTS: volumetric light shafts (godrays) that march toward a wandering light source and are occluded by
 *  the scene's real depth buffer, so shafts fall behind objects and cut off at their silhouettes.
 *
 *  Falls back to no shafts where depth isn't valid (2D layers); shaft
 *  intensity fades with distance from the light source, and a separate
 *  unoccluded bloom marks the source itself.  A 2D scene that passes the
 *  photo's depth on (26.11.2026, depthPhoto) lets the light through where the
 *  photo is far (its farthest third), at a fraction of the strength (PhotoShaft).
 *  With arcP above 0 (plan P2, 27.11.2026) the shafts carry the music's
 *  tension arc: in a build-up they narrow toward the light, at a drop they
 *  break through, wider and brighter, within half a second.
 *    interpolation -> cross-fades the two scene layers and their shaft-occlusion terms
 *    audioBuildUp  -> (arcP) narrows the shafts
 *    audioDrop     -> (arcP) the shafts break through, an envelope of its own (tensionArc())
 *    audioKick     -> nudges the light source's position
 *    audioLevel    -> brightens the shafts
 *    audioChromaHue-> tints the shaft/bloom colour with the harmonic hue
 *    audioHigh     -> brightens the bloom around the light source
 *    audioSubBass  -> subtle overall brightness pulse
 *    audioBeat     -> subtle overall brightness pulse
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// FxSunShafts.frag — volumetric light shafts occluded by real geometry.
// -----------------------------------------------------------------------
// The classic radial-blur godray marches from each pixel toward the light and
// accumulates whatever the colour buffer holds.  It fails the moment anything
// bright sits in front of the light, because a colour buffer cannot say what is
// NEARER — a bright foreground object smears rays out of itself as if it were a
// hole in the sky.
//
// With the depth buffer the occlusion test is the real one: a sample blocks
// light if there is geometry between it and the eye, and shafts therefore fall
// BEHIND objects and are cut off by their silhouettes.  That is the difference
// between "glow" and "light in air".
//
// Depth also gives the shafts their falloff: near geometry is dense dust, the
// far plane is empty sky.
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform sampler2D texDepth0;     ///< Depth buffer of the current 3D scene (the source of tex0).
uniform sampler2D texDepth1;     ///< Depth buffer of the next 3D scene (the source of tex1).
uniform vec2      depthValid;    ///< 1 where texDepth0 (x) and texDepth1 (y) hold a 3D scene's depth, else 0.
uniform vec2      nearFar;       ///< Near and far clip distances.
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform vec2      depthPhoto;    ///< 1 where texDepth0 (x) / texDepth1 (y) hold a photo's depth (a 2D scene), else 0.
uniform vec2      photoDepthWin; ///< Window depth of the photo's near end (x, depth 1) and far end (y, depth 0).

const float PhotoShaft = 0.6; ///< The shafts on a photo, relative to a room (26.11.2026).

uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float shaftP;  ///< preset: shaft strength
uniform float lengthP; ///< preset: how far the march reaches
uniform float dustP;   ///< preset: haze density

const int Steps = 28; ///< Samples along the march toward the light.

uniform float audioBuildUp; ///< Build-up tension toward a drop, 0..1 (smoothed: ~0.5 s rise, ~1.2 s fall).
uniform float audioDrop;    ///< Drop pulse: 1 at the hit, then decaying (about exp( -t / 0.7 s )).
uniform float arcP;         ///< preset: the tension arc through the depth (plan P2); 0 = off, the old picture

const float PhotoArc = 0.6; ///< The tension arc on a photo, relative to a room (27.11.2026).

/**  The tension arc through the depth (plan P2, 27.11.2026): how far the music builds toward a drop, and how far a
 * drop has cleared the air.
 *
 * @return
 *   x: the build-up's tension, 0..1, released by a drop; y: the clearing after a drop, 0..1.
 *
 * The tension (build-up 0.3 .. 0.7) starts below the present pass's held breath (`breath`, the build-up's upper
 * half from 0.5: it takes colour and light from the whole frame) and works only in the depth.  The clearing is an
 * envelope of its own, never the pulse: the drop pulse jumps to 1 at the hit and decays as exp( -t / 0.7 s ), so its
 * value says how long ago the hit was.  The envelope rises from 0 to 1 between 0.15 and 0.55 s after the hit (pulse 0.8
 * .. 0.45), holds to about 1.6 s (0.1) and is gone by 4 s (0.003); a pulse of 1 gives 0, so the hit itself is no step.
 **/
vec2 tensionArc()
{
    float clear = ( 1.0 - smoothstep( 0.45, 0.8, audioDrop ) ) * smoothstep( 0.003, 0.1, audioDrop );
    return vec2( smoothstep( 0.3, 0.7, audioBuildUp ) * ( 1.0 - clear ), clear );
}

/**  Depth buffer value to linear distance.
 *
 * @param d  Depth buffer value, 0..1. (in)
 *
 * @return
 *   The linear distance.
 **/
float linearise( float d )
{
    float n = nearFar.x, f = nearFar.y;
    float z = d * 2.0 - 1.0;
    return ( 2.0 * n * f ) / ( f + n - z * ( f - n ) );
}

/**  A hue as a colour (the house palette).
 *
 * @param h  The hue, 0..1. (in)
 *
 * @return
 *   The colour (RGB).
 **/
vec3 hue2rgb( float h )
{
    return clamp( abs( mod( h * 6.0 + vec3( 0.0, 4.0, 2.0 ), 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 );
}

/**  March from uv toward the light and measure how much of the path is OPEN.
 *
 * @param dep      The depth texture. (in)
 * @param uv       Screen coordinate. (in)
 * @param lightUV  Screen coordinate of the light. (in)
 * @param valid    1 where the depth buffer is valid, else 0. (in)
 * @param ph       1 where the depth is a photo's (a 2D scene): open where the photo is far. (in)
 *
 * @return
 *   The openness, 0..1.
 *
 * The tempting version accumulates the frame's own colour along the ray, the
 * way a pure radial-blur godray does.  It is wrong here and the reason is worth
 * stating: the colour at a sample is bright exactly where there is geometry —
 * lit windows, a glowing surface — while the light only travels where there is
 * NO geometry.  The two gates then cancel and the shafts vanish.  What travels
 * along the ray is the sky's light; what the frame contributes is only the
 * occluders.  So this returns openness, and the caller supplies the colour.
 **/
float shafts( sampler2D dep, vec2 uv, vec2 lightUV, float valid, float ph )
{
    if ( valid <= 0.0 )
        return 0.0;
    if ( ph > 0.5 ) // a photo: no sky behind it, but its far parts let the light through (its depth 0..1 here)
    {
        vec2  dlt = ( lightUV - uv ) * ( lengthP * 0.85 ) / float( Steps );
        vec2  q = uv + dlt * fract( sin( dot( uv, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        float sum = 0.0, dec = 1.0;
        for ( int i = 0; i < Steps; ++i )
        {
            q += dlt;
            float d = ( texture( dep, clamp( q, vec2( 0.002 ), vec2( 0.998 ) ) ).r - photoDepthWin.y )
                      / ( photoDepthWin.x - photoDepthWin.y );
            sum += ( 1.0 - smoothstep( 0.05, 0.35, d ) ) * dec;
            dec *= 0.955 - 0.10 * dustP;
        }
        return sum / float( Steps ) * PhotoShaft * min( valid, 1.0 );
    }

    vec2 delta = ( lightUV - uv ) * ( lengthP * 0.85 ) / float( Steps );

    // Per-pixel dither on the start offset.  Without it every pixel samples the
    // same 28 depths and the shafts show as concentric rings.
    float jitter = fract( sin( dot( uv, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );

    vec2  p = uv + delta * jitter;
    float acc = 0.0;
    float decay = 1.0;

    for ( int i = 0; i < Steps; ++i )
    {
        p += delta;
        vec2 sp = clamp( p, vec2( 0.002 ), vec2( 0.998 ) );

        // The occlusion test: geometry ANYWHERE along the ray blocks the light
        // behind it.  This is the whole reason the depth buffer is needed.
        float z = linearise( texture( dep, sp ).r );
        float open = smoothstep( nearFar.y * 0.35, nearFar.y * 0.80, z );

        acc += open * decay;
        decay *= 0.955 - 0.10 * dustP;
    }
    return acc / float( Steps );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // The light wanders slowly across the upper frame; the kick shoves it.
    vec2 lightUV = vec2( 0.5 + 0.26 * sin( time * 0.043 ),
                         0.80 + 0.06 * sin( time * 0.031 ) + 0.05 * audioKick );

    vec3 a = texture( tex0, uv ).rgb;
    vec3 b = texture( tex1, uv ).rgb;
    vec3 col = mix( b, a, clamp( interpolation, 0.0, 1.0 ) );

    float sa = shafts( texDepth0, uv, lightUV, depthValid.x, depthPhoto.x );
    float sb = shafts( texDepth1, uv, lightUV, depthValid.y, depthPhoto.y );
    float shaft = mix( sb, sa, clamp( interpolation, 0.0, 1.0 ) );

    // Shafts fade with distance from the source, the way a beam of light in
    // haze does — without this the whole frame lifts uniformly and the light
    // stops having a position.
    float dl = length( ( uv - lightUV ) * vec2( resolution.x / resolution.y, 1.0 ) );
    shaft *= exp( -dl * 1.5 );
    if ( arcP > 0.0 )
    {
        // Plan P2, the tension arc: the build-up pulls the light in toward its source and leaves only the most open
        // paths (a power on the openness: the beams narrow); a drop lets it out wider and brighter.
        vec2  arc = tensionArc();
        float s = arcP
                  * mix( depthPhoto.y > 0.5 ? PhotoArc : 1.0, depthPhoto.x > 0.5 ? PhotoArc : 1.0,
                         clamp( interpolation, 0.0, 1.0 ) );
        shaft = pow( max( shaft, 0.0 ), 1.0 + 0.8 * arc.x * s ) * exp( -dl * ( 2.5 * arc.x - 0.6 * arc.y ) * s )
                * ( 1.0 + 0.9 * arc.y * s );
    }

    // Warm the shafts slightly and let the harmony tint them, bounded so they
    // stay sunlight rather than becoming a colour wash.
    vec3 tint = mix( vec3( 1.0, 0.88, 0.68 ),
                     hue2rgb( fract( 0.08 + 0.10 * sin( audioChromaHue ) ) ), 0.35 );

    col += shaft * tint * ( 1.6 + 3.4 * shaftP ) * ( 0.55 + 0.9 * audioLevel );

    // A soft bloom around the light itself, cut by nothing — this part IS just
    // glow, and it is what makes the source read as being in the scene.
    float d = length( ( uv - lightUV ) * vec2( resolution.x / resolution.y, 1.0 ) );
    col += tint * exp( -d * ( 7.0 - 3.0 * shaftP ) ) * ( 0.20 + 0.5 * audioHigh );

    col *= 1.0 + 0.12 * audioBeat + 0.10 * audioSubBass;
    col = col / ( 1.0 + col * 0.10 );
    fragColor = vec4( col, 1.0 );
}
