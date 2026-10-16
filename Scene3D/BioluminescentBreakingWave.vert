#version 330 core
/**
 * @file BioluminescentBreakingWave.vert
 * @brief Vertex stage companion to BioluminescentBreakingWave.frag -- see that file's header for
 * this scene's description.
 */
// BioluminescentBreakingWave.vert — 220x120 heightfield breaking ocean wave
// with Gerstner wave harmonics and dinoflagellate bioluminescent crest emission.
//   attrA.xy = grid UV (0..1), attrA.zw = quad index

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioZCR;       ///< 0 = pure tone, 1 = broadband hiss
uniform float audioLowMid;    ///< 150-500 Hz harmonic warmth / pad body

uniform float waveHeightP;
uniform float steepnessP;
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec4  vCol;    ///< Colour (from the vertex stage).
out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out float vBioGlow;

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 grid_uv = attrA.xy; // 0..1

    float hgt = ( waveHeightP > 0.0 ) ? waveHeightP : 1.0;
    float stp = ( steepnessP > 0.0 ) ? steepnessP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Grid world range: X in [-44, 44], Z in [0, 48].  Wide enough that the
    // far edge still covers the frustum at the top of a frame the camera below
    // now looks DOWN into -- a plate seen in perspective is a trapezoid, and a
    // frame is a rectangle.
    float x0 = ( grid_uv.x - 0.5 ) * 96.0;
    float z0 = grid_uv.y * 60.0;

    float t = time * 0.45 * spd + audioAdvance * 0.2;

    // Primary breaking wave (Gerstner harmonic with steep crest)
    float k = 0.72;
    float phase = z0 * k - t * 3.0;
    float crest_profile = exp( -pow( sin( phase * 0.5 ), 2.0 ) * 8.0 * stp );
    // Break the crest into patches along x — a real breaker foams in cells,
    // not as one full-width neon bar.  Surf hiss IS broadband noise, so the
    // noisier the signal (audioZCR) the more those long smooth foam rolls
    // shatter into fine, scattered cells; a pure held tone leaves them whole.
    // Only the cell WEIGHTING moves, never a spatial frequency, so nothing
    // slides when the feature jumps.
    float cell_big = pow( 0.5 + 0.5 * sin( x0 * 0.7 + phase * 0.9 ), 2.0 );
    float cell_fine = pow( 0.5 + 0.5 * sin( x0 * 3.1 - phase * 1.7 + z0 * 1.3 ), 2.0 );
    float cells = mix( cell_big, cell_big * ( 0.30 + 0.70 * cell_fine ),
                       clamp( audioZCR * 1.4, 0.0, 1.0 ) );
    crest_profile *= 0.35 + 0.65 * cells;

    // Wave curling forward as it breaks
    float dx = sin( phase ) * 0.8 * stp;
    // Harmonic warmth (pads, low strings, bass guitar body) is the deep ocean
    // swell underneath the breaker — it lifts the whole water column, where
    // audioBass only pumps the crest.
    float dy = ( cos( phase ) + crest_profile * 2.0 )
               * ( 0.85 * hgt + 0.35 * audioBass + 0.30 * audioLowMid );
    float dz = -sin( phase ) * 1.2 * stp;

    // Cross-swell ripples
    float ripple = sin( x0 * 1.5 + z0 * 0.8 + t * 4.0 ) * 0.15 * ( 1.0 + audioHigh );

    vec3 world_p = vec3( x0 + dx, dy + ripple, z0 + dz );

    // Kick breaker explosion
    world_p.y += audioKick * 0.8 * crest_profile;

    // Camera: low over the near edge and pitched DOWN onto the water.  The
    // old camera sat at 6.5 looking dead level, so the sea was a strip along
    // the bottom under a black sky (reported).
    vec3 cam_pos = vec3( 0.0, 5.4, -3.0 );
    vec3 rel_p = world_p - cam_pos;
    // Steep enough to fill the frame, shallow enough that the crests still
    // read in profile: at 0.62 the sea was a flat green field from above.
    const float pitch = 0.44;
    float       pc = cos( pitch ), ps = sin( pitch );
    rel_p = vec3( rel_p.x, rel_p.y * pc + rel_p.z * ps, -rel_p.y * ps + rel_p.z * pc );
    rel_p.x -= eyeOff;

    gl_Position = projM * vec4( rel_p.x, rel_p.y, -rel_p.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = grid_uv;
    vBioGlow = crest_profile * ( 1.0 + audioKick * 0.8 );

    // Normal approximation
    vNormal = normalize( vec3( -dx * 0.5, 1.0, -dz * 0.8 ) );

    // Ocean deep navy / bioluminescent cyan palette
    vec3 deep_ocean = vec3( 0.02, 0.05, 0.12 );
    vec3 bio_cyan = vec3( 0.0, 0.95, 1.0 );
    // Brighter crests: seen from above at this distance the old glow read as
    // a dim teal wash with the bioluminescence lost in it.
    vec3 col = mix( deep_ocean * 1.4, bio_cyan, clamp( pow( vBioGlow, 1.1 ) * 1.5, 0.0, 1.0 ) );

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    vCol = vec4( col, 1.0 );
}
