#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file KleinQuarticHyperbolicCurve.frag
 * @brief KLEIN QUARTIC HYPERBOLIC CURVE: Riemann surface of genus 3 with maximal
 * symmetry (168 automorphisms, PSL(2,7)). Tiled by 24 regular heptagons in
 * the hyperbolic Poincaré disk with conformal circle inversions, sacred
 * geometry kaleidoscopic rosettes, and multi-angle photo reflections.
 *   audioAdvance -> translates hyperbolic isometry group PSL(2,7)
 *   audioKick    -> flashes 168 automorphism reflection lines & facet edges
 *   audioBass    -> undulates Poincaré metric curvature & heptagon inflation
 *   audioChromaHue-> shifts hyperbolic rosette color spectrum
 *
 * Per-activation variety:
 *   genusP    float hyperbolic Poincaré curvature scale    (0.5..2.2)
 *   heptagonP float {7,3} heptagonal symmetry fold depth    (0.5..2.0)
 *   speedP    float hyperbolic rotation velocity            (0.5..2.0)
 *   hueP      float sacred geometry chromatic hue offset    (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float genusP;
uniform float heptagonP;
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
mat2 rot2D( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float gns = ( genusP > 0.0 ) ? genusP : 1.0;
    float hpt = ( heptagonP > 0.0 ) ? heptagonP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Poincaré disk coordinate normalization
    // Kick-Zoom raus: 15% Vollbild-Pump pro Schlag war das "Hektische";
    // der Swell atmet langsam statt zu springen.
    vec2 z = uv * ( 2.8 / gns ) * ( 1.0 - 0.06 * audioSwell );
    z = rot2D( t * 0.25 ) * z;

    float edge_dist = 1.0;
    float reflections = 0.0;

    // 7-fold hyperbolic Coxeter reflection lines
    float angle7 = 6.2831853 / 7.0;

    for ( int iter = 0; iter < 5; ++iter )
    {
        // 7-fold angular folding
        float a = atan( z.y, z.x );
        float r = length( z );
        a = mod( a, angle7 ) - angle7 * 0.5;
        z = vec2( cos( a ), sin( a ) ) * r;

        // Hyperbolic circle inversion centered on geodesic boundary
        vec2  circle_center = vec2( 1.2 * hpt, 0.0 );
        float circle_radius = 0.65;
        vec2  diff = z - circle_center;
        float d2 = dot( diff, diff );

        if ( d2 < circle_radius * circle_radius )
        {
            z = circle_center + diff * ( circle_radius * circle_radius / max( d2, 1e-4 ) );
            reflections += 1.0;
        }

        // Boundary sphere inversion
        float r2 = dot( z, z );
        if ( r2 > 1.0 )
        {
            z /= r2;
            reflections += 1.0;
        }

        edge_dist = min( edge_dist, abs( sin( a * 7.0 ) ) );
    }

    // Photo texture mapping into folded Klein heptagonal domains
    vec2 photo_uv = fract( z * 0.5 + 0.5 );
    vec3 photo = img( photo_uv );

    // PSL(2,7) symmetry group color palette
    vec3 group_color = imgPalette( ( reflections * 0.5 + audioPhase ) * 0.159 );

    // Glowing automorphism reflection lines
    // Kick 3.0 + high 1.5 turned crescendos into one full-frame flash
    // (the largest single-frame luma jump in the whole catalogue's scan).
    float line_glow = exp( -edge_dist * 25.0 ) * ( 1.0 + min( audioKick * 0.6 + audioHigh * 0.25, 0.8 ) );

    // Combine visualizer
    vec3 col = mix( photo * 0.85, group_color, 0.45 + 0.2 * audioSwell );
    col += line_glow * vec3( 1.0, 0.9, 0.4 ) * 1.5;

    if ( audioChromaHue != 0.0 )
        if ( hue > 0.001 )
            col = hueRot( col, hue );

    // Poincaré disk boundary vignette
    float disk_r = length( uv );
    float disk_vig = smoothstep( 1.35, 0.3, disk_r );
    col *= disk_vig;

    fragColor = vec4( col, 1.0 );
}
