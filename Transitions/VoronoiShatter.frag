#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file VoronoiShatter.frag
 * @brief TRANSITION VORONOI SHATTER: Smooth transition where the scene dissolves through
 * a floating Voronoi cell mosaic. Each polygonal cell smoothly lifts, rotates,
 * and cross-fades with glowing cell boundaries that pulse to the audio.
 *   interpolation -> controls continuous cross-fade & cell lift progress
 *   audioKick     -> flashes cell boundary edges
 *   audioSwell    -> undulates cell rotation amplitude
 *
 * Per-activation variety:
 *   cellP  float Voronoi cell grid density (0.5..2.2)
 *   liftP  float cell lift & displacement  (0.5..2.0)
 *   speedP float cell rotation velocity    (0.5..2.0)
 *   hueP   float edge glow hue offset      (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float cellP; ///< Cell size knob, 0..1.
uniform float liftP;
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/// @brief 2D rotation matrix.
mat2 rot2D( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21( vec2 p )
{
    p = fract( p * vec2( 434.34, 735.21 ) );
    p += dot( p, p + 52.32 );
    return fract( p.x * p.y );
}

vec3 voronoi( vec2 p )
{
    vec2  g = floor( p );
    vec2  f = fract( p );
    float min_dist = 1.0;
    vec2  min_offset = vec2( 0.0 );
    vec2  min_lattice = vec2( 0.0 );

    for ( int y = -1; y <= 1; ++y )
    {
        for ( int x = -1; x <= 1; ++x )
        {
            vec2  lattice = vec2( float( x ), float( y ) );
            vec2  offset = vec2( hash21( g + lattice ), hash21( g + lattice + 33.7 ) );
            vec2  d = lattice + offset - f;
            float dist = length( d );
            if ( dist < min_dist )
            {
                min_dist = dist;
                min_offset = offset;
                min_lattice = lattice;
            }
        }
    }
    return vec3( min_dist, min_offset );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float cll = ( cellP > 0.0 ) ? cellP : 1.0;
    float lft = ( liftP > 0.0 ) ? liftP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.4 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge

    // Transition progress: t_prog in [0, 1]
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float ease = smoothstep( 0.0, 1.0, t_prog );

    // Voronoi cell evaluation
    vec2  cell_coord = p * 12.0 * cll;
    vec3  v = voronoi( cell_coord );
    float cell_dist = v.x;
    float cell_seed = v.y;

    // Per-cell staggered transition timing
    float cell_delay = fract( cell_seed * 7.13 );
    float cell_prog = clamp( ( t_prog - cell_delay * 0.3 ) / 0.7, 0.0, 1.0 );
    cell_prog = smoothstep( 0.0, 1.0, cell_prog );

    // Dynamic rotation & displacement during mid-transition
    float mid_transition = sin( cell_prog * 3.14159265 );
    float cell_angle = ( cell_seed - 0.5 ) * 1.5 * mid_transition * lft * ( 1.0 + 0.5 * audioSwell );
    vec2  disp_uv = ( rot2D( cell_angle ) * ( uv - 0.5 ) ) + 0.5;

    // Sample incoming and outgoing textures
    vec4 c1 = texture( tex1, fract( disp_uv ) );
    vec4 c0 = texture( tex0, fract( disp_uv ) );

    // Smooth blend
    vec4 col = mix( c1, c0, cell_prog );

    // Glowing cell borders
    float border = exp( -cell_dist * 20.0 ) * mid_transition;
    vec3  border_glow = vec3( 0.3, 0.85, 1.0 ) * border * ( 1.5 + audioKick * 1.0 );
    col.rgb += border_glow;

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
