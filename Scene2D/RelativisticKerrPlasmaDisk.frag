#version 330 core
out vec4 fragColor;
/**
 * @file RelativisticKerrPlasmaDisk.frag
 * @brief RELATIVISTIC KERR PLASMA DISK: Rotating Kerr black hole accretion disk with
 * Lense-Thirring frame dragging, relativistic Doppler beaming (approaching side blueshifted
 * and super-bright), gravitational lensing light arcs, and inner ISCO plasma turbulence.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous Kerr black hole spin & plasma accretion rotation
 *   audioKick    -> flashes ISCO innermost stable circular orbit & plasma flares
 *   audioCentroid-> modulates relativistic accretion disk turbulence frequency
 *   audioSubBass -> expands accretion disk outer radius breathing
 *   audioChromaHue-> steers the relativistic Doppler blueshift / redshift spectrum
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
uniform float spinP;
uniform float dopplerP;
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
    float aSpin = (spinP > 0.01) ? spinP : 0.95; // Kerr spin parameter near maximal (0.95)
    float dBeaming = (dopplerP > 0.01) ? dopplerP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.240 * spd + audioAdvance * 0.240 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Tilted accretion disk coordinates: (x, y / cos(inclination))
    vec2 pDisk = uv * vec2(1.0, 2.2);
    float r = length(pDisk);
    float a = atan(pDisk.y, pDisk.x);

    // Frame dragging angular velocity: omega = 2*a*M / (r^3 + a^2*r + 2*a^2)
    float omegaDrag = (2.0 * aSpin) / (r * r * r + aSpin * aSpin * r + 0.5);
    float phiRot = a - (omegaDrag * 2.0 + t * 3.0);

    // Accretion disk inner radius (ISCO) and outer envelope
    float rISCO = 0.25;
    float rOuter = 1.1 * (1.0 + 0.15 * sin(audioSwell * 2.0)) * (1.0 + 0.32 * audioSubBass);
    float diskMask = smoothstep(rISCO - 0.02, rISCO + 0.05, r) * smoothstep(rOuter + 0.2, rOuter - 0.1, r);

    // Relativistic Doppler beaming: approaching side (x < 0) boosted by factor (1 + v/c)^4
    float vOrbital = sqrt(1.0 / max(0.1, r));
    float dopplerFactor = pow(1.0 - (pDisk.x / max(0.1, r)) * vOrbital * 0.45 * dBeaming, 3.5);

    // Plasma spiral turbulence. Brightness raises only the RADIAL wave
    // numbers -- the phiRot factors must stay fixed because phiRot already
    // carries the t*3.0 spin phase, and scaling that would remap the whole
    // accumulated rotation on every audio change.
    float turbFreq = 1.0 + 0.55 * audioCentroid;
    float plasmaTurb = sin(phiRot * 6.0 + r * 15.0 * turbFreq - t * 4.0) * cos(phiRot * 4.0 - r * 8.0 * turbFreq);

    // Sample distorted background photo
    vec2 sampleUV = fract(vec2(phiRot / 6.2831853 + 0.5, r * 0.5));
    vec3 texCol = img(sampleUV);

    // Palette with Doppler shift: left side blueshifted (hot white/cyan), right side redshifted (crimson)
    vec3 palBlueshift = vec3(0.4, 1.4, 2.0);
    vec3 palRedshift  = vec3(1.8, 0.4, 0.2);
    vec3 palBase = mix(palBlueshift, palRedshift, clamp((pDisk.x / max(0.1, r)) * 0.5 + 0.5, 0.0, 1.0));
    palBase = mix(palBase, imgPalette(r * 0.5 + 0.1), 0.35);

    vec3 diskCol = mix(texCol * 0.3, palBase, 0.5) * (0.7 + 0.3 * plasmaTurb) * dopplerFactor * diskMask;

    // Photon ring lensing arc (just outside horizon)
    float photonRing = exp(-abs(r - 0.2) * 35.0) * (1.5 + 3.0 * audioKick) * glw;

    // Black hole shadow (interior of ISCO)
    float shadowMask = smoothstep(0.18, 0.22, r);

    vec3 finalCol = diskCol * shadowMask + vec3(1.8, 1.7, 2.0) * photonRing;

    // Core ISCO flare
    float iscoGlow = exp(-abs(r - rISCO) * 20.0) * (0.8 + 2.0 * audioKick);
    finalCol += imgPalette(0.85) * iscoGlow * shadowMask;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
