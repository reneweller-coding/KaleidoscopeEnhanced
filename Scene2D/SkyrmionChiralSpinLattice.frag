#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SkyrmionChiralSpinLattice.frag
 * @brief SKYRMION CHIRAL SPIN LATTICE: Dense 2D triangular lattice of topological
 * magnetic skyrmion vortices governed by chiral Dzyaloshinskii-Moriya exchange interactions.
 * Displays swirling out-of-plane magnetization cores, gyrotropic Skyrmion Hall drift,
 * and holographic magneto-optical Faraday rotation patterns.
 *   audioAdvance -> drives gyrotropic Skyrmion Hall angle drift & spin precession
 *   audioKick    -> compresses lattice spacing triggering topological annihilation pulses
 *   audioBass    -> undulates skyrmion core diameter & out-of-plane helicity
 *   audioSwell   -> intensifies background ferromagnetic domain coherence
 *   audioCentroid-> shifts magneto-optical Kerr effect polarization colors
 *
 * Per-activation variety:
 *   latticeP float hexagonal skyrmion packing density         (2.0..6.0)
 *   coreP    float vortex core sharpness & radius             (0.4..1.8)
 *   chiralP  float Dzyaloshinskii-Moriya twisting chirality   (0.5..2.2)
 *   driftP   float gyrotropic Hall current velocity           (0.3..1.5)
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

uniform float latticeP;
uniform float coreP; ///< Fold core class knob of the 3D chain, 0..1.
uniform float chiralP;
uniform float driftP;

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

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.35 + audioAdvance * 0.3;

    // Gyrotropic Skyrmion Hall drift
    float drift_vel = ( driftP > 0.01 ? driftP : 0.8 );
    vec2  drift = vec2( cos( t * drift_vel * 0.5 ), sin( t * drift_vel * 0.5 + 0.8 ) ) * 0.15;

    // Hexagonal lattice geometry
    float scale = ( latticeP > 0.01 ? latticeP : 3.5 ) * ( 1.0 + 0.1 * audioSwell );
    vec2  p = ( uv + drift ) * scale;

    // Triangular 2D grid coordinates
    vec2 r_hex = vec2( p.x * 1.7320508 + p.y, p.y * 2.0 ) / 3.0;
    vec2 cell = floor( r_hex );
    vec2 f = fract( r_hex ) - 0.5;

    // Find closest hexagonal lattice center
    float min_dist = 1e5;
    vec2  closest_offset = vec2( 0.0 );

    for ( int y = -1; y <= 1; ++y )
    {
        for ( int x = -1; x <= 1; ++x )
        {
            vec2 neighbor = vec2( float( x ), float( y ) );
            vec2 center = neighbor + vec2( 0.0 );

            // Hexagonal skew back to Cartesian
            vec2  cart_pos = vec2( sqrt( 3.0 ) * ( cell.x + neighbor.x + 0.5 * ( cell.y + neighbor.y ) ),
                                   1.5 * ( cell.y + neighbor.y ) );
            vec2  diff = p - cart_pos;
            float d = length( diff );
            if ( d < min_dist )
            {
                min_dist = d;
                closest_offset = diff;
            }
        }
    }

    // Skyrmion spin texture: theta(r) rotates from Pi (core) to 0 (outer ferromagnetic domain)
    float core_sharpness = ( coreP > 0.01 ? coreP : 1.0 ) * ( 0.8 + 0.5 * audioBass );
    float spin_theta = 3.14159265 * exp( -min_dist * min_dist * 2.2 * core_sharpness );

    // Chiral winding angle (Dzyaloshinskii-Moriya helicity)
    float chiral_twist = ( chiralP > 0.01 ? chiralP : 1.2 );
    float azim = atan( closest_offset.y, closest_offset.x ) + spin_theta * chiral_twist + audioPhase;

    // 3D magnetization vector m = (sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta))
    vec3 m_spin = vec3(
        sin( spin_theta ) * cos( azim ),
        sin( spin_theta ) * sin( azim ),
        cos( spin_theta ) );

    // Topological charge density q = m . (dm/dx x dm/dy) ~ sin(theta)/r * dtheta/dr
    float top_charge = abs( sin( spin_theta ) * exp( -min_dist * 3.0 ) );

    // Faraday rotation & photo palette mapping
    float pal_angle = fract( azim * 0.159 + m_spin.z * 0.3 + t * 0.05 + audioCentroid );
    vec3  col_spin = imgPalette( pal_angle );

    // Core highlight & domain boundary lines
    float core_glow = exp( -min_dist * 12.0 ) * ( 1.0 + 3.0 * audioKick );
    float domain_wall = exp( -abs( spin_theta - 1.57 ) * 5.0 ) * ( 0.8 + 0.4 * audioHigh );

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_spin * ( 0.85 + 0.35 * m_spin.z ) * ( 0.8 + 0.4 * audioSwell );
    col += imgPalette( t * 0.1 ) * core_glow * 2.0;
    col += imgPalette( pal_angle + 0.5 ) * domain_wall * 1.2;
    col += imgPalette( audioAdvance * 0.1 ) * ( audioKick * 0.3 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
