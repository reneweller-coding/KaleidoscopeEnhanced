#version 330 core
/*****************************************************************************\
 *                              AbandonedStarGate.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  ABANDONED STAR GATE: A massive, ancient and corroded ring structure drifting in deep space.
 *
 *  It occasionally sparks with unstable, violent wormhole energy that pulses to the music.
 *
 *    audioAdvance -> slow drifting past the structure
 *    audioKick    -> violent energy sparks and unstable wormhole flashes
 *    audioSwell   -> ambient brightness of the dormant energy ring
 *    audioChromaHue-> palette offset for the wormhole energy
 *
 *  Per-activation variety:
 *    rustP float amount of corrosion and damage (0.5..1.5)
 *    sparkP float intensity of the unstable energy (0.5..2.0)
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

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
// Both count from THIS activation instead of from the program start:
// `time` and `audioAdvance` grow without bound and so serve only as a
// phase, never as a position or a noise coordinate.
uniform float sceneTime;    ///< Seconds since this scene was activated.
uniform float sceneAdvance; ///< The music's advance since this scene was activated (integrated, never jumps).

uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float rustP;  ///< Rust knob: amount of corrosion and damage (0.5..1.5).
uniform float sparkP; ///< Spark knob: intensity of the unstable energy (0.5..2.0).
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
    float rp = ( rustP > 0.01 ? rustP : 1.0 );
    float sp = ( sparkP > 0.01 ? sparkP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // The gate is viewed slightly off-center and tilted
    float tilt = 0.3 * sin( time * 0.1 );
    mat2  rot_m = mat2( cos( tilt ), -sin( tilt ), sin( tilt ), cos( tilt ) );
    vec2  p = rot_m * uv;

    // Slow drift of the camera past the structure
    vec2 offset = vec2( sin( time * 0.05 + audioAdvance * 0.5 ) * 0.2, cos( time * 0.07 ) * 0.2 );
    p += offset;

    // Perspective approximation for a 3D ring
    float y_squash = 2.0; // Squashes Y to make it look like it's tilted away in 3D
    vec2  ring_p = vec2( p.x, p.y * y_squash );

    float dist_to_center = length( ring_p );
    float angle = atan( ring_p.y, ring_p.x );

    float ring_radius = 0.6;
    float ring_thickness = 0.1;

    vec3 col = vec3( 0.0 );

    vec3 gate_col = vec3( 0.15, 0.12, 0.1 ); // Rusted dark metal
    vec3 energy_col = imgPalette( 0.8 + audioCentroid * 0.1 );

    // Background Space
    float bg_noise = fbm( vec3( p * 5.0, 0.0 ) );
    col += vec3( 0.02, 0.01, 0.03 ) * bg_noise * ( 1.0 + audioSwell ); // Faint nebula dust

    float ring_dist = abs( dist_to_center - ring_radius );

    // Render the physical ring structure
    if ( ring_dist < ring_thickness )
    {
        // Detailed surface texture (rust, panels, damage)
        float surface_detail = fbm( vec3( angle * 10.0, dist_to_center * 20.0, 0.0 ) );
        float panels = step( 0.9, fract( angle * 15.0 ) ); // Radial panel gaps

        vec3 local_col = mix( gate_col, vec3( 0.05 ), surface_detail * rp ) * 2.2;
        local_col *= ( 1.0 - panels * 0.5 );

        // Lighting from ambient stars + faint internal glow
        float lighting = 0.9 + 0.5 * sin( angle * 2.0 + time );
        local_col *= lighting;

        // Damage/holes in the ring
        float damage = smoothstep( 0.4, 0.6, fbm( vec3( angle * 5.0, dist_to_center * 5.0, 10.0 ) ) );
        if ( damage * rp > 0.6 )
        {
            local_col = vec3( 0.0 ); // hole
        }
        else
        {
            col = local_col;
        }

        // Residual glowing circuitry on the ring (dormant until kick)
        float circuitry = step( 0.95, fbm( vec3( angle * 30.0, dist_to_center * 40.0, 0.0 ) ) );
        col += energy_col * circuitry * ( 0.2 + audioSwell * 0.5 );
    }

    // Unstable Wormhole Energy sparking in the center and along the inner edge
    if ( dist_to_center < ring_radius + 0.02 )
    {
        // Event horizon / tear in spacetime
        float tear = fbm( vec3( ring_p * 3.0, sceneTime * 2.0 + sceneAdvance * 5.0 ) );

        // Intensity spikes on audioKick (violent unstable sparking)
        float spark_trigger = step( 0.95, hash11( floor( sceneTime * 4.00 ) + floor( angle * 5.0 ) ) ); // was 10 Hz
        float spark_int = spark_trigger * audioKick * 10.0 * sp;

        // Energy arcs jumping across the inner radius
        float arc = smoothstep( 0.45, 0.75, tear ) * exp( -( ring_radius - dist_to_center ) * 10.0 );

        col += energy_col * arc * ( 0.9 + spark_int + audioSwell * 1.5 );

        // Occasional violent flash filling the center (failed opening attempt)
        float massive_flash = step( 0.98, hash11( floor( time * 2.00 ) ) );
        col += energy_col * massive_flash * audioKick * 5.0 * sp * exp( -dist_to_center * 5.0 );
    }

    // Lens flare / Glare from sparks
    float glare = exp( -dist_to_center * 2.0 ) * audioKick * 0.5 * sp;
    col += energy_col * glare;

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
