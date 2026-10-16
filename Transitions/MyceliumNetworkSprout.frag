#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file MyceliumNetworkSprout.frag
 * @brief TRANSITION MYCELIUM NETWORK SPROUT: Branching fungal hyphae network transition.
 * Organic fungal mycelial threads sprout and branch across the screen, conducting
 * bioluminescent action-potential pulses that bridge and cross-fade the scenes.
 *   interpolation -> sweeps mycelial growth front from center to boundaries
 *   audioKick     -> flashes action potential electrical pulses along hyphae cords
 *   audioSwell    -> widens mycelial thread network thickness
 *
 * Per-activation variety:
 *   hyphaeP float mycelial network branch density (0.5..2.2)
 *   branchP float tip branching angle divergence  (0.5..2.0)
 *   speedP  float growth velocity multiplier      (0.5..2.0)
 *   hueP    float bioluminescent hyphae hue offset (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float hyphaeP; ///< Hyphae knob: mycelial network branch density (0.5..2.2).
uniform float branchP; ///< Branching knob, 0..1.
uniform float speedP;  ///< Speed knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 534.34, 835.21 ) );
    p += dot( p, p + 62.32 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hyp = ( hyphaeP > 0.0 ) ? hyphaeP : 1.0;
    float brn = ( branchP > 0.0 ) ? branchP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.45 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    float r = length( p );
    float angle = atan( p.y, p.x );

    // Multi-angle branching hyphae lines.  audioBass widens the mycelial thread
    // network by softening the perpendicular falloff (peak unchanged, cords get
    // thicker).  mid_transition gates the widening back to the base thickness at
    // both fade endpoints, where hyphae_pattern's only consumers -- the cord
    // displacement and the bioluminescent glow -- are multiplied out anyway.
    float thread_width = 1.0 + audioSwell * 0.7 * mid_transition;

    float hyphae_pattern = 0.0;
    for ( int i = 0; i < 6; ++i )
    {
        float theta = float( i ) * 1.0471975 + sin( float( i ) * 3.7 + t * 0.5 ) * 0.2 * brn;
        vec2  dir = vec2( cos( theta ), sin( theta ) );
        float proj = dot( p, dir );
        float perp = abs( dot( p, vec2( -dir.y, dir.x ) ) );

        float branch = exp( -perp * 45.0 * hyp / thread_width ) * smoothstep( 0.0, 0.1, proj );
        hyphae_pattern = max( hyphae_pattern, branch );
    }

    // Growth front moving outward
    float growth_radius = t_prog * 1.3;
    float growth_mask = smoothstep( growth_radius - 0.1, growth_radius + 0.1, r );

    // Coordinate displacement along hyphae cords
    vec2 hyphae_disp = vec2( sin( r * 20.0 + t ), cos( angle * 6.0 ) ) * 0.02 * hyphae_pattern * mid_transition;

    vec4 c1 = texture( tex1, fract( uv + hyphae_disp ) );
    vec4 c0 = texture( tex0, fract( uv - hyphae_disp ) );

    vec4 col = mix( c0, c1, growth_mask );

    // Bioluminescent action-potential pulses along hyphae
    float pulse = sin( r * 30.0 - t * 8.0 ) * 0.5 + 0.5;
    vec3  bio_green = vec3( 0.2, 1.0, 0.5 );
    col.rgb += hyphae_pattern * pulse * bio_green * mid_transition * ( 1.5 + audioKick * 1.17 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
