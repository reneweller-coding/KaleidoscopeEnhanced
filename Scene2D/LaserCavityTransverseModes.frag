#version 330 core
out vec4 fragColor;
/**
 * @file LaserCavityTransverseModes.frag
 * @brief LASER CAVITY TRANSVERSE MODES: Higher-order Hermite-Gaussian (TEM_mn) and
 * Laguerre-Gaussian (LG_l^p) laser cavity resonator transverse modes carrying orbital
 * angular momentum. Geometrical laser petal flowers, phase vortices, and resonant cavity flares.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous orbital angular momentum phase rotation
 *   audioKick    -> flashes laser cavity mode nodes & triggers mode index hopping
 *   audioCentroid-> modulates transverse mode indices (m, n) & radial petal count
 *   audioSubBass -> expands laser beam waist radius w0 breathing
 *   audioChromaHue-> rotates the monochromatic laser emission spectrum
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
uniform float modeIndexP;
uniform float waistP;
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
    float mIdx = (modeIndexP > 1.0) ? modeIndexP : 4.0;
    float w0 = (waistP > 0.01) ? waistP : 0.45;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Laser beam waist radius w(z) with breathing
    float beamWaist = w0 * (1.0 + 0.15 * sin(audioSwell * 2.5) + 0.1 * audioSubBass);

    float r = length(uv) / max(0.01, beamWaist);
    float a = atan(uv.y, uv.x);

    // Laguerre-Gaussian mode LG_l^p with orbital angular momentum l and radial nodes p
    float lOAM = floor(mIdx + 2.0 * audioCentroid);
    float pRadial = 2.0;

    // Laguerre polynomial approximation: L_p^l(2*r^2)
    float r2 = 2.0 * r * r;
    float laguerre = 1.0 - r2 + (r2 * r2) * 0.25;

    // Mode field amplitude: (r*sqrt(2))^l * L_p^l(2*r^2) * exp(-r^2) * cos(l*a - GouyPhase)
    float gouyPhase = t * 2.0 + audioPhase * 0.1;
    float modeAmp = pow(max(0.01, r * 1.4142), lOAM * 0.3) * laguerre * exp(-r * r) * cos(lOAM * a - gouyPhase);

    // Laser intensity: I = |E|^2
    float intensity = modeAmp * modeAmp;

    // Sample distorted background photo
    vec2 sampleUV = fract(uv * 0.4 + vec2(modeAmp * 0.08) + 0.5);
    vec3 texCol = img(sampleUV);

    // Monochromatic / multi-spectral laser cavity palette
    vec3 palLaser = imgPalette(intensity * 1.5 + 0.2);
    vec3 baseCol = mix(texCol * 0.25, palLaser, 0.45);

    // Glowing laser mode petals & nodal lines
    float petalGlow = exp(-abs(modeAmp) * 1.5) * intensity * (1.0 + 3.0 * audioKick) * glw;
    vec3 laserTint = vec3(1.4, 1.2, 1.9) * petalGlow * 2.5;

    vec3 finalCol = baseCol + laserTint;

    // Center optical vortex singularity core
    float vortexCore = exp(-r * 8.0) * (0.8 + 1.5 * audioKick);
    finalCol += imgPalette(0.85) * vortexCore;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
