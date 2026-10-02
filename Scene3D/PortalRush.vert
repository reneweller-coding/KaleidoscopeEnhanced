#version 330 core
/**
 * @file PortalRush.vert
 * @brief Vertex stage companion to PortalRush.frag -- see that file's header for
 * this scene's description.
 */
// PortalRush.vert — racing through a slalom of glowing ring gates.  Each
// "ribbon" is bent into a torus band; the gate directly ahead pulses with
// the beat, passing gates flash on the kick, a drop flares them all.
//   attrA.x = position around the ring, attrA.y = band side, attrA.w = gate.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioBeatPhase;   ///< Position within the current beat, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.

out vec4  vCol;   ///< Colour (from the vertex stage).
out float vSide;   ///< Which side of a strip (from the vertex stage).

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float t  = attrA.x;                    // 0..1 around the ring
    float sd = attrA.y;                    // band cross direction
    float ri = attrA.w;

    const float spacing = 19.0;
    const float L = 20.0 * spacing;
    float camZ = time * 5.0 + audioAdvance * 14.0;
    float zg   = mod(ri * spacing - camZ, L);

    float ringAng = t * 6.2831853;
    float R = 7.5 * (0.85 + 0.35 * attrB.x) * (1.0 + 0.06 * audioSwell);

    // Slalom: each gate sits at its own seeded offset off the axis.
    vec2 cg = vec2((attrB.y - 0.5) * 7.0, (attrB.z - 0.5) * 5.0);

    vec2 P = cg + vec2(cos(ringAng), sin(ringAng))
                  * (R + sd * (0.55 + 0.35 * attrB.w));
    float zTilt = sin(ringAng + attrB.x * 6.2831853)
                * 1.4 * (attrB.w - 0.5);   // seeded gate tilt

    vec3 vp = vec3(P.x, P.y, zg + zTilt);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;
    if (vp.z < 0.8)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // The nearest gates pulse in tempo; passing a gate flashes on the kick.
    float approach = exp(-zg * 0.05);
    float pulse = (0.5 + 0.5 * sin(6.2831853 * audioBeatPhase)) * approach;
    float pass  = audioKick * exp(-abs(zg - 10.0) * 0.14);

    vec3 col = hueRot(vec3(0.25, 0.75, 1.0),
                      ri * 0.55 + audioChromaHue * 1.4);
    col *= (0.5 + 0.5 * attrB.w)
         * (0.8 + 1.4 * pulse + 2.0 * pass + 1.6 * audioDrop)
         * exp(-zg * 0.007);
    vCol  = vec4(col * 1.8, 1.0);
    vSide = sd;
}
