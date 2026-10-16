#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file FluidChromaMarangoniConvection.frag
 * @brief FLUID CHROMA MARANGONI CONVECTION: Bénard-Marangoni thermal convection cells
 * (hexagonal thermal upwelling honeycomb) with surface-tension gradient driven
 * droplet bursting, toroidal fluid vortex rings, and psychedelic Chroma diffusion.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous thermal advection & Marangoni droplet spread
 *   audioKick    -> flashes thermal upwelling plume cores & surface tension shockwave
 *   audioCentroid-> modulates hexagonal cell boundary ripple frequency
 *   audioSubBass -> expands thermal convection cell diameter
 *   audioChromaHue-> rotates the luminous fluid marbling spectrum
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

// Per-activation variety
uniform float speedP;     ///< Speed knob, 0..1.
uniform float cellScaleP; ///< Cell scale knob, 0.7..1.5.
uniform float marangoniP; ///< Marangoni knob, 0.8..1.6.
uniform float glowP;      ///< Glow / afterglow knob, 0..1.
uniform float hueP;       ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/**  Hexagonal Bénard cell potential
 *
 * @param p  The point. (in)
 * @param t  Phase of the cells. (in)
 *
 * @return
 *   The potential, -1..1.
 **/
float benardCell( vec2 p, float t )
{
    float w1 = cos( p.x * 1.7320508 + t * 2.0 );
    float w2 = cos( p.x * 0.8660254 + p.y * 1.5 - t * 1.5 );
    float w3 = cos( p.x * 0.8660254 - p.y * 1.5 - t * 1.5 );
    return ( w1 + w2 + w3 ) / 3.0;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float c_sc = ( cellScaleP > 0.01 ) ? cellScaleP : 1.0;
    float mar = ( marangoniP > 0.01 ) ? marangoniP : 1.2;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Convection coordinates
    // Dividing the convection lattice frequency widens every Benard cell, so
    // the honeycomb swells with the drone instead of just brightening.
    vec2 p_conv = uv * ( 6.0 * c_sc ) / ( 1.0 + 0.4 * audioSubBass );

    // Evaluate Bénard convection thermal upwelling
    float temp_field = benardCell( p_conv, t );

    // Surface tension Marangoni velocity curl: v = grad(temp) x ez
    float eps = 0.01;
    float t_x = benardCell( p_conv + vec2( eps, 0.0 ), t );
    float t_y = benardCell( p_conv + vec2( 0.0, eps ), t );
    vec2  grad_t = vec2( t_x - temp_field, t_y - temp_field ) / eps;

    // Displace coordinate along Marangoni flow
    vec2 p_marangoni = uv + vec2( -grad_t.y, grad_t.x ) * ( 0.06 * mar );

    // Concentric thermal droplet rings in upwelling centers
    float drop_rings = sin( temp_field * 12.0 - t * 4.0 );
    float cell_border = smoothstep( 0.0, 0.05, abs( temp_field ) );

    // Sample distorted background photo
    vec2 sample_uv = fract( p_marangoni * 0.4 + vec2( temp_field * 0.05 ) + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Thermal gradient palette
    vec3 pal_warm = imgPalette( temp_field * 0.4 + 0.1 );
    vec3 pal_cool = imgPalette( temp_field * 0.4 + 0.6 );
    vec3 base_col = mix( pal_cool, pal_warm, clamp( temp_field * 0.5 + 0.5, 0.0, 1.0 ) );

    base_col = mix( base_col, tex_col, 0.35 + 0.15 * audioValence );

    // Glowing thermal plume centers & cell boundary lines
    float plume_glow = exp( -abs( temp_field - 0.8 ) * 15.0 ) * ( 1.0 + 3.0 * audioKick ) * glw;
    float border_glow = exp( -abs( temp_field ) * ( 20.0 + 10.0 * audioCentroid ) ) * glw;

    vec3 final_col = base_col + vec3( 1.6, 1.2, 0.4 ) * plume_glow + vec3( 0.4, 1.2, 1.8 ) * border_glow;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
