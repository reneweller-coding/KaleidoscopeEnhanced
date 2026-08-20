#version 330 core
out vec4 fragColor;
/**
 * @file EventHorizonSingularityPlunge.frag
 * @brief EVENT HORIZON SINGULARITY PLUNGE: Relativistic free-fall plunge past the
 * Schwarzschild event horizon into the central singularity with tidal spaghettification,
 * celestial sky compression into a shrinking Einstein circle, and chaotic plasma flares.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous relativistic gravitational plunge progression
 *   audioKick    -> flashes singularity core & triggers tidal force gravitational wave chirps
 *   audioCentroid-> modulates relativistic accretion filament frequency
 *   audioSubBass -> expands tidal stretching distortion amplitude
 *   audioChromaHue-> steers the extreme gravitational redshift/blueshift spectrum
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
uniform float tidalP;
uniform float plasmaP;
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
    float tdl = (tidalP > 0.01) ? tidalP : 1.2;
    float plsm = (plasmaP > 0.01) ? plasmaP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.4 * spd;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Relativistic tidal stretching (spaghettification along radial coordinate)
    float tidalStretch = (1.5 + 0.8 * sin(audioSwell * 2.5) + 0.5 * audioSubBass) * tdl;
    vec2 pTidal = vec2(
        (uv.x / max(0.1, r)) * pow(r, 1.0 / tidalStretch),
        (uv.y / max(0.1, r)) * pow(r, tidalStretch)
    );

    // Shrinking Einstein celestial sky disk at top of screen (view of the outer universe)
    vec2 skyPos = uv - vec2(0.0, 0.35);
    float dSky = length(skyPos);
    float skyMask = smoothstep(0.28, 0.22, dSky);

    // Swirling inner plasma turbulence inside event horizon
    // Brightness raises the SPATIAL frequency of the accretion filaments only;
    // the t-driven terms keep their fixed rate so the phase is never remapped.
    float filamentFreq = 12.0 * (1.0 + 0.45 * audioCentroid);
    float plasmaNoise = sin(pTidal.x * filamentFreq + t * 4.0) * cos(pTidal.y * filamentFreq - t * 3.5);
    float plasmaSpiral = sin(a * filamentFreq * 0.5 - (1.0 / max(0.05, r)) * 4.0 + t * 6.0);

    // Sample slideshow texture on outer universe disk vs inner plasma
    vec2 skyUV = fract(skyPos * 1.5 + 0.5);
    vec3 skyCol = img(skyUV) * (1.2 + 0.8 * audioLevel);

    vec2 plasmaUV = fract(pTidal * 0.5 + vec2(t * 0.1, 0.0));
    vec3 plasmaTex = img(plasmaUV);

    // Inner singularity palette (deep ultraviolet to gleam-white)
    vec3 palSing = imgPalette(r * 2.0 + t * 0.1);
    vec3 plasmaCol = mix(plasmaTex, palSing, 0.5) * (0.6 + 0.4 * plasmaNoise) * plsm;

    // Glowing photon ring and singularity point
    float photonRing = exp(-abs(dSky - 0.25) * 35.0) * (1.5 + 3.0 * audioKick) * glw;
    float singularityGlow = exp(-r * 12.0) * (2.0 + 4.0 * audioKick);

    vec3 finalCol = mix(plasmaCol, skyCol, skyMask);
    finalCol += vec3(1.8, 1.5, 1.2) * photonRing;
    finalCol += imgPalette(0.85) * singularityGlow;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
