#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file IridescentChitinMorpho.frag
 * @brief IRIDESCENT CHITIN MORPHO: 100% viewport-filling bio-photonic dielectric
 * nanostructure grating simulation (Morpho butterfly wings & jewel beetle
 * iridescent chitin). Multi-layer Bragg interference producing pure
 * structural color shifting from peacock cyan to electric cobalt and violet.
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

uniform float gratingP;
uniform float scaleP; ///< Scale knob.
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

/**  Multi-layer Bragg dielectric reflection color
 *
 * @param cosIncidence    Cosine of the incidence angle. (in)
 * @param gratingSpacing  Spacing of the layers. (in)
 *
 * @return
 *   The reflected colour (RGB).
 **/
vec3 braggStructuralColor( float cosIncidence, float gratingSpacing )
{
    // 2 * d * cos(theta) = m * lambda
    float opt_path = 2.0 * gratingSpacing * cosIncidence;

    // Constructive interference for RGB wavelengths
    float r = pow( max( cos( opt_path * 14.0 - 0.5 ), 0.0 ), 4.0 );
    float g = pow( max( cos( opt_path * 16.5 - 1.2 ), 0.0 ), 4.0 );
    float b = pow( max( cos( opt_path * 19.0 - 2.0 ), 0.0 ), 4.0 );

    // Morpho peacock iridescent base
    vec3 peacock_cyan = vec3( 0.0, 0.85, 1.0 );
    vec3 cobalt_blue = vec3( 0.1, 0.35, 0.95 );
    vec3 deep_violet = vec3( 0.6, 0.10, 0.90 );

    vec3 col = mix( peacock_cyan, cobalt_blue, smoothstep( 0.4, 0.8, cosIncidence ) );
    col = mix( col, deep_violet, smoothstep( 0.8, 1.0, cosIncidence ) );
    col += vec3( r, g, b ) * 1.5;

    return col;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float grt = ( gratingP > 0.0 ) ? gratingP : 1.0;
    float scl = ( scaleP > 0.0 ) ? scaleP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Microscopic scale-tile pattern (overlapping butterfly scales)
    vec2 scale_coord = uv * 8.0 * scl;
    vec2 cell = floor( scale_coord );
    vec2 f = fract( scale_coord ) - vec2( 0.5 );

    // Scale ribbing nanostructure lines
    float rib_lines = sin( f.x * 40.0 * grt + sin( f.y * 20.0 + t ) * 2.0 );
    float ribbing = smoothstep( -0.2, 0.8, rib_lines );

    // Viewing angle incidence calculation
    float r = length( uv );
    float angle = atan( uv.y, uv.x );
    float cos_theta = clamp( 1.0 - r * 0.6 + 0.3 * sin( angle * 4.0 + t ), 0.1, 1.0 );

    // Dynamic grating spacing modulated by audio
    float grating_d = ( 1.0 + 0.2 * audioBass + 0.15 * ribbing );
    vec3  struct_color = braggStructuralColor( cos_theta, grating_d );

    // Photo texture projection decomposed through photonic crystal
    vec2 photo_uv = uv * 0.5 + vec2( 0.5 ) + vec2( cos( t * 0.2 ), sin( t * 0.3 ) ) * 0.1;
    vec3 photo_base = img( fract( photo_uv ) );

    // Metallic chitin specular sheen
    float spec_sheen = pow( max( cos_theta, 0.0 ), 16.0 ) * ( 0.8 + 1.2 * audioHigh );

    // Flash wave across scales on beat kick
    float flash_wave = exp( -abs( r - fract( time * 0.7 ) * 1.5 ) * 6.0 ) * audioKick * 2.5;

    vec3 col = ( struct_color * 1.8 + photo_base * 0.6 ) * ( 0.7 + 0.3 * ribbing );
    col += vec3( 1.0 ) * spec_sheen * 1.2 + struct_color * flash_wave;

    col = hueRot( col, audioChromaHue + hue );
    col = pow( col, vec3( 0.9 ) ); // Saturation boost
    col += vec3( 0.02, 0.05, 0.08 ) * audioSwell;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.5;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
