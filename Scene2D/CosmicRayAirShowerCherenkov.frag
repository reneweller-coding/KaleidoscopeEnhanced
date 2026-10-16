#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file CosmicRayAirShowerCherenkov.frag
 * @brief COSMIC RAY AIR SHOWER CHERENKOV: Ultra-high-energy cosmic ray striking
 * the upper atmosphere, generating a cascading air shower of billions of
 * relativistic secondary particles, nitrogen fluorescence in near-UV,
 * and forward-directed atmospheric Cherenkov light cones.
 *   audioAdvance -> drives relativistic particle cascade propagation
 *   audioKick    -> fires primary cosmic ray impact & giant Cherenkov shock flash
 *   audioBass    -> widens lateral particle distribution cone
 *   audioHigh    -> excites molecular nitrogen UV fluorescence lines
 *
 * Per-activation variety:
 *   cascadeP float air shower particle multiplication depth (0.5..2.2)
 *   fluorP   float nitrogen fluorescence UV radiance        (0.5..2.0)
 *   speedP   float cascade arrival velocity                 (0.5..2.0)
 *   hueP     float atmospheric fluorescence hue offset      (0..6.28)
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

uniform float cascadeP; ///< Cascade knob: air shower particle multiplication depth (0.5..2.2).
uniform float fluorP;   ///< Fluor knob: nitrogen fluorescence UV radiance, 0.5..2.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  2D Noise hash
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 523.34, 825.21 ) );
    p += dot( p, p + 41.32 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float csc = ( cascadeP > 0.0 ) ? cascadeP : 1.0;
    float flr = ( fluorP > 0.0 ) ? fluorP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.45 * spd + audioAdvance * 0.22;

    // Air shower axis (top center to bottom)
    float shower_y = uv.y;
    float shower_x = uv.x - sin( shower_y * 1.5 + t * 0.5 ) * 0.1;

    // Lateral particle spread (Greisen function profile: widens towards bottom)
    float altitude = clamp( shower_y + 0.6, 0.01, 1.2 );
    float lateral_spread = pow( 1.2 - altitude, 1.5 ) * ( 0.45 * csc + 0.2 * audioBass );

    // Lateral distance from shower core
    float dist_to_core = abs( shower_x ) / max( lateral_spread, 0.01 );
    float core_luminance = exp( -dist_to_core * 4.0 );

    // Cascading secondary particles (shower tracks)
    vec2  track_coord = vec2( shower_x * 25.0, shower_y * 15.0 - t * 8.0 );
    vec2  spark_f = fract( track_coord ) - 0.5;
    float particle_sparks = pow( hash21( floor( track_coord ) ), 8.0 )
                            * exp( -dot( spark_f, spark_f ) * 14.0 ) // round spark, not a filled cell
                            * ( audioHigh * 3.0 + 0.5 );

    // Forward Cherenkov light cone (bright circular ring expanding downward)
    float cherenkov_phase = fract( t * 1.8 + audioPhase * 0.5 );
    float cherenkov_y = 0.5 - cherenkov_phase * 1.0;
    float cherenkov_dist = abs( shower_y - cherenkov_y );
    float cherenkov_ring = exp( -cherenkov_dist * 20.0 ) * exp( -abs( shower_x ) * 3.0 ) * ( audioKick * 3.5 + 0.8 );

    // Photo texture mapping into atmospheric air shower ionization
    vec2 photo_uv = st + vec2( sin( track_coord.y ), cos( track_coord.x ) ) * 0.03 * ( 1.0 + audioKick * 0.5 );
    vec3 photo = img( fract( photo_uv ) );

    // Near-UV Nitrogen fluorescence & Cherenkov blue palette
    vec3 night_sky = vec3( 0.02, 0.03, 0.08 );
    vec3 nitrogen_violet = vec3( 0.5, 0.2, 0.95 );
    vec3 cherenkov_cyan = vec3( 0.1, 0.85, 1.0 );
    vec3 impact_white = vec3( 0.95, 0.98, 1.0 );

    // Combine visualizer
    vec3 col = mix( night_sky, photo * 0.8, 0.35 + 0.2 * audioLevel );
    col += core_luminance * nitrogen_violet * ( 1.0 + audioSwell * 0.8 ) * flr;
    col += cherenkov_ring * cherenkov_cyan * 1.8;
    col += particle_sparks * impact_white * 2.0;

    // Primary impact flash at the top on kick
    float impact_flash = exp( -length( uv - vec2( 0.0, 0.5 ) ) * 6.0 ) * audioKick * 3.0;
    col += impact_flash * impact_white;

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue );
    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.35, 0.35, length( uv ) );
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.65;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
