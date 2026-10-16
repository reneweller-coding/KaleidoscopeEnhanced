#version 330 core
/*****************************************************************************\
 *                              ReactionDiffusionMandala.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  The living Gray-Scott reaction-diffusion field (`texSim`), sampled through TWO nested kaleidoscopic mirror-folds
 *  at different radii and blended -- a mandala-within-a-mandala, always on (unlike ReactionDiffusion.frag, where
 *  the fold is an occasional per-activation option and the field mostly reads as liquid metal draped over the
 *  photo).
 *
 *  Colour comes from imgPalette (the house-standard photo-arc palette, key-locked via audioChromaHue) modulated by
 *  the field's own concentration, not from the photo directly -- the picture supplies the colour family, the
 *  simulation supplies the structure. audioPhase spins the outer fold, audioBeat pulses the segment count's
 *  apparent sharpness, audioSwell breathes the inner-layer zoom, audioOnset flashes the mandala's rim. If the
 *  simulation is unavailable, texSim reads 0 and a dim, still symmetric mandala outline remains (the fold itself
 *  needs no simulation state to look intentional).
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform sampler2D texSim;        ///< reaction-diffusion state (R=A, G=B)
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioOnset;     ///< Onset envelope (any instrument), 0..1.
uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioSwell;     ///< slow loudness swell -> inner-layer zoom breathes
uniform float audioBarPhase;  ///< 0..1 per bar -> gentle per-bar palette wander
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   sidesP;     ///< outer fold segment count (0 -> 9; 5..14)
uniform float innerZoomP; ///< inner layer's zoom relative to the outer (0 -> 2.4; 1.8..3.2)
uniform float spinP;      ///< outer-fold spin speed multiplier (0 -> 1.0; 0.5..1.8)
uniform float glowP;      ///< overall brightness (0 -> 1.0; 0.7..1.4)

const float Pi = 3.14159265358979; ///< Pi.

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}
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
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue, jump-free)
 * with a slow advance drift, valence shapes saturation.
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

/**  Kaleidoscope fold of the coordinate with the given mirrors.
 *
 * @param p      The coordinate (centred). (in)
 * @param sides  Number of mirrors. (in)
 *
 * @return
 *   The folded coordinate.
 **/
vec2 kaleido( vec2 p, float sides )
{
    float a = atan( p.y, p.x );
    float r = length( p );
    float seg = Pi / sides;
    a = mod( a + Pi, 2.0 * seg ) - seg;
    a = abs( a );
    return vec2( cos( a ), sin( a ) ) * r;
}

/**  Blurred B-field sample (2px cross) -- low-passes the sim so per-step noise doesn't shimmer the fold's fine
 * detail.
 *
 * @param suv  Coordinate in the simulation. (in)
 * @param px   Size of a texel. (in)
 *
 * @return
 *   The smoothed B concentration.
 **/
float bSmooth( vec2 suv, vec2 px )
{
    float b = texture( texSim, suv ).g * 2.0;
    b += texture( texSim, suv + vec2( 2.0 * px.x, 0.0 ) ).g;
    b += texture( texSim, suv - vec2( 2.0 * px.x, 0.0 ) ).g;
    b += texture( texSim, suv + vec2( 0.0, 2.0 * px.y ) ).g;
    b += texture( texSim, suv - vec2( 0.0, 2.0 * px.y ) ).g;
    return b / 6.0;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 px = 1.0 / resolution;

    // Per-activation character (constant during the scene):
    float sides_v = ( sidesP < 5 ) ? 8.0 : float( sidesP );
    float inner_z = ( innerZoomP <= 0.01 ) ? 2.4 : innerZoomP;
    float spin_v = ( spinP <= 0.01 ) ? 1.0 : spinP;
    float glow_v = ( glowP <= 0.01 ) ? 1.0 : glowP;

    vec2 cp = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // Outer fold: spins with the integrated audio phase (jump-free).
    float outer_a = audioPhase * 0.6 * spin_v + time * 0.02 * spin_v;
    vec2  op = rot( outer_a ) * cp;
    vec2  ouv = kaleido( op, sides_v ) * 0.9 + 0.5;
    float ob = bSmooth( ouv, px );

    // Inner fold: nested at a deeper zoom, counter-spinning, breathing with
    // the slow loudness swell -- a mandala seen through a mandala.
    float inner_zoom = inner_z * ( 1.0 + 0.15 * audioSwell );
    vec2  ip = rot( -outer_a * 1.7 ) * ( op * inner_zoom );
    vec2  iuv = kaleido( ip, sides_v * 0.5 ) * 0.9 + 0.5;
    float ib = bSmooth( iuv, px );

    // Structure from the field (not colour): the outer layer draws the bulk
    // shape, the inner layer adds fine nested detail, weighted by depth.
    float edge = clamp( length( vec2( dFdx( ob ), dFdy( ob ) ) ) * 40.0, 0.0, 1.0 );
    float structure = ob * 0.7 + ib * 0.45;

    // Colour from the picture's own palette arc, modulated by the field --
    // the simulation supplies WHERE, the photo supplies WHAT COLOUR (V8b/V8d:
    // no extra hue-rotation on top of imgPalette).
    vec3 base_col = imgPalette( structure * 1.4 + 0.1 * sin( audioBarPhase * 6.28318 ) ) * 1.6;
    vec3 inner_col = imgPalette( ib * 1.4 + 0.35 ) * 1.6;

    vec3 col = base_col * ( 0.55 + 1.3 * ob ) + inner_col * ( 0.4 + 0.9 * ib ) * 0.7;
    col += edge * ( 0.5 + 0.6 * audioBeat + 0.35 * audioOnset ) * base_col;

    // Radial vignette so the fold reads as a mandala with a centre, not a
    // wallpaper tile filling the whole frame edge-to-edge.
    float r_fall = 1.0 - smoothstep( 0.35, 0.95, length( cp ) );
    col *= mix( 0.72, 1.0, r_fall );

    col *= glow_v * ( 1.25 + 0.4 * audioCentroid );
    col *= 1.05 + 0.4 * audioLevel;

    // Catalogue review: soft-knee exposure -- hot audio compresses instead
    // of clipping the whole frame to white.
    vec3 cat_tone = ( clamp( col, 0.0, 1.0 ) ) * 0.75;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    cat_tone = clamp( pow( max( cat_tone, 0.0 ), vec3( 2.0 ) ) * 1.30, 0.0, 1.0 ); // washed-out fix round 2: gamma
                                                                                   // crush
    fragColor = vec4( cat_tone, 1.0 );
}
