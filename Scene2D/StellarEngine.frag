#version 330 core
/*****************************************************************************\
 *                              StellarEngine.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  STELLAR ENGINE: A gigantic Shkadov thruster (a planet-sized mirror) built to move an entire star system across
 *  the galaxy.
 *
 *  The camera hovers behind the massive mirror as it harnesses explosive solar flares.
 *
 *    audioAdvance -> intense propulsion and solar wind flow
 *    audioKick    -> massive plasma bursts hitting the mirror
 *    audioSwell   -> brightness of the star and reflected light
 *    audioChromaHue-> palette offset for the star's plasma
 *
 *  Per-activation variety:
 *    mirrorP float complexity of the mirror structure (0.5..1.5)
 *    flareP float intensity of the solar flares (0.5..2.0)
 *    hueP float palette offset (0..6.28)
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

uniform float mirrorP; ///< Mirror knob: complexity of the mirror structure (0.5..1.5).
uniform float flareP;  ///< Flare knob: intensity of the solar flares (0.5..2.0).
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

/**  Pseudo-random number 0..1 from a float.
 *
 * @param n  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float n )
{
    return fract( sin( n * 127.1 ) * 43758.5453 );
}

/**  Smooth value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise( vec3 p )
{
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix( mix( hash11( n + 0.0 ), hash11( n + 1.0 ), f.x ),
             mix( hash11( n + 57.0 ), hash11( n + 58.0 ), f.x ), f.y ),
        mix( mix( hash11( n + 113.0 ), hash11( n + 114.0 ), f.x ),
             mix( hash11( n + 170.0 ), hash11( n + 171.0 ), f.x ), f.y ),
        f.z );
}

/**  Fractal noise: octaves of value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, about 0..1.
 **/
float fbm( vec3 p )
{
    float f = 0.0, a = 0.5;
    for ( int i = 0; i < 5; ++i )
    {
        f += a * noise( p );
        p *= 2.0;
        a *= 0.5;
    }
    return f;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float mp = ( mirrorP > 0.01 ? mirrorP : 1.0 );
    float fp = ( flareP > 0.01 ? flareP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // We are looking at the massive mirror edge-on or slightly angled, with the star behind it
    // The mirror curves around the star (parabolic)

    vec3 col = vec3( 0.0 );
    vec3 star_col = imgPalette( 0.8 + audioCentroid * 0.1 ); // Hot orange/yellow
    vec3 struct_col = imgPalette( 0.3 );                     // Metallic

    // Star position
    vec2  star_pos = vec2( 0.5, 0.0 );
    float d_star = length( uv - star_pos );

    // Mirror is a huge arc blocking the left side of the star
    // Defined in polar coords relative to star
    vec2 polar_star = vec2( d_star, atan( uv.y - star_pos.y, uv.x - star_pos.x ) );

    // Base mirror shape (arc from 135 to 225 degrees)
    float mirror_radius = 0.8;
    float angle_diff = mod( polar_star.y - 3.14159, 6.28318 ) - 3.14159; // center at pi

    float mirror_arc = step( abs( angle_diff ), 1.2 ); // Covers a large angle

    // Thickness of the mirror
    float mirror_thick = smoothstep( 0.0, 0.02, abs( polar_star.x - mirror_radius ) );

    if ( mirror_arc > 0.5 && polar_star.x > mirror_radius - 0.05 && polar_star.x < mirror_radius + 0.05 )
    {
        // We are ON the mirror structure
        float t = time * 0.1;
        float detail = fbm( vec3( polar_star.y * 50.0 * mp, polar_star.x * 200.0, t ) );

        vec3 local_col = vec3( 0.1 ); // dark metal

        // Structural ribbing
        float ribs = step( 0.9, fract( polar_star.y * 30.0 * mp ) );
        local_col = mix( local_col, struct_col, ribs );

        // The side facing the star (inner radius) is blindingly lit
        float heat = exp( -( polar_star.x - ( mirror_radius - 0.05 ) ) * 100.0 );
        local_col += star_col * heat * ( 1.0 + audioSwell * 2.0 );

        // Impact flares on the mirror surface
        float impact = step( 0.99, hash11( floor( polar_star.y * 20.0 ) + floor( time * 4.00 ) ) );
        local_col += star_col * impact * audioKick * 5.0 * fp;

        col = local_col;
    }
    else
    {
        // Space around the mirror
        if ( polar_star.x < mirror_radius || mirror_arc < 0.5 )
        {
            // View of the star and its atmosphere
            float star_core = smoothstep( 0.3, 0.28, d_star );

            // Solar surface detail
            if ( star_core > 0.0 )
            {
                float surface = fbm( vec3( ( uv - star_pos ) * 10.0, time * 0.5 + audioAdvance ) );
                col += star_col * ( 0.8 + surface * 0.5 ) * star_core * ( 1.0 + audioSwell );
            }

            // Corona / Flares
            float corona = exp( -( d_star - 0.3 ) * 10.0 );
            float flare_dist = fbm( vec3( polar_star.y * 5.0, d_star * 2.0, time * 2.0 ) );
            float flares = smoothstep( 0.5, 0.8, flare_dist ) * exp( -( d_star - 0.3 ) * 5.0 );

            col += star_col * corona * ( 0.5 + audioSwell * 0.5 );
            col += star_col * flares * fp * ( 1.0 + audioKick * 2.0 );

            // Propulsion exhaust escaping the open side
            if ( abs( angle_diff ) > 1.2 )
            {
                // Solar wind being funnelled and escaping
                float wind = fbm(
                    vec3( polar_star.x * 3.0 + time * 5.0 + audioAdvance * 5.0, polar_star.y * 5.0, 0.0 ) );
                float wind_mask = smoothstep( 0.3, 1.5, polar_star.x );
                col += star_col * wind * wind_mask * 0.5 * ( 1.0 + audioKick );
            }
        }

        // Background stars (only visible far from the glare)
        float glare = exp( -d_star * 1.5 );
        if ( glare < 0.5 )
        {
            // Runde, gejitterte Sterne statt aufgehellter floor()-Zellen
            // (Quadrat-Pixel).
            vec2  sgrid = uv * 55.0;
            vec2  sid = floor( sgrid );
            vec2  sfr = fract( sgrid ) - 0.5;
            float sh = fract( sin( dot( sid, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
            if ( sh > 0.90 )
            {
                vec2  spos = ( vec2( fract( sh * 7.31 ), fract( sh * 13.7 ) ) - 0.5 ) * 0.8;
                float sd2 = dot( sfr - spos, sfr - spos );
                float stw = 0.7 + 0.3 * sin( time * ( 1.0 + 2.0 * fract( sh * 29.0 ) ) + sh * 40.0 );
                col += vec3( 1.0 ) * exp( -sd2 * 250.0 ) * stw * ( 0.35 + audioSwell * 0.25 ) * ( 1.0 - glare );
            }
        }

        // Overwhelming glare over everything
        col += star_col * glare * 0.2 * ( 1.0 + audioSwell );
    }

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
