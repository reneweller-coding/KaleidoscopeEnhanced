#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file VoronoiPrismShatterKaleido.frag
 * @brief VORONOI PRISM SHATTER KALEIDO: Dynamic Voronoi crystal cell shatter matrix
 * with tilting diamond facets, chromatic refraction dispersion, 8-fold kaleidoscopic
 * symmetry, and explosive fragment displacement shockwaves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous Voronoi crystal cell motion & facet rotation
 *   audioKick    -> explodes crystal cell shockwaves & flashes diamond edge facets
 *   audioCentroid-> modulates Voronoi cell density & dispersion sharpness
 *   audioSubBass -> expands crystal cell breathing displacement
 *   audioChromaHue-> rotates the prismatic diamond rainbow palette
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
uniform float speedP;       ///< Speed knob, 0..1.
uniform float cellDensityP; ///< Cell density knob, 0.7..1.5.
uniform float shatterP;     ///< Shatter knob, 0.7..1.4.
uniform float glowP;        ///< Glow / afterglow knob, 0..1.
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

/**  2D Voronoi evaluation returning (minDist, cell_id, borderDist)
 *
 * @param p  The point. (in)
 * @param t  Phase of the cell centres' motion. (in)
 *
 * @return
 *   Distance to the nearest centre (x), the cell id (y, z) and the distance to the cell's border (w).
 **/
vec4 voronoi( vec2 p, float t )
{
    vec2 n = floor( p );
    vec2 f = fract( p );

    vec2  mg, mr;
    float md = 8.0;
    for ( int j = -1; j <= 1; ++j )
    {
        for ( int i = -1; i <= 1; ++i )
        {
            vec2  g = vec2( float( i ), float( j ) );
            vec2  o = sin( n + g + vec2( t * 0.4, t * 0.5 ) ) * 0.4 + 0.5;
            vec2  r = g + o - f;
            float d = dot( r, r );

            if ( d < md )
            {
                md = d;
                mr = r;
                mg = g;
            }
        }
    }

    // Border distance calculation
    float mdb = 8.0;
    for ( int j = -2; j <= 2; ++j )
    {
        for ( int i = -2; i <= 2; ++i )
        {
            vec2 g = mg + vec2( float( i ), float( j ) );
            vec2 o = sin( n + g + vec2( t * 0.4, t * 0.5 ) ) * 0.4 + 0.5;
            vec2 r = g + o - f;

            if ( dot( mr - r, mr - r ) > 0.00001 )
            {
                mdb = min( mdb, dot( 0.5 * ( mr + r ), normalize( r - mr ) ) );
            }
        }
    }

    return vec4( sqrt( md ), n + mg, mdb );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float c_dens = ( cellDensityP > 0.01 ) ? cellDensityP : 1.0;
    float shtr = ( shatterP > 0.01 ) ? shatterP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // 8-Fold radial kaleidoscope symmetry
    float a = atan( uv.y, uv.x );
    float r = length( uv );
    float seg = 3.14159265 / 4.0;
    a = mod( a + seg * 0.5, seg ) - seg * 0.5;
    a = abs( a );
    vec2 p_fold = vec2( cos( a ), sin( a ) ) * r;

    // Voronoi cell coordinates
    vec2 p_vor = p_fold * ( 6.0 * c_dens );

    // Shatter displacement shockwave on kicks, plus a slow sub-bass swell that
    // pushes the cells outward along the same radial axis -- the crystal
    // breathes apart on drones between the sharp kick bursts.
    vec2 shatter_offset = ( p_fold / max( 0.1, r ) ) * ( ( audioKick * 0.4 + 0.35 * audioSubBass ) * shtr );
    p_vor += shatter_offset;

    vec4  v_info = voronoi( p_vor, t );
    float d_center = v_info.x;
    vec2  cell_id = v_info.yz;
    float d_border = v_info.w;

    // Diamond crystal facet normal tilt
    vec3 facet_normal = normalize( vec3( cos( cell_id.x * 12.3 + t ), sin( cell_id.y * 14.5 - t ), 1.2 ) );

    // Chromatic dispersion refraction on cell facet
    float d_lambda = 0.015 * ( 1.0 + audioCentroid );
    vec2  uv_r = fract( p_fold * 0.4 + facet_normal.xy * ( 0.08 - d_lambda ) + 0.5 );
    vec2  uv_g = fract( p_fold * 0.4 + facet_normal.xy * 0.08 + 0.5 );
    vec2  uv_b = fract( p_fold * 0.4 + facet_normal.xy * ( 0.08 + d_lambda ) + 0.5 );

    vec3 tex_r = img( uv_r );
    vec3 tex_g = img( uv_g );
    vec3 tex_b = img( uv_b );
    vec3 tex_prism = vec3( tex_r.r, tex_g.g, tex_b.b );

    // Glowing Voronoi facet borders
    float border_glow = exp( -d_border * ( 30.0 + 15.0 * audioCentroid ) ) * glw;
    float facet_spark = pow( max( 0.0, dot( facet_normal, normalize( vec3( 1.0, 1.0, 2.0 ) ) ) ), 24.0 );

    // Palette mixing per cell ID
    vec3 pal_col = imgPalette( sin( dot( cell_id, vec2( 12.9898, 78.233 ) ) ) * 0.5 + 0.5 );
    vec3 cell_col = mix( tex_prism, pal_col, 0.45 );

    // Add glowing border struts & diamond sparks
    vec3 border_tint = vec3( 1.4, 1.1, 1.8 ) * border_glow * ( 1.0 + 3.0 * audioKick );
    cell_col += border_tint + vec3( 1.5, 1.5, 1.8 ) * facet_spark * ( 1.0 + 2.0 * audioKick );

    cell_col = pow( cell_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( cell_col, 0.0, 1.0 ), 1.0 );
}
