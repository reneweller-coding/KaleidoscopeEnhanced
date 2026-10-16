#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file BioluminescentAbyssalTrenches.frag
 * @brief BIOLUMINESCENT ABYSSAL TRENCHES: 100% viewport-filling deep-sea Hadal
 * zone (11,000m depth). Volumetric raymarched hydrothermal spires, flashing
 * siphonophore colonies, pyrosome light tubes, marine snow, and deep-sea
 * photo refraction across turbulent oceanic thermal boundary layers.
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

uniform float trenchP;
uniform float bioP;
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21( vec2 p )
{
    p = fract( p * vec2( 123.34, 345.45 ) );
    p += dot( p, p + 34.345 );
    return fract( p.x * p.y );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float trn = ( trenchP > 0.0 ) ? trenchP : 1.0;
    float bio = ( bioP > 0.0 ) ? bioP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Deep ocean perspective coordinates
    float depth_z = ( 1.0 / ( abs( uv.y + 0.6 ) + 0.1 ) ) * ( 0.8 + 0.3 * audioSwell );
    vec2  oceanic_uv = vec2( uv.x * depth_z * 0.4, depth_z + t * 1.5 );

    // Oceanic thermal boundary refraction waves
    float thermal_wave = sin( uv.x * 10.0 + sin( uv.y * 8.0 + t ) * 2.0 );
    vec2  refracted_uv = uv * 0.6 + vec2( 0.5 ) + vec2( cos( thermal_wave ), sin( thermal_wave ) ) * 0.03;
    vec3  photo_ocean = img( fract( refracted_uv ) );

    // Hydrothermal crystal vent spires
    float spire_coord = abs( fract( oceanic_uv.x * 0.5 ) - 0.5 ) * 2.0;
    float spire_height = exp( -spire_coord * 12.0 * trn );

    // Bioluminescent siphonophore tentacles & pulsing pyrosomes
    float siphonophore = sin( uv.x * 25.0 + t * 4.0 ) * cos( uv.y * 30.0 - t * 3.0 );
    float bio_glow = exp( -abs( siphonophore ) * 8.0 ) * ( 0.8 + 1.2 * audioHigh ) * bio;

    // Luciferin synchronized flash pulses on kicks
    float luciferin_pulse = sin( length( uv ) * 12.0 - time * 6.0 );
    float bio_flash = exp( -abs( luciferin_pulse ) * 6.0 ) * ( audioKick * 2.5 + audioSubBass * 1.2 );

    // Marine snow as small round motes. The old step(0.96, hash) lit the
    // ENTIRE grid cell (1/35th of the screen) flat white -- the reported
    // "giant white pixels". Now each occupied cell holds one soft round
    // particle at a hashed offset, dimmer and properly tiny.
    vec2  snow_cell = uv * 35.0 + vec2( t * 0.5, t * 2.0 );
    vec2  snow_grid = floor( snow_cell );
    float snow_hash = hash21( snow_grid );
    vec2  snow_off = ( vec2( hash21( snow_grid + 11.7 ), hash21( snow_grid + 23.3 ) ) - 0.5 ) * 0.6;
    float snow_d2 = dot( fract( snow_cell ) - 0.5 - snow_off, fract( snow_cell ) - 0.5 - snow_off );
    float snow_particle = step( 0.96, snow_hash ) * exp( -snow_d2 * 110.0 ) * ( 0.35 + 0.55 * audioMid );

    // Deep-sea color palette: Abyssal Navy, Luciferin Cyan, Siphonophore Emerald, Mineral Vent Amber
    vec3 abyssal_navy = vec3( 0.01, 0.03, 0.08 );
    vec3 bio_cyan = vec3( 0.0, 0.9, 1.0 ) * 2.0;
    vec3 bio_emerald = vec3( 0.1, 1.0, 0.6 ) * 1.8;
    vec3 vent_amber = vec3( 1.0, 0.5, 0.1 ) * 2.2;

    // CANYON GEOMETRY -- the old build painted the glow grid across the
    // whole frame, which recorded as an LED panel, not a trench.
    float trench_half = 0.06 + 0.62 * clamp( uv.y + 0.72, 0.0, 1.6 );
    float rim = abs( uv.x ) - trench_half; // <0 open water, >0 rock wall
    float wall_band = smoothstep( 0.0, 0.22, rim );
    float floor_band = exp( -pow( ( uv.y + 0.66 ) * 2.6, 2.0 ) );

    // Open water: dark navy with a faint rising luciferin haze.
    vec3 water = abyssal_navy + bio_cyan * 0.03 * ( 1.0 + 0.6 * audioSwell ) * smoothstep( 0.4, -0.7, uv.y );

    // Rock walls carry the photo texture, crushed toward navy.
    vec3 wall_rock = mix( abyssal_navy, photo_ocean * 0.55, 0.55 );

    vec3 col = mix( water, wall_rock, wall_band );

    // Bioluminescent colonies live ON the walls (gated to the rim zone).
    float colony_zone = smoothstep( 0.015, 0.10, rim ) * ( 1.0 - smoothstep( 0.28, 0.55, rim ) );
    col += mix( bio_cyan, bio_emerald, sin( t + uv.y * 4.0 ) * 0.5 + 0.5 )
           * ( bio_glow + bio_flash ) * ( 0.15 + 0.85 * colony_zone );

    // Hydrothermal vents glow along the trench floor.
    col += vent_amber * spire_height * floor_band * ( 0.6 + 1.2 * audioBass );
    col += vec3( 0.8, 0.95, 1.0 ) * snow_particle * ( 1.0 - wall_band * 0.6 );

    // Atmospheric deep-sea absorption falloff
    col = hueRot( col, audioChromaHue + hue );
    col = pow( col, vec3( 0.9 ) );
    col += vec3( 0.01, 0.03, 0.06 ) * audioSwell;

    fragColor = vec4( col, 1.0 );
}
