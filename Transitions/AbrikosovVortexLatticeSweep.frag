#version 330 core
out vec4 fragColor;
/**
 * @file AbrikosovVortexLatticeSweep.frag
 * @brief TRANSITION ABRIKOSOV VORTEX LATTICE SWEEP: Type-II superconductor vortex lattice.
 * A triangular lattice of quantized magnetic flux vortices (Abrikosov lattice)
 * sweeps across the screen, each vortex carrying 2pi phase winding that rotates
 * and transitions between scenes.
 *   interpolation -> sweeps superconducting flux penetration front across viewport
 *   audioKick     -> flashes quantized vortex core magnetic singularity points
 *   audioBass     -> drives vortex lattice triangular constant & Kelvin waves
 *
 * Per-activation variety:
 *   vortexP float Abrikosov vortex density & lattice scale (0.5..2.2)
 *   sweepP  float flux front sweep velocity ratio          (0.5..2.0)
 *   speedP  float animation speed multiplier               (0.5..2.0)
 *   hueP    float vortex core magnetic hue offset          (0..6.28)
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

uniform float vortexP;
uniform float sweepP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float vrt = (vortexP > 0.0) ? vortexP : 1.0;
    float swp = (sweepP  > 0.0) ? sweepP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Triangular Abrikosov lattice coordinates
    vec2 hexP = p * 16.0 * vrt;
    float h1 = sin(hexP.x + t);
    float h2 = sin(-0.5 * hexP.x + 0.866 * hexP.y - t);
    float h3 = sin(-0.5 * hexP.x - 0.866 * hexP.y - t);

    // Ginzburg-Landau order parameter approximation: |psi|^2 -> 0 in vortex cores
    float orderParam = clamp((h1 * h1 + h2 * h2 + h3 * h3) / 1.5, 0.0, 1.0);
    float vortexCore = 1.0 - orderParam;

    // 2pi phase winding displacement around vortex cores
    float phaseAngle = atan(h2, h1);
    vec2 vortexDisp = vec2(cos(phaseAngle), sin(phaseAngle)) * vortexCore * 0.04 * midTransition * (1.0 + audioBass * 0.7);

    vec4 c1 = texture(tex1, fract(uv + vortexDisp));
    vec4 c0 = texture(tex0, fract(uv - vortexDisp));

    // Sweep front. `swp` used to multiply the front's POSITION, so it also set
    // where the sweep ends: at the bottom of sweepP's 0.5..2.0 registration the
    // front stopped at 0.6 while the frame reaches |p.x| = 0.889, leaving the
    // right ~18% of the picture showing the NEW scene on the first frame of the
    // fade (measured mean endpoint error 26/255). The travel is now a fixed
    // span that always clears the frame, and the parameter reshapes the PACING
    // instead -- pow keeps 0->0 and 1->1 exactly, so both endpoints stay
    // pixel-exact for every sweepP.
    // Guarded because GLSL evaluates pow as exp2(y*log2(x)): pow(0.0, y) goes
    // through log2(0) = -inf and can return NaN on some drivers.
    float sweepFront = mix(-1.2, 1.2, (tProg > 0.0) ? pow(tProg, 1.0 / swp) : 0.0);
    float distToFront = p.x - sweepFront;
    float wipeMask = smoothstep(-0.04, 0.04, distToFront);

    vec4 col = mix(c0, c1, wipeMask);

    // Glowing magnetic flux cores (quantum vortex lines)
    float coreGlow = pow(vortexCore, 3.0) * midTransition;
    col.rgb += coreGlow * vec3(0.2, 0.95, 1.0) * (1.5 + audioKick * 3.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
