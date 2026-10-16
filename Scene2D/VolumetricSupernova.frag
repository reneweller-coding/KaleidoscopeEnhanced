#version 330 core
/*****************************************************************************\
 *                              VolumetricSupernova.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  VOLUMETRIC SUPERNOVA: Full-screen raymarched volumetric plasma field & shockwave explosion.
 *
 *  100% viewport coverage with 3D Curl Noise, light absorption, and audio-driven corona flares.
 *
 *    audioSubBass -> expands radial explosion shockwave outwards to screen corners
 *    audioKick    -> ignites core luminosity and chromatic flare burst
 *    audioHigh    -> sparks high-frequency plasma filaments
 *    audioSwell   -> thickens volumetric fog density
 *
 *  Per-activation variety (0 = default):
 *    densityP float fog density multiplier        (0 -> 1.0; 0.6..1.8)
 *    speedP   float plasma swirl speed multiplier (0 -> 1.0; 0.5..1.5)
 *    flareP   float chromatic flare intensity     (0 -> 1.0; 0.5..2.0)
 *    hueP     float global hue rotation           (0 -> none; 0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;    ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;    ///< Overall loudness, 0..1.
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid; ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;  ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;  ///< Sub-bass band level, 0..1.
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioMid;      ///< Mid band level, 0..1.
uniform float audioHigh;     ///< High band level, 0..1.
uniform float audioFlux;     ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float densityP;       ///< Density knob, 0..1.
uniform float speedP;         ///< Speed knob, 0..1.
uniform float flareP;         ///< Flare knob: chromatic flare intensity, 0.5..2.
uniform float hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

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


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
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

/**  Pseudo-random number 0..1 from a 3D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash31( vec3 p )
{
    p = fract( p * vec3( 443.8975, 397.2973, 491.1871 ) );
    p += dot( p, p.yzx + 19.19 );
    return fract( ( p.x + p.y ) * p.z );
}

/**  Smooth 3D value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value.
 **/
float noise3D( vec3 p )
{
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
        mix( mix( hash31( i ), hash31( i + vec3( 1, 0, 0 ) ), f.x ),
             mix( hash31( i + vec3( 0, 1, 0 ) ), hash31( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
        mix( mix( hash31( i + vec3( 0, 0, 1 ) ), hash31( i + vec3( 1, 0, 1 ) ), f.x ),
             mix( hash31( i + vec3( 0, 1, 1 ) ), hash31( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
        f.z );
}

/**  Fractal noise of four octaves.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, about 0..1.
 **/
float fbm3D( vec3 p )
{
    float v = 0.0;
    float a = 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        v += a * noise3D( p );
        p = p * 2.02 + vec3( 1.7, 9.2, 3.4 );
        a *= 0.5;
    }
    return v;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float dens = ( densityP > 0.0 ) ? densityP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float flr = ( flareP > 0.0 ) ? flareP : 1.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // Ray setup: origin (ro) and direction (rd)
    vec3 ro = vec3( 0.0, 0.0, -2.5 + audioSwell * 0.5 );
    vec3 rd = normalize( vec3( uv, 1.0 ) );

    // Camera rotation
    float t = time * 0.15 * spd + audioAdvance * 0.1;
    mat2  rot_xz = mat2( cos( t ), sin( t ), -sin( t ), cos( t ) );
    ro.xz = rot_xz * ro.xz;
    rd.xz = rot_xz * rd.xz;

    // Volumetric Raymarching Loop
    vec3  acc_color = vec3( 0.0 );
    float transmittance = 1.0;
    float step_size = 0.12;

    float shockwave_radius = 0.45 + mod( time * 0.18 * spd + audioAdvance * 0.22, 2.4 )
                             + audioKick * 0.35;

    for ( int i = 0; i < 28; ++i )
    {
        float depth = 1.0 + float( i ) * step_size;
        vec3  p = ro + rd * depth;

        // Radial distance from supernova core
        float dist = length( p );

        // Calculate density with noise and shockwave front
        float shock_front = smoothstep( 0.3, 0.0, abs( dist - shockwave_radius ) );
        float n = fbm3D( p * 1.5 + vec3( 0.0, 0.0, time * 0.4 * spd ) );

        float d = smoothstep( 2.5, 0.2, dist ) * n * dens * 0.045; // the broad fog was drawing a solid ball
        d += shock_front * ( 1.6 + 1.4 * ( audioKick + audioBass ) );

        // Radial EJECTA filaments streaking away from the core, plus a
        // white-hot centre - the difference between fog and an explosion.
        float fil = pow( fbm3D( normalize( p ) * 5.0 + vec3( 7.0 ) ), 3.5 )
                    * smoothstep( shockwave_radius + 0.25, shockwave_radius * 0.2, dist )
                    * smoothstep( 0.10, 0.45, dist ); // shell, not the core fill
        d += fil * 2.6 * dens;                        // ejecta filaments carry the explosion
        d += smoothstep( 0.40, 0.05, dist ) * 0.55;

        if ( d > 0.01 )
        {
            // Map sample point to 2D UV for source image sampling
            vec2 sample_uv = vec2( atan( p.z, p.x ) / 6.283185 + 0.5, p.y * 0.3 + 0.5 );
            vec3 img_col = img( fract( sample_uv ) );

            // TEMPERATURE ramp, not photo mud: white-hot core, gold shell,
            // ember red, violet outskirts.  The photo only textures it.
            // Temperature relative to the travelling shock front: inside it
            // is white-hot, at the front gold, outside ember red fading to
            // violet.  Absolute dist thresholds never fired -- the marched
            // samples all sit past them.
            float hot = clamp( 1.0 - dist / max( shockwave_radius, 0.25 ), 0.0, 1.0 );
            vec3  fire = mix( vec3( 1.0, 0.32, 0.07 ), vec3( 1.0, 0.92, 0.62 ),
                              smoothstep( 0.15, 0.95, hot ) );
            fire = mix( vec3( 0.35, 0.12, 0.30 ), fire, smoothstep( 0.0, 0.35, hot ) );
            vec3 glow = fire * ( 0.75 + 0.5 * dot( img_col, vec3( 0.333 ) ) );
            glow *= ( 1.0 + audioKick * 0.45 + audioHigh * 0.3 );
            glow += vec3( 1.0, 0.85, 0.60 ) * shock_front * 1.4; // golden shock rim

            // Emission & Absorption
            float step_density = d * step_size * 2.5;
            acc_color += transmittance * glow * step_density;
            transmittance *= exp( -step_density * 1.2 );

            if ( transmittance < 0.02 )
                break;
        }
    }

    // Add background texture glow
    vec3 bg_col = img( fract( uv * 0.5 + 0.5 ) ) * 0.15 * transmittance;
    vec3 final_col = acc_color + bg_col;

    // Add chromatic lens flare at center
    float center_dist = length( uv );
    float flare = 0.10 / ( center_dist + 0.10 ) * flr * ( audioKick * 0.5 + audioLevel * 0.5 );
    vec3  flare_col = imgPalette( 0.30 * audioCentroid ) * 1.4;
    final_col += flare_col * flare;

    if ( hueP > 0.0 )
    {
        final_col = hueRot( final_col, 0.22 * sin( hueP ) ); // full rotation turned the FIRE cyan
    }

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( final_col ) * 0.85; // 0.34 crushed the explosion into a dim blue ball
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
