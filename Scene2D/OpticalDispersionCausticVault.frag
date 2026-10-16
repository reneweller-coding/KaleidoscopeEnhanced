#version 330 core
/*****************************************************************************\
 *                              OpticalDispersionCausticVault.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  OPTICAL DISPERSION CAUSTIC VAULT: High-resolution multi-wavelength dispersive refraction caustics.
 *
 *  Crystal chamber water wave interference with full RGB spectral splitting, specular focal nodes, and luminous
 *  caustics.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous fluid caustic wave motion & focal shifts
 *    audioKick    -> flashes intense caustic focal nodes & chromatic shockwaves
 *    audioCentroid-> modulates wave frequency & caustic network filigree
 *    audioSubBass -> expands wave amplitude breathing
 *    audioChromaHue-> rotates the prismatic refractive spectrum
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

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
uniform float speedP;      ///< Speed knob, 0..1.
uniform float dispersionP; ///< Dispersion knob, 0.7..1.6.
uniform float waveScaleP;  ///< Wave scale knob, 0.8..1.4.
uniform float glowP;       ///< Glow / afterglow knob, 0..1.
uniform float hueP;        ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Dispersive water caustic wave intensity function for a given wavelength offset
 *
 * @param p         The point. (in)
 * @param t         Phase. (in)
 * @param wlOffset  Phase offset of the wavelength. (in)
 * @param wScale    Scale of the waves. (in)
 *
 * @return
 *   The caustic intensity.
 **/
float causticIntensity( vec2 p, float t, float wlOffset, float wScale )
{
    vec2  p_warp = p * wScale;
    float t_warp = t + wlOffset;

    // Sum over 4 directional sinusoidal wave trains
    vec2 grad = vec2( 0.0 );
    for ( int i = 0; i < 4; ++i )
    {
        float a = float( i ) * 0.785398 + t_warp * 0.1;
        vec2  dir = vec2( cos( a ), sin( a ) );
        // Tonal brightness raises the SPATIAL wave number only (the t_warp*2.5
        // drift term is left alone, so the flow phase is never remapped):
        // bright material packs the interference into a finer caustic filigree.
        float phase = dot( p_warp, dir ) * ( 4.0 * ( 1.0 + 0.45 * audioCentroid ) ) + t_warp * 2.5;
        grad += dir * cos( phase );
    }

    // Caustic focusing occurs where wave gradient is stationary (Jacobian
    // determinant peak). Near-perfect cancellation of the 4 wave trains
    // drives length(grad) down toward its 0.08 floor, sending jacobian up
    // to ~12.5 and pow(.,1.8) up past 90 -- an effectively unbounded spike
    // that was flooding whole caustic focal regions to solid white. Cap the
    // returned intensity so focal points stay bright highlights instead.
    float jacobian = 1.0 / max( 0.08, length( grad ) );
    return min( pow( jacobian, 1.8 ), 3.0 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float disp = ( dispersionP > 0.01 ) ? dispersionP : 1.0;
    float w_sc = ( waveScaleP > 0.01 ) ? waveScaleP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.35 * spd + audioAdvance * 0.28 * spd; // Zeit-Basis:
    // audioAdvance alone stands still in quiet music ("looks like a still picture").

    // Dispersive wavelength offsets for R, G, B channels
    float d_lambda = ( 0.12 + 0.08 * audioFlux ) * disp;
    float scale = ( 2.2 + 0.3 * sin( audioSwell * 2.0 ) ) * w_sc;

    // Sample chromatic caustic intensities separately for R, G, B
    float caustic_r = causticIntensity( uv, t, -d_lambda, scale );
    float caustic_g = causticIntensity( uv, t, 0.0, scale );
    float caustic_b = causticIntensity( uv, t, d_lambda, scale );

    vec3 caustic_rgb = vec3( caustic_r, caustic_g, caustic_b ) * ( 0.12 + 0.18 * audioLevel );

    // Sample distorted background photo texture on the pool floor. This
    // refraction offset is the only place the water's wave AMPLITUDE is
    // visible, so sub-bass swells it here; scaling the wave trains inside
    // causticIntensity instead would fight the jacobian floor and just dim
    // the caustic web rather than making it heave.
    vec2 floor_uv = fract( uv * 0.4 + caustic_rgb.xy * ( 0.05 * ( 1.0 + 0.9 * audioSubBass ) ) + 0.5 );
    vec3 floor_tex = img( floor_uv );

    // Crystal vault ambient palette. This base mix alone sat close to the
    // tonemap ceiling across most of the frame, leaving no headroom for the
    // caustic highlights to read as highlights -- give it room to breathe.
    vec3 pal_base = imgPalette( length( uv ) * 0.3 + 0.2 );
    vec3 col = mix( floor_tex, pal_base, 0.4 ) * 0.55;

    // Add glowing chromatic caustic webs (causticIntensity is capped above,
    // but the kick multiplier can still push it past 1.0 -- clamp the
    // applied term too, tighter than before since it still washed the frame).
    col += min( caustic_rgb * ( 1.0 + 3.0 * audioKick ) * glw, vec3( 0.7 ) );

    // Specular wave glints -- the first pass capped the SCALAR to 1.0, but
    // the 1.6-peak tint channel still turned a "capped" glint into a value
    // above 1.0 per channel, the same class of bug as the neutron-star and
    // Clifford-torus files: cap the FINAL tinted vector, not just the
    // scalar feeding it.
    float total_caustic = ( caustic_r + caustic_g + caustic_b ) * 0.3333;
    float specular_glint = pow( clamp( total_caustic * 0.8, 0.0, 1.0 ), 4.0 ) * ( 1.0 + 3.0 * audioKick );
    col += min( vec3( 1.0, 1.0, 1.15 ) * specular_glint, vec3( 0.55 ) );

    // Edge water vignette
    float vig = 1.0 - smoothstep( 0.85, 1.4, length( uv ) );
    col *= vig;

    col = pow( col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( col, 0.0, 1.0 );
    cat_tone /= 1.0 + 1.3 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    cat_tone = clamp( ( cat_tone - 0.26 ) * 1.55 + 0.12, 0.0, 1.0 ); // washed-out fix: contrast S-curve, darker fog
                                                                     // floor
    // "Dispersion" without a rainbow is just fog: split the caustic
    // brightness into a spectral gradient across its own intensity.
    float lum = dot( cat_tone, vec3( 0.299, 0.587, 0.114 ) );
    float sh = fract( lum * 1.6 + 0.06 );
    vec3  spec = clamp( vec3( abs( sh * 6.0 - 3.0 ) - 1.0,
                              2.0 - abs( sh * 6.0 - 2.0 ),
                              2.0 - abs( sh * 6.0 - 4.0 ) ),
                        0.0, 1.0 );
    cat_tone = mix( cat_tone, spec * lum * 1.35, 0.42 );
    fragColor = vec4( cat_tone, 1.0 );
}
