#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file TidalLockTerminator.frag
 * @brief TIDAL LOCK TERMINATOR: a flight along the day/night line of a
 * tidally locked planet.  The world turns under the camera on the music's
 * pace, so the terminator -- a band of long shadows, glowing cloud tops
 * and the first lights of the eternal night -- streams past forever.  The
 * host's day clock (dayPhase) shifts where the line falls; the valence of
 * the music is the weather on the day side (bright cumulus or a brooding
 * overcast); on the night side auroras breathe with the swell and storms
 * flash on the kick.  The camera never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the planet turns under the camera (continuous)
 *   dayPhase     -> the terminator drifts (very slow)
 *   audioValence -> day-side weather (light/colour)
 *   audioSwell   -> aurora on the night side (slow)
 *   audioKick    -> storm flashes on the night side (light)
 *   audioLevel   -> sunlight strength
 *
 * Per-activation variety: tiltP (view angle), cloudP (cloud cover), hueP.
 */
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float dayPhase;       ///< Phase of the slow day cycle, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float tiltP;  ///< Tilt knob, 0..1.
uniform float cloudP; ///< Cloud knob: cloud cover, 0..1.
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
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/**  Pseudo-random number 0..1 from a 3D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash13( vec3 p )
{
    p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
    p *= 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
/**  Smooth 3D value noise, 0..1.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise3( vec3 x )
{
    vec3 i = floor( x ), f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( mix( hash13( i ), hash13( i + vec3( 1, 0, 0 ) ), f.x ),
                     mix( hash13( i + vec3( 0, 1, 0 ) ), hash13( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                mix( mix( hash13( i + vec3( 0, 0, 1 ) ), hash13( i + vec3( 1, 0, 1 ) ), f.x ),
                     mix( hash13( i + vec3( 0, 1, 1 ) ), hash13( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
                f.z );
}
/**  Fractal noise of three octaves, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, 0..1.
 **/
float fbm3( vec3 p )
{
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 5; ++i )
    {
        v += a * noise3( p );
        p = p * 2.03 + 3.1;
        a *= 0.5;
    }
    return v;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float tilt = 0.35 + 0.3 * clamp( tiltP, 0.0, 1.0 );
    float cloud_cover = 0.35 + 0.4 * clamp( cloudP, 0.0, 1.0 );
    float val = clamp( audioValence, 0.0, 1.0 );

    // A big sphere below and ahead; the camera looks down along the limb.
    vec3        ro = vec3( 0.0, 0.0, 0.0 );
    vec3        rd = normalize( vec3( p.x, p.y - tilt, 1.0 ) );
    vec3        C = vec3( 0.0, -3.3, 2.2 );
    const float R = 3.0;
    vec3        oc = ro - C;
    float       b = dot( oc, rd );
    float       c = dot( oc, oc ) - R * R;
    float       disc = b * b - c;

    // Sun direction: the terminator runs across the view; dayPhase turns it
    // slowly (a 4.7-minute cycle, continuous through the wrap).
    float dp = dayPhase * 6.2831853;
    vec3  sun_dir = normalize(
        vec3( cos( dp * 0.5 + 0.6 ) * 0.9, 0.35 + 0.15 * sin( dp ), -0.4 + 0.5 * cos( dp * 0.5 + 0.6 ) ) );

    vec3 col;
    if ( disc > 0.0 )
    {
        float t = -b - sqrt( disc );
        vec3  pos = ro + rd * t;
        vec3  n = normalize( pos - C );
        // The planet turns under us: rotate the surface sample about the
        // planet's axis on the scene clock.
        float a = sceneAdvance * 0.12 + sceneTime * 0.02;
        vec3  sp = n;
        sp = vec3( cos( a ) * sp.x - sin( a ) * sp.z, sp.y, sin( a ) * sp.x + cos( a ) * sp.z );

        float land = fbm3( sp * 3.0 );
        float sea = smoothstep( 0.42, 0.5, land );
        float mountains = fbm3( sp * 9.0 + 4.0 ) * sea;
        vec3  sea_col = imgPalette( hue * 0.159 + 0.55 ) * 0.5;
        vec3  land_col = mix( imgPalette( hue * 0.159 + 0.25 ), imgPalette( hue * 0.159 + 0.1 ), mountains ) * 0.8;
        vec3  ground = mix( sea_col, land_col, sea );
        // Weather: valence chooses bright cumulus or a brooding overcast.
        float cl = fbm3( sp * 5.0 + vec3( 0.0, sceneAdvance * 0.03, 0.0 ) );
        float clouds = smoothstep( 1.0 - cloud_cover, 1.0 - cloud_cover + 0.25, cl );
        vec3  cloud_col = mix( vec3( 0.55, 0.55, 0.6 ), vec3( 1.0, 0.98, 0.95 ), val );
        vec3  surf = mix( ground, cloud_col, clouds );

        float sun = dot( n, sun_dir );
        float day = smoothstep( -0.08, 0.15, sun );
        // Terminator band: long shadows and gold light.
        float term = exp( -sun * sun * 60.0 );
        vec3  day_light = surf * ( 0.15 + 1.1 * max( sun, 0.0 ) ) * ( 0.7 + 0.5 * audioLevel );
        day_light += imgPalette( hue * 0.159 + 0.08 ) * term * 0.6;
        // Night side: dark, an aurora breathing on the swell, storms flashing.
        float aur = fbm3( sp * 6.0 + vec3( sceneTime * 0.1, 0.0, 0.0 ) );
        aur = pow( smoothstep( 0.45, 0.7, aur ), 2.0 ) * ( 0.2 + 0.8 * clamp( audioSwell, 0.0, 1.0 ) );
        vec3  night = surf * 0.02 + imgPalette( hue * 0.159 + 0.45 ) * aur * 0.7;
        float storm = smoothstep( 0.62, 0.7, cl ) * audioKick;
        night += vec3( 0.9, 0.9, 1.0 ) * storm * 0.8;
        col = mix( night, day_light, day );
        // Atmosphere rim.
        float rim = pow( 1.0 - max( dot( -rd, n ), 0.0 ), 3.0 );
        col += imgPalette( hue * 0.159 + 0.6 ) * rim * ( 0.3 + 0.6 * day );
    }
    else
    {
        // Space: stars and the corona of the star beyond the limb.
        vec2  sk = rd.xy / max( rd.z, 0.1 );
        vec2  cell = floor( sk * 90.0 );
        vec2  f = fract( sk * 90.0 ) - 0.5;
        float hs = fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
        col = vec3( step( 0.986, hs ) * exp( -dot( f, f ) * 9.0 ) ) * 0.6;
        float glow = pow( max( dot( rd, sun_dir ), 0.0 ), 8.0 );
        col += imgPalette( hue * 0.159 + 0.08 ) * glow * 0.5;
        // Atmosphere halo just outside the limb.
        float limb = exp( -abs( sqrt( max( -disc, 0.0 ) ) ) * 6.0 );
        col += imgPalette( hue * 0.159 + 0.6 ) * limb * 0.5;
    }

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
