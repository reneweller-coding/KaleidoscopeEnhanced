#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file PlasmaLightningGlobe.frag
 * @brief PLASMA LIGHTNING GLOBE: Dielectric breakdown plasma globe with dozens of snaking,
 * branching high-voltage filament arcs striking the glass sphere, central electrode glow,
 * and electric neon magenta/cyan gas ionization trails.
 *   audioHigh    -> sparks new dielectric breakdown plasma filament branches
 *   audioKick    -> flashes high-energy arc discharges to glass boundary
 *   audioSwell   -> thickens noble gas ionization luminescence
 *   audioPhase   -> twists plasma filament tendril paths
 *
 * Per-activation variety:
 *   arcP     float plasma filament density & count         (0.5..2.2)
 *   branchP  float dielectric branching complexity         (0.5..2.0)
 *   glassP   float glass spherical refraction intensity    (0.5..1.8)
 *   hueP     float plasma ionization color shift           (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;    ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;    ///< Overall loudness, 0..1.
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid; ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;  ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;  ///< Sub-bass band level, 0..1.
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioMid;      ///< Mid band level, 0..1.
uniform float audioHigh;     ///< High band level, 0..1.
uniform float audioFlux;     ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float arcP;           ///< Arc knob: plasma filament density & count, 0.5..2.2.
uniform float branchP;        ///< Branching knob, 0..1.
uniform float glassP;         ///< Glass knob: glass spherical refraction intensity, 0.5..1.8.
uniform float hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 234.34, 435.12 ) );
    p += dot( p, p + 56.45 );
    return fract( p.x * p.y );
}

/**  Smooth value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise( vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
                mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float arc = ( arcP > 0.0 ) ? arcP : 1.0;
    float brn = ( branchP > 0.0 ) ? branchP : 1.0;
    float gls = ( glassP > 0.0 ) ? glassP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float r = length( uv );
    float a = atan( uv.y, uv.x );

    // Glass sphere boundary at r = 0.48
    float glass_r = 0.48;
    float inside_glass = step( r, glass_r );

    // Spherical glass refraction
    float glass_z = sqrt( max( glass_r * glass_r - r * r, 0.0 ) );
    vec2  refr_uv = st + ( uv / max( r, 0.01 ) ) * ( 1.0 - glass_z / glass_r ) * 0.08 * gls;
    vec3  photo = img( clamp( refr_uv, 0.0, 1.0 ) );

    // Central high-voltage graphite electrode core at r = 0.08
    float core_dist = length( uv );
    float core_glow = ( 0.005 / ( core_dist * core_dist + 0.001 ) ) * ( 1.0 + audioKick * 2.0 );
    vec3  core_color = vec3( 0.9, 0.3, 1.0 ) * core_glow;

    // Snaking plasma filaments
    vec3 filament_col = vec3( 0.0 );
    int  num_arcs = int( 8.0 * arc );

    float t = time * 2.5 + audioAdvance * 1.5;

    for ( int i = 0; i < 8; ++i )
    {
        float fi = float( i );
        float base_angle = ( fi / 8.0 ) * 6.2831853 + sin( t * 0.3 + fi ) * 0.4;

        // Tendril path with dielectric breakdown noise
        float arc_radius = r / glass_r;
        float wiggle = ( noise( vec2( arc_radius * 8.0 * brn, t + fi * 10.0 ) ) - 0.5 ) * 0.35 * arc_radius;
        float target_angle = base_angle + wiggle;

        float angle_dist = abs( mod( a - target_angle + 3.14159, 6.28318 ) - 3.14159 );
        float dist_to_arc = angle_dist * r;

        float arc_glow = ( 0.0012 / ( dist_to_arc * dist_to_arc + 0.0001 ) ) * step( 0.06, r ) * step( r, glass_r );

        // Neon magenta/electric cyan ionization gradient
        vec3 a_col = imgPalette( 0.30 * arc_radius ) * 1.5;
        filament_col += a_col * arc_glow;
    }

    // Glass rim glow and touch point flares
    float glass_rim = abs( r - glass_r );
    float rim_glow = ( 0.0015 / ( glass_rim * glass_rim + 0.00015 ) ) * ( 0.8 + 0.4 * audioSwell );
    vec3  rim_col = vec3( 0.3, 0.7, 1.0 ) * rim_glow;

    // Combine visualizer
    vec3 col = photo * 0.25 + core_color + filament_col * ( 1.0 + audioHigh * 2.0 + audioKick * 2.0 ) + rim_col;

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.7;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
