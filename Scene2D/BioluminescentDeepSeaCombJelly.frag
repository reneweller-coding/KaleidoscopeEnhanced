#version 330 core
out vec4 fragColor;
/**
 * @file BioluminescentDeepSeaCombJelly.frag
 * @brief BIOLUMINESCENT DEEP SEA COMB JELLY: Macro-scale 3D visualization of a
 * transparent deep-sea comb jelly (Ctenophore) with cascading rainbow diffraction
 * ctene rows, pulsating gelatinous body walls, and luminous internal bio-lanterns.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous ctene row diffraction wave progression
 *   audioKick    -> flashes internal bioluminescent lantern organs & pulse burst
 *   audioCentroid-> sharpens rainbow diffraction grating fringe resolution
 *   audioSubBass -> expands gelatinous jelly bell respiration breathing
 *   audioChromaHue-> steers the deep-sea rainbow diffraction spectrum
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
uniform float cteneRowsP;
uniform float iridescenceP;
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
    float nCtene = (cteneRowsP > 1.0) ? cteneRowsP : 8.0;
    float irid = (iridescenceP > 0.01) ? iridescenceP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Gelatinous jelly body coordinate
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Oval body envelope with audio respiration
    float jellyR = (0.33 + 0.06 * sin(audioSwell * 2.5) + 0.04 * audioSubBass);   // 0.65 was LARGER than the frame half-height
    vec2 pOval = uv * vec2(1.0, 0.75);
    float dBody = abs(length(pOval) - jellyR);

    // 8 Ctene rows (comb rows) arranged around body perimeter
    float seg = 6.2831853 / nCtene;
    float aRow = mod(a + seg * 0.5, seg) - seg * 0.5;
    float dRow = abs(aRow * r);

    // Running rainbow diffraction grating waves traveling along ctene rows
    float ctenePhase = uv.y * 6.0 * irid - t * 4.0;
    vec3 rainbowDiffraction = vec3(
        sin(ctenePhase),
        sin(ctenePhase + 2.094),
        sin(ctenePhase + 4.188)
    ) * 0.5 + 0.5;

    // Glowing comb row cilia lines
    // Gate the rows onto the body SHELL: without the exp(-dBody...) term
    // they ran as full radial spokes from the centre -- the recording showed
    // a starburst, not an animal.
    float rowGlow = exp(-dRow * (30.0 + 15.0 * audioCentroid))
                  * exp(-dBody * 6.5)
                  * smoothstep(jellyR + 0.2, jellyR - 0.35, length(pOval));

    // Internal bioluminescent organs (lantern nodes in center)
    float internalLantern = exp(-r * 8.0) * (0.16 + 0.35 * audioKick);

    // Sample distorted background photo through transparent gelatinous body
    vec2 sampleUV = fract(uv * 0.5 + vec2(sin(a * 4.0), cos(a * 4.0)) * 0.03 + 0.5);
    vec3 texCol = img(sampleUV);

    // Translucent jelly color
    vec3 palBase = imgPalette(r * 0.5 + 0.1);
    vec3 jellyBase = mix(texCol, palBase, 0.4) * 0.35;

    // Add rainbow ctene rows and internal bio-lantern
    vec3 cteneColor = rainbowDiffraction * rowGlow * 1.6 * (1.0 + 1.8 * audioKick) * glw;
    vec3 lanternColor = vec3(1.3, 1.6, 1.9) * internalLantern;

    // Translucent membrane so the BODY reads, not just its rows.
    float membrane = exp(-dBody * 10.0);
    vec3 membraneCol = imgPalette(0.62) * membrane * 2.0;
    vec3 finalCol = jellyBase + cteneColor + lanternColor + membraneCol;

    // Abyss water vignette
    float vig = 1.0 - smoothstep(0.85, 1.4, r);
    finalCol *= vig;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
