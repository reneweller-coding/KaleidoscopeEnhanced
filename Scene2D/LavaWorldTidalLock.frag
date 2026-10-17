#version 330 core
/*****************************************************************************\
 *                              LavaWorldTidalLock.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  LAVA WORLD TIDAL LOCK: The day-side of a tidally locked planet.
 *
 *  The surface is a continuous, roiling ocean of glowing magma constantly baked by a massive, close star. Eruptions
 *  and waves pulse to the beat.
 *
 *    audioAdvance -> slow pan across the magma ocean
 *    audioKick    -> explosive magma bursts and solar flares
 *    audioSwell   -> brightness of the star and magma heat
 *    audioChromaHue-> palette offset for the magma
 *
 *  Per-activation variety:
 *    lavaP float turbulence of the magma ocean (0.5..1.5)
 *    starP float intensity of the close star (0.5..2.0)
 *    hueP float palette offset (0..6.28)
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
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float lavaP; ///< Lava knob: turbulence of the magma ocean (0.5..1.5).
uniform float starP; ///< Star knob: intensity of the close star (0.5..2.0).
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float lp = ( lavaP > 0.01 ? lavaP : 1.0 );
    float sp = ( starP > 0.01 ? starP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    vec3 col = vec3( 0.0 );
    vec3 magma_color = imgPalette( 0.8 + audioCentroid * 0.1 );
    vec3 crust_color = vec3( 0.05, 0.02, 0.01 ); // Dark solidified rock
    vec3 star_color = imgPalette( 0.2 );         // Usually white/blue-ish for high heat

    // Horizon line
    float horizon = 0.0 + sin( time * 0.1 ) * 0.05;

    if ( uv.y < horizon )
    {
        // Lava ocean surface (pseudo 3D plane projection)
        float d_plane = 0.2 / abs( uv.y - horizon );
        vec2  plane_uv = vec2( uv.x * d_plane, d_plane );

        // Panning across the ocean
        plane_uv.y -= time * 0.3 + audioAdvance;
        plane_uv.x += sin( time * 0.1 ) * 0.5;

        // Lava texture
        // Low frequency for massive convection cells
        float cells = fbm( vec3( plane_uv * 1.5 * lp, time * 0.1 ) );

        // High frequency for flowing magma
        float flow = fbm( vec3( plane_uv * 10.0, time * 0.5 + audioAdvance * 2.0 ) );

        // We create crust where it's cooler
        float crust_mask = smoothstep( 0.4, 0.6, cells + flow * 0.2 );

        // The exposed magma is incredibly bright
        float heat = smoothstep( 0.6, 0.3, cells );

        // Eruptions: round glowing vents instead of the flat-coloured giant
        // squares (whole 0.5 cells blinked at 5 Hz).
        vec2  e_cell = floor( plane_uv * 4.0 );
        vec2  e_frac = fract( plane_uv * 4.0 ) - 0.5;
        float eh = fract( sin( dot( e_cell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        float e_sel = step( 0.8, fract( eh + floor( time * 4.00 ) * 0.31 ) );
        float e_shape = exp( -dot( e_frac, e_frac ) * 9.0 );
        float e_pulse = 0.5 + 0.5 * sin( time * 2.5 + eh * 40.0 );
        float eruption_flash = e_sel * e_shape * e_pulse * ( 0.6 + audioKick * 2.0 ) * lp;

        vec3 surface_col = mix( magma_color * ( heat + eruption_flash ) * 2.0, crust_color, crust_mask );

        // Distance fade/atmospheric haze (heat shimmer)
        float haze = exp( -d_plane * 0.2 );
        col = surface_col * haze * ( 0.5 + audioSwell * 0.5 );

        // Reflection of the massive star on the magma
        float star_reflection = exp( -abs( uv.x ) * 10.0 ) * exp( -d_plane * 0.5 );
        col += star_color * star_reflection * sp * ( 1.0 + audioSwell );
    }
    else
    {
        // Sky / The close massive star
        // The star is huge, taking up most of the sky
        vec2  star_pos = vec2( 0.0, horizon + 0.3 );
        float d_star = length( uv - star_pos );
        float star_rad = 0.6;

        if ( d_star < star_rad )
        {
            // Star surface
            vec2  s_uv = ( uv - star_pos ) * 5.0;
            float surface = fbm( vec3( s_uv, time * 0.5 + audioAdvance ) );

            float core = smoothstep( star_rad, 0.0, d_star );
            col += star_color * ( 0.8 + surface * 0.5 ) * core * sp * ( 1.0 + audioSwell );
        }
        else
        {
            // Corona and flares
            float corona = exp( -( d_star - star_rad ) * 10.0 );

            // Solar flares reaching out
            float angle = atan( uv.y - star_pos.y, uv.x - star_pos.x );
            float flares = fbm( vec3( angle * 10.0, d_star * 5.0, time * 2.0 ) );
            flares = smoothstep( 0.6, 0.9, flares ) * exp( -( d_star - star_rad ) * 5.0 );

            col += star_color * corona * sp * ( 0.5 + audioSwell );
            col += star_color * flares * sp * ( 1.0 + audioKick * 3.0 );
        }

        // Dense, burning atmosphere
        float atmos = exp( -( uv.y - horizon ) * 5.0 );
        col += magma_color * atmos * 0.5 * ( 1.0 + audioSwell );
    }

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
