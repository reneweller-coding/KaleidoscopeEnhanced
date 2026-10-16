#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file MobiusOrbs.frag
 * @brief Adapted from an untitled Shadertoy Möbius-inversion orb field (pasted by the
 * user; exact page/author not given).  A ring of glowing orbs seen through a
 * Möbius (1/r^2) inversion, swirling into a hypnotic kaleidoscopic knot.
 *
 * Adapted to our engine: GLSL 1.20 (gl_FragCoord/resolution/time), jump-free
 * audio motion (host-integrated audioAdvance added to time, never time*audio),
 * beat/onset brightness, mood grade, and IMAGE-DRIVEN colour: a drifting crop
 * of the source picture (imgPal) rotates the palette's hue (hueRot) so the orb
 * colours come from the ever-changing image.  Only "Variant 01" of the
 * original's three `#define` presets is used (the other two were commented out
 * in the source and would just swap the numeric constants below).
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioPhase;    ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioBeat;     ///< Beat envelope, 0..1.
uniform float audioOnset;    ///< Onset envelope (any instrument), 0..1.
uniform float audioLevel;    ///< Overall loudness, 0..1.
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioCentroid; ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;  ///< Mood valence: 0 dark .. 1 bright.

uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
// Per-activation variety (re-rolled by the engine each time the effect comes
// on): the original's three #define "variants" differed mainly in these very
// numbers, so rolling them turns one shader into a whole family of looks.
// All default to the "Variant 01" values when 0 / absent from the config.
uniform float zoomP;    ///< 0 -> 0.07   (0.27 = original "Variant 02" look)
uniform float orbSizeP; ///< 0 -> 6.46
uniform float radiusP;  ///< 0 -> 11.0
uniform float stretchP; ///< 0 -> 1.2    max extra ellipse aspect (length variance)
uniform float shapeP;   ///< 0 -> 0.6    circle -> superellipse shape variance

const float Pi = 3.141592; ///< Pi.
const float Orbs = 20.0;   ///< Number of orbs.

const float Contrast = 0.13;    ///< Contrast of the orbs.
const float Colorshift = 10.32; ///< Colour shift between the orbs.
const float CosMul = 2.38;      ///< Amplitude of the cosine warp.
const float XMul = 0.28;        ///< Frequency of the cosine warp in x.
const float YDivide = 4.99;     ///< Wavelength of the warp in y.
const float XDivide = 6.27;     ///< Wavelength of the sine warp in x.

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv )
             + ( 1.0 - interpolation ) * texture( tex1, uv ) )
        .rgb;
}

/**  A colour of the photo along a slowly wandering arc (palette lookup).
 *
 * @param x  Position along the arc (radians). (in)
 *
 * @return
 *   The photo's colour there (RGB).
 **/
vec3 imgPal( float x )
{
    vec2 cc = vec2( 0.5 )
              + 0.32 * vec2( cos( time * 0.045 + audioPhase * 0.12 ), sin( time * 0.033 + audioPhase * 0.09 ) );
    return img( fract( cc + 0.24 * vec2( cos( x ), sin( x * 1.31 ) ) ) );
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

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rotate( float a )
{
    return mat2( cos( a ), -sin( a ), sin( a ), cos( a ) );
}

/**  One glowing blob.
 *
 * @param uv          The point. (in)
 * @param p           Negated centre of the orb. (in)
 * @param i           Index of the orb. (in)
 * @param stretchAmt  Elongation. (in)
 * @param shapeAmt    Round (0) .. squarish (1). (in)
 *
 * @return
 *   The distance to the orb (for its glow).
 *
 * No longer a plain circle: each orb is an ELLIPSE with its own orientation (golden-angle spread over the index) whose
 * aspect drifts slowly and stretches with the bass (loudness -> size/elongation, per the crossmodal-correspondence
 * research), and a per-orb SHAPE that blends from round toward a soft superellipse (squarish) - so the field is a
 * mixture of long streaks, plump ovals and rounded lozenges instead of uniform circles.
 **/
float orbDist( vec2 uv, vec2 p, float i, float stretchAmt, float shapeAmt )
{
    vec2 d = uv + p;

    // Per-orb orientation, drifting on jump-free clocks only.
    float oa = i * 2.399963 + time * 0.03 + audioPhase * 0.05;
    d = rotate( oa ) * d;

    // Length variance: per-orb aspect, breathing slowly, pumped by the bass.
    float asp = 1.0 + stretchAmt * ( 0.5 + 0.5 * sin( i * 1.7 + time * 0.11 ) ) * ( 1.0 + 0.30 * audioBass );
    d.x /= asp;

    // Shape variance: exponent 2 = circle, higher = soft superellipse.
    float k = 2.0 + shapeAmt * ( 0.5 + 0.5 * sin( i * 2.3 - time * 0.07 ) ) * 2.0;
    return pow( pow( abs( d.x ), k ) + pow( abs( d.y ), k ), 1.0 / k );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  frag_coord = gl_FragCoord.xy;
    float tt = time + audioAdvance * 2.0; // jump-free (host-integrated) clock

    // Per-activation parameters (0 / absent -> "Variant 01" defaults).
    float zoom_v = ( zoomP <= 0.001 ) ? 0.07 : zoomP;
    float orb_size = ( orbSizeP <= 0.001 ) ? 6.46 : orbSizeP;
    float radius_v = ( radiusP <= 0.001 ) ? 11.0 : radiusP;
    float stretch_v = ( stretchP <= 0.001 ) ? 1.2 : stretchP;
    float shape_v = ( shapeP <= 0.001 ) ? 0.6 : shapeP;

    vec2 uv = ( 2.0 * frag_coord - resolution ) / resolution.y;
    // NOTE: accumulate in a LOCAL (acc), not in a shadowing "vec4 fragColor"
    // -- a local of that name hides the out variable, the real output is
    // never written and the scene renders solid black (found by the metric
    // scan; core-migration artefact).
    vec4 acc = vec4( 0.0 );
    uv *= zoom_v;
    // CAPPED Mobius inversion.  A bare 1/r^2 inversion sends the screen centre
    // to infinity: every orb then sits at an effectively infinite distance and
    // the whole central disc collapsed to one hot singularity while the rest of
    // the picture sat outside the orb field entirely (measured occ 0.01).
    // Flooring dot(uv,uv) at r_min^2 caps |uv| at 1/r_min and -- because the cap
    // engages exactly where |uv| == r_min -- does it continuously, so the centre
    // becomes a smooth plateau of orbs instead of a blown-out point.  r_min
    // tracks zoom_v so a rolled zoom keeps the same proportions.
    float r_min = 0.28 * zoom_v;
    uv /= max( dot( uv, uv ), r_min * r_min );
    uv = uv * rotate( tt / 10.0 + audioPhase * 0.05 );

    for ( float i = 0.0; i < Orbs; i += 1.0 )
    {
        uv.x += cos( uv.y / YDivide - tt );
        uv.y += CosMul * cos( uv.x * XMul ) - sin( uv.x / XDivide - tt );
        float t = i * Pi / Orbs * 2.0;
        // tan() runs away near t = pi/2 and 3pi/2: two of the twenty orbs were
        // being flung ~3e7 units off screen, contributing a flat constant and
        // leaving that side of the ring empty.  Clamping keeps the projective
        // sweep of the ring but holds every orb inside the picture.
        float x = radius_v * clamp( tan( t ), -4.0, 4.0 );
        float y = radius_v * cos( t + tt / 10.0 );
        vec2  position = vec2( x, y );
        vec3  color = imgPalette( 0.0032 * ( uv.x + uv.y ) + 0.5 * i / Colorshift );
        // Normalise the palette to a fixed LEVEL and keep only its chroma, so the
        // orb field's exposure no longer rides on whichever slide happens to be up.
        vec3 oc = color / max( dot( color, vec3( 0.3333 ) ), 0.15 ) * 0.55;

        // Accumulate the orbs' glow DIRECTLY.
        // The old form was `acc += 0.65 - pow(orb_size/dist * colour, 0.13)`, a
        // difference of two near-equal numbers: an exponent of 0.13 crushes the
        // three decades that orb_size/dist actually spans (0.1 .. 60 here) into the
        // range 0.62 .. 0.77, i.e. the "glow" was essentially the SAME VALUE at
        // every pixel by construction. Subtracting a 0.65 bias from it left a
        // residual that hovered around zero and whose sign flipped on nothing more
        // than orb distance, so `max(-acc, 0.0)` clipped almost the entire frame to
        // black (measured luma 0.002, occ 0.01) and what survived had no range.
        // A plain inverse-distance falloff with a softening gap gives real bright
        // cores and real dark gaps, and is independent of the photo's exposure.
        float dist = orbDist( uv, position, i, stretch_v, shape_v );
        float g = orb_size / ( dist + 0.45 );
        acc.rgb += oc * pow( g, 1.8 );
    }

    // Exponential tone-map: responds logarithmically, so the exposure stays sane
    // across the wide range of glow sums the rolled parameters produce, and it can
    // never exceed 1.0 no matter how hot the field gets.
    vec3 col = 1.0 - exp( -max( acc.rgb, 0.0 ) * 0.070 );
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix( vec3( 0.75, 0.85, 1.20 ), vec3( 1.25, 1.05, 0.75 ), audioCentroid );
    float lum = dot( col, vec3( 0.299, 0.587, 0.114 ) );
    col = mix( vec3( lum ), col, 0.6 + 0.6 * audioValence );

    // Image-driven colour: a drifting crop of the picture rotates the hue.
    float himg = dot( imgPal( dot( col, vec3( 0.333 ) ) * 6.0
                              + length( frag_coord / resolution - 0.5 ) * 4.0 ),
                      vec3( 0.333 ) );
    col = hueRot( col, ( himg - 0.5 ) * 3.0 + time * 0.05 );

    col *= 0.9 + 0.5 * audioLevel;

    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
