#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file StainedGlassCathedralCaustics.frag
 * @brief STAINED GLASS CATHEDRAL CAUSTICS: 100% viewport-filling Gothic cathedral
 * rose window. The loaded photo is transformed into a luminous stained glass
 * masterpiece with procedural lead tracery, antique bubbled glass refraction,
 * and volumetric sunbeams (godrays) casting jewel-toned caustics.
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

uniform float traceryP;
uniform float godrayP;
uniform float glassP;
uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 123.34, 345.45 ) );
    p += dot( p, p + 34.345 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float trc = ( traceryP > 0.0 ) ? traceryP : 1.0;
    float gdr = ( godrayP > 0.0 ) ? godrayP : 1.0;
    float gls = ( glassP > 0.0 ) ? glassP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float r = length( uv );
    float angle = atan( uv.y, uv.x );

    // 16-fold Gothic rosette symmetry
    float sectors = 16.0;
    float sector_angle = 6.2831853 / sectors;
    float sym_angle = mod( angle + time * 0.05 + audioAdvance * 0.05 + 0.5 * sector_angle, sector_angle )
                      - 0.5 * sector_angle;
    vec2  sym_uv = vec2( cos( sym_angle ), sin( sym_angle ) ) * r;

    // Procedural Gothic lead came (tracery borders)
    float ring1 = abs( r - 0.22 );
    float ring2 = abs( r - 0.45 );
    float ring3 = abs( r - 0.70 );
    float petal = abs( sin( sym_angle * 8.0 ) * 0.18 + 0.35 - r );
    float spokes = abs( sym_angle * r );

    float lead_tracery = min( min( min( ring1, ring2 ), min( ring3, petal ) ), spokes ) * trc;
    float lead_came = smoothstep( 0.008, 0.018, lead_tracery ); // 0 at lead borders, 1 in glass

    // Antique bubbled glass refraction
    float glass_noise = hash21( floor( sym_uv * 40.0 * gls ) );
    vec2  glass_displace = vec2(
                               sin( glass_noise * 6.28 + time * 0.5 ),
                               cos( glass_noise * 6.28 + time * 0.5 ) )
                           * ( 0.015 * gls );

    // Photo texture embedded in stained glass panels
    vec2 photo_uv = sym_uv * 0.8 + vec2( 0.5 ) + glass_displace;
    vec3 stained_photo = img( fract( photo_uv ) );

    // Jewel-tone color enhancement (ruby reds, sapphire blues, emeralds, amber)
    stained_photo = pow( stained_photo, vec3( 0.8 ) ) * 1.5;

    // Dark cast-lead borders
    vec3 lead_color = vec3( 0.06, 0.07, 0.09 );
    vec3 glass_color = mix( lead_color, stained_photo, lead_came );

    // Volumetric sunbeams (godrays) streaming from sunlight source
    vec2  light_source = vec2( sin( time * 0.2 ) * 0.3, 0.2 + cos( time * 0.15 ) * 0.2 );
    vec2  ray_dir = uv - light_source;
    float ray_dist = length( ray_dir );
    float sun_ray = sin( atan( ray_dir.y, ray_dir.x ) * 24.0 + time * 2.0 ) * 0.5 + 0.5;
    sun_ray = pow( sun_ray, 4.0 ) * exp( -ray_dist * 1.2 );

    vec3 godray_color = ( stained_photo + vec3( 1.0, 0.9, 0.6 ) ) * sun_ray * ( 1.2 + 2.5 * audioKick ) * gdr
                        * ( 0.8 + 0.6 * audioSwell );

    // Bass vibration on cathedral window panels
    float bass_vibe = sin( r * 40.0 - time * 12.0 ) * audioBass * 0.2 * lead_came;
    glass_color += vec3( 0.2, 0.6, 1.0 ) * bass_vibe;

    vec3 col = glass_color + godray_color;

    // Subtle cathedral interior ambient depth
    col += vec3( 0.04, 0.02, 0.06 ) * ( 1.0 - lead_came );

    col = hueRot( col, audioChromaHue + hue );
    col = pow( col, vec3( 0.9 ) );

    col *= 0.75; // measured luma 0.668: knee, not a linear trim
    col /= 1.0 + 0.45 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( col, 1.0 );
}
