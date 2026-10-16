#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file GrapheneDiracPlasmonics.frag
 * @brief GRAPHENE DIRAC PLASMONICS: 100% viewport-filling 2D honeycomb carbon
 * graphene lattice visualizing Dirac cones, topological quantum Hall edge
 * states, localized electronic wavepacket hops, and plasmonic resonances.
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;        ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;     ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;      ///< Sub-bass band level, 0..1.
uniform float audioBass;         ///< Bass band level, 0..1.
uniform float audioMid;          ///< Mid band level, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioFlux;         ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.

uniform float latticeP;
uniform float plasmonP;
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}


/// IMG-PALETTE (house standard): colours come from a rotating arc in the
/// CURRENT slideshow image, so every activation inherits a fresh palette from
/// the photos; the arc follows the musical key (audioChromaHue is circular-
/// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/// Hexagonal honeycomb distance helper
vec4 hexLattice( vec2 p )
{
    vec2 s = vec2( 1.0, 1.7320508 );
    vec4 h_c = floor( vec4( p, p - vec2( 0.5, 1.0 ) ) / s.xyxy ) + 0.5;
    vec4 h = vec4( p - h_c.xy * s, p - ( h_c.zw + 0.5 ) * s );
    return ( dot( h.xy, h.xy ) < dot( h.zw, h.zw ) ) ? vec4( h.xy, h_c.xy ) : vec4( h.zw, h_c.zw + vec2( 0.5, 0.5 ) );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float lat = ( latticeP > 0.0 ) ? latticeP : 1.0;
    float pls = ( plasmonP > 0.0 ) ? plasmonP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Honeycomb coordinates
    vec2 p = uv * 14.0 * lat;
    vec4 h = hexLattice( p );
    vec2 local_pos = h.xy;
    vec2 cell_center = h.zw;

    // Carbon-carbon covalent bond lines
    float hex_edge = abs( length( local_pos ) - 0.5 );
    float bond_line = smoothstep( 0.08, 0.02, hex_edge );

    // Atomic carbon nuclei at honeycomb vertices
    float nucleus = exp( -dot( local_pos, local_pos ) * 35.0 );

    // Dirac cone electronic wave dispersion: E(k) = +/- hbar * v_F * |k - K|
    float k_dist = length( cell_center * 0.2 );
    float dirac_energy = abs( sin( k_dist * 4.0 - t * 2.0 ) );

    // Spectrum band excitation per carbon ring
    float cell_hash = fract( sin( dot( cell_center, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    int   band_idx = int( clamp( cell_hash * 31.0, 0.0, 31.0 ) );
    float band_energy = audioSpectrum[band_idx];

    // Plasmonic wavepacket traveling across the sheet
    // USER-FEEDBACK: two CROSSING wavefronts + an expanding kick ring —
    // the plasmons visibly travel and collide instead of one static stripe.
    float w1 = pow( 0.5 + 0.5 * sin( dot( p, normalize( vec2( 1.0, 0.5 ) ) ) - time * 6.0 ), 8.0 );
    float w2 = pow( 0.5 + 0.5 * sin( dot( p, normalize( vec2( -0.6, 1.0 ) ) ) - time * 4.6 - audioPhase ), 8.0 );
    float ring_r = fract( time * 0.45 + audioAdvance * 0.2 ) * 1.5;
    float ring = pow( max( 0.0, 1.0 - abs( length( uv ) - ring_r ) * 6.0 ), 2.0 )
                 * ( 0.4 + 1.6 * audioKick );
    float plasmon_wave = ( w1 + w2 * 0.8 ) * ( 1.0 + 1.2 * audioKick );

    // Photo projection on electronic density of states
    vec2 photo_uv = cell_center * 0.08 + vec2( 0.5 );
    vec3 photo_col = img( fract( photo_uv ) );

    // Quantum colors: Graphene carbon grey + neon cyan/amber Dirac plasmons
    vec3 carbon_base = vec3( 0.06, 0.08, 0.12 ) * photo_col;
    vec3 bond_neon = vec3( 0.0, 0.85, 1.0 ) * ( 0.6 + 1.5 * dirac_energy );
    vec3 plasmon_col = imgPalette( 0.12 ) * plasmon_wave * 2.6 * pls + imgPalette( 0.55 ) * ring * 2.0;
    vec3 nucleus_glow = vec3( 1.0, 0.9, 0.4 ) * nucleus * ( 1.0 + 2.0 * band_energy );

    vec3 col = carbon_base + bond_neon * bond_line * 1.8 + plasmon_col + nucleus_glow;
    col += vec3( 0.3, 0.8, 1.0 ) * audioKick * exp( -length( uv ) * 3.5 ) * 1.5; // Quantum Hall pulse

    col = hueRot( col, hue ); // chromaHue handled inside imgPalette
    col = pow( col, vec3( 0.88 ) );
    col *= 0.8;
    col /= 1.0 + 0.30 * max( col.r, max( col.g, col.b ) );

    fragColor = vec4( col, 1.0 );
}
