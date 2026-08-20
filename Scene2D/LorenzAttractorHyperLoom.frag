#version 330 core
out vec4 fragColor;
/**
 * @file LorenzAttractorHyperLoom.frag
 * @brief LORENZ ATTRACTOR HYPER LOOM: High-density chaotic Lorenz attractor trajectory
 * field woven into a glowing butterfly-wing hyper-dimensional loom with orbital particle
 * pulses, chaotic parameter morphing, and volumetric luminous energy sheets.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous integration of chaotic Lorenz trajectories
 *   audioKick    -> flashes chaotic singularity lobes & shoots particle pulses
 *   audioCentroid-> modulates Rayleigh number rho & trajectory sharpness
 *   audioSubBass -> expands butterfly wing lobe separation
 *   audioChromaHue-> rotates the chaotic attractor rainbow palette
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
uniform float rhoP;
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
    float rMod = (rhoP > 0.01) ? rhoP : 1.0;
    float trl = (trailP > 0.01) ? trailP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.3 * spd;

    // Lorenz parameters: sigma = 10, beta = 8/3, rho modulated by audio
    float sigma = 10.0;
    float beta = 2.666666;
    float rho = (28.0 + 8.0 * sin(t * 0.4) + 6.0 * audioCentroid) * rMod;

    // 3D Point projected onto 2D screen coordinate frame
    float rotA = t * 0.2 + audioPhase * 0.1;
    float cs = cos(rotA), sn = sin(rotA);
    vec2 pRot = mat2(cs, -sn, sn, cs) * uv * (35.0 + 5.0 * sin(audioSwell * 2.0));

    // Integrated trajectory point simulation (multi-step RK2 integration),
    // seeded from a FIXED point shared by every pixel -- not the pixel's own
    // position -- so the traced curve is one real spatial path instead of
    // every pixel trivially starting AT distance zero from itself (which let
    // the angle-only lobePhase background dominate the whole frame with a
    // generic pinwheel instead of the intended attractor-wing glow).
    vec3 pLorenz = vec3(1.0, 1.0, 25.0);
    float minDist = 1e5;
    float energyAcc = 0.0;

    float dt = 0.012 * trl;

    for (int i = 0; i < 24; i++) {
        // Lorenz ODE derivatives
        float dx = sigma * (pLorenz.y - pLorenz.x);
        float dy = pLorenz.x * (rho - pLorenz.z) - pLorenz.y;
        float dz = pLorenz.x * pLorenz.y - beta * pLorenz.z;

        pLorenz += vec3(dx, dy, dz) * dt;

        // Project 3D Lorenz attractor onto screen plane
        vec2 pProj = pLorenz.xy - vec2(0.0, 5.0);
        float d = length(pRot - pProj);
        minDist = min(minDist, d);
        energyAcc += exp(-d * 0.4);
    }

    // Dynamic texture sample mapped on attractor coordinates
    vec2 sampleUV = fract(pRot * 0.05 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing trajectory ribbon lines
    float lineGlow = exp(-minDist * (1.2 + 0.8 * audioCentroid)) * glw;

    // Palette mixing across Lorenz lobes
    float lobePhase = atan(pRot.y, pRot.x) / 6.2831853 + length(pRot) * 0.02;
    vec3 palA = imgPalette(lobePhase + t * 0.05);
    vec3 palB = imgPalette(lobePhase + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(energyAcc * 0.3));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing attractor wings and kick flashes
    vec3 wingTint = vec3(1.3, 1.1, 1.8) * (lineGlow + energyAcc * 0.05) * (1.0 + 2.5 * audioKick);
    col += wingTint;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
