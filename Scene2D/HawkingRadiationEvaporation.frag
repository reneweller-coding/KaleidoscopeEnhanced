#version 330 core
/*****************************************************************************\
 *                              HawkingRadiationEvaporation.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  HAWKING RADIATION EVAPORATION: Micro-black hole event horizon displaying quantum tunneling evaporation.
 *
 *  Virtual particle-antiparticle pairs separate at the horizon boundary, emitting thermal Hawking photons with
 *  extreme gravitational redshift, photon sphere light deflection, and photo mapping.
 *
 *    audioAdvance -> accelerates quantum horizon entanglement & particle flux
 *    audioKick    -> triggers explosive micro-black hole evaporation bursts
 *    audioSubBass -> pulses Schwarzschild radius & gravitational lens depth
 *    audioChromaHue-> shifts Hawking thermal emission temperature spectrum
 *
 *  Per-activation variety:
 *    evapP    float Hawking radiation flux & burst intensity (0.5..2.2)
 *    horizonP float Schwarzschild event horizon scale        (0.5..2.0)
 *    speedP   float quantum tunneling phase velocity         (0.5..2.0)
 *    hueP     float thermal radiation hue offset             (0..6.28)
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

uniform float evapP;    ///< Evap knob: Hawking radiation flux & burst intensity (0.5..2.2).
uniform float horizonP; ///< Horizon knob: Schwarzschild event horizon scale, 0.5..2.
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
    float evp = ( evapP > 0.0 ) ? evapP : 1.0;
    float hrz = ( horizonP > 0.0 ) ? horizonP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    float r = length( uv );
    float angle = atan( uv.y, uv.x );

    // Event horizon radius: r_s
    float r_schwarzschild = ( 0.22 + 0.08 * sin( t * 0.7 ) + 0.1 * audioSubBass ) * hrz;
    float r_photon_sphere = r_schwarzschild * 1.5;

    // Relativistic gravitational light deflection: theta = r - r_s^2 / r
    float deflection = ( r_schwarzschild * r_schwarzschild ) / max( r * r, 0.001 );
    vec2  defl_uv = uv * ( 1.0 - deflection * 0.6 );
    defl_uv = rot2D( deflection * 1.5 + t * 0.2 ) * defl_uv;

    vec2 photo_uv = fract( ( defl_uv * resolution.y + 0.5 * resolution ) / resolution );
    vec3 photo = img( photo_uv );

    // Quantum Hawking radiation particles streaming outwards: r > r_s
    float particle_waves = sin( r * 45.0 - t * 12.0 + angle * 4.0 );
    float particle_sparks = pow( max( 0.0, sin( r * 80.0 - t * 18.0 + angle * 8.0 ) ), 6.0 );
    float hawking_flux = exp( -abs( r - r_schwarzschild ) * 8.0 ) * ( particle_waves * 0.5 + 0.5 ) * evp;

    // Explosive gamma-ray burst on kick
    float evaporation_burst = exp( -r * 6.0 ) * ( audioKick * 4.0 * evp + audioHigh * 1.5 );

    // Blackbody thermal Hawking radiation spectrum: T ~ 1 / M
    vec3 thermal_hawking = imgPalette( 0.35 * clamp( hawking_flux * 1.5, 0.0, 1.0 ) ) * 1.5;
    thermal_hawking = mix( thermal_hawking, vec3( 1.0, 0.98, 0.9 ), evaporation_burst * 0.5 );

    // Event horizon core shadow
    float shadow = smoothstep( r_schwarzschild * 0.7, r_schwarzschild * 1.1, r );

    // Photon sphere bright ring
    float photon_ring = exp( -abs( r - r_photon_sphere ) * 35.0 ) * ( 1.2 + audioKick * 2.5 );

    // Combine visualizer
    vec3 col = photo * ( 0.8 + 0.3 * audioLevel ) * shadow;
    col += hawking_flux * thermal_hawking * ( 1.2 + audioSwell * 0.8 );
    col += particle_sparks * vec3( 1.0, 0.9, 0.6 ) * 1.5 * shadow;
    col += photon_ring * vec3( 0.4, 0.9, 1.0 ) * 1.5;
    col += evaporation_burst * vec3( 1.0, 0.98, 0.92 ) * 2.0;

    if ( audioChromaHue != 0.0 )
        if ( hue > 0.001 )
            col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.35, 0.35, r );
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.6;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
