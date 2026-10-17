#version 330 core
/*****************************************************************************\
 *                              HeliosphericCurrentSheet.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  HELIOSPHERIC CURRENT SHEET: Rotating Parker spiral "ballerina skirt" current sheet separating opposite magnetic
 *  polarities throughout the solar system.
 *
 *  Wavy sector boundary crossings, solar wind stream turbulence, and undulating plasma membrane photo reflections.
 *
 *    audioAdvance -> rotates Parker spiral sector boundaries & solar wind
 *    audioKick    -> flashes interplanetary magnetic reconnection sheets
 *    audioBass    -> undulates ballerina skirt wave amplitude & tilt
 *    audioCentroid-> shifts solar wind proton/electron temperature grading
 *
 *  Per-activation variety:
 *    spiralP float Parker spiral arm winding tightness   (0.5..2.2)
 *    skirtP  float ballerina skirt vertical waviness     (0.5..2.0)
 *    speedP  float solar rotation velocity                (0.5..2.0)
 *    hueP    float interplanetary magnetic hue offset     (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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

uniform float spiralP; ///< Spiral knob: Parker spiral arm winding tightness, 0.5..2.2.
uniform float skirtP;  ///< Skirt knob: ballerina skirt vertical waviness, 0.5..2.
uniform float speedP;  ///< Speed knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float spr = ( spiralP > 0.0 ) ? spiralP : 1.0;
    float skr = ( skirtP > 0.0 ) ? skirtP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    float r = length( uv );
    float angle = atan( uv.y, uv.x );

    // Archimedian / Parker spiral: r(theta) = v / omega * theta
    // Spiral phase: angle - r * winding - t
    float spiral_arm = angle - r * 8.0 * spr - t * 2.5;

    // Ballerina skirt wavy undulation: z(r, theta) = r * sin(4 * spiral_arm)
    float skirt_wave = sin( spiral_arm * 2.0 ) * ( 0.45 * skr + 0.2 * audioBass );

    // Sector boundary current sheet (where magnetic polarity flips B_r = 0)
    float sheet_dist = abs( skirt_wave );
    float current_sheet = exp( -sheet_dist * 16.0 );

    // Solar wind radial stream turbulence
    float turbulence = sin( r * 40.0 - t * 10.0 + angle * 6.0 ) * 0.08 * ( 1.0 + audioHigh );

    // Photo texture mapping along spiral current sheet
    vec2 photo_uv = st + vec2( sin( spiral_arm ), cos( spiral_arm ) ) * 0.04 * ( 1.0 + audioKick * 0.7 );
    vec3 photo = img( fract( photo_uv ) );

    // Magnetic polarity palette: North Sector (Cyan/Blue), South Sector (Amber/Red), Current Sheet (Gold/White)
    vec3 north_sector = vec3( 0.05, 0.4, 0.9 );
    vec3 south_sector = vec3( 0.9, 0.3, 0.1 );
    vec3 sheet_gold = vec3( 1.0, 0.95, 0.5 );

    float polarity = smoothstep( -0.2, 0.2, skirt_wave );
    vec3  sector_color = mix( north_sector, south_sector, polarity );

    // Magnetic reconnection flash on kick
    float reconnection = current_sheet * ( audioKick * 3.5 + audioSubBass * 1.2 );

    // Combine visualizer
    vec3 col = mix( sector_color * 0.4, photo * 0.9, 0.5 + 0.2 * audioLevel );
    col += current_sheet * sheet_gold * ( 1.2 + audioSwell * 0.8 );
    col += reconnection * vec3( 1.0, 0.98, 0.85 ) * 1.5;
    col += turbulence * vec3( 0.3, 0.8, 1.0 );

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue );
    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.35, 0.35, r );
    col *= vig;

    fragColor = vec4( col, 1.0 );
}
