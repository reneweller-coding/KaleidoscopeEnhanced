#version 330 core
/*****************************************************************************\
 *                              FxAmbientOcclusion.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  FX AMBIENT OCCLUSION: screen-space ambient occlusion reconstructed from the scene's real depth buffer, darkening
 *  and cooling creases where nearby geometry blocks the ambient light.
 *
 *  Rebuilds view-space position and normal per pixel from depth, samples a
 *  dithered hemisphere kernel with a range check that avoids silhouette
 *  haloing, and blends the occlusion of both incoming scene layers.  A 2D
 *  scene that passes the photo's depth on (26.11.2026, depthPhoto) gets a
 *  fraction of the occlusion (PhotoAO).
 *  With arcP above 0 (plan P2, 27.11.2026) the shadows carry the music's
 *  tension arc: in a build-up the ambient light withdraws from the back
 *  toward the front and the creases deepen, a drop lifts both within half a
 *  second.
 *    interpolation -> cross-fades the two scene layers and their occlusion terms
 *    audioBuildUp  -> (arcP) the shadow grows from the back, the creases deepen
 *    audioDrop     -> (arcP) lifts the occlusion, an envelope of its own (tensionArc())
 *    audioAmbient  -> raises/lowers the overall occlusion strength (breathing)
 *    audioSubBass  -> adds extra occlusion darkening
 *    audioKick     -> briefly lightens the occlusion on a hit
 *    audioBeat     -> subtle overall brightness pulse
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// FxAmbientOcclusion.frag — screen-space ambient occlusion from depth.
// -----------------------------------------------------------------------
// SSAO asks, for every pixel, how much of the hemisphere above its surface is
// blocked by nearby geometry.  Answering that needs a POSITION and a NORMAL,
// and the only thing available here is a depth buffer — so both are rebuilt.
//
// A depth sample plus the projection's field of view gives the view-space
// position: the pixel's screen coordinate is a ray direction, and the linear
// depth is how far along it the surface sits.  The normal then comes from the
// derivatives of that position across the screen.
//
// This is why the engine shares tanHalfFov and the clip planes rather than
// letting this shader guess them.  Guessed values do not look broken — they
// look like slightly wrong occlusion, which is far harder to notice and
// impossible to debug from the image.
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform sampler2D texDepth0;     ///< Depth buffer of the current 3D scene (the source of tex0).
uniform sampler2D texDepth1;     ///< Depth buffer of the next 3D scene (the source of tex1).
uniform vec2      depthValid;    ///< 1 where texDepth0 (x) and texDepth1 (y) hold a 3D scene's depth, else 0.
uniform vec2      nearFar;       ///< Near and far clip distances.
uniform float     tanHalfFov;    ///< Tangent of half the vertical field of view of the 3D scene.
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform vec2      depthPhoto;    ///< 1 where texDepth0 (x) / texDepth1 (y) hold a photo's depth (a 2D scene), else 0.

const float PhotoAO = 0.6; ///< The occlusion on a photo, relative to a room (26.11.2026).

uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioAmbient;   ///< How ambient (sustained, beatless) the music is, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float radiusP;   ///< preset: sampling radius in world units
uniform float strengthP; ///< preset: how dark the creases go
uniform float tintP;     ///< preset: how much colour the shadow keeps

const int Samples = 12; ///< Samples per pixel.

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
 * The tension starts below the present pass's held breath (`breath`, the build-up's upper half from 0.5: it takes
 * colour and light from the whole frame) and works only in the depth.  The clearing is an envelope of its own, never
 * the pulse: the drop pulse jumps to 1 at the hit and decays as exp( -t / 0.7 s ), so its value says how long ago
 * the hit was.  The envelope rises from 0 to 1 between 0.15 and 0.55 s after the hit (pulse 0.8 .. 0.45), holds to
 * about 1.6 s (0.1) and is gone by 4 s (0.003); a pulse of 1 gives 0, so the hit itself is no step.
 **/
vec2 tensionArc()
{
    float clear = ( 1.0 - smoothstep( 0.45, 0.8, audioDrop ) ) * smoothstep( 0.003, 0.1, audioDrop );
    return vec2( smoothstep( 0.35, 0.8, audioBuildUp ) * ( 1.0 - clear ), clear );
}

/**  How far a point lies, on a log scale.
 *
 * @param z  Linear distance. (in)
 *
 * @return
 *   0 at 4 units (the near end of a room) .. 1 at 60 and beyond (the sky); a photo's depth spans 0.26 (its near
 *   end, 8 units) .. 1 (its far end, 80).
 **/
float farness( float z )
{
    return clamp( log( z / 4.0 ) / log( 15.0 ), 0.0, 1.0 );
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

/**  Screen position -> view-space position, using the depth at that pixel.
 *
 * @param dep  The depth texture. (in)
 * @param uv   Screen coordinate. (in)
 *
 * @return
 *   The view-space position.
 **/
vec3 viewPos( sampler2D dep, vec2 uv )
{
    float z = linearise( texture( dep, uv ).r );
    vec2  ndc = uv * 2.0 - 1.0;
    float aspect = resolution.x / max( resolution.y, 1.0 );
    // The engine projects with -z forward, so the ray leans into negative z.
    vec3 ray = vec3( ndc.x * tanHalfFov * aspect, ndc.y * tanHalfFov, -1.0 );
    return ray * z;
}

/**  Ambient occlusion at a pixel, from the depth around it.
 *
 * @param dep    The depth texture. (in)
 * @param uv     Screen coordinate. (in)
 * @param valid  1 where the depth buffer is valid, else 0. (in)
 *
 * @return
 *   The occlusion, 0..1.
 **/
float occlusion( sampler2D dep, vec2 uv, float valid )
{
    if ( valid <= 0.0 )
        return 0.0;

    float z = linearise( texture( dep, uv ).r );
    if ( z > nearFar.y * 0.95 )
        return 0.0; // empty sky: nothing to occlude

    vec3 p = viewPos( dep, uv );

    // Normal from the derivatives of the reconstructed position.  Screen-space
    // derivatives cross silhouettes, so at an edge this normal is wrong — the
    // range check below is what keeps that from becoming a black outline.
    vec3 n = normalize( cross( dFdx( p ), dFdy( p ) ) );

    float radius = radiusP * 1.6;
    // Project the world radius into screen space: near geometry needs a wide
    // kernel, far geometry a narrow one.  A fixed pixel radius would make the
    // occlusion scale with distance, which is exactly backwards.
    float sr = radius * tanHalfFov / max( z, 0.4 );
    sr = clamp( sr, 0.002, 0.09 );

    float rot = fract( sin( dot( uv, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831853;
    float occ = 0.0;

    for ( int i = 0; i < Samples; ++i )
    {
        float a = float( i ) * 2.3999632 + rot;
        float r = sqrt( ( float( i ) + 0.5 ) / float( Samples ) ) * sr;
        vec2  su = clamp( uv + vec2( cos( a ), sin( a ) ) * r * vec2( 1.0, resolution.x / resolution.y ),
                          vec2( 0.002 ), vec2( 0.998 ) );

        vec3  q = viewPos( dep, su );
        vec3  d = q - p;
        float len = length( d );
        if ( len < 1e-4 )
            continue;

        // How far the neighbour lies along this surface's normal.  Positive
        // means it rises above the tangent plane, and therefore blocks light.
        float ndl = dot( n, d / len );

        // Range check: a neighbour much closer to the camera belongs to a
        // different surface entirely, and counting it would draw a dark halo
        // around every silhouette.
        float range = smoothstep( 0.0, 1.0, radius / max( len, 1e-3 ) );

        occ += max( ndl - 0.06, 0.0 ) * range;
    }

    return clamp( occ / float( Samples ) * ( 1.2 + 3.4 * strengthP ), 0.0, 1.0 );
}

/**  A cheap 4-tap blur of the occlusion, so the per-pixel dither in the sampling pattern averages out instead of
 * showing as grain.
 *
 * @param dep    The depth texture. (in)
 * @param uv     Screen coordinate. (in)
 * @param valid  1 where the depth buffer is valid, else 0. (in)
 *
 * @return
 *   The occlusion, 0..1.
 **/
float occlusionSmooth( sampler2D dep, vec2 uv, float valid )
{
    vec2 t = 1.5 / resolution;
    return 0.25
           * ( occlusion( dep, uv + vec2( t.x, t.y ), valid ) + occlusion( dep, uv + vec2( -t.x, t.y ), valid )
               + occlusion( dep, uv + vec2( t.x, -t.y ), valid ) + occlusion( dep, uv + vec2( -t.x, -t.y ), valid ) );
}

/**  How much of the ambient light the build-up has taken from a layer's pixel: from the back toward the front.
 *
 * @param dep    The depth texture. (in)
 * @param uv     Screen coordinate. (in)
 * @param valid  The share of real depth, 0..1. (in)
 * @param t      The tension, 0..1. (in)
 *
 * @return
 *   The withdrawal, 0..1: 0 in front of the shadow's front, which walks from beyond the far end to farness 0.45.
 **/
float withdrawal( sampler2D dep, vec2 uv, float valid, float t )
{
    if ( valid <= 0.0 )
        return 0.0;
    float front = 1.1 - 0.65 * t;
    return t * smoothstep( front - 0.15, front + 0.15, farness( linearise( texture( dep, uv ).r ) ) )
           * min( valid, 1.0 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    vec3 a = texture( tex0, uv ).rgb;
    vec3 b = texture( tex1, uv ).rgb;
    vec3 col = mix( b, a, clamp( interpolation, 0.0, 1.0 ) );

    float oa = occlusionSmooth( texDepth0, uv, depthValid.x );
    float ob = occlusionSmooth( texDepth1, uv, depthValid.y );
    // A photo: PhotoAO of it, faded in with the share of the photos that have a map.
    if ( depthPhoto.x > 0.5 )
        oa *= PhotoAO * min( depthValid.x, 1.0 );
    if ( depthPhoto.y > 0.5 )
        ob *= PhotoAO * min( depthValid.y, 1.0 );
    float occ = mix( ob, oa, clamp( interpolation, 0.0, 1.0 ) );

    // Breathe with the music, but never all the way off: an occlusion term
    // that pumps to zero makes the whole image look like it is losing contrast
    // rather than like light changing.
    occ *= 0.65 + 0.45 * audioAmbient + 0.25 * audioSubBass - 0.20 * audioKick;
    occ = clamp( occ, 0.0, 1.0 );
    if ( arcP > 0.0 )
    {
        // Plan P2, the tension arc: the build-up deepens the creases and takes the ambient light from the back
        // toward the front (a withdrawal toward the cool shadow colour below, at most 0.35); a drop lifts the
        // occlusion to a fifth of itself, and the withdrawal with the tension.  The withdrawal is the one part of
        // the arc that darkens a region: where the final pass's held breath dims the whole frame (its target,
        // clamp( ( buildUp - 0.5 ) x 2.2, 0, 1 )), it gives up to half of itself, so the two do not double.
        vec2  arc = tensionArc();
        float sa = arcP * ( depthPhoto.x > 0.5 ? PhotoArc : 1.0 ), sb = arcP * ( depthPhoto.y > 0.5 ? PhotoArc : 1.0 );
        float wa = withdrawal( texDepth0, uv, depthValid.x, arc.x ) * sa;
        float wb = withdrawal( texDepth1, uv, depthValid.y, arc.x ) * sb;
        float s = mix( sb, sa, clamp( interpolation, 0.0, 1.0 ) );
        float held = clamp( ( audioBuildUp - 0.5 ) * 2.2, 0.0, 1.0 );
        occ = clamp( occ * ( 1.0 + 0.8 * arc.x * s ) * ( 1.0 - 0.8 * arc.y * s )
                         + 0.35 * ( 1.0 - 0.5 * held ) * mix( wb, wa, clamp( interpolation, 0.0, 1.0 ) ),
                     0.0, 1.0 );
    }

    // Occluded areas do not just get darker, they get COOLER and keep some of
    // their own colour — light that reaches a crease has bounced off the walls
    // around it.  Multiplying straight to grey is what makes cheap SSAO read as
    // dirt smeared on the image.
    vec3 shadow = mix( vec3( 0.10, 0.13, 0.22 ), col * 0.35, tintP );
    col = mix( col, shadow, occ );

    col *= 1.0 + 0.10 * audioBeat;
    fragColor = vec4( col, 1.0 );
}
