#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SolarEclipseTotality.frag
 * @brief SOLAR ECLIPSE TOTALITY: the moon's disc over the sun, and the
 * corona that only totality shows -- thirty-two streamers whose lengths are
 * the thirty-two spectrum bands, so the corona breathes with the music
 * band by band; red prominences on the limb; the chromosphere's thin pink
 * ring; the diamond ring where a sliver of photosphere shows.  The host's
 * day clock moves the moon across the sun (a slow sin, never a wrap), so
 * totality comes and goes over minutes.  The sky darkens to stars during
 * totality.  The camera never moves.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> streamer lengths (light)
 *   dayPhase          -> moon position (slow, continuous)
 *   audioKick         -> the diamond ring flares (light)
 *   audioSwell        -> prominence height (slow)
 *   audioLevel        -> corona brightness
 *
 * Per-activation variety: coronaP (streamer reach), tiltP (limb axis), hueP.
 */
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;      ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;         ///< Seconds since this scene was activated.
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float dayPhase;          ///< Phase of the slow day cycle, 0..1.
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.

uniform float coronaP; ///< Corona knob: streamer reach, 0..1.
uniform float tiltP;   ///< Tilt knob, 0..1.
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
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
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
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float       hue = ( hueP > 0.001 ) ? hueP : 0.0;
    const float RS = 0.22;      // sun radius
    float       RM = RS * 1.02; // moon slightly larger
    // The moon crosses the sun on the day clock: x offset = sin of the phase,
    // so totality (offset ~ 0) recurs without any jump.
    // The moon stays ON the sun: it drifts across the face by a tenth of a
    // radius, so totality is the rule and the diamond ring the exception at
    // the ends of the drift.
    float mx = 0.075 * sin( dayPhase * 6.2831853 );
    float tilt = ( tiltP - 0.5 ) * 0.6;
    vec2  moon_c = vec2( mx * cos( tilt ), mx * sin( tilt ) );
    float d_sun = length( p ) - RS;
    float d_moon = length( p - moon_c ) - RM;
    float sun_disc = 1.0 - smoothstep( -0.003, 0.003, d_sun );
    float moon_disc = 1.0 - smoothstep( -0.003, 0.003, d_moon );
    // How total: the moon's offset from the sun's centre.
    float cover = 1.0 - smoothstep( 0.035, 0.07, abs( mx ) );
    float sky = cover; // sky darkens toward totality

    float r = length( p );
    float a = atan( p.y, p.x );

    // Corona: 32 streamers, one per band, reaching out from the limb.
    vec3  col = vec3( 0.0 );
    float reach = 0.35 + 0.5 * clamp( coronaP, 0.0, 1.0 );
    float corona = 0.0;
    for ( int k = 0; k < 32; ++k )
    {
        float fk = float( k );
        float ang = fk / 32.0 * 6.2831853 + ( hash11( fk * 3.1 ) - 0.5 ) * 0.12 + sceneAdvance * 0.01;
        float d_a = a - ang;
        d_a = atan( sin( d_a ), cos( d_a ) );
        float e = clamp( audioSpectrum[k] * 1.6, 0.0, 1.0 );
        float len = RS + reach * ( 0.35 + 0.65 * e ) * ( 0.7 + 0.6 * hash11( fk * 5.3 ) );
        float width = 0.05 + 0.04 * hash11( fk * 7.7 );
        float along = smoothstep( len, RS + 0.01, r );
        corona += exp( -d_a * d_a / ( width * width ) ) * along * ( 0.3 + 0.7 * e )
                  * ( 1.0 / ( 1.0 + ( r - RS ) * 6.0 ) );
    }
    // A soft inner corona all round.
    corona += exp( -( r - RS ) * 9.0 ) * 0.6 * step( RS, r );
    vec3 corona_col = mix( vec3( 0.95, 0.95, 1.0 ), imgPalette( hue * 0.159 + 0.55 ), 0.35 );
    col += corona_col * corona * ( 0.5 + 0.7 * audioLevel ) * sky;

    // Chromosphere: a thin pink ring; prominences: red loops on the limb.
    float chromo = exp( -abs( r - RS * 1.005 ) * 250.0 );
    col += vec3( 1.0, 0.45, 0.55 ) * chromo * 1.2 * sky;
    for ( int k = 0; k < 5; ++k )
    {
        float fk = float( k );
        float ang = hash11( fk * 9.3 ) * 6.2831853;
        float d_a = atan( sin( a - ang ), cos( a - ang ) );
        float h = 0.02 + 0.04 * hash11( fk * 4.4 ) * ( 0.6 + 0.6 * clamp( audioSwell, 0.0, 1.0 ) );
        float prom = exp( -d_a * d_a * 900.0 ) * smoothstep( RS + h, RS, r ) * step( RS, r );
        col += vec3( 1.0, 0.35, 0.3 ) * prom * 1.5 * sky;
    }

    // The photosphere where the moon does not cover it: blinding white,
    // fading the corona away (partial phases); the diamond ring is the last
    // sliver, flaring on the kick.
    float photo = sun_disc * ( 1.0 - moon_disc );
    vec3  sun_col = vec3( 1.0, 0.98, 0.9 );
    float sliver = photo;
    col = mix( col, sun_col * 4.0, photo );
    col += sun_col * sliver * ( 2.0 + 4.0 * audioKick );
    // Baily's beads / diamond glow around the sliver.
    col += sun_col * exp( -abs( d_moon ) * 40.0 ) * photo * 2.0;
    // Glare from the uncovered photosphere brightens the whole sky.
    float glare = ( 1.0 - cover );
    col += sun_col * glare * exp( -r * 2.0 ) * 0.6;

    // Sky: stars appear during totality (round, jittered); deep blue-black.
    vec2  su = p * 50.0;
    vec2  cell = floor( su );
    vec2  f = fract( su ) - 0.5;
    float hs = hash21( cell );
    vec2  off = vec2( hash21( cell + 3.1 ), hash21( cell + 7.7 ) ) - 0.5;
    float star = smoothstep( 0.16, 0.03, length( f - off * 0.6 ) ) * step( 0.975, hs );
    col += vec3( star ) * 0.6 * sky * step( RS * 1.3, r );
    col += mix( vec3( 0.25, 0.35, 0.6 ), vec3( 0.01, 0.015, 0.04 ), sky ) * 0.15 * ( 1.0 - photo );
    // The moon: black, a faint earthshine texture from the photo.
    col = mix( col, img( fract( p * 0.8 + 0.5 ) ) * 0.03, moon_disc * ( 1.0 - photo ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
