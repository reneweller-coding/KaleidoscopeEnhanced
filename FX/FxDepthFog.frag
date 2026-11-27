#version 330 core
/*****************************************************************************\
 *                              FxDepthFog.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  FX DEPTH FOG: physically modelled atmospheric haze that separates light absorbed by the fog from light scattered
 *  into the ray from a wandering sun (Henyey-Greenstein phase function), read against the scene's real depth
 *  buffer.
 *
 *  Height falloff gives the fog a layer with a surface rather than a
 *  uniform fill; the sun's direction and colour drift with dayPhase and the
 *  harmonic hue.  A 2D scene that passes the photo's depth on (26.11.2026,
 *  depthPhoto) gets the same haze with thinner air (PhotoDensity).
 *  With arcP above 0 (plan P2, 27.11.2026) the fog carries the music's tension
 *  arc: in a build-up a haze grows from the back toward the front, a drop
 *  clears it -- and the usual air with it -- within half a second.
 *    interpolation -> cross-fades the two fogged scene layers
 *    audioBuildUp  -> (arcP) the haze's density and how far forward its front reaches
 *    audioDrop     -> (arcP) clears the haze and thins the air, an envelope of its own (tensionArc())
 *    audioSubBass  -> thickens the fog density and widens the forward-scatter halo
 *    audioKick     -> flashes the sun colour brighter
 *    audioLevel    -> brightens the sun colour
 *    audioChromaHue-> tints the sun and air colour with the harmonic hue
 *    audioAmbient  -> lifts the ambient air colour
 *    audioBeat     -> subtle overall brightness pulse
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// FxDepthFog.frag — atmospheric depth, done as physics rather than as a
// distance-keyed colour ramp.
// -----------------------------------------------------------------------
// Two things happen to light crossing a hazy volume: some is absorbed, and
// some is scattered INTO the ray from the sun.  A simple lerp toward a fog
// colour models only the first, which is why it flattens a scene into a wash.
// Keeping them separate is what gives aerial perspective its direction — the
// haze glows toward the light and stays dark away from it.
//
// The scattering is weighted by Henyey-Greenstein, the standard one-parameter
// phase function: at g = 0 the haze scatters evenly, and as g rises the glow
// tightens into a halo around the sun.  The bass opens that halo up.
//
// Height falloff turns the fog into a layer with a surface rather than a
// uniform fill, which is what lets tall geometry stand out of it.
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

const float PhotoDensity = 0.7; ///< The air's density on a photo, relative to a room (26.11.2026).

uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAmbient;   ///< How ambient (sustained, beatless) the music is, 0..1.
uniform float dayPhase;       ///< Phase of the slow day cycle, 0..1.

uniform float densityP; ///< preset: how thick the air is
uniform float heightP;  ///< preset: how fast the layer thins with height
uniform float glowP;    ///< preset: strength of the forward scattering

uniform float audioBuildUp; ///< Build-up tension toward a drop, 0..1 (smoothed: ~0.5 s rise, ~1.2 s fall).
uniform float audioDrop;    ///< Drop pulse: 1 at the hit, then decaying (about exp( -t / 0.7 s )).
uniform float arcP;         ///< preset: the tension arc through the depth (plan P2); 0 = off, the old picture

const float PhotoArc = 0.6; ///< The tension arc on a photo, relative to a room (27.11.2026).

vec2 gArc = vec2( 0.0 );  ///< This frame's tension arc (tensionArc()), set in main() when arcP is above 0.
vec3 gHaze = vec3( 0.0 ); ///< The colour of the build-up's haze, set in main() when arcP is above 0.

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

/**  Henyey-Greenstein phase function: how much light scattered from direction L ends up travelling toward the viewer.
 *
 * @param cosT  Cosine of the scattering angle. (in)
 * @param g     Anisotropy, -1..1. (in)
 *
 * @return
 *   The phase value.
 **/
float phaseHG( float cosT, float g )
{
    float g2 = g * g;
    float d = 1.0 + g2 - 2.0 * g * cosT;
    return ( 1.0 - g2 ) / ( 12.566371 * max( pow( d, 1.5 ), 1e-4 ) );
}

/**  The fog with the tension arc (arcP above 0): in a build-up a haze grows from the back toward the front, a drop
 * clears it and thins the usual air below its density.
 *
 * @param c      The frame's colour. (in)
 * @param air    The colour of the air with the sun's in-scattering. (in)
 * @param ext    The usual fog's extinction, 0..1. (in)
 * @param z      Linear distance. (in)
 * @param valid  The share of real depth, 0..1. (in)
 * @param ph     1 where the depth is a photo's: PhotoArc of the arc. (in)
 *
 * @return
 *   The colour (RGB).
 *
 * The haze's front walks from beyond the far end (no tension) to farness 0.45 (full tension), so the back goes first
 * and the near stays clear; its colour is a pale mix of the air and the sun without the kick (gHaze), a veil and no
 * second dimming -- the held breath already dims the whole frame.
 **/
vec3 arcFogged( vec3 c, vec3 air, float ext, float z, float valid, float ph )
{
    float s = arcP * ( ph > 0.5 ? PhotoArc : 1.0 );
    float front = 1.1 - 0.65 * gArc.x;
    float haze = 0.7 * gArc.x * smoothstep( front - 0.15, front + 0.15, farness( z ) ) * min( valid, 1.0 );
    vec3  col = mix( c, air, ext * ( 1.0 - 0.6 * gArc.y * s ) );
    return mix( col, gHaze, clamp( haze * s, 0.0, 1.0 ) );
}

/**  The frame at a pixel behind the depth fog, with the sun's in-scattering.
 *
 * @param src     The frame. (in)
 * @param dep     The depth texture. (in)
 * @param uv      Screen coordinate. (in)
 * @param sunDir  Direction to the sun. (in)
 * @param sunCol  Colour of the sun. (in)
 * @param airCol  Colour of the air. (in)
 * @param valid   1 where the depth buffer is valid, else 0; between, the fog fades in (a photo with a map only on
 *                one side of a photo cross-fade). (in)
 * @param ph      1 where the depth is a photo's (a 2D scene): thinner air. (in)
 *
 * @return
 *   The colour (RGB).
 **/
vec3 fogged( sampler2D src, sampler2D dep, vec2 uv, vec3 sunDir, vec3 sunCol,
             vec3 airCol, float valid, float ph )
{
    vec3 c = texture( src, uv ).rgb;
    if ( valid <= 0.0 )
        return c;

    float z = linearise( texture( dep, uv ).r );

    // The view ray for this pixel, which the phase function needs.
    vec2  ndc = uv * 2.0 - 1.0;
    float aspect = resolution.x / max( resolution.y, 1.0 );
    vec3  ray = normalize( vec3( ndc.x * tanHalfFov * aspect, ndc.y * tanHalfFov, -1.0 ) );

    // A height-banded layer: the y of the point this pixel sees, used to thin
    // the fog upward.  Sky (at the far plane) still gets full extinction, which
    // is what keeps the horizon from cutting a hard line.
    float y = ray.y * z;
    float h_fall = exp( -max( y, 0.0 ) * ( 0.045 * heightP ) );

    float density = densityP * ( 0.9 + 0.6 * audioSubBass ) * h_fall;
    if ( ph > 0.5 ) // a photo is no room: the haze stays a hint in its far parts
        density *= PhotoDensity;
    float ext = 1.0 - exp( -z * density * 0.0055 );
    ext = clamp( ext, 0.0, 1.0 );

    // In-scattering: strongest looking into the sun, and it grows with the same
    // path length that absorbs the scene.
    float cosT = dot( ray, sunDir );
    float g = clamp( 0.55 + 0.25 * glowP - 0.20 * audioSubBass, 0.0, 0.92 );

    // The phase function is a probability DENSITY, and a forward-scattering
    // lobe is very tall: at g = 0.62 its peak is above 11.  Used raw it does
    // not brighten the haze, it detonates it — the whole frame goes white.
    // Dividing by that peak, which has the closed form (1+g)/(1-g)^2, turns it
    // into a 0..1 shape that still concentrates exactly where it should.
    float peak = ( 1.0 + g ) / max( ( 1.0 - g ) * ( 1.0 - g ), 1e-3 );
    float in_scatter = phaseHG( cosT, g ) * 12.566371 / peak;

    vec3 air = airCol + sunCol * in_scatter * ( 0.35 + 1.5 * glowP );

    if ( valid < 1.0 )
        ext *= valid;
    if ( arcP > 0.0 ) // plan P2: the tension arc (0: the old picture, this line skipped)
        return arcFogged( c, air, ext, z, valid, ph );
    return mix( c, air, ext );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // A sun that wanders with the day cycle rather than with the frame counter,
    // so the light in the room agrees with the rest of the show.
    float sa = 6.2831853 * dayPhase + 0.6 * sin( time * 0.017 );
    vec3  sunDir = normalize( vec3( 0.55 * sin( sa ), 0.22 + 0.16 * cos( sa * 0.5 ), -1.0 ) );

    vec3 sunCol = mix( vec3( 1.0, 0.72, 0.42 ), vec3( 0.85, 0.92, 1.0 ),
                       clamp( 0.5 + 0.5 * cos( sa ), 0.0, 1.0 ) );
    sunCol = mix( sunCol, hue2rgb( fract( 0.08 + 0.10 * sin( audioChromaHue ) ) ), 0.22 );
    vec3 sunTint = sunCol; // the sun's colour without the kick: the build-up's haze must not pulse
    sunCol *= 0.7 + 0.9 * audioLevel + 0.5 * audioKick;

    vec3 airCol = mix( vec3( 0.045, 0.060, 0.095 ), vec3( 0.16, 0.20, 0.28 ),
                       0.3 + 0.5 * audioAmbient );
    if ( arcP > 0.0 ) // plan P2: the tension arc
    {
        gArc = tensionArc();
        gHaze = mix( airCol, sunTint * ( 0.6 + 0.5 * audioLevel ), 0.35 );
    }

    vec3 a = fogged( tex0, texDepth0, uv, sunDir, sunCol, airCol, depthValid.x, depthPhoto.x );
    vec3 b = fogged( tex1, texDepth1, uv, sunDir, sunCol, airCol, depthValid.y, depthPhoto.y );
    vec3 col = mix( b, a, clamp( interpolation, 0.0, 1.0 ) );

    col *= 1.0 + 0.12 * audioBeat;
    col = col / ( 1.0 + col * 0.12 );
    fragColor = vec4( col, 1.0 );
}
