#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file LiesegangPrecipitationRingArray.frag
 * @brief LIESEGANG PRECIPITATION RING ARRAY: Self-organized periodic mineral precipitation rings
 * in porous gel media. Non-linear reaction-diffusion supersaturation nucleation creates geometric
 * ring bands obeying the Jablczynski spacing law with colloidal turbidity and photo texturing.
 *   audioAdvance -> drives chemical precursor ion diffusion front velocity
 *   audioKick    -> flashes supersaturation nucleation threshold precipitate bursts
 *   audioSwell   -> widens colloidal precipitation band thickness & opacity
 *   audioCentroid-> shifts colloidal mineral precipitate absorption spectra
 *   audioPhase   -> modulates concentric ring eccentricities & branching defects
 *
 * Per-activation variety:
 *   spacingRatioP float Liesegang Jablczynski geometric ratio     (1.05..1.35)
 *   ringDensityP  float precipitation band count parameter       (4.0..14.0)
 *   colloidGlowP  float colloidal precipitate luminance gain     (0.8..2.5)
 *   diffusionP    float ion concentration diffusion steepness    (0.6..2.2)
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
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float spacingRatioP;
uniform float ringDensityP;
uniform float colloidGlowP;
uniform float diffusionP;

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

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
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
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.35 + audioAdvance * 0.3;

    // Radius with slight eccentric deformation
    float theta = atan( uv.y, uv.x );
    float deform = sin( theta * 3.0 + audioPhase * 0.5 ) * 0.04;
    float r = length( uv ) + deform;

    // Liesegang geometric spacing law: x_{n+1} / x_n = 1 + P (Jablczynski constant)
    // In log-space, rings are evenly spaced: log(r)
    float r_param = ( spacingRatioP > 0.01 ? spacingRatioP : 1.18 );
    float log_r = log( max( r * 3.0, 0.05 ) ) / log( r_param );

    // Dichte gedeckelt (Moire) und Drift halbiert.
    float ring_phase = log_r * min( ( ringDensityP > 0.01 ? ringDensityP : 6.0 ), 9.0 ) - t * 1.0;

    // Sharp precipitate band profile (supersaturation threshold nucleation)
    float local_band = fract( ring_phase ) - 0.5;
    float precip_band = exp( -local_band * local_band * 26.0 );

    // Colloidal diffusion gradient between rings
    float d_grad = ( diffusionP > 0.01 ? diffusionP : 1.2 );
    float ion_diffusion = exp( -r * d_grad * 2.0 );

    // Nucleation flash on kick
    // Blitz nur an der wachsenden Front (Zentrum), nicht ueber alle Ringe.
    float nuc_flash = precip_band * exp( -r * 2.2 ) * ( 0.6 + 1.2 * audioKick )
                      * ( colloidGlowP > 0.01 ? colloidGlowP : 1.3 );

    // Palette assignment
    // audioAdvance statt Centroid: der Centroid liess ALLE Ringe pro Frame
    // die Farbe wechseln ("blinkendes Moire").
    float pal_angle = fract( log_r * 0.15 + r * 0.2 + audioAdvance * 0.05 );
    vec3  col_band = imgPalette( pal_angle );
    vec3  col_gel = imgPalette( fract( pal_angle + 0.5 ) ) * 0.6;

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_gel * ion_diffusion * ( 0.8 + 0.4 * audioSwell );
    col += col_band * precip_band * 2.2;
    col += vec3( 0.95, 0.95, 1.0 ) * nuc_flash * 1.8;
    col += col_band * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    col = clamp( ( col - 0.26 ) * 1.5 + 0.14, 0.0, 1.0 ); // washed-out fix
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
