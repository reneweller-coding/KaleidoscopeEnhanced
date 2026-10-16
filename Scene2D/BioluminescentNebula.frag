#version 330 core
/*****************************************************************************\
 *                              BioluminescentNebula.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  BIOLUMINESCENT NEBULA: Massive, fluid-like clouds of interstellar gas that glow with organic, bioluminescent
 *  colors.
 *
 *  The nebula ripples and pulses like a living organism in response to the audio.
 *
 *    audioAdvance -> drift speed through the nebula
 *    audioKick    -> flashes of bright light through the gas clouds
 *    audioSwell   -> overall glow intensity and color shifting
 *    audioPhase   -> rotation of the viewing angle
 *    audioChromaHue-> base color palette of the nebula
 *
 *  Per-activation variety:
 *    densP float density of the nebula clouds (0.5..1.5)
 *    glowP float intensity of the bioluminescence (0.6..1.8)
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

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
// Both count from THIS activation, not from the program start -- see `drift`
// below for why that decides here between a picture and none.
uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float densP; ///< Density knob, 0..1.
uniform float glowP; ///< Glow / afterglow knob, 0..1.
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
        p *= 2.03;
        a *= 0.5;
    }
    return f;
}

/**  The slow warp field's fractal noise: three octaves, plus the mean the other two would have added.
 *
 * @param p  The point. (in)
 *
 * @return
 *   About fbm( p ) without its two finest octaves (under 10 % of its swing), at three fifths of the cost.
 **/
float fbm3( vec3 p )
{
    float f = 0.0, a = 0.5;
    for ( int i = 0; i < 3; ++i )
    {
        f += a * noise( p );
        p *= 2.03;
        a *= 0.5;
    }
    return f + 0.046875; // the 4th and 5th octaves' mean (0.0625 + 0.03125) * 0.5
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float dp = ( densP > 0.01 ? densP : 1.0 );
    float gp = ( glowP > 0.01 ? glowP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.1 + audioAdvance * 0.2;
    // The distance flown MUST start at 0 with every activation.  It is the z
    // coordinate the noise field is sampled at; with `time` it stood at 7200
    // here after an hour, and `sin(n * 12.9898)` has no resolution left for
    // neighbouring cells at such arguments -- the cloud turns constant,
    // smoothstep(0.40, 0.80, ...) cuts it away completely and the picture is
    // BLACK (measured: structure 0.0534 at clock 0, exactly 0.0000 at clock
    // 3600).  The music's push stays; it, too, just counts from the scene's
    // entrance.
    float drift = sceneTime * 2.0 + sceneAdvance * 5.0;

    vec3 ro = vec3( 3.0 * sin( t ), 3.0 * cos( t * 0.8 ), drift );
    vec3 ta = ro + vec3( sin( t * 0.5 ), cos( t * 0.3 ), 1.0 );

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    float roll = 0.2 * sin( t * 0.2 ) + audioPhase * 0.2;
    vec2  ruv = mat2( cos( roll ), -sin( roll ), sin( roll ), cos( roll ) ) * uv;
    vec3  rd = normalize( ruv.x * uu + ruv.y * vv + 1.5 * ww );

    float d = 0.0;
    vec3  col = vec3( 0.0 );

    vec3 color_base1 = max( imgPalette( 0.1 + audioCentroid * 0.2 ), vec3( 0.10, 0.14, 0.18 ) );
    vec3 color_base2 = max( imgPalette( 0.8 + audioKick * 0.1 ), vec3( 0.24, 0.34, 0.22 ) );

    // Volumetric raymarching for the nebula.  16.10.2026: it cost 24 ms of GPU time a frame at 2880x1620 -- thirty
    // times the catalogue's median, three frames at 120 Hz -- with up to 25 five-octave noise sums per step.  The
    // warp is a slow field (p * 0.1), so three octaves carry it and it is renewed every 2nd step (along the ray it
    // moves by a few hundredths a step); the veins are only worked out where the gas is dense enough to show them;
    // and the steps are 1.3 times as long (46 instead of 60 to the same depth), each carrying 1.3 times the gas.
    vec3 warp = vec3( 0.5 );
    for ( int i = 0; i < 46; ++i )
    {
        vec3 p = ro + rd * d;

        // Distort space slightly for organic feel
        if ( ( i & 1 ) == 0 )
            warp = vec3( fbm3( p * 0.1 ), fbm3( p * 0.1 + 10.0 ), fbm3( p * 0.1 + 20.0 ) );
        // Warp must not hang off the audio level: on quiet material the
        // clouds collapsed into structureless fog. Swell only breathes it.
        vec3 np = p * 0.5 + ( warp - 0.5 ) * ( 2.0 + 0.5 * audioSwell );

        float dens = fbm( np );

        // Carve out empty space
        dens = smoothstep( 0.40, 0.80, dens ) * dp;

        if ( dens > 0.01 )
        {
            // Smooth travelling pulse instead of the old hard step bands
            float pulse = pow( 0.5 + 0.5 * sin( dens * 12.0 - time * 3.0 ), 4.0 )
                          * audioKick * 1.5;

            // Color mapping based on density. Brightness floor 0.45: the old
            // 0.2 + swell*0.8 went black on every quiet passage -- the
            // user-reported "the nebula is black".
            vec3 local_col = mix( color_base1, color_base2, dens );
            // Visible without music: with quiet material the cloud otherwise stayed
            // a barely recognisable hint (catalogue frame A/B).
            local_col *= ( 0.85 + 0.5 * audioSwell + pulse ) * gp;

            // BIOLUMINESCENT VEINS: ridged filaments glowing inside the gas -- where it is dense enough to show them
            // (their light is weighted by the density below anyway), faded in so there is no edge.
            float vein_w = smoothstep( 0.05, 0.15, dens );
            if ( vein_w > 0.0 )
            {
                float ridge = 1.0 - abs( 2.0 * fbm( np * 2.3 ) - 1.0 );
                ridge = pow( ridge, 5.0 );
                local_col += mix( color_base2, vec3( 1.0 ), 0.3 ) * ridge * 0.9 * gp * vein_w;
            }

            // Fade by distance
            float alpha = dens * 0.13; // a step 1.3 times as long carries 1.3 times the gas
            col += local_col * alpha * exp( -d * 0.05 );
        }

        d += 0.65 + d * 0.026;
        if ( d > 50.0 )
            break;
    }

    // Add glowing spores / stars
    vec3 spore_col = vec3( 0.0 );
    for ( int i = 0; i < 2; ++i )
    {
        float sc = 10.0 + 10.0 * float( i );
        vec3  st = rd * sc + vec3( 0.0, 0.0, drift * 0.1 );
        vec3  cell = floor( st );
        vec3  f = fract( st ) - 0.5;
        if ( fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) > 0.93 )
        {
            float b = exp( -length( f ) * 120.0 );
            spore_col += mix( color_base2, vec3( 1.0 ), hash11( cell.x ) ) * b * ( 1.0 + audioKick * 3.0 ) * gp;
        }
    }
    col += spore_col;

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
