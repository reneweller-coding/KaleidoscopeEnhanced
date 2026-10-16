#version 330 core
/*****************************************************************************\
 *                              MandelbulbHyperRealm.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  MANDELBULB HYPER REALM: Raymarched infinite 3D Mandelbulb fractal realm (z^N + c) with audio-reactive power N
 *  morphing, internal crystalline cave traversal, and thin-film metallic specular iridescence with photo texture
 *  blending.
 *
 *    audioSwell   -> dynamically morphs fractal power N (2.0 to 8.0)
 *    audioKick    -> ignites metallic specular core flare & laser beams
 *    audioPhase   -> rotates higher-dimensional 3D slicing planes
 *    audioCentroid-> shifts thin-film metallic iridescence palette
 *
 *  Per-activation variety:
 *    powerP   float base Mandelbulb power N                 (4.0..8.0)
 *    zoomP    float camera flight zoom depth                (0.5..1.8)
 *    glowP    float interior crystal glow intensity         (0.5..2.2)
 *    hueP     float spectrum base hue rotation              (0..6.28)
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
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float powerP; ///< Power knob: base Mandelbulb power N, 4..8.
uniform float zoomP;  ///< Zoom knob, 0..1.
uniform float glowP;  ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  IMG-PALETTE (house standard, replaces the generic cos-rainbow): colours come from a rotating arc in the CURRENT
 * slideshow image, so every activation inherits a fresh palette from the photos, and the arc follows the musical
 * key (chromaHue is circular-slewed = jump-free) with a slow advance drift.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 *
 * Valence shapes saturation toward the mood.
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
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

/**  3D Mandelbulb distance estimator
 *
 * @param p      The point. (in)
 * @param power  Power of the bulb. (in)
 * @param trap   Receives the orbit trap. (out)
 *
 * @return
 *   The distance estimate.
 **/
float mandelbulb( vec3 p, float power, out float trap )
{
    vec3  w = p;
    float m = dot( w, w );
    float dz = 1.0;
    float r = 0.0;
    trap = 1e10;

    for ( int i = 0; i < 6; ++i )
    {
        dz = power * pow( m, ( power - 1.0 ) * 0.5 ) * dz + 1.0;
        r = length( w );
        trap = min( trap, r );

        float b = power * acos( clamp( w.y / max( r, 0.001 ), -1.0, 1.0 ) );
        float a = power * atan( w.x, w.z );

        w = p + pow( r, power ) * vec3( sin( b ) * sin( a ), cos( b ), sin( b ) * cos( a ) );
        m = dot( w, w );
        if ( m > 4.0 )
            break;
    }

    return 0.25 * log( m ) * sqrt( m ) / dz;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float pwr = ( powerP > 0.0 ) ? powerP : 6.0;
    float zm = ( zoomP > 0.0 ) ? zoomP : 1.0;
    float glw = ( glowP > 0.0 ) ? glowP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    // Dynamic Mandelbulb power modulated by audio swell
    float active_power = pwr + 2.0 * sin( audioAdvance * 0.2 + time * 0.3 ) + 1.5 * audioSwell;

    // Orbiting / diving camera path
    float t = time * 0.25 + audioAdvance * 0.15;
    float cam_dist = ( 1.8 - 0.6 * sin( t * 0.5 ) ) / zm;
    vec3  ro = vec3( sin( t ) * cam_dist, 0.5 * cos( t * 0.7 ), cos( t ) * cam_dist );
    vec3  ta = vec3( 0.0, 0.0, 0.0 );

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );
    vec3 rd = normalize( uv.x * uu + uv.y * vv + 1.5 * ww );

    float total_dist = 0.0;
    float trap = 0.0;
    float min_trap = 1e10;
    float glow_acc = 0.0;
    bool  hit = false;

    for ( int i = 0; i < 80; ++i )
    {
        vec3  p = ro + rd * total_dist;
        float d = mandelbulb( p, active_power, trap );
        min_trap = min( min_trap, trap );

        glow_acc += exp( -max( d, 0.0 ) * 12.0 ) * ( 0.02 * glw );

        if ( d < 0.001 )
        {
            hit = true;
            break;
        }
        if ( total_dist > 8.0 )
            break;
        total_dist += max( d * 0.65, 0.003 );
    }

    vec3 col = vec3( 0.01, 0.02, 0.05 );

    if ( hit )
    {
        vec3 p = ro + rd * total_dist;

        // Normal computation
        float dummy_trap;
        float eps = 0.002;
        vec3  n = normalize( vec3( mandelbulb( p + vec3( eps, 0.0, 0.0 ), active_power, dummy_trap )
                                       - mandelbulb( p - vec3( eps, 0.0, 0.0 ), active_power, dummy_trap ),
                                   mandelbulb( p + vec3( 0.0, eps, 0.0 ), active_power, dummy_trap )
                                       - mandelbulb( p - vec3( 0.0, eps, 0.0 ), active_power, dummy_trap ),
                                   mandelbulb( p + vec3( 0.0, 0.0, eps ), active_power, dummy_trap )
                                       - mandelbulb( p - vec3( 0.0, 0.0, eps ), active_power, dummy_trap ) ) );

        // Iridescent Thin-Film Specular Shading
        vec3  light_dir = normalize( vec3( 0.8, 1.2, -0.6 ) );
        float diff = max( dot( n, light_dir ), 0.0 );
        vec3  ref = reflect( rd, n );
        float spec = pow( max( dot( ref, light_dir ), 0.0 ), 32.0 );

        // Orbit trap color mapping
        vec3 base_col = imgPalette( ( min_trap * 8.0 + audioCentroid * 3.0 ) * 0.159 );

        // Photo mapping from triplanar surface
        vec2 photo_coord = fract( p.xy * 0.8 + 0.5 );
        vec3 photo = img( photo_coord );

        col = mix( base_col, photo, 0.4 ) * ( diff * 0.8 + 0.2 );
        col += vec3( 1.0, 0.9, 0.7 ) * spec * ( 1.5 + audioKick * 3.0 );

        // Distance fog
        col = mix( col, vec3( 0.01, 0.02, 0.06 ), smoothstep( 2.5, 7.0, total_dist ) );
    }

    // Add interior fractal glow
    vec3 glow_color = mix( vec3( 0.9, 0.2, 0.5 ), vec3( 0.2, 0.8, 1.0 ), sin( audioPhase + time ) * 0.5 + 0.5 );
    col += glow_color * glow_acc * ( 1.0 + audioKick * 2.5 );

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.5;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
