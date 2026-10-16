#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file QuasarRelativisticJet.frag
 * @brief QUASAR RELATIVISTIC JET: Raymarched look down the magnetic confinement
 * funnel of an ultra-luminous active galactic nucleus. Relativistic synchrotron
 * plasma jets shoot along helical magnetic field lines with shock diamonds,
 * Cherenkov beaming cones, and multi-tier accretion disk photo reflections.
 *   audioAdvance -> accelerates plasma packets down the relativistic jet
 *   audioKick    -> fires shock diamond detonations and synchrotron flashes
 *   audioSubBass -> expands accretion magnetic field throat
 *   audioHigh    -> intensifies Cherenkov radiation ring glow
 *
 * Per-activation variety:
 *   jetP         float jet core radiance and length      (0.5..2.2)
 *   collimationP float magnetic funnel tight confinement (0.5..2.0)
 *   speedP       float plasma helical swirl velocity     (0.5..2.0)
 *   hueP         float spectral synchrotron hue offset   (0..6.28)
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

uniform float jetP;         ///< Jet knob: jet core radiance and length, 0.5..2.2.
uniform float collimationP; ///< Collimation knob: magnetic funnel tight confinement (0.5..2.0).
uniform float speedP;       ///< Speed knob, 0..1.
uniform float hueP;         ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float jet = ( jetP > 0.0 ) ? jetP : 1.0;
    float col = ( collimationP > 0.0 ) ? collimationP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Raymarching camera down the relativistic jet axis
    vec3 ro = vec3( 0.0, 0.0, -3.0 );
    vec3 rd = normalize( vec3( uv, 1.2 ) );

    // Slight camera bank/swirl
    rd.xy = rot2D( sin( t * 0.3 ) * 0.3 + audioPhase * 0.5 ) * rd.xy;

    vec3  p = ro;
    float accum_density = 0.0;
    float shock_diamonds = 0.0;
    float photo_weight = 0.0;
    vec2  sampled_coord = vec2( 0.0 );

    float step_size = 0.08;
    for ( int i = 0; i < 40; ++i )
    {
        p += rd * step_size;
        // Side view: the old march looked straight down the jet axis and
        // the beam recorded as a concentric glow ball.  Tilt the axis ~62
        // degrees across the frame and mirror it (bipolar lobes).
        vec3  pj = vec3( p.x, p.y * 0.469 - p.z * 0.883, p.y * 0.883 + p.z * 0.469 );
        float z = pj.y * 1.25;
        float r = length( vec2( pj.x, pj.z ) );

        // Magnetic funnel envelope, opening away from the core BOTH ways
        float funnel_r = ( 0.16 + 0.30 * pow( abs( z ) * 1.5 + 0.10, 0.65 ) ) / col;
        funnel_r += 0.08 * sin( z * 4.0 - t * 6.0 ) * ( 1.0 + audioKick );

        // Helical magnetic field lines
        float angle = atan( p.y, p.x ) + z * 2.5 * col - t * 4.0;
        float helix = abs( sin( angle * 4.0 ) );

        // Synchrotron plasma sheath density
        float sheath_dist = abs( r - funnel_r );
        float density = exp( -sheath_dist * 16.0 ) * ( 1.0 + helix * 1.2 );

        // Shock diamonds: periodic supersonic compression nodes along z
        float diamond_z = sin( abs( z ) * 6.0 - t * 8.0 );
        float diamond = exp( -abs( diamond_z ) * 8.0 ) * exp( -r * 8.0 );
        shock_diamonds += diamond * ( 1.5 + audioKick * 3.0 );
        // Luminous beam core so the jet reads as a BEAM, not a haze.
        accum_density += exp( -r * 10.0 ) * 0.55 * step_size * ( 1.0 + 0.6 * audioLevel );

        accum_density += density * step_size;

        // Sample coordinates along magnetic sheath for photo mapping
        if ( sheath_dist < 0.15 && photo_weight < 1.0 )
        {
            sampled_coord = vec2( angle * 0.15915, z * 0.2 + t * 0.1 );
            photo_weight += 0.2;
        }
    }

    vec3 photo = img( fract( sampled_coord + 0.5 ) );

    // Core relativistic beam color (Cherenkov electric blue / violet / white)
    vec3 beam_color = imgPalette( 0.25 * shock_diamonds ) * 1.3;
    beam_color = mix( beam_color, vec3( 1.0, 0.3, 0.8 ), sin( t + accum_density * 2.0 ) * 0.5 + 0.5 );

    // Combine visualizer
    vec3 final_col = mix( photo * 0.9, beam_color, clamp( accum_density * 1.5 * jet, 0.0, 1.0 ) );
    final_col += shock_diamonds * vec3( 1.0, 0.95, 0.85 ) * ( 1.2 + audioKick * 2.0 );
    final_col += exp( -length( uv ) * 12.0 ) * vec3( 1.0, 0.9, 0.6 ) * ( 1.5 + audioSubBass * 2.0 );

    if ( audioChromaHue != 0.0 )
        final_col = hueRot( final_col, audioChromaHue );
    if ( hue > 0.001 )
        final_col = hueRot( final_col, hue );

    // Vignette
    float vig = smoothstep( 1.3, 0.3, length( uv ) );
    final_col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( final_col ) * 0.3;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
