#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file InfinitePhotoZoomAbyss.frag
 * @brief INFINITE PHOTO ZOOM ABYSS: 100% viewport-filling seamless infinite
 * logarithmic Droste spiral dive into the loaded photo texture.
 * Conformal mapping w = ln(z) transforms the image into an endless
 * self-similar recursive fractal spiral with smooth multi-octave blending.
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

uniform float speedP; ///< Speed knob, 0..1.
uniform float spiralP;
uniform float zoomP; ///< Zoom knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float spi = ( spiralP > 0.0 ) ? spiralP : 1.0;
    float zm = ( zoomP > 0.0 ) ? zoomP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // Center coordinates
    float r = length( uv );
    float angle = atan( uv.y, uv.x );

    // Conformal complex logarithm w = ln(z) = ln(r) + i*theta
    float log_r = log( max( r, 1e-4 ) );

    // Logarithmic spiral transformation parameters
    // Droste condition: quantise the twist so one full turn advances u by
    // an INTEGER number of octaves — otherwise the octave blend tears at
    // the atan branch cut (the sharp edge on the left).
    float spiral_angle = max( 1.0, floor( 0.35 * spi * 6.2831853 / log( 2.0 ) + 0.5 ) )
                         * log( 2.0 ) / 6.2831853;
    float scale_factor = 2.0; // Zoom octave scale
    float log_scale = log( scale_factor );

    // Continuous forward zoom & spiral rotation
    float zoom_prog = ( time * 0.6 * spd + audioAdvance * 0.35 ) * zm;

    // Droste spiral coordinates
    float u = ( log_r - zoom_prog * log_scale + angle * spiral_angle ) / log_scale;
    float v = angle / 6.2831853 + audioPhase * 0.1;

    // Multi-octave blending to ensure 100% seamless continuity without pop-in
    float oct = fract( u );
    float oct_index = floor( u );

    // Sample two neighboring scale octaves
    vec2 uv1 = vec2( fract( oct ), fract( v ) );
    vec2 uv2 = vec2( fract( oct + 1.0 ), fract( v ) );

    // Apply kaleidoscopic mirror fold to each octave coordinate
    uv1 = abs( uv1 * 2.0 - 1.0 );
    uv2 = abs( uv2 * 2.0 - 1.0 );

    // Kick shockwave ripple
    float shock = sin( r * 18.0 - time * 8.0 ) * 0.04 * ( 1.0 + 2.0 * audioKick );
    uv1 += shock;
    uv2 += shock;

    vec3 col1 = img( fract( uv1 ) );
    vec3 col2 = img( fract( uv2 ) );

    // Smooth sinusoidal octave cross-fade
    float blend_weight = smoothstep( 0.0, 1.0, oct );
    vec3  photo_mix = mix( col1, col2, blend_weight );

    // Octave depth chromatic tint
    vec3 octave_tint = imgPalette( ( oct_index * 0.8 + audioPhase ) * 0.159 );

    // Vignetting and central vortex glow
    float center_vortex = exp( -r * 3.5 ) * ( 0.8 + 2.0 * audioKick );
    vec3  col = photo_mix * ( 0.85 + 0.35 * octave_tint ) * ( 0.8 + 0.5 * audioLevel );
    col += ( vec3( 1.0, 0.85, 0.6 ) * col1 + vec3( 0.6, 0.9, 1.0 ) ) * center_vortex;

    col = hueRot( col, hue );      // chromaHue handled inside imgPalette
    col = pow( col, vec3( 0.9 ) ); // Saturation boost
    col += vec3( 0.03, 0.02, 0.05 ) * audioSwell;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.5;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
