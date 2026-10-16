#version 330 core
/*****************************************************************************\
 *                              WhiteDwarfAccretion.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  WHITE DWARF ACCRETION: An extremely dense, hot white dwarf siphoning glowing plasma from a bloated red giant
 *  companion.
 *
 *  A swirling accretion disk forms and violently pulses to the beat.
 *
 *    audioAdvance -> rotation speed of the binary system and accretion disk
 *    audioKick    -> flares and matter striking the white dwarf
 *    audioSwell   -> brightness of the accretion disk and the red giant
 *    audioChromaHue-> palette offset for the plasma
 *
 *  Per-activation variety:
 *    flowP float rate of the plasma flow (0.5..1.5)
 *    diskP float intensity and turbulence of the accretion disk (0.5..2.0)
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

uniform float flowP; ///< Flow knob: rate of the plasma flow (0.5..1.5).
uniform float diskP; ///< Disk knob: intensity and turbulence of the accretion disk (0.5..2.0).
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
    for ( int i = 0; i < 4; ++i )
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
    float fp = ( flowP > 0.01 ? flowP : 1.0 );
    float dp = ( diskP > 0.01 ? diskP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // Orbital mechanics
    float orbit_speed = time * 0.5 + audioAdvance * 2.0;

    // The White Dwarf is at the center
    vec2 wd_pos = vec2( 0.0, 0.0 );

    // The Red Giant orbits the white dwarf (for the camera view)
    float rg_dist = 1.2;
    vec2  rg_pos = vec2( cos( orbit_speed ), sin( orbit_speed ) ) * rg_dist;

    vec3 col = vec3( 0.0 );

    vec3 rg_color = imgPalette( 0.1 + audioCentroid * 0.1 ); // deep red/orange
    vec3 wd_color = imgPalette( 0.9 + audioKick * 0.1 );     // hot blue/white
    vec3 disk_color = imgPalette( 0.5 );                     // mix for the accretion disk

    float d_wd = length( uv - wd_pos );
    float d_rg = length( uv - rg_pos );

    // --- 1. Red Giant ---
    float rg_rad = 0.5;
    float rg_edge = smoothstep( rg_rad, rg_rad * 0.9, d_rg );

    // Texture for the red giant surface
    if ( d_rg < rg_rad * 1.5 )
    {
        vec3  p = vec3( ( uv - rg_pos ) * 5.0, time * 0.5 );
        float surface_noise = fbm( p );

        vec3 local_rg = rg_color * ( 0.5 + surface_noise * 0.5 ) * ( 1.0 + audioSwell * 0.5 );

        // Darken edges (limb darkening)
        local_rg *= smoothstep( rg_rad * 1.2, 0.0, d_rg );

        col += local_rg * rg_edge;

        // Solar flares / atmosphere
        float atmos = exp( -( d_rg - rg_rad ) * 10.0 );
        col += rg_color * atmos * ( 0.5 + audioSwell );
    }

    // --- 2. Plasma Stream (Roche Lobe overflow) ---
    // The stream goes from the inner Lagrangian point (L1) towards the white dwarf, curving into the disk
    vec2 l1_pos = rg_pos * 0.6; // Approximate L1 point

    // Curve the stream using polar coordinates around the WD
    vec2  polar_wd = vec2( d_wd, atan( uv.y, uv.x ) );
    float angle_to_rg = atan( rg_pos.y, rg_pos.x );

    // Determine the spiral path of the stream
    // The stream originates at angle_to_rg, and spirals inwards
    float stream_angle = angle_to_rg - ( 1.0 - polar_wd.x ) * 3.0; // arbitrary spiral function

    // Wrap angle diff
    float a_diff_stream = mod( polar_wd.y - stream_angle + 3.14159, 6.28318 ) - 3.14159;

    // The stream is only between the red giant and the disk
    float stream_mask = smoothstep( rg_dist, 0.2, polar_wd.x );

    if ( abs( a_diff_stream ) < 0.3 && stream_mask > 0.0 )
    {
        float stream_center = 1.0 - abs( a_diff_stream ) / 0.3;

        // Flowing noise
        float flow = fbm( vec3( polar_wd.x * 5.0, polar_wd.y * 5.0 + time * 5.0 * fp, 0.0 ) );

        vec3 stream_col = mix( rg_color, wd_color, 1.0 - polar_wd.x );
        col += stream_col * pow( stream_center, 3.0 ) * flow * stream_mask * ( 1.0 + audioSwell * 0.5 );
    }

    // --- 3. Accretion Disk ---
    float disk_outer = 0.4;
    float disk_inner = 0.05;

    if ( d_wd < disk_outer && d_wd > disk_inner )
    {
        // Fast rotation
        float disk_rot = polar_wd.y - time * 5.0 * dp - audioAdvance * 10.0;

        float disk_detail = fbm( vec3( polar_wd.x * 20.0, disk_rot * 10.0, time ) );

        // Radial intensity profile
        float disk_profile = smoothstep( disk_outer, disk_outer * 0.5, d_wd )
                             * smoothstep( disk_inner, disk_inner * 2.0, d_wd );

        // Turbulence/clumping reacting to kick
        float turbulence = smoothstep( 0.4, 0.8, disk_detail );

        vec3 local_disk = mix( rg_color, wd_color, smoothstep( disk_outer, disk_inner, d_wd ) );

        col += local_disk * disk_profile * ( 0.5 + turbulence * 1.2 ) * dp * ( 1.0 + audioKick * 2.0 );
    }

    // --- 4. White Dwarf ---
    // Tiny, but incredibly bright
    float wd_core = 0.01;
    float wd_glow = exp( -d_wd * 30.0 );

    col += wd_color * smoothstep( wd_core * 2.0, wd_core, d_wd ) * 2.0;
    col += wd_color * wd_glow * ( 1.0 + audioKick * 3.0 );

    // Polar Jets from the White Dwarf
    // Assuming rotation axis is somewhat arbitrary, let's say it's Z-axis (pointing at us)
    // Actually, Scene2D means we see it from above or side. Let's make jets shoot up/down
    vec2 jet_dir1 = vec2( -sin( orbit_speed ), cos( orbit_speed ) ); // Perpendicular to orbit
    vec2 jet_dir2 = -jet_dir1;

    float j1 = max( 0.0, dot( normalize( uv - wd_pos ), jet_dir1 ) );
    float j2 = max( 0.0, dot( normalize( uv - wd_pos ), jet_dir2 ) );

    j1 = pow( j1, 150.0 ) * ( 0.005 / d_wd );
    j2 = pow( j2, 150.0 ) * ( 0.005 / d_wd );

    float j_pulse = step( 0.8, sin( d_wd * 20.0 - time * 15.0 ) );

    col += wd_color * j1 * dp * ( 0.5 + j_pulse * audioKick * 5.0 );
    col += wd_color * j2 * dp * ( 0.5 + j_pulse * audioKick * 5.0 );

    // --- 5. Background ---
    // Round, jittered stars: brightening whole floor() cells gives SQUARES
    // (the repeatedly reported "giant pixel" fault).
    vec2  sgrid = uv * 55.0;
    vec2  sid = floor( sgrid );
    vec2  sfr = fract( sgrid ) - 0.5;
    float sh = fract( sin( dot( sid, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    if ( sh > 0.90 )
    {
        vec2  spos = ( vec2( fract( sh * 7.31 ), fract( sh * 13.7 ) ) - 0.5 ) * 0.8;
        float sd2 = dot( sfr - spos, sfr - spos );
        float stw = 0.7 + 0.3 * sin( time * ( 1.0 + 2.0 * fract( sh * 29.0 ) ) + sh * 40.0 );
        col += vec3( 1.0 ) * exp( -sd2 * 250.0 ) * stw * ( 0.35 + audioSwell * 0.25 );
    }

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
