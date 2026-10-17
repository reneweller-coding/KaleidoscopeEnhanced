#version 330 core
/*****************************************************************************\
 *                              StormLighthouse.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  STORM LIGHTHOUSE: a lighthouse on a rock in a gale at night.
 *
 *  Its lamp turns steadily and the beam sweeps as a solid shaft of light through rain and spray; when it swings
 *  toward us the lantern flares.  Heavy swell rolls in under a torn sky with the moon behind the clouds, and the
 *  sea breaks white over the rock.  The music is the storm's light: the lamp burns with the bass, the spray over
 *  the rock catches the kick, the rain sparkles with the treble.  The beam never turns faster or slower with the
 *  music -- a lighthouse keeps its period.
 *
 *  Audio Reactivity:
 *    audioBass         -> lamp brightness (light)
 *    audioKick         -> the breaking spray lights up (light)
 *    audioHigh         -> rain sparkle in the beam (light)
 *    audioSwell        -> height of the swell and the storm haze (slow)
 *    sceneTime         -> the lamp's rotation and the waves (continuous)
 *
 *  Per-activation variety: periodP (beam period), hueP.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float periodP; ///< Period knob: beam period, 0..1.
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
/**  Smooth 2D value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise2( vec2 p )
{
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
                mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
/**  Fractal noise: octaves of value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, about 0..1.
 **/
float fbm( vec2 p )
{
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 5; ++i )
    {
        v += a * noise2( p );
        p = p * 2.03 + 3.7;
        a *= 0.5;
    }
    return v;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p = ( uv - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float bass = clamp( audioBass * 1.2, 0.0, 1.0 );
    float kick = clamp( audioKick, 0.0, 2.0 );
    float hi = clamp( audioHigh * 2.0, 0.0, 1.0 );
    float t = sceneTime;

    // The lighthouse stands right of centre on its rock.
    vec2  base = vec2( 0.32 * aspect * 0.5, -0.12 );
    float tower_h = 0.42;
    vec2  lamp = base + vec2( 0.0, tower_h + 0.03 );

    // Sky: torn cloud, moon glow behind it.
    vec2  moon_p = vec2( -0.55 * aspect * 0.5, 0.33 );
    float cl = fbm( p * vec2( 1.6, 2.4 ) + vec2( t * 0.03, 0.0 ) );
    float cl2 = fbm( p * vec2( 3.0, 4.0 ) + vec2( t * 0.06, 1.0 ) );
    vec3  sky_c = mix( vec3( 0.03, 0.04, 0.07 ), imgPalette( hue * 0.159 + 0.6 ) * 0.12, 0.3 );
    vec3  moon_c = mix( vec3( 0.75, 0.8, 0.95 ), imgPalette( hue * 0.159 + 0.55 ), 0.15 );
    float md = length( p - moon_p );
    float veil = smoothstep( 0.35, 0.75, cl );
    vec3  col = sky_c + moon_c * exp( -md * 3.0 ) * 0.35 * ( 1.0 - 0.6 * veil );
    col += moon_c * exp( -md * 40.0 ) * ( 1.0 - veil ) * 1.2;
    // Cloud edges catch the moonlight.
    col += moon_c * 0.25 * smoothstep( 0.4, 0.6, cl2 ) * exp( -md * 1.4 ) * ( 1.0 - veil * 0.5 );
    col = mix( col, sky_c * 0.6, veil * 0.6 );

    // The sea: rolling swell toward the horizon with foam streaks.
    float horizon = -0.05;
    if ( p.y < horizon )
    {
        float depth = ( horizon - p.y );
        float z = 0.35 / max( depth, 0.004 ); // distance from the camera
        vec2  sq = vec2( p.x * z, z );
        float amp = 0.5 + 0.8 * swell;
        float wav = sin( sq.y * 1.3 - t * 1.1 + sin( sq.x * 0.4 ) * 1.5 ) * 0.5 + 0.5;
        float chop = fbm( sq * vec2( 0.8, 1.2 ) + vec2( 0.0, -t * 0.6 ) );
        float crest = smoothstep( 0.75, 0.98, wav * ( 0.6 + 0.4 * chop ) * amp + chop * 0.35 );
        vec3  sea_c = mix( vec3( 0.03, 0.06, 0.08 ), imgPalette( hue * 0.159 + 0.5 ) * 0.1, 0.4 );
        // Slopes of the swell: the faces toward the moon catch its light.
        float slope = sin( sq.y * 1.3 - t * 1.1 + sin( sq.x * 0.4 ) * 1.5 + 0.6 ) * 0.5 + 0.5;
        vec3  sea = sea_c * ( 0.5 + 0.9 * chop ) * ( 0.6 + 0.8 * slope );
        sea += moon_c * 0.5 * exp( -abs( p.x - moon_p.x ) * 3.0 ) * pow( chop * slope, 2.0 ) * ( 1.0 - veil * 0.4 );
        sea += vec3( 0.75, 0.8, 0.85 ) * crest * 0.55 * exp( -z * 0.04 );
        // Streaks of foam blown along the surface.
        float streaks = smoothstep( 0.62, 0.9, noise2( sq * vec2( 0.6, 3.0 ) + vec2( t * 0.2, 0.0 ) ) );
        sea += vec3( 0.6, 0.65, 0.7 ) * streaks * 0.18 * exp( -z * 0.08 );
        col = mix( col, sea, smoothstep( horizon + 0.004, horizon - 0.004, p.y ) );
    }

    // The rock and the tower.
    float rock_top = base.y + 0.02 - 0.05 * abs( p.x - base.x ) * 3.0 + 0.03 * fbm( vec2( p.x * 12.0, 1.0 ) );
    float rock_m = smoothstep( rock_top + 0.004, rock_top - 0.004, p.y ) * step( abs( p.x - base.x ), 0.3 )
                   * step( horizon - 0.12, p.y );
    vec3  rock_c = vec3( 0.03, 0.03, 0.035 ) * ( 0.6 + 0.8 * fbm( p * 20.0 ) );
    col = mix( col, rock_c, rock_m );
    float tw = 0.035 - 0.012 * clamp( ( p.y - base.y ) / tower_h, 0.0, 1.0 );
    float tower_m = step( abs( p.x - base.x ), tw ) * step( base.y, p.y ) * step( p.y, base.y + tower_h );
    float stripe = step( 0.5, fract( ( p.y - base.y ) / tower_h * 3.0 ) );
    vec3  tower_c = mix( vec3( 0.08, 0.08, 0.09 ), vec3( 0.2, 0.05, 0.05 ), stripe );
    tower_c *= 0.6 + 0.6 * smoothstep( -tw, tw, ( p.x - base.x ) * sign( moon_p.x - base.x ) * -1.0 );
    col = mix( col, tower_c, tower_m );
    // Gallery and lantern.
    float gal_m = step( abs( p.x - base.x ), 0.045 ) * step( abs( p.y - ( base.y + tower_h ) ), 0.006 );
    col = mix( col, vec3( 0.02 ), gal_m );

    // The beam: a wedge from the lamp turning about the vertical axis; its
    // projection sweeps across the frame and narrows when it points at us.
    float period = mix( 9.0, 16.0, clamp( periodP, 0.0, 1.0 ) );
    float phi = t * 6.2831853 / period; // azimuth of the beam
    float toward = cos( phi );          // 1 = pointing at the camera
    float side = sin( phi );
    vec2  rel = p - lamp;
    vec3  lamp_c = mix( vec3( 1.0, 0.93, 0.78 ), imgPalette( hue * 0.159 + 0.1 ), 0.15 );
    float lamp_i = 0.6 + 0.8 * bass;
    float beam_out = 0.0;
    for ( int b = 0; b < 2; ++b )
    {
        // Two opposite beams (a double lens).
        float sgn = ( b == 0 ) ? 1.0 : -1.0;
        float sx = side * sgn, tz = toward * sgn;
        vec2  dir = normalize( vec2( sx, -0.03 ) );
        float along = dot( rel, dir );
        float across = abs( rel.x * dir.y - rel.y * dir.x );
        float spread = 0.02 + along * 0.06;
        float w = exp( -across * across / max( spread * spread, 1e-5 ) );
        // Visible length shrinks as the beam turns toward or away from us.
        float len = 2.4 * abs( sx ) + 0.1;
        float fall = smoothstep( len, 0.0, along ) * step( 0.0, along );
        float haze = 0.4 + 0.6 * fbm( p * 3.0 + vec2( t * 0.2, 0.0 ) );
        beam_out += w * fall * haze * ( 0.6 + 0.4 * ( 1.0 - abs( tz ) ) );
        // Flare when it looks at us.
        float flare = pow( max( tz, 0.0 ), 6.0 );
        col += lamp_c * flare * ( exp( -length( rel ) * 18.0 ) * 2.0 + exp( -length( rel ) * 3.0 ) * 0.4 ) * lamp_i;
    }
    col += lamp_c * beam_out * 0.55 * lamp_i * ( 0.8 + 0.4 * swell );
    col += lamp_c * exp( -length( rel ) * 60.0 ) * 1.2 * lamp_i;

    // Spray bursting over the rock: bright where the beam or the kick lights it.
    float spray_ph = fract( t * 0.18 );
    float spray_h = sin( spray_ph * 3.14159 ) * ( 0.2 + 0.18 * swell );
    float spr = fbm( vec2( p.x * 8.0, p.y * 6.0 - t * 0.8 ) ) * smoothstep( rock_top + spray_h + 0.05, rock_top, p.y )
                * smoothstep( 0.35, 0.05, abs( p.x - base.x + 0.08 ) ) * step( rock_top - 0.02, p.y );
    col += vec3( 0.8, 0.85, 0.9 ) * spr * ( 0.12 + 0.45 * clamp( kick, 0.0, 1.5 ) + beam_out * 0.6 );

    // Rain: slanted streaks, brightest inside the beam.
    vec2  rg = vec2( p.x * 60.0 + p.y * 18.0, p.y * 7.0 + t * 9.0 );
    vec2  rc = floor( rg ), rf = fract( rg ) - 0.5;
    float streak = smoothstep( 0.06, 0.0, abs( rf.x - ( hash21( rc ) - 0.5 ) * 0.6 ) )
                   * smoothstep( 0.5, 0.1, abs( rf.y ) ) * step( 0.7, hash21( rc + 3.0 ) );
    col += lamp_c * streak * ( 0.04 + beam_out * ( 0.5 + 1.2 * hi ) );

    col *= 0.9 + 0.2 * audioLevel;
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
