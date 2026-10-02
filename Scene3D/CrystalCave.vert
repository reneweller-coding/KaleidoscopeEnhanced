#version 330 core
/**
 * @file CrystalCave.vert
 * @brief Vertex stage companion to CrystalCave.frag -- see that file's header for
 * this scene's description.
 */
// CrystalCave.vert — a flight through a cave of glowing crystal shards.
// Each "cube" is stretched into a long faceted crystal pointing inward from
// the cave wall; the kick makes the crystals just ahead flare, the swell
// breathes the ambient glow.  attrA.xyz = unit corner, attrA.w = index.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float cubeBudget;    ///< FPS detail budget: <1 -> drop every 2nd cube

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSnare;   ///< Snare envelope, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.

out vec4 vCol;   ///< Colour (from the vertex stage).
out vec3 vCorner;

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
    // FPS budget: below full detail, every 2nd crystal collapses.
    if (cubeBudget < 0.75 && mod(attrA.w, 2.0) > 0.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    const float L = 210.0;
    float camZ = time * 3.5 + audioAdvance * 8.0;
    float z    = mod(r1 * L - camZ, L);

    float ang  = r2 * 6.2831853;
    float radT = 9.0 + 15.0 * r3;

    // Crystal size + orientation (fixed per crystal).
    float sy = 2.0 + 6.0 * r4;                    // long axis
    float sx = 0.35 + 0.6 * r2;
    float sz = 0.35 + 0.6 * r3;

    vec2 radial = vec2(cos(ang), sin(ang));
    vec2 tang   = vec2(-radial.y, radial.x);

    vec3 C = vec3(radial * radT, z);
    vec3 world = C
               + vec3(-radial, 0.0)  * (attrA.y * sy + sy * 0.35)  // points inward
               + vec3(tang, 0.0)     * (attrA.x * sx + attrA.y * (r1 - 0.5) * 0.8)
               + vec3(0.0, 0.0, 1.0) * (attrA.z * sz);

    vec3 vp = vec3(world.x + sin(time * 0.10) * 1.5,
                   world.y + cos(time * 0.083) * 1.2,
                   world.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.055 * gl_Position.w;

    // Gem colour by seed family, key-driven hue drift; the kick flares the
    // crystals just ahead, snares sparkle a hashed subset.
    vec3 gem = (r4 < 0.33) ? vec3(0.30, 0.70, 1.00)
             : (r4 < 0.66) ? vec3(0.80, 0.30, 1.00)
                           : vec3(0.20, 1.00, 0.65);
    gem = hueRot(gem, audioChromaHue * 1.2 + r2 * 0.5);
    float flare   = audioKick * exp(-abs(z - 15.0) * 0.09);
    float sparkle = audioSnare * step(0.7, fract(r3 * 13.7));
    float fog     = exp(-z * 0.016);
    vCol = vec4(gem * (0.55 + 0.45 * audioSwell
                       + 1.8 * flare + 1.0 * sparkle + 1.4 * audioDrop) * fog,
                1.0);
    vCorner = attrA.xyz;
}
