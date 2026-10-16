#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file ThomasAttractorCosmicLabyrinth.frag
 * @brief THOMAS ATTRACTOR COSMIC LABYRINTH: Cyclically symmetric chaotic Thomas attractor
 * dx/dt = sin(y) - bx, dy/dt = sin(z) - by, dz/dt = sin(x) - bz. Hypnotic smooth 3D
 * space curve labyrinth with 3-fold cyclic symmetry, glowing energy packets, and orbital flow.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous integration along Thomas attractor curve
 *   audioKick    -> flashes attractor loop nodes & shoots energy pulses
 *   audioCentroid-> modulates damping parameter b & trajectory sharpness
 *   audioSubBass -> expands attractor labyrinth spatial volume
 *   audioChromaHue-> rotates the chaotic cyclic attractor palette
 */

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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP; ///< Speed knob, 0..1.
uniform float bParamP;
uniform float trailP;
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float b_mod = ( bParamP > 0.01 ) ? bParamP : 1.0;
    float trl = ( trailP > 0.01 ) ? trailP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.180 * spd + audioAdvance * 0.180 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Thomas attractor damping parameter b: chaotic regime around 0.18 - 0.208
    float b = ( 0.19 + 0.02 * sin( t * 0.4 ) + 0.015 * audioCentroid ) * b_mod;

    // 3D Orbital rotation of screen plane
    float rot_a = t * 0.2 + audioPhase * 0.1;
    float cs = cos( rot_a ), sn = sin( rot_a );
    // Sub-bass shrinks the world-units-per-screen factor, so the labyrinth
    // volume swells into the frame. The integrated attractor state itself is
    // left alone -- rescaling a trajectory mid-flight would jump the curve.
    vec2 p_rot = mat2( cs, -sn, sn, cs ) * uv * ( 8.0 + 1.5 * sin( audioSwell * 2.0 ) ) / ( 1.0 + 0.35 * audioSubBass );

    // Multi-step numerical RK2 integration along the Thomas attractor curve,
    // seeded from a FIXED point shared by every pixel -- not the pixel's own
    // position -- so the traced curve is one real spatial path instead of
    // every pixel trivially starting AT distance zero from itself (which
    // washed the whole frame out to a near-uniform glow).
    vec3  p_thomas = vec3( 1.5, 0.8, sin( t * 0.5 ) * 2.0 );
    float min_dist = 1e5;
    float energy_acc = 0.0;

    float dt = 0.04 * trl;

    for ( int i = 0; i < 26; i++ )
    {
        // Thomas ODE derivatives
        float dx = sin( p_thomas.y ) - b * p_thomas.x;
        float dy = sin( p_thomas.z ) - b * p_thomas.y;
        float dz = sin( p_thomas.x ) - b * p_thomas.z;

        p_thomas += vec3( dx, dy, dz ) * dt;

        float d = length( p_rot - p_thomas.xy );
        min_dist = min( min_dist, d );
        energy_acc += exp( -d * 2.5 );
    }

    // Sample distorted background photo
    vec2 sample_uv = fract( p_rot * 0.1 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Glowing trajectory ribbon lines
    float line_glow = exp( -min_dist * ( 4.0 + 3.0 * audioCentroid ) ) * glw;

    // Palette mixing across cyclic attractor loops
    float loop_phase = atan( p_rot.y, p_rot.x ) / 6.2831853 + length( p_rot ) * 0.1;
    vec3  pal_a = imgPalette( loop_phase + t * 0.05 );
    vec3  pal_b = imgPalette( loop_phase + 0.5 );
    vec3  col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( energy_acc * 0.4 ) );

    col = mix( col, tex_col, 0.35 + 0.15 * audioValence );

    // Add glowing attractor labyrinth tubes and kick pulses
    vec3 tube_tint = vec3( 1.3, 1.1, 1.8 ) * ( line_glow + energy_acc * 0.1 ) * ( 1.0 + 2.5 * audioKick );
    col += tube_tint;

    col = pow( col, vec3( 0.88 ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
