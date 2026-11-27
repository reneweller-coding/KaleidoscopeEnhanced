#version 330 core
/*****************************************************************************\
 *                              FxRimLight.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  FX RIM LIGHT: relights the scene from behind using a surface normal reconstructed from the real depth buffer,
 *  adding a grazing-angle rim highlight plus an opposing fill light.
 *
 *  Uses whichever of the forward/backward depth differences spans the
 *  smaller step, per axis, so the reconstructed normal (and therefore the
 *  rim) stays clean right up to silhouette edges; the key light's direction
 *  and colour drift with dayPhase and the harmonic hue.  A 2D scene that
 *  passes the photo's depth on (26.11.2026, depthPhoto) is relit at a fraction
 *  of the rim (PhotoRim), without the fill, its normal over a wider step
 *  (PhotoStep, across the map's 8-bit terraces) and a flattened relief
 *  (PhotoFlat, so only its edges catch the light): a photo's relief is a hint.
 *  With arcP above 0 (plan P2, 27.11.2026) the light behind carries the
 *  music's tension arc: in a build-up the rim narrows to a thin outline and
 *  withdraws a little, at a drop it flares, wider and brighter, within half a
 *  second.
 *    interpolation -> cross-fades the two rim-lit scene layers
 *    audioBuildUp  -> (arcP) a thinner, fainter rim
 *    audioDrop     -> (arcP) the rim flares, an envelope of its own (tensionArc())
 *    audioKick     -> flashes the rim-light intensity
 *    audioLevel    -> adds to the rim-light intensity
 *    audioAmbient  -> strengthens the opposing fill light
 *    audioChromaHue-> tints the key/fill light colours with the harmonic hue
 *    audioHigh     -> adds a touch of key-coloured highlight
 *    audioSubBass  -> subtle overall brightness pulse
 *    audioBeat     -> subtle overall brightness pulse
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// FxRimLight.frag — relight the frame from behind, using only depth.
// -----------------------------------------------------------------------
// A rim needs a surface normal, and the depth buffer does not store one.  It can
// be recovered: unproject three neighbouring pixels into view space and cross
// the two edge vectors.  The catch is what happens at a silhouette, where the
// neighbour belongs to a completely different surface — the reconstructed normal
// there is garbage, and since a silhouette is exactly where a rim is brightest,
// the artefact lands precisely where the effect is supposed to live.  A naive
// version fringes every object with a ragged halo.
//
// The standard answer, and the one used here: take BOTH the forward and the
// backward difference and keep whichever spans the smaller step in depth.  At an
// interior pixel they agree.  At a silhouette one of them crosses the gap and
// the other stays on the near surface, so the near surface wins and its normal
// stays correct right up to the last pixel of the edge.
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

const float PhotoRim = 0.35;  ///< The rim light on a photo, relative to a room (26.11.2026); a photo gets no fill.
const float PhotoStep = 2.0;  ///< The normal's step on a photo, in 1/270 of the height: across 8-bit terraces.
const float PhotoFlat = 0.15; ///< The relief a photo's normal sees, relative to its depth: only its edges catch light.

uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAmbient;   ///< How ambient (sustained, beatless) the music is, 0..1.
uniform float dayPhase;       ///< Phase of the slow day cycle, 0..1.

uniform float rimP;   ///< preset: rim strength
uniform float sharpP; ///< preset: how tight the rim band is
uniform float fillP;  ///< preset: opposing fill light

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
 * .. 0.45), holds to about 2.6 s (0.03) and is gone by 5.5 s (0.0005); a pulse of 1 gives 0, so the hit itself is no
 * step.
 **/
vec2 tensionArc()
{
    float clear = ( 1.0 - smoothstep( 0.45, 0.8, audioDrop ) ) * smoothstep( 0.0005, 0.03, audioDrop );
    return vec2( smoothstep( 0.3, 0.7, audioBuildUp ) * ( 1.0 - clear ), clear );
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

/**  View-space position of a pixel at linear depth z.
 *
 * @param uv  Screen coordinate. (in)
 * @param z   Linear depth. (in)
 *
 * @return
 *   The position.
 **/
vec3 viewPos( vec2 uv, float z )
{
    vec2  ndc = uv * 2.0 - 1.0;
    float aspect = resolution.x / max( resolution.y, 1.0 );
    return vec3( ndc.x * tanHalfFov * aspect, ndc.y * tanHalfFov, -1.0 ) * z;
}

/**  The frame relit by a key and a fill light, with normals from the depth.
 *
 * @param src      The frame. (in)
 * @param dep      The depth texture. (in)
 * @param uv       Screen coordinate. (in)
 * @param valid    1 where the depth buffer is valid, else 0. (in)
 * @param px       Size of a pixel. (in)
 * @param keyDir   Direction of the key light. (in)
 * @param keyCol   Colour of the key light. (in)
 * @param fillDir  Direction of the fill light. (in)
 * @param fillCol  Colour of the fill light. (in)
 * @param sharp    Sharpness of the rim. (in)
 *
 * @return
 *   The colour (RGB).
 **/
vec3 lit( sampler2D src, sampler2D dep, vec2 uv, float valid, vec2 px,
          vec3 keyDir, vec3 keyCol, vec3 fillDir, vec3 fillCol, float sharp )
{
    vec3 c = texture( src, uv ).rgb;
    if ( valid < 0.5 )
        return c;

    float zc = linearise( texture( dep, uv ).r );
    // Nothing there: the far plane is sky, and relighting sky produces a bright
    // frame edge where the geometry simply stops.
    if ( zc > nearFar.y * 0.94 )
        return c;

    float zr = linearise( texture( dep, uv + vec2( px.x, 0.0 ) ).r );
    float zl = linearise( texture( dep, uv - vec2( px.x, 0.0 ) ).r );
    float zu = linearise( texture( dep, uv + vec2( 0.0, px.y ) ).r );
    float zd = linearise( texture( dep, uv - vec2( 0.0, px.y ) ).r );

    vec3 P = viewPos( uv, zc );

    // Keep the difference that stays on this surface.
    vec3 dx = ( abs( zr - zc ) < abs( zc - zl ) )
                  ? viewPos( uv + vec2( px.x, 0.0 ), zr ) - P
                  : P - viewPos( uv - vec2( px.x, 0.0 ), zl );
    vec3 dy = ( abs( zu - zc ) < abs( zc - zd ) )
                  ? viewPos( uv + vec2( 0.0, px.y ), zu ) - P
                  : P - viewPos( uv - vec2( 0.0, px.y ), zd );

    vec3 N = normalize( cross( dx, dy ) );
    vec3 V = normalize( -P );
    if ( dot( N, V ) < 0.0 )
        N = -N;

    // The rim: grazing angles only, tightened by the preset.
    float fres = pow( 1.0 - clamp( dot( N, V ), 0.0, 1.0 ), mix( 1.6, 6.0, clamp( sharp, 0.0, 1.0 ) ) );
    // Back-lit, so the rim only appears where the key is actually behind the
    // surface — a rim that ignores the light direction is just an outline.
    float back = clamp( dot( N, keyDir ) * 0.5 + 0.5, 0.0, 1.0 );

    vec3 col = c;
    col += keyCol * fres * back * ( 0.8 + 2.2 * rimP )
           * ( 0.55 + 0.9 * audioKick + 0.35 * audioLevel );
    col += fillCol * max( dot( N, fillDir ), 0.0 ) * ( 0.25 * fillP )
           * ( 0.5 + 0.6 * audioAmbient );
    return col;
}

/**  A photo relit by the key light alone: the rim of its relief, at PhotoRim of a room's.
 *
 * @param src     The frame. (in)
 * @param dep     The depth texture: the photo's depth, as the 2D scene wrote it. (in)
 * @param uv      Screen coordinate. (in)
 * @param valid   The share of the photos with a map, 0..1: the light fades in with it (a photo cross-fade between a
 *                photo with and one without a map). (in)
 * @param px      Size of a pixel. (in)
 * @param keyDir  Direction of the key light. (in)
 * @param keyCol  Colour of the key light. (in)
 * @param sharp   Sharpness of the rim. (in)
 *
 * @return
 *   The colour (RGB).
 *
 * Not lit(): a photo's depth has 256 levels, and a one-pixel difference sees every level as a cliff -- the rim drew
 * the terraces as lines (ramp sheet of 27.11.2026).  The normal here spans PhotoStep on both sides, which measures
 * the slope across several levels; the shorter side of lit() would lie flat on any terrace wider than the step.  The
 * relief is flattened (PhotoFlat) and seen straight on, so the rim outlines the photo's depth edges instead of
 * covering every slope and the frame's edges.  And no fill: a photo faces the camera almost everywhere, so the fill
 * lay over the whole picture as a veil.
 **/
vec3 litPhoto( sampler2D src, sampler2D dep, vec2 uv, float valid, vec2 px, vec3 keyDir, vec3 keyCol, float sharp )
{
    vec3 c = texture( src, uv ).rgb;
    if ( valid <= 0.0 )
        return c;

    vec2  st = px * ( PhotoStep * max( resolution.y / 270.0, 1.0 ) );
    float zc = linearise( texture( dep, uv ).r );
    if ( zc > nearFar.y * 0.94 )
        return c;
    // The relief flattened to PhotoFlat: a photo's depth spans 8..80 units, so nearly every slope of it is steep and
    // the rim lay on the whole picture (+17 of 255 on the sheet of 27.11.2026); flat, only its edges stay steep.
    float zr = zc + PhotoFlat * ( linearise( texture( dep, uv + vec2( st.x, 0.0 ) ).r ) - zc );
    float zl = zc + PhotoFlat * ( linearise( texture( dep, uv - vec2( st.x, 0.0 ) ).r ) - zc );
    float zu = zc + PhotoFlat * ( linearise( texture( dep, uv + vec2( 0.0, st.y ) ).r ) - zc );
    float zd = zc + PhotoFlat * ( linearise( texture( dep, uv - vec2( 0.0, st.y ) ).r ) - zc );

    vec3 dx = viewPos( uv + vec2( st.x, 0.0 ), zr ) - viewPos( uv - vec2( st.x, 0.0 ), zl );
    vec3 dy = viewPos( uv + vec2( 0.0, st.y ), zu ) - viewPos( uv - vec2( 0.0, st.y ), zd );
    vec3 N = normalize( cross( dx, dy ) );
    // A photo is a picture facing the eye: only its relief turns away, not the edges of the frame (seen from the
    // camera, a flat photo's corners lit up like a vignette).
    vec3 V = vec3( 0.0, 0.0, 1.0 );
    if ( dot( N, V ) < 0.0 )
        N = -N;

    float fres = pow( 1.0 - clamp( dot( N, V ), 0.0, 1.0 ), mix( 1.6, 6.0, clamp( sharp, 0.0, 1.0 ) ) );
    float back = clamp( dot( N, keyDir ) * 0.5 + 0.5, 0.0, 1.0 );
    return c
           + keyCol * fres * back * ( 0.8 + 2.2 * rimP ) * ( 0.55 + 0.9 * audioKick + 0.35 * audioLevel )
                 * ( PhotoRim * min( valid, 1.0 ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    // The key swings slowly, and behind the subject: a rim light lives roughly
    // opposite the camera, so the direction is mostly +z in view space.
    float a = time * 0.11 + 6.2831853 * dayPhase * 0.25;
    vec3  keyDir = normalize( vec3( 0.75 * sin( a ), 0.30 + 0.25 * cos( a * 0.7 ), 0.75 ) );
    vec3  fillDir = normalize( vec3( -0.6, -0.25, 0.35 ) );

    vec3 keyCol = hue2rgb( fract( 0.55 + 0.30 * sin( audioChromaHue ) + 0.08 * sin( a ) ) );
    keyCol = mix( keyCol, vec3( 1.0 ), 0.30 );
    vec3 fillCol = mix( vec3( 0.25, 0.35, 0.55 ), hue2rgb( fract( 0.12 + 0.2 * sin( a ) ) ), 0.35 );

    float sharp = clamp( sharpP, 0.0, 1.0 );
    vec2  arc = vec2( 0.0 );
    float s = 0.0;
    if ( arcP > 0.0 ) // plan P2, the tension arc: the build-up tightens the rim toward a thin outline
    {
        arc = tensionArc();
        s = arcP
            * mix( depthPhoto.y > 0.5 ? PhotoArc : 1.0, depthPhoto.x > 0.5 ? PhotoArc : 1.0,
                   clamp( interpolation, 0.0, 1.0 ) );
        sharp = mix( sharp, 1.0, 0.6 * arc.x * s ) * ( 1.0 - 0.2 * arc.y * s );
    }
    // A photo's depth (a 2D scene, depthPhoto) gets its own light; a 3D layer gets what it always got.
    vec3 A = depthPhoto.x > 0.5 ? litPhoto( tex0, texDepth0, uv, depthValid.x, px, keyDir, keyCol, sharp )
                                : lit( tex0, texDepth0, uv, depthValid.x, px, keyDir, keyCol, fillDir, fillCol, sharp );
    vec3 B = depthPhoto.y > 0.5 ? litPhoto( tex1, texDepth1, uv, depthValid.y, px, keyDir, keyCol, sharp )
                                : lit( tex1, texDepth1, uv, depthValid.y, px, keyDir, keyCol, fillDir, fillCol, sharp );
    vec3 col = mix( B, A, clamp( interpolation, 0.0, 1.0 ) );
    if ( arcP > 0.0 ) // the light itself: a little fainter in the build-up, its kick held back, flaring at the drop
    {
        // The rim pulses with the kick ( 0.55 + 0.9 audioKick + 0.35 audioLevel in lit() ): the build-up holds that
        // pulse back (to 0.4 of it at full tension), and the flare is modest (x 1.4) -- a flare of x 2 doubled the
        // pulse, and even the plain 5 % dimming of the build-up tipped a scene's own beat flicker over one more
        // flash a second (ostgut, 1.5 -> 2.0; plan P2, 27.11.2026).
        float pulse = 0.55 + 0.9 * audioKick + 0.35 * audioLevel;
        float held = ( pulse - 0.9 * audioKick * 0.6 * arc.x * s ) / pulse;
        vec3  base = mix( texture( tex1, uv ).rgb, texture( tex0, uv ).rgb, clamp( interpolation, 0.0, 1.0 ) );
        col = base + ( col - base ) * ( ( 1.0 - 0.3 * arc.x * s ) * held * ( 1.0 + 0.4 * arc.y * s ) );
    }

    col *= 1.0 + 0.12 * audioBeat + 0.10 * audioSubBass;
    col += keyCol * 0.04 * audioHigh;
    col = col / ( 1.0 + col * 0.16 );
    fragColor = vec4( col, 1.0 );
}
