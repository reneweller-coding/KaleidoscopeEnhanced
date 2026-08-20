#version 330 core
out vec4 fragColor;
/**
 * @file FerrofluidMagneticSpikeSurge.frag
 * @brief FERROFLUID MAGNETIC SPIKE SURGE: Liquid metal ferrofluid Rosensweig normal-field
 * instability with explosive magnetic spike eruptions, mirror-chrome liquid reflections,
 * and high-luminance specular field glints.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous magnetic dipole rotation & spike growth
 *   audioKick    -> flashes magnetic spike tips & triggers ferrofluid eruption shockwaves
 *   audioCentroid-> modulates ferrofluid spike sharpness & cone resolution
 *   audioSubBass -> expands ferrofluid pool diameter & spike height
 *   audioChromaHue-> rotates the mirror chrome / dark obsidian / gold spectrum
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
uniform float spikeDensityP;
uniform float spikeHeightP;
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

// Rosensweig magnetic spike height function
float ferroHeight(vec2 p, float t, float sDens, float sHeight) {
    // Two ends of the same lattice scale: brightness subdivides the Rosensweig
    // pattern into more, finer cones, sub-bass widens each fluid pool cell.
    vec2 pGrid = p * (6.0 * sDens) * (1.0 + 0.25 * audioCentroid) / (1.0 + 0.35 * audioSubBass);
    vec2 gridFract = fract(pGrid) - 0.5;
    float rSpike = length(gridFract);

    // Conical spike profile with magnetic modulation. A narrower cone base over
    // the same tip height is a steeper, sharper magnetic needle.
    float cone = max(0.0, 0.45 * (1.0 - 0.25 * audioCentroid) - rSpike);
    float pulse = sin(p.x * 2.0 + t * 3.0) * cos(p.y * 2.0 - t * 2.5);

    return cone * (1.2 + 0.8 * pulse + 1.2 * audioBass) * sHeight * (1.0 + 0.4 * audioSubBass);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sDens = (spikeDensityP > 0.01) ? spikeDensityP : 1.0;
    float sH = (spikeHeightP > 0.01) ? spikeHeightP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Evaluate ferrofluid height field
    float h = ferroHeight(uv, t, sDens, sH);

    // Normal gradient for liquid chrome specular lighting
    float eps = 0.01;
    float hX = ferroHeight(uv + vec2(eps, 0.0), t, sDens, sH);
    float hY = ferroHeight(uv + vec2(0.0, eps), t, sDens, sH);
    vec3 normal = normalize(vec3((hX - h) * 4.0, (hY - h) * 4.0, eps));

    // Dynamic light direction
    vec3 lightDir = normalize(vec3(cos(t * 0.5), sin(t * 0.5), 1.2));
    float diff = max(0.0, dot(normal, lightDir));
    float spec = pow(max(0.0, dot(normal, normalize(lightDir + vec3(0,0,1)))), 32.0);

    // Sample distorted background photo in chrome reflection
    vec2 reflectUV = fract(uv * 0.4 + normal.xy * 0.15 + 0.5);
    vec3 texCol = img(reflectUV);

    // Obsidian liquid ferrofluid base
    vec3 palObsidian = imgPalette(h * 0.5 + 0.1);
    vec3 liquidBase = mix(vec3(0.04, 0.04, 0.06), palObsidian, 0.35);

    vec3 col = mix(liquidBase, texCol, 0.35) * (0.6 + 0.4 * diff);

    // Add chrome specular glints & spike tip flashes
    vec3 chromeSpec = vec3(1.5, 1.4, 1.7) * spec * (1.0 + 3.0 * audioKick) * glw;
    float spikeTipGlow = exp(-abs(h - 0.4) * 15.0) * (1.0 + 2.5 * audioKick);

    col += chromeSpec + vec3(1.6, 1.2, 0.4) * spikeTipGlow * 0.6;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
