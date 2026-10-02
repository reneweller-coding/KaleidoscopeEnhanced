#version 330 core
/**
 * @file SpiralArray.vert
 * @brief Vertex stage companion to SpiralArray.frag -- see that file's header for
 * this scene's description.
 */
// SpiralArray.vert — a DNA DOUBLE HELIX of light (the recognisable motif
// the abstract tonality helix never managed to be): two glowing strands
// wind around each other, connected by base-pair rungs that light up in
// the current harmony's colours (audioChroma picks which rungs glow).
// A light pulse climbs the helix on every beat, kicks make the strands
// breathe apart — and a DROP UNZIPS the helix: the strands tear apart
// down the middle and snap back together as the pulse decays.
//   60k points: 2x 12k strand beads, 24k rung beads, 12k drifting plasma.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float sceneSeed;   ///< A random number fixed per activation.

uniform float audioChroma[12];   ///< Pitch-class energies (12 values).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.
uniform float audioBeatPhase;   ///< Position within the current beat, 0..1.

out vec4 vCol;   ///< Colour (from the vertex stage).

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float idx = attrA.w;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Helix parameters: h in 0..1 spans the visible column.
    const float TURNS = 5.5;
    const float H     = 34.0;
    const float R     = 5.2;

    vec3  world;
    vec3  col;
    float bright;
    float sizeMul = 1.0;

    // The whole molecule slowly turns; a beat pulse climbs it.
    float spin  = time * 0.35;
    float pulseH = fract(audioBeatPhase);              // 0 bottom .. 1 top

    // DROP UNZIP: the strands tear apart horizontally, most near the top.
    float unzip = audioDrop;

    if (idx < 24000.0)
    {
        // ---- Two strands: beads along the backbones ----
        float strand = (idx < 12000.0) ? 0.0 : 1.0;
        float h  = fract(idx / 12000.0) ;
        h = fract(h * 7.919 + r1 * 0.002);             // decorrelate
        float ang = h * TURNS * 6.2831853 + spin + strand * 3.1415927;

        vec3 c3 = vec3(cos(ang) * R, (h - 0.5) * H, sin(ang) * R);
        // Unzip: push the strands apart sideways, stronger toward the top.
        c3.x += (strand * 2.0 - 1.0) * unzip * 7.0 * h;
        // Kick: the strands breathe apart radially for an instant.
        c3.xz *= 1.0 + 0.16 * audioKick;
        world = c3 + vec3(r2 - 0.5, r3 - 0.5, r4 - 0.5) * 0.30;

        // Strand colours: classic two-tone (cyan / warm) around the key.
        col = hueRot((strand < 0.5) ? vec3(0.25, 0.85, 1.0)
                                    : vec3(1.0, 0.55, 0.25), audioChromaHue);
        float pulse = exp(-abs(h - pulseH) * 8.0);
        bright = 0.45 + 0.9 * pulse + 0.4 * audioSwell;
        sizeMul = 0.8 + 0.6 * pulse;
    }
    else if (idx < 48000.0)
    {
        // ---- Base-pair rungs: 64 rungs x ~375 beads bridging the strands.
        float ri   = floor((idx - 24000.0) / 375.0);   // rung 0..63
        float tt   = fract((idx - 24000.0) / 375.0);   // 0..1 across the rung
        float h    = (ri + 0.5) / 64.0;
        float ang  = h * TURNS * 6.2831853 + spin;

        vec3 a3 = vec3(cos(ang) * R, (h - 0.5) * H, sin(ang) * R);
        vec3 b3 = vec3(cos(ang + 3.1415927) * R, a3.y, sin(ang + 3.1415927) * R);
        a3.x += -unzip * 7.0 * h;  b3.x += unzip * 7.0 * h;   // unzip splits rungs
        vec3 c3 = mix(a3, b3, tt);
        // The rung BREAKS in the middle while unzipped.
        float gap = step(0.5 - 0.35 * unzip, tt) * step(tt, 0.5 + 0.35 * unzip)
                  * step(0.05, unzip);
        c3.xz *= 1.0 + 0.16 * audioKick;
        world = c3 + vec3(r2 - 0.5, r3 - 0.5, r4 - 0.5) * 0.22;

        // Rung colour = its pitch class; it GLOWS when that note sounds.
        float pc = mod(ri, 12.0);
        float e  = audioChroma[int(pc)] * 4.0;
        col = hueRot(vec3(0.9, 0.5, 0.9), pc / 12.0 * 3.1415927 + audioChromaHue);
        float pulse = exp(-abs(h - pulseH) * 8.0);
        bright = (0.10 + 2.2 * e + 0.6 * pulse) * (1.0 - gap);
        sizeMul = 0.6 + 0.5 * e;
    }
    else
    {
        // ---- Ambient plasma drifting around the molecule ----
        float u = r1 * 6.2831853;
        float h = r2;
        float rad = R + 2.5 + 4.0 * r3;
        world = vec3(cos(u + time * 0.1) * rad, (h - 0.5) * (H + 6.0),
                     sin(u + time * 0.1) * rad);
        col = hueRot(vec3(0.3, 0.5, 0.9), audioChromaHue);
        bright = 0.05 + 0.10 * audioSwell;
        sizeMul = 0.5;
    }

    // Gentle camera: slight tilt + slow vertical drift along the molecule.
    float tilt = 0.25 + 0.10 * sin(time * 0.03 + sceneSeed * 6.28);
    world.y  += sin(time * 0.05) * 4.0;
    world.yz  = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * world.yz;

    vec3 vp = world + vec3(0.0, 0.0, 27.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(170.5 * sizeMul * (0.5 + 0.5 * r4) * px / dist, 1.5, 19.5 * px);   // sprite sweep 2026-08-22: measured luma 0.053, area x2.6

    vCol = vec4(col * bright * 2.8, 1.0);
}
