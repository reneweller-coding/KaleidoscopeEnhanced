#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file CatatumboRelightningTower.frag
 * @brief CATATUMBO RELIGHTNING TOWER: Nocturnal continuous electrical storm column
 * above Lake Maracaibo. Kilometers-tall intra-cloud lightning arcs, methane-ionized
 * plasma channels, volumetric anvil cloud illuminations, and thunderous photo reflections.
 *   audioAdvance -> navigates atmospheric storm updrafts & cloud turbulence
 *   audioKick    -> fires explosive stepped leader lightning arc detonations
 *   audioSnare   -> triggers spiderweb cloud-to-cloud branch discharges
 *   audioSubBass -> rumbles volumetric thunder shockwave expansion
 *   audioSwell   -> thickens dense anvil cloud mist & ionization glow
 *
 * Per-activation variety:
 *   branchP  float lightning fractal branching complexity   (1.0..3.5)
 *   cloudP   float volumetric anvil cloud turbulence        (0.6..2.0)
 *   flashP   float stepped leader arc flash brightness      (0.8..2.5)
 *   methaneP float methane ionization blue/violet tint      (0.2..1.5)
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
uniform float audioSnare;     ///< Snare envelope, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float branchP; ///< Branching knob, 0..1.
uniform float cloudP;
uniform float flashP;
uniform float methaneP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/// @brief Tints a colour toward the house palette at t, keeping its brightness.
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
}

/// @brief Smooth value noise.
float noise( vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = sin( dot( i, vec2( 12.9898, 78.233 ) ) * 43758.5453 );
    float b = sin( dot( i + vec2( 1.0, 0.0 ), vec2( 12.9898, 78.233 ) ) * 43758.5453 );
    float c = sin( dot( i + vec2( 0.0, 1.0 ), vec2( 12.9898, 78.233 ) ) * 43758.5453 );
    float d = sin( dot( i + vec2( 1.0, 1.0 ), vec2( 12.9898, 78.233 ) ) * 43758.5453 );
    return mix( mix( fract( a ), fract( b ), f.x ), mix( fract( c ), fract( d ), f.x ), f.y );
}

/// @brief Fractal noise: octaves of value noise.
float fbm( vec2 p )
{
    float v = 0.0;
    float a = 0.5;
    mat2  rot = mat2( cos( 0.5 ), sin( 0.5 ), -sin( 0.5 ), cos( 0.5 ) );
    for ( int i = 0; i < 5; i++ )
    {
        v += a * noise( p );
        p = rot * p * 2.0;
        a *= 0.5;
    }
    return v;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.4 + audioAdvance * 0.35;

    // Cloud anvil background & turbulence
    float cloud_turb = ( cloudP > 0.01 ? cloudP : 1.2 );
    vec2  cloud_coord = uv * 2.0 * cloud_turb + vec2( 0.0, -t * 0.2 );
    float clouds = fbm( cloud_coord ) * ( 0.8 + 0.4 * audioSwell );

    // Main vertical lightning channel column
    float branch_complexity = ( branchP > 0.01 ? branchP : 1.5 );
    float main_arc_dist = 1e5;

    for ( float i = 0.0; i < 3.0; i += 1.0 )
    {
        float x_offset = ( i - 1.0 ) * 0.35 + sin( t * 0.8 + i ) * 0.1;
        float jagged = fbm( vec2( uv.y * 6.0 * branch_complexity, t * 2.0 + i * 1.5 ) ) * 0.35 - 0.175;
        float d = abs( uv.x - ( x_offset + jagged ) );
        main_arc_dist = min( main_arc_dist, d );
    }

    // Spiderweb branch discharges
    float branch_arc = abs( sin( uv.x * 8.0 + uv.y * 12.0 + fbm( uv * 10.0 + t ) * 4.0 ) );
    float branch_intensity = exp( -branch_arc * 8.0 ) * ( 0.4 + 1.8 * audioSnare );

    // Lightning plasma channel glow
    float arc_core = exp( -main_arc_dist * 90.0 ) * ( 1.0 + 4.0 * audioKick ) * ( flashP > 0.01 ? flashP : 1.5 );
    float arc_halo = exp( -main_arc_dist * 12.0 ) * ( 0.8 + 1.5 * audioMid );

    // Cloud illumination by lightning flashes
    float cloud_illum = clouds * ( arc_halo * 1.5 + audioKick * 0.6 );

    // Methane ionization color: Deep violet-cyan identity tinted with photo palette
    vec3 methane_violet = vec3( 0.55, 0.2, 0.95 );
    vec3 lightning_blue = vec3( 0.1, 0.6, 1.0 );
    vec3 arc_color = palTint( mix( lightning_blue, methane_violet, sin( audioCentroid * 3.14 ) * 0.5 + 0.5 ),
                              main_arc_dist * 2.0, 0.25 );

    // Background photo texture
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.2;

    vec3 col = bg;
    col += palTint( vec3( 0.08, 0.12, 0.22 ), clouds * 0.5, 0.2 ) * ( 0.5 + clouds * 0.7 );
    col += arc_color * cloud_illum * 1.6;
    col += arc_color * branch_intensity * 1.4;
    col += vec3( 0.9, 0.95, 1.0 ) * arc_core * 2.5;
    col += arc_color * arc_halo * 1.2;
    col += arc_color * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
