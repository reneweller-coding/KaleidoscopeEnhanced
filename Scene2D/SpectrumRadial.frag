#version 330 core
/*****************************************************************************\
 *                              SpectrumRadial.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Radial spectrum analyzer with 32 frequency bands (mirrored into 64 wedges) radiating around a central disc that
 *  shows the source image.
 *
 *  Each wedge is a bar whose length tracks that band's live level, filled with the image and tinted across the
 *  rainbow by frequency; the whole ring pulses on the beat. Far more bands and far more movement than the old
 *  6-band version.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioSpectrum[32]; ///< 32 log-spaced bands, 0..1 (self-normalised)
uniform float audioBeat;         ///< Beat envelope, 0..1.
uniform float audioBeatPhase;    ///< Position within the current beat, 0..1.
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioPhase;        ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioBarPhase;     ///< 0..1 per bar -> gentle rainbow sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   wedgesP;        ///< wedge count       (0 -> 64; 44..96)
uniform float petalLenP;      ///< petal max length  (0 -> 0.72; 0.5..0.95)
uniform float rotP;           ///< Rot knob, 0.5..2.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAdvance;   ///< ring rotation speed multiplier (0 -> 1.0)

const float Pi = 3.14159265358979; ///< Pi.

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

/**  HSV (all 0..1) to RGB.
 *
 * @param c  Hue, saturation and value, all 0..1. (in)
 *
 * @return
 *   The RGB colour.
 **/
vec3 hsv2rgb( vec3 c )
{
    vec3 p = imgPalette( c.x ) * 1.35; // photo-arc palette (house standard)
    return c.z * mix( vec3( 1.0 ), p, c.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = gl_FragCoord.xy / resolution.xy;
    vec2  p = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / resolution.y;
    float r = length( p );

    // Per-activation character (constant during the scene):
    float W = float( ( wedgesP >= 8 ) ? wedgesP : 64 );
    float half_w = W * 0.5;
    float petal_l = ( petalLenP <= 0.01 ) ? 0.72 : petalLenP;
    float rot_v = ( rotP <= 0.01 ) ? 1.0 : rotP;

    float a = atan( p.y, p.x ) + ( audioPhase * 0.15 + time * 0.01 ) * rot_v;
    float ang = a / ( 2.0 * Pi ) + 0.5; // 0..1

    // W wedges -> mirrored onto the 32 bands (low freq sweeping around).
    float wf = floor( fract( ang ) * W );
    float m = ( wf < half_w ) ? wf : ( W - 1.0 - wf );
    float binf = clamp( m * 31.0 / ( half_w - 1.0 ), 0.0, 31.0 );
    int   bin = int( binf );
    float amp = audioSpectrum[bin];

    float bar_edge = 0.20 + petal_l * amp;
    float petal = smoothstep( bar_edge, bar_edge - 0.03, r ) * smoothstep( 0.16, 0.19, r );
    float disc = smoothstep( 0.19, 0.13, r );

    // Image sampled polar & mirrored inside each wedge so the picture radiates.
    float wedge = abs( fract( ang * half_w ) * 2.0 - 1.0 );
    vec2  pimg = vec2( wedge, clamp( ( r - 0.14 ) * 1.5, 0.0, 1.0 ) );
    vec3  pic = img( pimg );

    // Rainbow across the bands + a beat-phase shimmer + per-bar sweep.
    float hue = fract( binf / 32.0 * 0.85 + 0.10 * audioValence + time * 0.02
                       + 0.10 * sin( audioBarPhase * 2.0 * Pi ) );
    vec3  band = hsv2rgb( vec3( hue, 0.75, 1.0 ) );
    float pulse = 0.5 + 0.5 * sin( audioBeatPhase * 2.0 * Pi );

    vec3 col = img( uv ) * ( 0.12 + 0.55 * disc ); // faint backdrop + disc
    col += pic * petal * band * ( 0.6 + 0.9 * amp + 0.4 * pulse + audioBeat );
    col += band * amp * exp( -5.0 * max( r - bar_edge, 0.0 ) ) * 0.35; // outer glow

    // ORBITING DOTS: each wedge carries a bright bead riding at its band's
    // amplitude radius - the ring becomes a swarm of dancing satellites.
    float wc = ( wf + 0.5 ) / W;                        // wedge centre (0..1)
    float d_ang = ( fract( ang ) - wc ) * 2.0 * Pi * r; // arc offset
    float dot_r = 0.24 + ( petal_l - 0.06 ) * amp;
    float bead = smoothstep( 0.022, 0.006, length( vec2( d_ang, r - dot_r ) ) );
    col += band * bead * ( 0.45 + 0.55 * amp + 0.5 * audioBeat );

    // Tempo-locked ripple rings expanding over the centre disc (continuous
    // beat phase -> they travel smoothly and land on the beat).
    float ripple = pow( 0.5 + 0.5 * cos( 2.0 * Pi * ( r * 3.5 - audioBeatPhase ) ), 10.0 );
    col += band * ripple * disc * audioBeat * 0.30;

    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
