#version 330 core
/*****************************************************************************\
 *                              FxDepthField.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  FX DEPTH FIELD: physically based depth-of-field blur driven by the scene's real depth buffer, with a 12-tap
 *  bokeh kernel and a focal plane that racks with the music.
 *
 *  Layers without valid depth (2D scenes) pass through unblurred. A
 *  foreground-stays-sharp occlusion test keeps in-focus objects from
 *  smearing into the blurred background behind them.
 *  A 2D scene that passes the photo's depth on (26.11.2026, depthPhoto) is
 *  blurred too, quieter: the focus sits on the photo's subject (photoSubject,
 *  or the near half without one), half the aperture, at most PhotoMaxCoc of
 *  the blur, no rack focus.
 *  With arcP above 0 (plan P2, 27.11.2026) the lens carries the music's
 *  tension arc: in a build-up the aperture opens around the focus (the
 *  subject comes loose from its background), a drop makes everything sharp
 *  within half a second.
 *    interpolation -> cross-fades the two independently blurred scene layers
 *    audioBuildUp  -> (arcP) opens the aperture
 *    audioDrop     -> (arcP) closes it below its rest, an envelope of its own (tensionArc())
 *    audioSubBass  -> pulls the focal plane in toward the camera
 *    audioKick     -> snaps the focal plane back out (rack focus)
 *    audioBeat     -> subtle overall brightness pulse
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// FxDepthField.frag — depth of field, using the 3D scene's real depth.
// -----------------------------------------------------------------------
// This is the first effect that reads what the scene actually wrote into the
// depth attachment.  Everything a 2D visualiser can do with "fake" depth —
// radial blur, luminance-keyed softening — puts the blur in the wrong places;
// with the real buffer the focal plane is a physical distance, so the blur
// grows correctly on both sides of it and stops exactly at a silhouette.
//
// The focal plane drifts with the music: the bass pulls focus toward the
// camera, a kick snaps it back.  That is a camera operator's move, and it
// reads as intent rather than as an effect.
//
// depthValid tells us whether each layer's depth is real geometry at all.  A 2D
// effect leaves the far plane there, and blurring THAT would mean blurring the
// whole frame uniformly — so those layers pass through untouched.
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
uniform vec4      photoSubject;  ///< Depth threshold and confidence of the photo's subject (xy: the current photo).

uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioBeat;    ///< Beat envelope, 0..1.
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSubBass; ///< Sub-bass band level, 0..1.
uniform float audioHigh;    ///< High band level, 0..1.

uniform float focusP;    ///< preset: resting focal distance
uniform float apertureP; ///< preset: how fast things go soft
uniform float bokehP;    ///< preset: highlight blooming in the blur

const float Pi = 3.14159265358979; ///< Pi.
const float PhotoMaxCoc = 0.4;     ///< The largest blur on a photo, relative to a room's (26.11.2026): a hint of focus.

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

/**  A depth buffer is stored non-linearly — most of its precision sits near the camera.
 *
 * @param d  Depth buffer value, 0..1. (in)
 *
 * @return
 *   The linear distance.
 *
 * Comparing raw values would put the whole scene in one bucket, so it has to be turned back into a distance first.
 **/
float linearise( float d )
{
    float n = nearFar.x, f = nearFar.y;
    float z = d * 2.0 - 1.0;
    return ( 2.0 * n * f ) / ( f + n - z * ( f - n ) );
}

/**  12-tap ring, golden-angle spaced.
 *
 * @param src    The frame. (in)
 * @param dep    The depth texture. (in)
 * @param uv     Screen coordinate. (in)
 * @param focus  Focus distance. (in)
 * @param valid  1 where the depth buffer is valid, else 0; between, the blur fades in (a photo with a map only on
 *               one side of a photo cross-fade). (in)
 * @param ap     The aperture: apertureP, or less on a photo. (in)
 * @param cmax   The largest circle of confusion: 1, or PhotoMaxCoc on a photo. (in)
 *
 * @return
 *   The colour (RGB).
 *
 * A ring gathers a disc of confusion far more evenly than a box of the same tap count, which is what keeps the bokeh
 * round instead of cross-shaped.
 **/
vec3 blurAt( sampler2D src, sampler2D dep, vec2 uv, float focus, float valid, float ap, float cmax )
{
    vec3 c = texture( src, uv ).rgb;
    if ( valid <= 0.0 )
        return c;

    float z = linearise( texture( dep, uv ).r );
    // Circle of confusion, signed distance from the focal plane in metres,
    // normalised so that the aperture setting behaves the same at any depth.
    float coc = abs( z - focus ) / max( focus, 1.0 );
    coc = clamp( coc * ( 0.6 + 3.2 * ap ) - 0.04, 0.0, cmax );

    // Kept modest on purpose: 12 taps spread over a large disc stop reading as
    // a blur and start reading as twelve copies.  Wider bokeh needs more taps,
    // not a bigger radius.
    float radius = coc * 0.014;
    if ( radius < 0.0008 )
        return c;

    // Rotate each pixel's tap pattern by a HASH, not by a smooth function of
    // uv.  Neighbouring pixels otherwise share almost the same twelve
    // directions, and the sampling turns into a visible weave rather than
    // averaging away.
    float rot = fract( sin( dot( uv, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831853;

    vec3  sum = c;
    float wsum = 1.0;
    for ( int i = 0; i < 12; ++i )
    {
        float a = float( i ) * 2.3999632 + rot;
        float r = sqrt( ( float( i ) + 0.5 ) / 12.0 ) * radius;
        vec2  o = vec2( cos( a ), sin( a ) ) * r * vec2( 1.0, resolution.x / resolution.y );
        vec2  su = clamp( uv + o, vec2( 0.001 ), vec2( 0.999 ) );

        vec3  s = texture( src, su ).rgb;
        float sz = linearise( texture( dep, su ).r );

        // Reject samples that are IN FOCUS and in front: a sharp foreground
        // object must not smear into a blurred background, which is the
        // artefact that gives cheap depth of field its halos.
        float sc = clamp( abs( sz - focus ) / max( focus, 1.0 ) * ( 0.6 + 3.2 * ap ), 0.0, 1.0 );
        float w = ( sz > z - 0.05 ) ? 1.0 : sc;

        // Bright samples weigh more, which is what turns out-of-focus
        // highlights into visible bokeh discs instead of grey mush.
        w *= 1.0 + bokehP * 2.5 * max( max( s.r, s.g ), s.b );

        sum += s * w;
        wsum += w;
    }
    vec3 r = sum / wsum;
    return valid >= 1.0 ? r : mix( c, r, valid );
}

/**  The focus distance on a photo: its subject's depth threshold, or the near half without a measured subject.
 *
 * @return
 *   The distance, in the units of linearise().
 **/
float photoFocusDist()
{
    float d = mix( 0.6, photoSubject.x, smoothstep( 0.45, 0.55, photoSubject.y ) ); // a subject from conf 0.5
    return linearise( mix( photoDepthWin.y, photoDepthWin.x, d ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // The focal plane rides the music.  audioSubBass pulls it in, the kick
    // snaps it back out — a rack focus on the beat.
    float focus = focusP * ( 26.0 - 13.0 * audioSubBass + 7.0 * audioKick );
    focus = clamp( focus, nearFar.x + 1.0, nearFar.y * 0.75 );

    // A photo is no room: its own focus (the subject), half the aperture, at most PhotoMaxCoc of the blur (its depth
    // spans 8..80 units, so nearly all of it would lie far from any focus), no rack focus on the music.
    float pf = photoFocusDist();
    vec3  a, b;
    if ( arcP > 0.0 )
    {
        // Plan P2, the tension arc: the build-up opens the aperture around the focus (up to 2.5 x; a photo's blur
        // may grow to 1.5 x PhotoMaxCoc), a drop closes it to a fifth -- everything sharp -- and lets it come back.
        vec2 arc = tensionArc();
        vec2 s = arcP * vec2( depthPhoto.x > 0.5 ? PhotoArc : 1.0, depthPhoto.y > 0.5 ? PhotoArc : 1.0 );
        vec2 ka = ( 1.0 + 1.5 * arc.x * s ) * ( 1.0 - 0.8 * arc.y * s );
        vec2 kc = 1.0 + 0.5 * arc.x * s;
        a = blurAt( tex0, texDepth0, uv, depthPhoto.x > 0.5 ? pf : focus, depthValid.x,
                    ( depthPhoto.x > 0.5 ? 0.5 * apertureP : apertureP ) * ka.x,
                    depthPhoto.x > 0.5 ? PhotoMaxCoc * kc.x : 1.0 );
        b = blurAt( tex1, texDepth1, uv, depthPhoto.y > 0.5 ? pf : focus, depthValid.y,
                    ( depthPhoto.y > 0.5 ? 0.5 * apertureP : apertureP ) * ka.y,
                    depthPhoto.y > 0.5 ? PhotoMaxCoc * kc.y : 1.0 );
    }
    else
    {
        a = blurAt( tex0, texDepth0, uv, depthPhoto.x > 0.5 ? pf : focus, depthValid.x,
                    depthPhoto.x > 0.5 ? 0.5 * apertureP : apertureP, depthPhoto.x > 0.5 ? PhotoMaxCoc : 1.0 );
        b = blurAt( tex1, texDepth1, uv, depthPhoto.y > 0.5 ? pf : focus, depthValid.y,
                    depthPhoto.y > 0.5 ? 0.5 * apertureP : apertureP, depthPhoto.y > 0.5 ? PhotoMaxCoc : 1.0 );
    }

    vec3 col = mix( b, a, clamp( interpolation, 0.0, 1.0 ) );

    // A whisper of chromatic fringing in the strongly defocused corners, which
    // is what a fast lens actually does.
    float edge = length( uv - 0.5 ) * 1.4;
    col.r *= 1.0 + 0.05 * edge * ( 0.3 + apertureP );
    col.b *= 1.0 - 0.04 * edge * ( 0.3 + apertureP );

    col *= 1.0 + 0.10 * audioBeat;
    fragColor = vec4( col, 1.0 );
}
