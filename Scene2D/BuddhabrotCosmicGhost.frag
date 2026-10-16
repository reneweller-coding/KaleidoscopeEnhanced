#version 330 core
/*****************************************************************************\
 *                              BuddhabrotCosmicGhost.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  BUDDHABROT COSMIC GHOST: Inverse orbit-density projection of escaping Mandelbrot trajectories forming a
 *  luminous, meditating cosmic ghost figure with multi-spectral exposure channels, nebula halos, and spiritual
 *  resonance.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous orbit trajectory integration & ghost rotation
 *    audioKick    -> flashes interior third-eye chakra & expands astral aura
 *    audioCentroid-> modulates fine orbit filament density & exposure sharpness
 *    audioSubBass -> expands meditating astral ghost respiration
 *    audioChromaHue-> rotates the luminous cosmic ghost palette
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
uniform float speedP;   ///< Speed knob, 0..1.
uniform float densityP; ///< Density knob, 0..1.
uniform float auraP;    ///< Aura knob, 0.7..1.5.
uniform float glowP;    ///< Glow / afterglow knob, 0..1.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float dens = ( densityP > 0.01 ) ? densityP : 1.0;
    float ar = ( auraP > 0.01 ) ? auraP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.150 * spd + audioAdvance * 0.150 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).

    // Center coordinate for meditating Buddhabrot: center around c = (-0.5, 0.0)
    // Rotate 90 degrees so Buddha sits upright
    vec2 c = vec2( -uv.y * 1.6 - 0.45, uv.x * 1.6 );
    c /= ( 1.0 + 0.15 * sin( audioSwell * 2.5 ) + 0.1 * audioSubBass );

    // Multi-spectral orbit density sampling across 3 exposure depths (R, G, B channels)
    vec3 orbit_density = vec3( 0.0 );

    vec2 z = c;
    for ( int i = 0; i < 32; ++i )
    {
        z = vec2( z.x * z.x - z.y * z.y, 2.0 * z.x * z.y ) + c;
        float r2 = dot( z, z );

        // Distance from current pixel to orbit point
        vec2  orbit_pixel = vec2( z.y / 1.6, -( z.x + 0.45 ) / 1.6 );
        float d = length( uv - orbit_pixel );

        // Tonal brightness tightens every exposure kernel at once: thinner, finer
        // filaments -- and because it only steepens the decay it can never raise
        // the accumulated exposure above what the darker setting already gave.
        float expo = dens * ( 1.0 + 0.45 * audioCentroid );
        // Channel R: long orbits (deep inner details)
        if ( i >= 18 )
            orbit_density.r += exp( -d * ( 35.0 * expo ) );
        // Channel G: medium orbits (body of Buddha)
        if ( i >= 8 )
            orbit_density.g += exp( -d * ( 25.0 * expo ) );
        // Channel B: short orbits (halo and aura)
        orbit_density.b += exp( -d * ( 15.0 * expo ) );

        if ( r2 > 16.0 )
            break;
    }

    // Sample slideshow texture on ghost coordinate
    vec2 sample_uv = fract( uv * 0.4 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Astral palette mixing
    vec3 pal_a = imgPalette( length( orbit_density ) * 0.2 + t * 0.05 );
    vec3 pal_b = imgPalette( length( orbit_density ) * 0.2 + 0.5 );
    vec3 ghost_col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( orbit_density.g * 2.0 ) );

    ghost_col = mix( ghost_col, tex_col, 0.35 + 0.15 * audioValence );

    // Add glowing multi-channel astral light
    vec3 astral_light = vec3(
                            orbit_density.r * 1.4,
                            orbit_density.g * 1.1,
                            orbit_density.b * 1.6 )
                        * glw * ( 1.0 + 2.5 * audioKick ) * ar;

    ghost_col += astral_light;

    // Third-eye chakra bloom (located at top center)
    vec2  chakra_pos = vec2( 0.0, 0.35 );
    float chakra_bloom = exp( -length( uv - chakra_pos ) * 8.0 ) * ( 1.2 + 3.0 * audioKick );
    ghost_col += vec3( 1.8, 1.6, 1.2 ) * chakra_bloom;

    ghost_col = pow( ghost_col, vec3( 0.88 ) );
    ghost_col /= 1.0 + 0.55 * max( ghost_col.r, max( ghost_col.g, ghost_col.b ) ); // peak knee: tame local glare, keep
                                                                                   // midtones
    fragColor = vec4( clamp( ghost_col, 0.0, 1.0 ), 1.0 );
}
