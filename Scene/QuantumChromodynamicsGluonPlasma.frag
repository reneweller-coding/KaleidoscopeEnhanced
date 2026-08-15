#version 330 core
out vec4 fragColor;
// QuantumChromodynamicsGluonPlasma.frag
// -----------------------------------------------------------------------
// QUANTUM CHROMODYNAMICS GLUON PLASMA: 100% viewport-filling relativistic
// heavy-ion collision simulation (RHIC / CERN LHC). Ultra-high temperature
// deconfined quark-gluon fireball with SU(3) non-abelian color flux tubes,
// asymptotic freedom string breaking, and gluon Cherenkov radiation.
// -----------------------------------------------------------------------

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
uniform float audioSpectrum[32];

uniform float plasmaP;
uniform float stringP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// SU(3) Color charge matrix helper (Red, Green, Blue color states)
vec3 su3ColorField(vec2 p, float t) {
    float r = sin(p.x * 6.0 + p.y * 4.0 + t * 2.0);
    float g = sin(p.x * 4.0 - p.y * 6.0 - t * 1.5 + 2.094);
    float b = sin(-p.x * 5.0 - p.y * 5.0 + t * 2.5 + 4.188);
    return vec3(r, g, b) * 0.5 + 0.5;
}

void main() {
    float pls = (plasmaP > 0.0) ? plasmaP : 1.0;
    float str = (stringP > 0.0) ? stringP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.35 * spd + audioAdvance * 0.2;
    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Relativistic fireball expansion shockwave
    float fireballR = (0.7 + 0.3 * sin(t * 0.8)) * (1.0 + 0.4 * audioBass);
    float fireballMask = smoothstep(fireballR + 0.2, fireballR - 0.1, r);

    // SU(3) Non-Abelian color flux tubes
    vec2 fluxUV = uv * (4.0 * str);
    vec3 su3 = su3ColorField(fluxUV, t);

    // Color string tension & string-breaking vortex pinch
    float stringTension = sin(uv.x * 12.0 + sin(uv.y * 8.0 + t) * 2.0);
    float stringBreak = exp(-abs(stringTension) * 8.0) * (0.8 + 1.2 * audioHigh);

    // Deconfined quark trajectories advected through gluon field
    vec2 quarkPos1 = uv + vec2(cos(t * 1.2), sin(t * 1.5)) * 0.25;
    vec2 quarkPos2 = uv + vec2(cos(t * 0.9 + 2.0), sin(t * 1.1 + 1.0)) * 0.3;
    vec2 quarkPos3 = uv + vec2(sin(t * 1.4 + 4.0), cos(t * 0.8 + 3.0)) * 0.35;

    float q1 = exp(-dot(quarkPos1, quarkPos1) * 30.0);
    float q2 = exp(-dot(quarkPos2, quarkPos2) * 30.0);
    float q3 = exp(-dot(quarkPos3, quarkPos3) * 30.0);
    float quarkGlow = (q1 + q2 + q3) * (1.5 + 2.5 * audioKick);

    // Photo texture embedded into the deconfined color fields
    vec2 photoUV = uv * 0.5 + vec2(0.5) + (su3.xy - 0.5) * 0.1;
    vec3 photoPlasma = img(fract(photoUV));

    // High-temperature QCD colors: 4 Trillion Kelvin Fireball White/Magenta/Cyan
    vec3 qcdWhite = vec3(1.0, 0.98, 0.95) * 3.0;
    vec3 qcdMagenta = vec3(1.0, 0.05, 0.6) * 2.0;
    vec3 qcdCyan = vec3(0.0, 0.85, 1.0) * 2.0;

    vec3 plasmaCol = mix(qcdCyan, qcdMagenta, su3.r);
    plasmaCol = mix(plasmaCol, qcdWhite, fireballMask * (0.5 + 0.5 * audioKick));

    // Collision burst on kick
    float collisionBurst = exp(-r * 3.0) * (audioKick * 3.0 + audioSubBass * 1.5);

    vec3 col = photoPlasma * (plasmaCol * 0.8 + 0.2) * pls;
    col += plasmaCol * stringBreak * 1.5;
    col += vec3(1.0, 0.9, 0.5) * quarkGlow * 1.5;
    col += qcdWhite * collisionBurst;

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.85)); // High contrast boost
    col += vec3(0.04, 0.02, 0.06) * audioSwell;

    fragColor = vec4(col, 1.0);
}
