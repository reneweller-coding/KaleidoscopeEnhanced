#version 330 core
/*****************************************************************************\
 *                              ExoplanetOcean.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  EXOPLANET OCEAN: A vast, undulating alien ocean under a dark sky dominated by a massive, close gas giant or
 *  moon.
 *
 *  The water glows with strange bio-luminescence that pulses gently to the audio swells.
 *
 *    audioAdvance -> movement of the waves and clouds
 *    audioKick    -> flashes of bio-luminescence in the wave crests
 *    audioSwell   -> ambient brightness of the sky and reflection
 *    audioChromaHue-> palette offset for the alien water and sky
 *
 *  Per-activation variety:
 *    waveP float height and turbulence of the waves (0.5..1.5)
 *    moonP float size and brightness of the celestial body (0.5..2.0)
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

uniform float waveP; ///< Wave knob.
uniform float moonP; ///< Moon knob: size and brightness of the celestial body (0.5..2.0).
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Ocean wave height function
 *
 * @param p      Position on the water. (in)
 * @param phase  Integrated clock of the waves. (in)
 *
 * @return
 *   The wave height.
 **/
float getWaves( vec2 p, float phase )
{
    // phase is an INTEGRATED clock (time + audioAdvance), never time times a
    // level -- time*speed with speed jumping per frame was the reported
    // full-screen shimmer ("schnelles Flirren").
    float w = 0.0;
    w += sin( p.x * 2.0 + phase ) * 0.5;
    w += sin( p.y * 3.0 + p.x * 1.5 - phase * 1.2 ) * 0.25;
    w += fbm( vec3( p * 5.0, phase * 0.5 ) ) * 0.25;
    return w;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float wp = ( waveP > 0.01 ? waveP : 1.0 );
    float mp = ( moonP > 0.01 ? moonP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    vec3 col = vec3( 0.0 );

    vec3 water_color = max( imgPalette( 0.2 ), vec3( 0.05, 0.07, 0.10 ) ); // Base dark water, nie ganz schwarz
    vec3 bio_color = imgPalette( 0.7 + audioCentroid * 0.2 );              // Bioluminescent glow
    vec3 sky_color = imgPalette( 0.1 );
    vec3 moon_color = imgPalette( 0.9 );

    // Horizon line with slight bobbing
    float horizon = -0.1 + sin( time * 0.2 ) * 0.02 * wp;

    if ( uv.y < horizon )
    {
        // Ocean surface
        float d_plane = 0.1 / abs( uv.y - horizon );
        vec2  plane_uv = vec2( uv.x * d_plane, d_plane );

        // Forward movement on an integrated clock (jump-free)
        float travel = time * 0.5 + audioAdvance * 0.8;
        plane_uv.y -= travel;

        // Waves
        float w = getWaves( plane_uv * wp, travel );

        // Normal approximation for lighting/reflection
        vec2  e = vec2( 0.05, 0.0 );
        float wx = getWaves( ( plane_uv + e.xy ) * wp, travel ) - w;
        float wy = getWaves( ( plane_uv + e.yx ) * wp, travel ) - w;
        vec3  normal = normalize( vec3( -wx, 1.0, -wy ) );

        // Reflection of the moon (light source is at y > horizon)
        vec3 light_dir = normalize( vec3( 0.0, 0.5, 1.0 ) );
        vec3 view_dir = normalize( vec3( 0.0, -abs( uv.y - horizon ), 1.0 ) );

        float spec = pow( max( dot( reflect( -light_dir, normal ), view_dir ), 0.0 ), 32.0 );
        float diffuse = max( dot( normal, light_dir ), 0.0 );

        vec3 surface_col = water_color * ( 0.28 + diffuse * 0.9 );
        // Moon glitter path: the sparkling light road under the moon is what
        // makes a night sea READ as water.
        float glitter = pow( max( dot( reflect( -light_dir, normal ), view_dir ), 0.0 ), 90.0 )
                        * exp( -abs( uv.x ) * 2.2 );
        surface_col += max( moon_color, vec3( 0.35, 0.33, 0.30 ) )
                       * ( spec * 0.5 + glitter * 2.2 ) * mp * ( 0.6 + audioSwell );

        // Bioluminescence in the wave crests (high wave peaks)
        float crests = smoothstep( 0.4, 0.8, w );
        float bio_flash = crests * ( 0.5 + audioKick * 3.0 ) * wp;
        surface_col += bio_color * bio_flash;

        // Distance fog / haze fading to sky color
        float fog = exp( -d_plane * 0.1 );
        col = mix( sky_color * ( 0.1 + audioSwell * 0.1 ), surface_col, fog );
    }
    else
    {
        // Sky
        // The giant moon dominates the sky
        vec2  moon_pos = vec2( 0.0, horizon + 0.4 );
        float d_moon = length( uv - moon_pos );
        float moon_rad = 0.35 * mp;

        if ( d_moon < moon_rad )
        {
            // Moon surface
            vec2  m_uv = ( uv - moon_pos ) / moon_rad;
            float m_z = sqrt( max( 0.0, 1.0 - dot( m_uv, m_uv ) ) );

            // Texture
            float m_tex = fbm( vec3( m_uv * 3.0, m_z + time * 0.01 ) );

            // Moon with a real terminator, and a brightness FLOOR: the pure
            // palette colour went black on dark photos -- the giant moon was
            // an invisible hole in the sky.
            vec3  m_col = max( moon_color, vec3( 0.38, 0.36, 0.32 ) );
            vec3  m_n = normalize( vec3( m_uv, m_z ) );
            vec3  m_sun = normalize( vec3( 0.55, 0.25, 0.55 ) );
            float m_shade = 0.32 + 0.68 * max( dot( m_n, m_sun ), 0.0 );
            float edge_fade = smoothstep( 1.0, 0.92, length( m_uv ) );
            col = m_col * ( 0.55 + m_tex * 0.45 ) * m_shade * edge_fade * ( 1.0 + 0.4 * audioSwell );
        }
        else
        {
            // Sky background with stars and faint alien aurora/clouds
            float sky_noise = fbm( vec3( uv * 2.0, time * 0.05 + audioAdvance * 0.5 ) );
            col = sky_color * sky_noise * 0.5 * ( 1.0 + audioSwell );

            // Stars -- round, jittered points (whole floor() cells were the
            // square pixels).
            vec2  sgrid = uv * 60.0;
            vec2  sid = floor( sgrid );
            vec2  sf = fract( sgrid ) - 0.5;
            float sh = fract( sin( dot( sid, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
            if ( sh > 0.90 )
            {
                vec2  spos = ( vec2( fract( sh * 7.31 ), fract( sh * 13.7 ) ) - 0.5 ) * 0.8;
                float sd2 = dot( sf - spos, sf - spos );
                float tw = 0.7 + 0.3 * sin( time * ( 1.0 + 2.0 * fract( sh * 29.0 ) ) + sh * 40.0 );
                col += vec3( 1.0 ) * exp( -sd2 * 260.0 ) * tw * ( 0.5 + audioSwell * 0.4 );
            }

            // Moon glow/halo
            float halo = exp( -( d_moon - moon_rad ) * 5.0 );
            col += moon_color * halo * 0.5 * mp * ( 1.0 + audioSwell );
        }
    }

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
