#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file HyperspaceGridToroidTube.frag
 * @brief HYPERSPACE GRID TOROID TUBE: High-speed 3D flight within the curved lumen
 * of a giant toroidal geometry tube. Pulsing kinetic neon polygon scales,
 * curving camera bankings, and high-frequency energy grid waves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight progression inside the toroid
 *   audioKick    -> flashes polygon scale grid vertices & energy pulses
 *   audioCentroid-> modulates kinetic scale tessellation frequency
 *   audioSubBass -> expands toroid minor tube radius breathing
 *   audioChromaHue-> rotates the luminous neon grid palette
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

// Per-activation variety
uniform float speedP;    ///< Speed knob, 0..1.
uniform float gridFreqP; ///< Grid freq knob, 0.7..1.5.
uniform float radiusP;   ///< Radius knob, 0..1.
uniform float glowP;     ///< Glow / afterglow knob, 0..1.
uniform float hueP;      ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Distance estimator inside curved Toroid tube
 *
 * @param p        The point. (in)
 * @param rMajor   Major radius. (in)
 * @param rMinor   Minor radius. (in)
 * @param uvCoord  Receives the tube coordinate (for the grid). (out)
 *
 * @return
 *   The distance to the nearest surface.
 **/
float mapToroidTube( vec3 p, float rMajor, float rMinor, out vec2 uvCoord )
{
    float r = length( p.xy );
    float a_major = atan( p.y, p.x );
    float a_minor = atan( p.z, r - rMajor );

    uvCoord = vec2( a_major, a_minor );

    // Inverted distance to inner wall of torus
    float d_wall = rMinor - length( vec2( r - rMajor, p.z ) );
    return d_wall;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float g_freq = ( gridFreqP > 0.01 ) ? gridFreqP : 1.0;
    float r_mod = ( radiusP > 0.01 ) ? radiusP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.228 * spd + audioAdvance * 0.228 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    float rMajor = 3.5 * r_mod;
    float rMinor = 1.15 * ( 1.0 + 0.15 * sin( audioSwell * 2.5 ) + 0.1 * audioSubBass );

    // Camera ride coordinate inside toroid
    float a_cam = t * 0.7;
    vec3  ro = vec3( cos( a_cam ) * rMajor, sin( a_cam ) * rMajor, 0.0 );
    vec3  ta = vec3( cos( a_cam + 0.1 ) * rMajor, sin( a_cam + 0.1 ) * rMajor, 0.0 );

    vec3 T = normalize( ta - ro );
    vec3 up = vec3( 0.0, 0.0, 1.0 );
    vec3 right = normalize( cross( T, up ) );

    vec3 rd = normalize( uv.x * right + uv.y * up + ( 1.25 + 0.2 * sin( audioSwell * 2.0 ) ) * T );

    // Raymarching to hit inner toroid wall
    float tot_dist = 0.0;
    vec2  hit_uv = vec2( 0.0 );
    vec3  hit_col = vec3( 0.0 );

    for ( int i = 0; i < 44; ++i )
    {
        vec3  p = ro + rd * tot_dist;
        vec2  cur_uv;
        float d = mapToroidTube( p, rMajor, rMinor, cur_uv );

        if ( d < 0.005 || tot_dist > 8.0 )
        {
            hit_uv = cur_uv;
            break;
        }

        tot_dist += max( 0.02, d * 0.7 );
    }

    // Kinetic polygon grid lines on toroid wall. Brightness scales only the
    // wall-space term -- the t*3.0 scroll offset stays outside the factor so a
    // changing tessellation frequency cannot remap the accumulated scroll phase.
    float tess = 1.0 + 0.4 * audioCentroid;
    vec2  grid_p_uv = hit_uv * vec2( 16.0 * g_freq * tess, 12.0 * g_freq * tess ) + vec2( t * 3.0, 0.0 );
    vec2  grid_fract = abs( fract( grid_p_uv - 0.5 ) - 0.5 );
    float grid_line = smoothstep( 0.08, 0.0, min( grid_fract.x, grid_fract.y ) );

    // Sample slideshow texture on toroid coordinates
    vec2 sample_uv = fract( hit_uv / 6.2831853 + 0.5 );
    vec3 tex_col = img( sample_uv );
    vec3 pal_col = imgPalette( hit_uv.x / 6.2831853 + t * 0.05 );

    vec3 wall_base = mix( tex_col, pal_col, 0.45 );
    vec3 grid_col = vec3( 1.3, 1.1, 1.8 ) * grid_line * ( 1.0 + 2.5 * audioKick ) * glw;

    hit_col = wall_base * 0.5 + grid_col;

    // Atmospheric depth fog
    float depth_fog = 1.0 - exp( -tot_dist * 0.25 );
    hit_col = mix( hit_col, imgPalette( 0.8 ) * 0.35, depth_fog );

    hit_col = pow( hit_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( hit_col, 0.0, 1.0 ), 1.0 );
}
