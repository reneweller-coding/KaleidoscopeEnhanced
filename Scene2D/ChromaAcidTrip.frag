#version 330 core
/*****************************************************************************\
 *                              ChromaAcidTrip.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  CHROMA ACID TRIP: Hypnotic psychedelic feedback vortex with melting contour lines, reaction-diffusion spirals,
 *  liquid rainbow gradients, optical warp displacement, and high-energy audio-driven color state transformations.
 *
 *    audioLevel   -> drives feedback displacement velocity & melt intensity
 *    audioKick    -> triggers chromatic inversion flash & color ripple shockwaves
 *    audioChromaHue-> rotates liquid psychedelic color spectrum
 *    audioSwell   -> widens feedback vortex expansion & saturation
 *
 *  Per-activation variety:
 *    meltP      float liquid contour melting intensity     (0.5..2.2)
 *    feedbackP  float recursive feedback zoom factor       (0.5..1.8)
 *    speedP     float psychedelic swirl velocity           (0.5..1.8)
 *    hueP       float base hue palette shift               (0..6.28)
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

uniform float meltP;     ///< Melt knob: liquid contour melting intensity, 0.5..2.2.
uniform float feedbackP; ///< Feedback knob: recursive feedback zoom factor, 0.5..1.8.
uniform float speedP;    ///< Speed knob, 0..1.
uniform float hueP;      ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Hypnotic psychedelic acid color map
 *
 * @param t  Position on the palette. (in)
 *
 * @return
 *   The colour (RGB).
 **/
vec3 acidPalette( float t )
{
    vec3 a = vec3( 0.5, 0.5, 0.5 );
    vec3 b = vec3( 0.5, 0.5, 0.5 );
    vec3 c = vec3( 2.0, 1.0, 0.0 );
    vec3 d = vec3( 0.5, 0.20, 0.25 );
    return a + b * cos( 6.28318 * ( c * t + d ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float mlt = ( meltP > 0.0 ) ? meltP : 1.0;
    float fdb = ( feedbackP > 0.0 ) ? feedbackP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.2;

    // Psychedelic polar coordinates
    float r = length( uv );
    float a = atan( uv.y, uv.x );

    // Multi-arm logarithmic spiral feedback
    float arms = 7.0;
    float spiral = a * arms + log( max( r, 0.01 ) ) * 12.0 * fdb - t * 3.0;

    // Melting sinusoidal wave contours
    vec2  melt_coord = uv * 4.0;
    float wave1 = sin( melt_coord.x + sin( melt_coord.y * 1.5 + t ) * 2.0 * mlt );
    float wave2 = cos( melt_coord.y + sin( melt_coord.x * 1.5 - t ) * 2.0 * mlt );
    float wave3 = sin( ( melt_coord.x + melt_coord.y ) * 1.2 + a
                       + 0.2 * ( log( max( r, 0.01 ) ) * 12.0 * fdb - t * 3.0 )
                       + audioBass * 3.0 ); // a*1: integer coeff = no atan seam

    float acid_pattern = ( wave1 + wave2 + wave3 ) / 3.0;

    // Psychedelic contour isolines (topographic acid bands)
    float contours = sin( acid_pattern * 18.0 + spiral + audioPhase * 4.0 );
    float isolines = smoothstep( 0.7, 0.95, abs( contours ) );

    // Vibrant rainbow color assignment
    float color_phase = acid_pattern * 1.5 + r * 0.8 - t * 0.5 + audioChromaHue;
    vec3  acid_col = acidPalette( color_phase );
    acid_col = mix( acid_col, vec3( 1.0 ) - acid_col, isolines * 0.8 );

    // Optical warp distortion for photo sampling
    vec2 photo_warp = st + vec2( wave1, wave2 ) * 0.04 * mlt * ( 1.0 + audioKick * 0.8 );
    vec3 photo = img( clamp( photo_warp, 0.0, 1.0 ) );

    // Combine psychedelic visualizer
    vec3 col = mix( acid_col, photo * 1.4, 0.4 + 0.3 * audioLevel );
    col += isolines * vec3( 1.0, 0.9, 0.2 ) * ( 0.8 + audioHigh * 1.2 );

    // Audio-reactive chromatic solarization flash on kick
    if ( audioKick > 0.65 )
    {
        col = abs( col - vec3( audioKick * 0.8 ) );
    }

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Vignette
    vec2  v_uv = st * ( 1.0 - st.yx );
    float vig = v_uv.x * v_uv.y * 15.0;
    col *= clamp( pow( vig, 0.25 ), 0.0, 1.0 );

    fragColor = vec4( col, 1.0 );
}
