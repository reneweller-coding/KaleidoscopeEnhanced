#version 330 core
out vec4 fragColor;
/**
 * @file RiemannSphereInfinityFlight.frag
 * @brief RIEMANN SPHERE INFINITY FLIGHT: Stereographic conformal flight on the
 * Riemann number sphere (S^2). Dynamic continuous plunge from zero (South Pole)
 * to infinity (North Pole) via Möbius automorphisms f(z) = (az+b)/(cz+d).
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous conformal flight pole trajectory
 *   audioKick    -> flashes polar singularities & spacetime expansion burst
 *   audioCentroid-> modulates stereographic grid resolution & latitude rings
 *   audioSubBass -> expands spherical metric curvature breathing
 *   audioChromaHue-> rotates the global conformal rainbow spectrum
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
uniform float warpP;
uniform float gridP;
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

// Complex arithmetic helpers
vec2 cMul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cDiv(vec2 a, vec2 b) { return vec2(dot(a, b), a.y * b.x - a.x * b.y) / max(1e-6, dot(b, b)); }

// Inverse stereographic projection: maps complex plane z to 3D unit sphere point (X, Y, Z)
vec3 inverseStereographic(vec2 z) {
    float r2 = dot(z, z);
    return vec3(2.0 * z.x, 2.0 * z.y, r2 - 1.0) / (r2 + 1.0);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float wrp = (warpP > 0.01) ? warpP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.3 * spd;

    // Logarithmic scale plunge along imaginary/real axes
    vec2 z = uv * (1.8 + 0.3 * sin(audioSwell * 2.0));

    // Dynamic Möbius automorphism coefficients: f(z) = (az + b) / (cz + d)
    vec2 aMob = vec2(cos(t * 0.4), sin(t * 0.4));
    vec2 bMob = vec2(sin(t * 0.5), cos(t * 0.3)) * (0.6 + 0.4 * audioSubBass) * wrp;
    vec2 cMob = vec2(cos(t * 0.35), -sin(t * 0.45)) * 0.5;
    vec2 dMob = vec2(1.0, 0.0);

    vec2 num = cMul(aMob, z) + bMob;
    vec2 den = cMul(cMob, z) + dMob;
    vec2 w = cDiv(num, den);

    // Map transformed complex plane to 3D Riemann Sphere
    vec3 spherePt = inverseStereographic(w);

    // Spherical coordinates: latitude theta, longitude phi
    float theta = acos(clamp(spherePt.z, -1.0, 1.0)); // 0 = North Pole, pi = South Pole
    float phi = atan(spherePt.y, spherePt.x);

    // Glowing coordinate grid lines (meridians and parallels). Brightness
    // multiplies only the phi/theta wave numbers -- both are bounded angles,
    // so a finer grid stays a pure spatial refinement and never touches the
    // t-driven drift phase added next to them.
    float gridRes = 1.0 + 0.6 * audioCentroid;
    float meridians = abs(sin(phi * 12.0 * gridRes + t * 2.0));
    float parallels = abs(sin(theta * 16.0 * gridRes - t * 3.0));
    float grid = min(smoothstep(0.88, 1.0, meridians), smoothstep(0.88, 1.0, parallels));

    // Sample texture in spherical Mercator projection
    vec2 sampleUV = fract(vec2(phi / 6.2831853 + 0.5, theta / 3.14159265));
    vec3 texCol = img(sampleUV);

    // Conformal palette coloring
    vec3 palA = imgPalette(theta / 3.14159265 + t * 0.05);
    vec3 palB = imgPalette(phi / 6.2831853 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(theta * 4.0 + phi * 2.0));

    col = mix(col, texCol, 0.4 + 0.15 * audioValence);

    // Glowing coordinate lines and singular pole flashes
    float poleGlow = (exp(-theta * 6.0) + exp(-(3.14159265 - theta) * 6.0)) * (1.0 + 2.5 * audioKick);
    col += vec3(1.3, 1.1, 1.7) * grid * glw * (0.8 + 1.5 * audioLevel);
    col += imgPalette(0.85) * poleGlow;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
