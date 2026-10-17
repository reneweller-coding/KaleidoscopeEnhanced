#version 330 core
/*****************************************************************************\
 *                              LiquidMercuryFerrofluidChamber.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  LIQUID MERCURY FERROFLUID CHAMBER: Raymarched reflective pool of liquid mercury and magnetic ferrofluid.
 *
 *  Paramagnetic Rosensweig instability cone spikes erupt in hexagonal arrays under shifting magnetic fields, with
 *  standing Faraday ripples, chrome mirror reflections, and photo dispersion.
 *
 *    audioAdvance -> rotates magnetic field poles & advects liquid ripples
 *    audioKick    -> violently erupts sharp Rosensweig cone spikes from pool
 *    audioBass    -> undulates Faraday standing-wave frequency and height
 *    audioCentroid-> modulates specular chrome highlight sharpness
 *
 *  Per-activation variety:
 *    spikeP   float Rosensweig cone spike sharpness & height (0.5..2.2)
 *    faradayP float Faraday ripple wave amplitude           (0.5..2.0)
 *    speedP   float magnetic field oscillation velocity     (0.5..2.0)
 *    hueP     float metallic sheen hue offset               (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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

uniform float spikeP;   ///< Spike knob: Rosensweig cone spike sharpness & height (0.5..2.2).
uniform float faradayP; ///< Faraday knob: Faraday ripple wave amplitude, 0.5..2.
uniform float speedP;   ///< Speed knob, 0..1.
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


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot2D( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}

/**  Ferrofluid heightfield function
 *
 * @param p    Position on the fluid. (in)
 * @param t    Time. (in)
 * @param spk  Spike knob. (in)
 * @param far  Distance from the camera (fades the detail). (in)
 *
 * @return
 *   The height of the fluid surface.
 **/
float ferroHeight( vec2 p, float t, float spk, float far )
{
    // Hexagonal magnetic lattice pattern.
    // Lattice and ripple frequencies both dropped (4.0 -> 2.4, 18.0 -> 7.0).
    // At the old rates the surface slope changed faster than the picture can
    // resolve: neighbouring pixels got completely unrelated normals, so the
    // mirror lookup below sampled unrelated parts of the photo and the whole
    // pool averaged down to one flat mid grey (measured contrast 0.034). At
    // these rates the spike lattice and the standing waves are individually
    // VISIBLE, which is the entire point of the scene.
    vec2  hex = p * 2.4;
    float h1 = sin( hex.x );
    float h2 = sin( -0.5 * hex.x + 0.866 * hex.y );
    float h3 = sin( -0.5 * hex.x - 0.866 * hex.y );
    float hex_pattern = ( h1 + h2 + h3 ) / 3.0;

    // Rosensweig sharp cone spikes (nonlinear sharpening)
    float spikes = pow( max( 0.0, hex_pattern * 0.5 + 0.5 ), 4.0 ) * ( 0.35 + audioKick * 0.8 ) * spk;

    // Faraday standing waves
    float r = length( p );
    float faraday = sin( r * 7.0 - t * 6.0 ) * cos( atan( p.y, p.x ) * 6.0 ) * 0.09 * far * ( 1.0 + audioBass );

    return spikes + faraday;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float spk = ( spikeP > 0.0 ) ? spikeP : 1.0;
    float far = ( faradayP > 0.0 ) ? faradayP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Raymarching camera angled at the mercury pool
    vec3 ro = vec3( 0.0, 1.8, -2.4 );
    vec3 look_target = vec3( 0.0, 0.0, 0.0 );

    vec3 ww = normalize( look_target - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    vec3 rd = normalize( uv.x * uu + uv.y * vv + 1.2 * ww );

    // Raymarch against heightfield plane y = ferroHeight(x, z)
    float d_o = 0.0;
    float hit_dist = -1.0;
    vec3  p = vec3( 0.0 ); // guarded by hit_dist, but the compiler cannot see that

    for ( int i = 0; i < 45; ++i )
    {
        p = ro + rd * d_o;
        float h = ferroHeight( p.xz, t, spk, far );
        float dist = p.y - h;
        if ( dist < 0.004 )
        {
            hit_dist = d_o;
            break;
        }
        if ( d_o > 8.0 )
            break;
        d_o += dist * 0.6;
    }

    vec3 col = vec3( 0.04, 0.05, 0.08 );

    if ( hit_dist > 0.0 )
    {
        // Normal computation via finite differences. eps widened to band-limit
        // the slope: a 0.005 stencil resolved detail finer than a pixel, which
        // is what turned the mirror into noise.
        vec2  e = vec2( 0.014, 0.0 );
        float h_l = ferroHeight( p.xz - e.xy, t, spk, far );
        float h_r = ferroHeight( p.xz + e.xy, t, spk, far );
        float h_d = ferroHeight( p.xz - e.yx, t, spk, far );
        float h_u = ferroHeight( p.xz + e.yx, t, spk, far );
        vec3  n = normalize( vec3( h_l - h_r, 2.0 * e.x, h_d - h_u ) );

        // Chrome mirror reflection.
        // fract() wrapped the whole photo every 2 units of refl.xz, so the
        // slightest change of slope jumped to an unrelated crop -- clamping to a
        // single, gently-scaled window keeps neighbouring pixels reflecting
        // neighbouring parts of the image, which is what a mirror does.
        vec3 refl = reflect( rd, n );
        vec2 refl_uv = clamp( refl.xz * 0.34 + 0.5, 0.0, 1.0 );
        vec3 photo = img( refl_uv );

        // Environment: a mirror pool reflects a bright ceiling and a dark rim.
        // This is the term that gives the surface its large-scale light/dark --
        // refl.y is a genuine per-point quantity (it swings the full -1..1 as the
        // Rosensweig cones tip the normal over) whereas the photo crop alone was
        // near-constant in average once the picture was resolved.
        float env_up = refl.y * 0.5 + 0.5;
        vec3  env_col = mix( vec3( 0.035, 0.045, 0.075 ),
                             imgPalette( 0.25 + audioPhase * 0.05 ) * 1.15,
                             smoothstep( 0.30, 0.92, env_up ) );

        // Specular highlight from overhead magnetic coil
        vec3  light_dir = normalize( vec3( 0.2, 0.9, 0.1 ) );
        float diff = max( dot( n, light_dir ), 0.0 );
        float spec = pow( max( dot( refl, light_dir ), 0.0 ), 48.0 );

        // Fresnel term for liquid metal
        float fresnel = pow( 1.0 - max( dot( -rd, n ), 0.0 ), 3.0 );

        // Metallic palette (liquid mercury silver + oily thin-film sheen)
        vec3 mercury_base = vec3( 0.85, 0.9, 0.95 );
        vec3 oily_sheen = imgPalette( ( p.y * 12.0 + audioPhase ) * 0.159 );

        vec3 metal = mix( mercury_base, oily_sheen, 0.35 );
        // The mirror image is the environment gradient MODULATED by the photo,
        // not the photo alone; a mirror that only ever shows one crop of one
        // picture has no light and dark of its own.
        vec3 mirror = env_col * ( 0.45 + 0.95 * photo );
        col = mix( metal * 0.28, mirror, 0.60 + 0.32 * fresnel );
        col += metal * diff * 0.22;
        col += spec * vec3( 1.0, 1.0, 1.0 ) * ( 1.2 + audioKick * 2.5 );

        // Distance fog. At 0.2/unit the far half of the pool -- which is most of
        // the frame at this grazing camera angle -- was already 60-80% dissolved
        // into the flat background colour.
        col = mix( col, vec3( 0.05, 0.06, 0.10 ), min( 1.0 - exp( -hit_dist * 0.085 ), 0.55 ) );
    }

    if ( audioChromaHue != 0.0 )
        if ( hue > 0.001 )
            col = hueRot( col, hue );

    col = min( col, vec3( 1.35 ) );
    col /= 1.0 + 0.30 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
