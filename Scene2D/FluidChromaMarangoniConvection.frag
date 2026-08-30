#version 330 core
out vec4 fragColor;
/**
 * @file FluidChromaMarangoniConvection.frag
 * @brief FLUID CHROMA MARANGONI CONVECTION: Bénard-Marangoni thermal convection cells
 * (hexagonal thermal upwelling honeycomb) with surface-tension gradient driven
 * droplet bursting, toroidal fluid vortex rings, and psychedelic Chroma diffusion.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous thermal advection & Marangoni droplet spread
 *   audioKick    -> flashes thermal upwelling plume cores & surface tension shockwave
 *   audioCentroid-> modulates hexagonal cell boundary ripple frequency
 *   audioSubBass -> expands thermal convection cell diameter
 *   audioChromaHue-> rotates the luminous fluid marbling spectrum
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
uniform float cellScaleP;
uniform float marangoniP;
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

// Hexagonal Bénard cell potential
float benardCell(vec2 p, float t) {
    float w1 = cos(p.x * 1.7320508 + t * 2.0);
    float w2 = cos(p.x * 0.8660254 + p.y * 1.5 - t * 1.5);
    float w3 = cos(p.x * 0.8660254 - p.y * 1.5 - t * 1.5);
    return (w1 + w2 + w3) / 3.0;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float cSc = (cellScaleP > 0.01) ? cellScaleP : 1.0;
    float mar = (marangoniP > 0.01) ? marangoniP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Convection coordinates
    // Dividing the convection lattice frequency widens every Benard cell, so
    // the honeycomb swells with the drone instead of just brightening.
    vec2 pConv = uv * (6.0 * cSc) / (1.0 + 0.4 * audioSubBass);

    // Evaluate Bénard convection thermal upwelling
    float tempField = benardCell(pConv, t);

    // Surface tension Marangoni velocity curl: v = grad(temp) x ez
    float eps = 0.01;
    float tX = benardCell(pConv + vec2(eps, 0.0), t);
    float tY = benardCell(pConv + vec2(0.0, eps), t);
    vec2 gradT = vec2(tX - tempField, tY - tempField) / eps;

    // Displace coordinate along Marangoni flow
    vec2 pMarangoni = uv + vec2(-gradT.y, gradT.x) * (0.06 * mar);

    // Concentric thermal droplet rings in upwelling centers
    float dropRings = sin(tempField * 12.0 - t * 4.0);
    float cellBorder = smoothstep(0.0, 0.05, abs(tempField));

    // Sample distorted background photo
    vec2 sampleUV = fract(pMarangoni * 0.4 + vec2(tempField * 0.05) + 0.5);
    vec3 texCol = img(sampleUV);

    // Thermal gradient palette
    vec3 palWarm = imgPalette(tempField * 0.4 + 0.1);
    vec3 palCool = imgPalette(tempField * 0.4 + 0.6);
    vec3 baseCol = mix(palCool, palWarm, clamp(tempField * 0.5 + 0.5, 0.0, 1.0));

    baseCol = mix(baseCol, texCol, 0.35 + 0.15 * audioValence);

    // Glowing thermal plume centers & cell boundary lines
    float plumeGlow = exp(-abs(tempField - 0.8) * 15.0) * (1.0 + 3.0 * audioKick) * glw;
    float borderGlow = exp(-abs(tempField) * (20.0 + 10.0 * audioCentroid)) * glw;

    vec3 finalCol = baseCol + vec3(1.6, 1.2, 0.4) * plumeGlow + vec3(0.4, 1.2, 1.8) * borderGlow;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
