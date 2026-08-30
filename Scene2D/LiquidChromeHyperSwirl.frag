#version 330 core
out vec4 fragColor;
/**
 * @file LiquidChromeHyperSwirl.frag
 * @brief LIQUID CHROME HYPER SWIRL: Ultra-reflective liquid mercury sea agitated
 * by multiple orbiting gravitational vortex sinks with chromatic normal reflections,
 * high-frequency capillary ripples, and glowing Fresnel metallic highlights.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous multi-vortex liquid fluid advection
 *   audioKick    -> excites high-amplitude capillary surface ripples & specular bursts
 *   audioCentroid-> sharpens chrome environment reflection curvature
 *   audioSubBass -> expands gravitational vortex suction depth
 *   audioChromaHue-> rotates the liquid chrome reflection palette
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
uniform float vortexCountP;
uniform float chromeP;
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

// Fluid surface height field evaluated across 3 orbiting gravitational vortex sinks
float liquidHeight(vec2 p, float t, float nVortices) {
    float h = 0.0;
    int numV = int(clamp(nVortices, 2.0, 4.0));

    for (int k = 0; k < 4; k++) {
        if (k >= numV) break;
        float kf = float(k);
        float orbitA = t * 0.4 + kf * (6.2831853 / float(numV));
        float orbitR = 0.5 + 0.2 * sin(t * 0.5 + kf);
        vec2 vCenter = vec2(cos(orbitA), sin(orbitA)) * orbitR;

        vec2 rel = p - vCenter;
        float dist = length(rel);
        float angle = atan(rel.y, rel.x);

        // Vortex swirling depression + spiral ripple arms
        float vortexSpiral = sin(angle * 3.0 - dist * 12.0 + t * 3.0);
        float sink = -1.0 / (dist * 3.0 + 0.4);

        h += (sink * 0.5 + vortexSpiral * 0.25) * (0.8 + 0.6 * audioSubBass);
    }

    // High-frequency capillary ripples
    float capillary = sin(p.x * 25.0 + t * 4.0) * cos(p.y * 25.0 - t * 3.5) * (0.05 + 0.08 * audioKick);
    return h + capillary;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float nV = (vortexCountP > 1.0) ? vortexCountP : 3.0;
    float chrm = (chromeP > 0.01) ? chromeP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Multi-vortex fluid surface normal estimation
    float eps = 0.006;
    float hC = liquidHeight(uv, t, nV);
    float hX = liquidHeight(uv + vec2(eps, 0.0), t, nV);
    float hY = liquidHeight(uv + vec2(0.0, eps), t, nV);

    // Brightness steepens the height gradient fed into the normal, so the
    // mercury surface curves harder and the mirrored environment compresses
    // into tighter, sharper reflection bands.
    float reflCurv = chrm * (1.0 + 0.4 * audioCentroid);
    vec3 normal = normalize(vec3((hX - hC) * reflCurv, (hY - hC) * reflCurv, eps * 2.0));

    // View vector and reflection vector on liquid surface
    vec3 viewDir = normalize(vec3(uv, 1.2));
    vec3 reflDir = reflect(-viewDir, normal);

    // Fresnel reflectance: Schlick's approximation for liquid mercury (high base reflectivity)
    float cosTheta = clamp(dot(viewDir, normal), 0.0, 1.0);
    float fresnel = 0.7 + 0.3 * pow(1.0 - cosTheta, 5.0);

    // Sample distorted photo texture via reflection vector
    vec2 reflUV = fract(reflDir.xy * 0.4 + 0.5 + vec2(t * 0.05, 0.0));
    vec3 texRefl = img(reflUV);

    // Chromatic dispersion in chrome reflection
    vec3 palR = imgPalette(reflDir.z * 0.5 + 0.02);
    vec3 palG = imgPalette(reflDir.z * 0.5);
    vec3 palB = imgPalette(reflDir.z * 0.5 - 0.02);
    vec3 chromeTint = vec3(palR.r, palG.g, palB.b);

    vec3 liquidCol = mix(texRefl, chromeTint, 0.55);

    // Specular light source highlights
    vec3 lightDir = normalize(vec3(cos(t * 0.6), sin(t * 0.6), 1.0));
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(0.0, dot(normal, halfVec)), 32.0) * (1.0 + 3.0 * audioKick) * glw;

    liquidCol = liquidCol * fresnel + vec3(1.4, 1.4, 1.6) * spec;

    // Center vortex sink glow
    float sinkGlow = smoothstep(-1.2, -2.5, hC) * (0.8 + 1.2 * audioKick);
    liquidCol += imgPalette(0.85) * sinkGlow;

    liquidCol = pow(liquidCol, vec3(0.88));
    fragColor = vec4(clamp(liquidCol, 0.0, 1.0), 1.0);
}
