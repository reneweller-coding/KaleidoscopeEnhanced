#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file NewtonBasinPsychedelicSea.frag
 * @brief NEWTON BASIN PSYCHEDELIC SEA: Higher-order complex Newton-Raphson
 * root attraction basins with 3D embossed normal relief, fluid relaxation
 * currents, specular wave glints, and dynamic polynomial coefficient rotation.
 *
 * Audio Reactivity:
 *   audioAdvance -> rotates complex polynomial roots & drives wave relaxation
 *   audioKick    -> flashes root convergence singularities & shockwave pulse
 *   audioCentroid-> selects polynomial degree power & fine basin ridges
 *   audioSubBass -> expands ocean basin wave amplitude
 *   audioChromaHue-> rotates the iridescent sea sunset palette
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
uniform float speedP;  ///< Speed knob, 0..1.
uniform float powerP;  ///< Power knob, 0.8..1.5.
uniform float reliefP; ///< Relief knob, 0..1.
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Overall level of the photo currently bound, from a fixed 5-tap grid.
 *
 * @return
 *   The photo's average level, 0..1.
 *
 * The basin colour is entirely photo-derived and the library spans near-black to near-white, so a bright photo left the
 * sea glints and boundary lines no headroom. The probe rides the tex0/tex1 crossfade so the gain can never pop, and one
 * number for the whole frame rescales exposure without touching local contrast.
 **/
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/**  Complex arithmetic helpers
 *
 * @param a  One complex number. (in)
 * @param b  The other. (in)
 *
 * @return
 *   The product a b.
 **/
vec2 cMul( vec2 a, vec2 b )
{
    return vec2( a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x );
}
/**  Complex division
 *
 * @param a  The numerator. (in)
 * @param b  The denominator. (in)
 *
 * @return
 *   The quotient a / b.
 **/
vec2 cDiv( vec2 a, vec2 b )
{
    return vec2( dot( a, b ), a.y * b.x - a.x * b.y ) / max( 1e-6, dot( b, b ) );
}

/**  Integer power of a complex number.
 *
 * @param z  The complex number. (in)
 * @param n  The exponent (up to 7). (in)
 *
 * @return
 *   z^n.
 **/
vec2 cPow( vec2 z, int n )
{
    vec2 res = vec2( 1.0, 0.0 );
    for ( int i = 0; i < 7; ++i )
    {
        if ( i >= n )
            break;
        res = cMul( res, z );
    }
    return res;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float rel = ( reliefP > 0.01 ) ? reliefP : 1.2;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.28 * spd + audioAdvance * 0.22 * spd; // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Polynomial power (3 to 6)
    int n_power = int( clamp( 3.0 + floor( powerP * 2.0 + audioCentroid * 2.0 ), 3.0, 6.0 ) );

    // Dynamic constant offset c = c_r + i * c_i
    vec2 c_const = vec2(
        1.0 + 0.3 * sin( t * 0.4 ),
        0.3 * cos( t * 0.35 + audioFlux ) );

    // Initial complex coordinate with zoom & rotation
    float zoom = 1.45 + 0.25 * sin( audioSwell * 2.0 );
    float rot_a = t * 0.12;
    float cs = cos( rot_a ), sn = sin( rot_a );
    vec2  z = mat2( cs, -sn, sn, cs ) * uv * zoom;

    float iter_count = 0.0;

    // Newton-Raphson iteration: z -> z - (z^n - c) / (n * z^(n-1))
    for ( int i = 0; i < 22; ++i )
    {
        vec2 zn = cPow( z, n_power );
        vec2 zn_minus_1 = cPow( z, n_power - 1 );

        vec2 fz = zn - c_const;
        vec2 dfz = float( n_power ) * zn_minus_1;

        vec2 step_z = cDiv( fz, dfz );
        z -= step_z;

        float step_len = dot( step_z, step_z );
        if ( step_len < 0.0001 )
        {
            iter_count = float( i );
            break;
        }

        iter_count += 1.0;
    }

    // Determine root angle sector
    float root_angle = atan( z.y, z.x );
    float root_sector = ( root_angle + 3.14159265 ) / ( 6.2831853 / float( n_power ) );

    // 3D Embossed surface normal estimation based on iteration gradient
    float eps = 0.005;
    vec2  z_dx = uv + vec2( eps, 0.0 );
    vec2  z_dy = uv + vec2( 0.0, eps );
    // The sin() term is the sea swell riding on the iteration terrain; sub-bass
    // scales its amplitude only (never its phase), so heavy lows deepen the
    // wave relief that the normal -- and therefore the glints -- are built from.
    float wave_amp = 1.0 + 0.5 * audioSubBass;
    float h_center = iter_count + wave_amp * sin( root_angle * float( n_power ) * 2.0 + t );
    float h_dx = iter_count + wave_amp * sin( atan( z_dx.y, z_dx.x ) * float( n_power ) * 2.0 + t );
    float h_dy = iter_count + wave_amp * sin( atan( z_dy.y, z_dy.x ) * float( n_power ) * 2.0 + t );

    vec3 normal = normalize( vec3( ( h_dx - h_center ) * rel, ( h_dy - h_center ) * rel, eps * 3.0 ) );
    vec3 light_dir = normalize( vec3( cos( t * 0.5 ), sin( t * 0.5 ), 1.2 ) );

    // Lighting: Diffuse + Specular sea glints
    float diff = max( 0.0, dot( normal, light_dir ) );
    vec3  view_dir = vec3( 0.0, 0.0, 1.0 );
    vec3  half_vec = normalize( light_dir + view_dir );
    float spec = pow( max( 0.0, dot( normal, half_vec ) ), 24.0 ) * ( 1.0 + 2.0 * audioKick );

    // Dynamic texture sample mapped to converged root basin
    vec2 sample_uv = fract( z * 0.4 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Multi-attractor psychedelic coloring
    vec3 pal_a = imgPalette( root_sector / float( n_power ) + iter_count * 0.05 );
    vec3 pal_b = imgPalette( root_sector / float( n_power ) + 0.5 );
    vec3 basin_col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( iter_count * 0.6 + t ) );

    basin_col = mix( basin_col, tex_col, 0.35 + 0.15 * audioValence );

    // Hold the sea surface to a fixed level so the relief, the glints and the
    // basin boundaries are what carries the light, whatever photo is bound.
    basin_col *= clamp( 0.32 / max( 0.05, photoLevel() ), 0.20, 2.4 );

    // Glowing root boundary lines. The old metric was min(step_len) fed into
    // exp(-d * 50) -- but Newton converges QUADRATICALLY, so every pixel's
    // smallest step is ~1e-4..1e-2 and that exponential evaluated to ~0.9
    // across the entire frame: an unbroken magenta flood that clipped the
    // basin interiors to white and left the boundaries (which converge
    // slowly, i.e. large steps) as the only DARK part of the picture -- the
    // exact inverse of the intent. A basin boundary is where convergence is
    // slow, so key the glow off the iteration count instead.
    float converge_slow = clamp( iter_count / 22.0, 0.0, 1.0 );
    float root_edge_glow = smoothstep( 0.45, 1.0, converge_slow ) * glw;

    basin_col = basin_col * ( 0.25 + 0.75 * diff )
                + min( vec3( 1.2, 1.3, 1.5 ) * spec, vec3( 1.15 ) );
    basin_col += min( vec3( 1.4, 0.9, 1.6 ) * root_edge_glow * ( 1.0 + 2.5 * audioKick ), vec3( 1.25 ) );

    basin_col = pow( basin_col, vec3( 0.87 ) );
    vec3 cat_tone = clamp( basin_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.28 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) ); // peak knee round 2
    float nb_lum = dot( cat_tone, vec3( 0.299, 0.587, 0.114 ) );
    cat_tone = clamp( mix( vec3( nb_lum ), cat_tone, 1.35 ), 0.0, 1.0 );
    fragColor = vec4( cat_tone, 1.0 );
}
