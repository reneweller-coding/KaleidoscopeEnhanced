#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file MantleConvectionPlume.frag
 * @brief MANTLE CONVECTION PLUME: Deep Earth core-mantle boundary (D'' layer)
 * thermal plumes rising through Rayleigh-Bénard viscous convection cells.
 * Mushrooming basaltic magma diapir heads, subducting tectonic slabs,
 * 3000°C thermal upwelling, and molten rock photo texture distortion.
 *   audioAdvance -> drives viscous mantle convection vorticity flow
 *   audioKick    -> triggers explosive magma diapir eruptions at the lithosphere
 *   audioBass    -> undulates thermal plume stem thickness & buoyancy, and the
 *                   glow of the hot D'' core-mantle boundary layer
 *   audioCentroid-> shifts magma temperature (deep basaltic red to incandescent gold)
 *
 * A whole MANTLE SECTION is shown, not one plume: five diapirs rise from the
 * core-mantle boundary at staggered heights, cold subducting slabs sink between
 * them, and the Rayleigh-Benard roll field carries visible cell structure right
 * out to the frame edges.
 *
 * Per-activation variety:
 *   plumeP   float mantle thermal plume buoyancy & height  (0.5..2.2)
 *   convectP float Rayleigh-Bénard convection cell density  (0.5..2.0)
 *   speedP   float viscous mantle flow velocity            (0.5..2.0)
 *   hueP     float thermal radiation hue offset            (0..6.28)
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

uniform float plumeP;   ///< Plume knob: mantle thermal plume buoyancy & height, 0.5..2.2.
uniform float convectP; ///< Convect knob: Rayleigh-Bénard convection cell density, 0.5..2.
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
    float plm = ( plumeP > 0.0 ) ? plumeP : 1.0;
    float cnv = ( convectP > 0.0 ) ? convectP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Upwelling convection coordinates (bottom core-mantle boundary y = -0.5 to top lithosphere y = 0.5)
    vec2 p = uv * vec2( 5.0 * cnv, 4.2 );

    // Rayleigh-Bénard convection vorticity rolls: psi(x, y) = sin(k_x * x) * sin(k_y * y)
    float roll_x = sin( p.x + sin( p.y * 2.0 + t ) * 0.6 );
    float roll_y = cos( p.y - t * 1.4 ) * ( 0.8 + 0.3 * audioBass );
    float convection_stream = roll_x * roll_y;

    // Secondary boundary-layer fingering, so the cell field keeps structure
    // all the way into the corners instead of fading to dead rock.
    float fine = sin( p.x * 2.3 + p.y * 1.1 + t * 0.7 ) * cos( p.y * 2.7 - t * 0.9 );
    convection_stream = convection_stream * 0.80 + fine * 0.34;

    float hot_roll = max( convection_stream, 0.0 );
    float cold_roll = max( -convection_stream, 0.0 );

    // --- FIVE rising diapirs across the whole section --------------------
    // (one lone central plume left five sixths of the frame empty)
    const int NP = 5;
    float     plume_stem = 0.0;
    float     diapir_head = 0.0;
    for ( int i = 0; i < NP; ++i )
    {
        float fi = float( i );
        float sd = fract( sin( fi * 12.9898 + 4.1 ) * 43758.5453 );
        float x0 = ( ( fi + 0.5 ) / float( NP ) * 2.0 - 1.0 ) * 0.86;
        float ph = sd * 6.2831853;

        // Rising thermal plume stem (upwelling column, widening as it rises)
        float stem_x = uv.x - x0 - sin( uv.y * 4.0 - t * 1.6 + ph ) * 0.10;
        float stem_width = ( 0.045 + 0.032 * ( uv.y + 0.5 ) ) * plm * ( 0.75 + 0.6 * sd );
        float sw = max( stem_width, 0.02 );
        plume_stem += exp( -( stem_x * stem_x ) / ( sw * sw ) ) * ( 0.75 + 0.35 * sd ); // gaussian: the |x| tail summed
                                                                                        // into a flood

        // Mushrooming diapir head, each one arrested at a different depth
        float head_y = 0.10 + 0.32 * fract( sd * 3.7 );
        float head_dist = length( vec2( stem_x * 1.5, uv.y - head_y ) );
        diapir_head += exp( -head_dist * 9.0 ) * ( 0.55 + 0.45 * sd ) * ( 1.0 + audioKick * 1.2 );
    }
    plume_stem = min( plume_stem, 1.6 );
    diapir_head = min( diapir_head, 1.5 );

    // Photo texture mapping into molten magma flow (mirrored wrap: the old
    // fract() left an animated seam at the frame edge that read as a JUMP)
    vec2 magma_warp = st + vec2( roll_x, roll_y ) * 0.04 * ( 1.0 + audioKick * 0.7 );
    vec3 photo = img( abs( fract( magma_warp * 0.5 ) * 2.0 - 1.0 ) );

    // Viscous magma temperature palette — pulled off the saturation ceiling
    // (deep basalt, 1500°C ember, molten gold, cold subducted slab)
    vec3 basalt_dark = vec3( 0.055, 0.048, 0.052 );
    vec3 magma_crimson = vec3( 0.80, 0.36, 0.22 );
    vec3 molten_gold = vec3( 0.97, 0.84, 0.55 );
    vec3 slab_cool = vec3( 0.16, 0.20, 0.26 );

    float temp_field = clamp( plume_stem * 0.70 + diapir_head * 0.95 + hot_roll * 0.30, 0.0, 1.0 );
    temp_field = pow( temp_field, 1.35 ); // hot stays hot, warm mush goes dark
    vec3 thermal_col = mix( basalt_dark, magma_crimson, temp_field );
    // Timbre brightness shifts the magma's colour temperature toward
    // incandescent gold -- the audioCentroid mapping this file's header
    // documents, which nothing in the body actually implemented.  Gold is the
    // least saturated end of the ramp, so this also spends the frame's hottest
    // pixels on its calmest colour rather than its most strident one.
    thermal_col = mix(
        thermal_col, molten_gold,
        clamp( pow( temp_field, 2.6 ) * ( 0.35 + 0.35 * audioSwell + 0.30 * audioCentroid ), 0.0, 1.0 ) );

    // Cold downwelling limbs = subducting slabs, so the "empty" half of every
    // convection roll carries content too.
    thermal_col = mix( thermal_col, slab_cool, clamp( cold_roll * 0.55, 0.0, 0.55 ) );

    // Hot D'' layer at the core-mantle boundary and the cool lithosphere lid.
    float core_glow = smoothstep( -0.26, -0.50, uv.y );
    thermal_col += magma_crimson * core_glow * ( 0.20 + 0.13 * audioBass );
    float crust = smoothstep( 0.28, 0.50, uv.y );
    thermal_col = mix( thermal_col, slab_cool * 0.9, crust * 0.45 );

    // Combine visualizer — the cool mantle now shows its rock texture instead
    // of reading as black.
    float mix_w = clamp( 0.42 + 0.45 * temp_field + 0.15 * audioLevel, 0.0, 0.95 );
    // photo*0.62 made the COLD rock the brightest thing in frame (the
    // recording showed cream-white with dark plume silhouettes -- inverted).
    // Cold mantle is dark; brightness now belongs to temperature alone.
    vec3 rock_tex = mix( vec3( dot( photo, vec3( 0.333 ) ) ), photo, 0.45 );
    vec3 rock = rock_tex * mix( 0.10, 0.22, temp_field ); // the 0.50 ceiling was the cream flood
    vec3 col = mix( rock, thermal_col, mix_w );
    col += diapir_head * vec3( 1.0, 0.55, 0.25 ) * ( 0.20 + audioKick * 0.5 ); // was a cream flood over the whole frame

    // Bounded hue nudges.  Rotating by the RAW audioChromaHue swung the whole
    // frame right around the wheel as the key slewed: that is the measured
    // frame-to-frame colour jump, and it also drove channels negative, which
    // clips back to a pure primary and re-saturates everything the pull below
    // is there to calm.  hueP could likewise park a whole activation on a hue
    // that has nothing to do with molten rock.  Magma is red-orange; these only
    // inflect it, and sin() keeps both continuous across the wrap.
    col = hueRot( col, 0.20 * sin( audioChromaHue ) );
    if ( hue > 0.001 )
        col = hueRot( col, 0.28 * sin( hue ) );
    col = max( col, 0.0 );

    // Vignette — softened, the old one crushed the corners to black
    float vig = smoothstep( 1.45, 0.45, length( uv ) );
    col *= mix( 0.72, 1.0, vig );

    // Catalogue review: pull the magma tones off the saturation ceiling
    // (the old palette left ~40% of the frame fully saturated).
    float lum = dot( col, vec3( 0.299, 0.587, 0.114 ) );
    col = mix( vec3( lum ), col, 0.88 ); // 0.66 bleached the gold into cream

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3  cat_tone = col * 0.86;
    float m = max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    cat_tone *= 1.0 / ( 1.0 + max( 0.0, m - 0.72 ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
