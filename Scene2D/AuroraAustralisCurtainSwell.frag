#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file AuroraAustralisCurtainSwell.frag
 * @brief AURORA AUSTRALIS CURTAIN SWELL: Volumetric double-sheet Antarctic Aurora
 * Australis waving along geomagnetic field lines. Atomic oxygen green emission
 * (557.7nm) and high-altitude molecular nitrogen crimson rays (630.0nm),
 * magnetic substorm surges, and polar ice pack photo reflections.
 *   audioAdvance -> drives geomagnetic auroral curtain wave undulations
 *   audioKick    -> triggers explosive geomagnetic substorm brightening
 *   audioBass    -> undulates auroral curtain vertical height & bottom fold
 *   audioCentroid-> shifts balance between oxygen green and nitrogen red
 *
 * Per-activation variety:
 *   curtainP float auroral curtain folding & sheet count (0.5..2.2)
 *   rayP     float vertical ray filament sharpness       (0.5..2.0)
 *   speedP   float auroral drift velocity                (0.5..2.0)
 *   hueP     float atmospheric ion emission hue offset   (0..6.28)
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

uniform float curtainP; ///< Curtain knob: auroral curtain folding & sheet count (0.5..2.2).
uniform float rayP;     ///< Ray knob: vertical ray filament sharpness, 0.5..2.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float crt = ( curtainP > 0.0 ) ? curtainP : 1.0;
    float ray = ( rayP > 0.0 ) ? rayP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Dual auroral curtain sheets waving horizontally across the sky
    float wave1 = sin( uv.x * 3.5 * crt + t * 2.0 ) * 0.18 + sin( uv.x * 7.0 - t * 3.0 ) * 0.08;
    float wave2 = cos( uv.x * 4.0 * crt - t * 2.5 ) * 0.18 + cos( uv.x * 8.0 + t * 2.0 ) * 0.08;

    // Distance to lower curtain boundary (bottom fold)
    float base_altitude = -0.15 + 0.1 * audioBass;
    float dist1 = uv.y - ( base_altitude + wave1 );
    float dist2 = uv.y - ( base_altitude + wave2 + 0.15 );

    // Vertical ray filaments along geomagnetic field lines
    float ray_filaments1 = pow( abs( sin( uv.x * 30.0 * ray + t * 4.0 ) ), 4.0 );
    float ray_filaments2 = pow( abs( sin( uv.x * 25.0 * ray - t * 3.5 ) ), 4.0 );

    // Volumetric curtain brightness
    float curtain1 = exp( -max( 0.0, dist1 ) * 3.5 ) * smoothstep( -0.05, 0.05, dist1 )
                     * ( 1.0 + ray_filaments1 * 0.8 );
    float curtain2 = exp( -max( 0.0, dist2 ) * 3.0 ) * smoothstep( -0.05, 0.05, dist2 )
                     * ( 1.0 + ray_filaments2 * 0.8 );

    // Geomagnetic substorm surge on kick
    float substorm = ( curtain1 + curtain2 ) * ( audioKick * 3.5 + audioHigh * 1.5 );

    // Photo texture mapping into polar ice reflection and sky
    vec2 photo_uv = st + vec2( wave1, wave2 ) * 0.04 * ( 1.0 + audioKick * 0.6 );
    vec3 photo = img( fract( photo_uv ) );

    // Ion emission colors: Oxygen 557.7nm Emerald (lower altitude), Nitrogen 630.0nm Crimson (high altitude)
    vec3 oxygen_green = vec3( 0.05, 0.98, 0.45 );
    vec3 nitrogen_red = vec3( 0.95, 0.15, 0.4 );
    vec3 ion_violet = vec3( 0.5, 0.2, 0.95 );

    float alt_factor = clamp( ( uv.y - base_altitude ) * 1.5, 0.0, 1.0 );
    vec3  aurora_col1 = mix( oxygen_green, nitrogen_red, alt_factor );
    vec3  aurora_col2 = mix( oxygen_green, ion_violet, alt_factor );

    vec3 aurora_total = curtain1 * aurora_col1 + curtain2 * aurora_col2;

    // Combine visualizer with starry polar sky
    vec3 night_sky = vec3( 0.02, 0.03, 0.08 );
    vec3 col = mix( night_sky, photo * 0.8, 0.35 + 0.2 * audioLevel );
    col += aurora_total * ( 1.2 + audioSwell * 0.8 );
    col += substorm * vec3( 1.0, 0.98, 0.9 ) * 1.5;

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue );
    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.35, 0.35, length( uv ) );
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.6;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    cat_tone /= 1.0 + 0.55 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) ); // peak knee: tame local glare, keep
                                                                               // midtones
    fragColor = vec4( cat_tone, 1.0 );
}
