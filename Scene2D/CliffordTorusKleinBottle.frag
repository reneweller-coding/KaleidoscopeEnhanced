#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file CliffordTorusKleinBottle.frag
 * @brief CLIFFORD TORUS KLEIN BOTTLE: 4D non-orientable Klein bottle and flat Clifford
 * torus rotating in 4D space with glass refraction, internal self-intersection,
 * chromatic dispersion, and live photo distortion.
 *   audioAdvance -> drives continuous 4D isometric rotation
 *   audioKick    -> flashes glass refraction shockwaves and caustic sparkles
 *   audioBass    -> pulses figure-8 Klein bottle tube thickness
 *   audioSwell   -> increases chromatic aberration dispersion
 *
 * Per-activation variety:
 *   radiusP  float torus major/minor radius ratio          (0.5..1.8)
 *   glassP   float glass transparency & refraction index   (0.5..2.0)
 *   rotSpdP  float 4D plane rotation speed                 (0.5..2.2)
 *   hueP     float dispersion hue offset                   (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;    ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;    ///< Overall loudness, 0..1.
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid; ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;  ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;  ///< Sub-bass band level, 0..1.
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioMid;      ///< Mid band level, 0..1.
uniform float audioHigh;     ///< High band level, 0..1.
uniform float audioFlux;     ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float radiusP; ///< Radius knob, 0..1.
uniform float glassP;
uniform float rotSpdP;
uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.


uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

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

/**  4D Klein bottle distance function (Figure-8 immersion)
 *
 * @param p       The point. (in)
 * @param rad     Size of the bottle. (in)
 * @param uParam  Receives the toroidal angle. (out)
 * @param vParam  Receives the poloidal angle. (out)
 *
 * @return
 *   The distance to the surface.
 **/
float mapKlein( vec3 p, float rad, out float uParam, out float vParam )
{
    float t_4d = time * 0.35 + audioAdvance * 0.2;

    // Toroidal coordinate transformation
    float r = length( p.xy );
    float u = atan( p.y, p.x );           // Toroidal angle 0..2pi
    float v = atan( p.z, r - 1.8 * rad ); // Poloidal angle

    uParam = u;
    vParam = v;

    // Figure-8 Klein bottle cross-section
    float r_torus = 1.8 * rad;
    float tube_r = 0.55 * ( 0.8 + 0.3 * audioBass );

    // Twisted figure-8 shape
    float cross_dist = length( vec2( r - r_torus, p.z ) ) - tube_r * ( 1.0 + 0.35 * sin( u * 0.5 + t_4d ) );
    return cross_dist * 0.7;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float rad = ( radiusP > 0.0 ) ? radiusP : 1.0;
    float gls = ( glassP > 0.0 ) ? glassP : 1.0;
    float rot = ( rotSpdP > 0.0 ) ? rotSpdP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * rot + audioAdvance * 0.15;
    // Weiter draussen: die ganze Flasche passt ins Bild (Nutzerwunsch).
    vec3 ro = vec3( sin( t ) * 5.2, 2.2 * cos( t * 0.6 ), cos( t ) * 5.2 );
    vec3 ta = vec3( 0.0, 0.0, 0.0 );

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );
    // FOV konstant: der Kick-Zoom war ein Vollbild-Sprung pro Schlag.
    vec3 rd = normalize( uv.x * uu + uv.y * vv + 1.35 * ww );

    float total_dist = 0.0;
    float u_p = 0.0, v_p = 0.0;
    float glow = 0.0;
    bool  hit = false;

    for ( int i = 0; i < 64; ++i )
    {
        vec3  p = ro + rd * total_dist;
        float d = mapKlein( p, rad, u_p, v_p );

        glow += exp( -max( d, 0.0 ) * 14.0 ) * ( 0.015 * gls );

        if ( d < 0.002 )
        {
            hit = true;
            break;
        }
        if ( total_dist > 13.0 )
            break;
        total_dist += max( d * 0.65, 0.006 );
    }

    vec3 col = vec3( 0.01, 0.02, 0.04 );

    if ( hit )
    {
        vec3 p = ro + rd * total_dist;

        // Normal
        float du, dv;
        float eps = 0.003;
        vec3  n = normalize( vec3(
            mapKlein( p + vec3( eps, 0.0, 0.0 ), rad, du, dv ) - mapKlein( p - vec3( eps, 0.0, 0.0 ), rad, du, dv ),
            mapKlein( p + vec3( 0.0, eps, 0.0 ), rad, du, dv ) - mapKlein( p - vec3( 0.0, eps, 0.0 ), rad, du, dv ),
            mapKlein( p + vec3( 0.0, 0.0, eps ), rad, du, dv ) - mapKlein( p - vec3( 0.0, 0.0, eps ), rad, du, dv ) ) );

        // Glass Fresnel reflection & refraction
        float fresnel = pow( 1.0 - max( dot( -rd, n ), 0.0 ), 3.0 );
        vec3  ref_dir = reflect( rd, n );
        vec3  refr_dir = refract( rd, n, 0.85 );

        // Refracted photo texture with chromatic dispersion
        vec2 refr_uv = st + refr_dir.xy * 0.15 * ( 1.0 + audioSwell );
        vec3 refr_photo;
        refr_photo.r = img( refr_uv + vec2( 0.008, 0.0 ) ).r;
        refr_photo.g = img( refr_uv ).g;
        refr_photo.b = img( refr_uv - vec2( 0.008, 0.0 ) ).b;

        // Klein bottle non-orientable rainbow gradient
        vec3 klein_rainbow = imgPalette( ( u_p + v_p * 2.0 + audioPhase ) * 0.159 );

        col = mix( refr_photo, klein_rainbow, 0.35 );
        col += vec3( 1.0, 0.95, 0.8 ) * fresnel * ( 1.2 + audioKick * 2.5 );
    }
    else
    {
        // Background photo
        col = img( st ) * 0.3;
    }

    // Add glowing glass edges
    vec3 glow_col = imgPalette( 0.5 + 0.2 * sin( time * 2.5 ) );
    col += glow_col * glow * ( 1.0 + audioKick * 3.0 );

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    fragColor = vec4( col, 1.0 );
}
