#version 330 core
/*****************************************************************************\
 *                              IoVolcanicPlumes.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  IO VOLCANIC PLUMES: Jupiter fills the sky, banded and turning on the scene clock; below, Io's sulphur plains
 *  (the photo as the surface) with volcanic vents.
 *
 *  Each vent runs a continuous umbrella plume -- material rises on a travelling phase and falls back in an arc, as
 *  Io's plumes do in vacuum -- and an onset brightens the plume from the vent up (light), so the eruptions pulse
 *  with the music without a single geometric jump.  The camera never moves.
 *
 *  Audio Reactivity:
 *    sceneAdvance -> Jupiter's bands turn, the plumes' flow (continuous)
 *    audioOnset   -> plume brightness from the vent (light)
 *    audioSwell   -> plume height (slow)
 *    audioLevel   -> surface brightness
 *    audioBass    -> vent glow (light)
 *
 *  Per-activation variety: ventsP (vent count), jupP (Jupiter size), hueP.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioOnset;     ///< Onset envelope (any instrument), 0..1.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float ventsP; ///< Vents knob: vent count, 0..1.
uniform float jupP;   ///< Jup knob: Jupiter size, 0..1.
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
    for ( int i = 0; i < 4; ++i )
    {
        v += a * noise2( p );
        p = p * 2.03 + 7.0;
        a *= 0.5;
    }
    return v;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float       hue = ( hueP > 0.001 ) ? hueP : 0.0;
    int         n_vents = 2 + int( clamp( ventsP, 0.0, 1.0 ) * 3.0 );
    float       jr = 1.2 + 0.6 * clamp( jupP, 0.0, 1.0 );
    const float horizon = -0.25;

    vec3 col;
    if ( p.y > horizon )
    {
        // Jupiter: a huge disc above the horizon, its bands turning.
        vec2  jc = vec2( 0.3, horizon + jr * 0.55 );
        float jd = length( ( p - jc ) / vec2( 1.0, 1.0 ) ) - jr;
        float on_j = 1.0 - smoothstep( -0.005, 0.005, jd );
        // Bands: latitude from the disc; turning = a shift along the band.
        vec2  q = ( p - jc ) / jr;
        float lat = q.y;
        float lon = q.x / sqrt( max( 1.0 - lat * lat, 0.05 ) ) + sceneAdvance * 0.03 + sceneTime * 0.006;
        float band = 0.5 + 0.5 * sin( lat * 14.0 + fbm( vec2( lon * 3.0, lat * 6.0 ) ) * 2.5 );
        float storm = smoothstep( 0.55, 0.8, fbm( vec2( lon * 5.0 + 3.0, lat * 12.0 ) ) );
        vec3  band_a = imgPalette( hue * 0.159 + 0.08 ) * 1.6 + vec3( 0.45, 0.3, 0.15 );
        vec3  band_b = imgPalette( hue * 0.159 + 0.18 ) * 0.5 + vec3( 0.12, 0.08, 0.06 );
        vec3  jup = mix( band_a, band_b, band );
        jup = mix( jup, vec3( 0.9, 0.5, 0.35 ), storm * 0.6 );
        float limb = sqrt( max( 1.0 - dot( q, q ), 0.0 ) );
        jup *= 0.35 + 0.75 * limb;
        vec3 space = vec3( 0.005, 0.006, 0.012 );
        vec2 su = p * 60.0;
        vec2 cell = floor( su );
        vec2 f = fract( su ) - 0.5;
        vec2 off = vec2( hash21( cell + 3.1 ), hash21( cell + 7.7 ) ) - 0.5;
        space += vec3( smoothstep( 0.15, 0.02, length( f - off * 0.6 ) ) * step( 0.975, hash21( cell ) ) ) * 0.7;
        col = mix( space, jup, on_j );
        // Horizon haze of sulphur dioxide.
        col += imgPalette( hue * 0.159 + 0.15 ) * exp( -( p.y - horizon ) * 12.0 ) * 0.12;
    }
    else
    {
        // Io's surface: the photo as sulphur plains, warm, with flow lines.
        float depth = ( horizon - p.y );
        vec2  guv = vec2( p.x * 0.6 / ( 0.15 + depth * 2.0 ) + 0.5,
                          1.0 / ( 0.15 + depth * 2.0 ) * 0.08 + sceneAdvance * 0.005 );
        vec3  ground = img( fract( guv ) ) * ( imgPalette( hue * 0.159 + 0.12 ) * 1.5 + vec3( 0.35, 0.25, 0.05 ) );
        ground *= ( 0.5 + 0.5 * audioLevel ) * ( 0.4 + 0.6 * smoothstep( 0.0, 0.3, depth ) );
        col = ground;
    }

    // Plumes: umbrella fountains at the vents.  Material rises along a
    // travelling phase and falls back in an arc; brightness from the onset.
    float onset = clamp( audioOnset, 0.0, 1.0 );
    vec3  plume_col = imgPalette( hue * 0.159 + 0.2 ) * 0.8 + vec3( 0.6, 0.5, 0.35 );
    for ( int k = 0; k < 5; ++k )
    {
        if ( k >= n_vents )
            break;
        float fk = float( k );
        float vx = ( hash11( fk * 3.7 ) - 0.5 ) * 1.5;
        float vy = horizon - 0.02 - 0.18 * hash11( fk * 5.1 );
        float H = ( 0.4 + 0.4 * hash11( fk * 7.3 ) ) * ( 0.8 + 0.5 * clamp( audioSwell, 0.0, 1.0 ) );
        vec2  d = p - vec2( vx, vy );
        // Umbrella: a parabolic envelope; the plume is dense along the
        // envelope, thin inside.
        float x = d.x / ( 0.35 * H );
        float env_y = H * ( 1.0 - x * x );
        float on_umb = exp( -abs( d.y - env_y ) * 20.0 / max( H, 0.1 ) ) * step( 0.0, d.y ) * step( abs( x ), 1.15 );
        float column = exp( -abs( d.x ) * 30.0 ) * step( 0.0, d.y ) * ( 1.0 - smoothstep( H * 0.9, H * 1.05, d.y ) );
        // Flow: dots rising on a phase (round, moving, continuous).
        float phase = sceneAdvance * 1.5 + sceneTime * 0.3 + fk;
        float rise = fract( d.y / max( H, 0.1 ) * 3.0 - phase );
        float flow = 0.6 + 0.4 * pow( 0.5 + 0.5 * cos( rise * 6.2831853 ), 2.0 );
        float fam = step( 0.3, hash11( fk * 9.9 ) );
        float bright = ( 0.35 + 1.4 * onset * fam ) * ( 1.0 - 0.5 * d.y / max( H, 0.1 ) );
        col += plume_col * ( on_umb * 0.9 + column * 0.6 ) * flow * bright;
        // Vent glow on the bass.
        col += vec3( 1.0, 0.5, 0.15 ) * exp( -dot( d, d ) * 400.0 ) * ( 0.4 + 1.5 * audioBass );
    }

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
