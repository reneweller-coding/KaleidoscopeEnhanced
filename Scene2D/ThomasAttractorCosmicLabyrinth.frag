#version 330 core
out vec4 fragColor;
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

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

// Per-activation variety
uniform float speedP;
uniform float bParamP;
uniform float trailP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float bMod = (bParamP > 0.01) ? bParamP : 1.0;
    float trl = (trailP > 0.01) ? trailP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.3 * spd;

    // Thomas attractor damping parameter b: chaotic regime around 0.18 - 0.208
    float b = (0.19 + 0.02 * sin(t * 0.4) + 0.015 * audioCentroid) * bMod;

    // 3D Orbital rotation of screen plane
    float rotA = t * 0.2 + audioPhase * 0.1;
    float cs = cos(rotA), sn = sin(rotA);
    // Sub-bass shrinks the world-units-per-screen factor, so the labyrinth
    // volume swells into the frame. The integrated attractor state itself is
    // left alone -- rescaling a trajectory mid-flight would jump the curve.
    vec2 pRot = mat2(cs, -sn, sn, cs) * uv * (8.0 + 1.5 * sin(audioSwell * 2.0)) / (1.0 + 0.35 * audioSubBass);

    // Multi-step numerical RK2 integration along the Thomas attractor curve,
    // seeded from a FIXED point shared by every pixel -- not the pixel's own
    // position -- so the traced curve is one real spatial path instead of
    // every pixel trivially starting AT distance zero from itself (which
    // washed the whole frame out to a near-uniform glow).
    vec3 pThomas = vec3(1.5, 0.8, sin(t * 0.5) * 2.0);
    float minDist = 1e5;
    float energyAcc = 0.0;

    float dt = 0.04 * trl;

    for (int i = 0; i < 26; i++) {
        // Thomas ODE derivatives
        float dx = sin(pThomas.y) - b * pThomas.x;
        float dy = sin(pThomas.z) - b * pThomas.y;
        float dz = sin(pThomas.x) - b * pThomas.z;

        pThomas += vec3(dx, dy, dz) * dt;

        float d = length(pRot - pThomas.xy);
        minDist = min(minDist, d);
        energyAcc += exp(-d * 2.5);
    }

    // Sample distorted background photo
    vec2 sampleUV = fract(pRot * 0.1 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing trajectory ribbon lines
    float lineGlow = exp(-minDist * (4.0 + 3.0 * audioCentroid)) * glw;

    // Palette mixing across cyclic attractor loops
    float loopPhase = atan(pRot.y, pRot.x) / 6.2831853 + length(pRot) * 0.1;
    vec3 palA = imgPalette(loopPhase + t * 0.05);
    vec3 palB = imgPalette(loopPhase + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(energyAcc * 0.4));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing attractor labyrinth tubes and kick pulses
    vec3 tubeTint = vec3(1.3, 1.1, 1.8) * (lineGlow + energyAcc * 0.1) * (1.0 + 2.5 * audioKick);
    col += tubeTint;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
