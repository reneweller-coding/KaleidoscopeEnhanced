#version 330 core
/*****************************************************************************\
 *                              LiquidChromeHyperSwirl.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  LIQUID CHROME HYPER SWIRL: Ultra-reflective liquid mercury sea agitated by multiple orbiting gravitational
 *  vortex sinks with chromatic normal reflections, high-frequency capillary ripples, and glowing Fresnel metallic
 *  highlights.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous multi-vortex liquid fluid advection
 *    audioKick    -> excites high-amplitude capillary surface ripples & specular bursts
 *    audioCentroid-> sharpens chrome environment reflection curvature
 *    audioSubBass -> expands gravitational vortex suction depth
 *    audioChromaHue-> rotates the liquid chrome reflection palette
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
uniform float speedP;       ///< Speed knob, 0..1.
uniform float vortexCountP; ///< Vortex count knob, 2..4.
uniform float chromeP;      ///< Chrome knob, 0.8..1.6.
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

/**  Fluid surface height field evaluated across 3 orbiting gravitational vortex sinks
 *
 * @param p          Position on the surface. (in)
 * @param t          The scene's time. (in)
 * @param nVortices  Number of vortices (2..4). (in)
 *
 * @return
 *   The height.
 **/
float liquidHeight( vec2 p, float t, float nVortices )
{
    float h = 0.0;
    int   num_v = int( clamp( nVortices, 2.0, 4.0 ) );

    for ( int k = 0; k < 4; ++k )
    {
        if ( k >= num_v )
            break;
        float kf = float( k );
        float orbit_a = t * 0.4 + kf * ( 6.2831853 / float( num_v ) );
        float orbit_r = 0.5 + 0.2 * sin( t * 0.5 + kf );
        vec2  v_center = vec2( cos( orbit_a ), sin( orbit_a ) ) * orbit_r;

        vec2  rel = p - v_center;
        float dist = length( rel );
        float angle = atan( rel.y, rel.x );

        // Vortex swirling depression + spiral ripple arms
        float vortex_spiral = sin( angle * 3.0 - dist * 12.0 + t * 3.0 );
        float sink = -1.0 / ( dist * 3.0 + 0.4 );

        h += ( sink * 0.5 + vortex_spiral * 0.25 ) * ( 0.8 + 0.6 * audioSubBass );
    }

    // High-frequency capillary ripples
    float capillary = sin( p.x * 25.0 + t * 4.0 ) * cos( p.y * 25.0 - t * 3.5 ) * ( 0.05 + 0.08 * audioKick );
    return h + capillary;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float n_v = ( vortexCountP > 1.0 ) ? vortexCountP : 3.0;
    float chrm = ( chromeP > 0.01 ) ? chromeP : 1.2;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Multi-vortex fluid surface normal estimation
    float eps = 0.006;
    float h_c = liquidHeight( uv, t, n_v );
    float h_x = liquidHeight( uv + vec2( eps, 0.0 ), t, n_v );
    float h_y = liquidHeight( uv + vec2( 0.0, eps ), t, n_v );

    // Brightness steepens the height gradient fed into the normal, so the
    // mercury surface curves harder and the mirrored environment compresses
    // into tighter, sharper reflection bands.
    float refl_curv = chrm * ( 1.0 + 0.4 * audioCentroid );
    vec3  normal = normalize( vec3( ( h_x - h_c ) * refl_curv, ( h_y - h_c ) * refl_curv, eps * 2.0 ) );

    // View vector and reflection vector on liquid surface
    vec3 view_dir = normalize( vec3( uv, 1.2 ) );
    vec3 refl_dir = reflect( -view_dir, normal );

    // Fresnel reflectance: Schlick's approximation for liquid mercury (high base reflectivity)
    float cos_theta = clamp( dot( view_dir, normal ), 0.0, 1.0 );
    float fresnel = 0.7 + 0.3 * pow( 1.0 - cos_theta, 5.0 );

    // Sample distorted photo texture via reflection vector
    vec2 refl_uv = fract( refl_dir.xy * 0.4 + 0.5 + vec2( t * 0.05, 0.0 ) );
    vec3 tex_refl = img( refl_uv );

    // Chromatic dispersion in chrome reflection
    vec3 pal_r = imgPalette( refl_dir.z * 0.5 + 0.02 );
    vec3 pal_g = imgPalette( refl_dir.z * 0.5 );
    vec3 pal_b = imgPalette( refl_dir.z * 0.5 - 0.02 );
    vec3 chrome_tint = vec3( pal_r.r, pal_g.g, pal_b.b );

    vec3 liquid_col = mix( tex_refl, chrome_tint, 0.55 );

    // Specular light source highlights
    vec3  light_dir = normalize( vec3( cos( t * 0.6 ), sin( t * 0.6 ), 1.0 ) );
    vec3  half_vec = normalize( light_dir + view_dir );
    float spec = pow( max( 0.0, dot( normal, half_vec ) ), 32.0 ) * ( 1.0 + 3.0 * audioKick ) * glw;

    liquid_col = liquid_col * fresnel + vec3( 1.4, 1.4, 1.6 ) * spec;

    // Center vortex sink glow
    float sink_glow = smoothstep( -1.2, -2.5, h_c ) * ( 0.8 + 1.2 * audioKick );
    liquid_col += imgPalette( 0.85 ) * sink_glow;

    liquid_col = pow( liquid_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( liquid_col, 0.0, 1.0 ), 1.0 );
}
