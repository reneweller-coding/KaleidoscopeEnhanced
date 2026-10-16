#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file DreamyBokehBloom.frag
 * @brief TRANSITION DREAMY BOKEH BLOOM: Smooth depth-of-field bokeh blur and lens bloom
 * transition. The outgoing scene melts into a soft out-of-focus bokeh field
 * of luminous circular aperture discs and resolves into the incoming scene.
 *   interpolation -> sweeps camera focus distance & circle-of-confusion blur
 *   audioKick     -> flashes luminous bokeh highlight discs
 *   audioSwell   -> broadens dreamy lens bloom radius
 *
 * Per-activation variety:
 *   bokehP float circle-of-confusion blur radius (0.5..2.2)
 *   bloomP float luminous highlight bloom gain   (0.5..2.0)
 *   speedP float animation speed multiplier      (0.5..2.0)
 *   hueP   float bokeh chromatic hue offset      (0..6.28)
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

uniform float bokehP; ///< Bokeh knob: circle-of-confusion blur radius (0.5..2.2).
uniform float bloomP; ///< Bloom knob: luminous highlight bloom gain, 0.5..2.
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float bkh = ( bokehP > 0.0 ) ? bokehP : 1.0;
    float blm = ( bloomP > 0.0 ) ? bloomP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    float t = time * 0.4 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Multi-tap bokeh disc sampling
    float blur_radius = mid_transition * 0.025 * bkh * ( 1.0 + audioSwell * 0.5 );

    vec3  c1_acc = vec3( 0.0 );
    vec3  c0_acc = vec3( 0.0 );
    float w1_sum = 0.0;
    float w0_sum = 0.0;

    // 12-tap golden angle Fermat spiral disc
    float golden_angle = 2.39996323;
    for ( int i = 0; i < 12; ++i )
    {
        float r = sqrt( float( i + 1 ) / 12.0 ) * blur_radius;
        float theta = float( i ) * golden_angle;
        vec2  offset = vec2( cos( theta ), sin( theta ) ) * r;

        vec3 s1 = texture( tex1, fract( uv + offset ) ).rgb;
        vec3 s0 = texture( tex0, fract( uv + offset ) ).rgb;

        // Weight highlights more heavily for bokeh bloom
        float w1 = 1.0 + dot( s1, vec3( 0.333 ) ) * blm;
        float w0 = 1.0 + dot( s0, vec3( 0.333 ) ) * blm;

        c1_acc += s1 * w1;
        c0_acc += s0 * w0;
        w1_sum += w1;
        w0_sum += w0;
    }

    // Each accumulator carries ITS OWN weights -- a shared normalizer
    // brightens whichever scene has the stronger highlights and washed
    // the whole frame toward white.
    vec3 c1 = c1_acc / w1_sum;
    vec3 c0 = c0_acc / w0_sum;

    vec3 col = mix( c1, c0, t_prog );

    // Luminous bloom glow on kick -- masked to the frame's own highlights;
    // a flat full-frame add whited the whole picture out at strong kicks.
    float hi = smoothstep( 0.55, 1.0, dot( col, vec3( 0.333 ) ) );
    float bloom_glow = mid_transition * hi * ( audioKick * 0.15 + audioSwell * 0.10 );
    col += bloom_glow * vec3( 1.0, 0.95, 0.85 );

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col = hueRot( col, hue * mid_transition );

    fragColor = vec4( col, 1.0 );
}
