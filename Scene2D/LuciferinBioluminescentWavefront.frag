#version 330 core
out vec4 fragColor;
/**
 * @file LuciferinBioluminescentWavefront.frag
 * @brief LUCIFERIN BIOLUMINESCENT WAVEFRONT: Nocturnal ocean surf populated by dinoflagellates
 * (Noctiluca scintillans). Hydrodynamic shear stresses on breaking wave crests trigger
 * enzymatic luciferase-luciferin blue-green photon flashes, foam caustics, and water ripples.
 *   audioAdvance -> drives oceanic swell drift & shoreward wave-breaking velocity
 *   audioKick    -> triggers violent wave crest collapse & explosive shear light bursts
 *   audioFlux    -> excites sparkling dinoflagellate micro-plankton point flashes
 *   audioSwell   -> thickens deep oceanic swell volumetric depth & haze
 *   audioCentroid-> shifts bio-enzymatic photon emission spectrum (cyan to emerald)
 *
 * Per-activation variety:
 *   waveP    float ocean wave steepness & breaker density   (0.6..2.2)
 *   shearP   float hydrodynamic shear activation threshold (0.5..2.0)
 *   foamP    float bioluminescent foam persistence scale  (0.8..2.5)
 *   sparkP   float plankton micro-scintillation density    (1.0..3.5)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float waveP;
uniform float shearP;
uniform float foamP;
uniform float sparkP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

// Pseudo random hash for plankton sparkles
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Wave coordinate transformation
    float waveSteepness = (waveP > 0.01 ? waveP : 1.2);
    vec2 p = uv * 2.5;
    p.x += sin(p.y * 1.5 + t * 0.5) * 0.25;
    
    // Trochoidal / Gerstner-like wave profile simulation
    float wave1 = sin(p.y * 3.5 - t * 2.2 + sin(p.x * 2.0) * 0.5);
    float wave2 = sin(p.y * 7.0 - t * 3.5 + cos(p.x * 4.0) * 0.3) * 0.5;
    float wave3 = sin(p.y * 14.0 - t * 5.0 + sin(p.x * 8.0) * 0.2) * 0.25;
    
    float waveHeight = (wave1 + wave2 + wave3) * waveSteepness;
    
    // Hydrodynamic shear rate ~ spatial gradient of wave surface
    float dWave = abs(dFdx(waveHeight)) + abs(dFdy(waveHeight));
    float shearThresh = (shearP > 0.01 ? shearP : 1.0);
    float shearActivation = smoothstep(0.04 * shearThresh, 0.18 * shearThresh, dWave);
    
    // Breaking wave crest detector (cusp regions where wave > threshold)
    float crest = smoothstep(0.8, 1.4, waveHeight + dWave * 3.0);
    
    // Turbulent bioluminescent foam trails
    float foamPersistence = (foamP > 0.01 ? foamP : 1.5);
    float foamNoise = sin(p.x * 12.0 + p.y * 6.0 - t * 2.0) * cos(p.x * 8.0 - p.y * 10.0 + t);
    float foam = smoothstep(0.2, 0.8, crest + foamNoise * 0.4) * foamPersistence;
    
    // Micro-plankton twinkling scintillation
    float sparkDensity = 40.0 * (sparkP > 0.01 ? sparkP : 1.5);
    vec2 gridId = floor(p * sparkDensity);
    float h = hash(gridId);
    float sparkFlash = pow(max(0.0, sin(h * 6.28 + t * 6.0 + audioFlux * 4.0)), 12.0);
    sparkFlash *= smoothstep(0.1, 0.6, shearActivation + crest) * (0.8 + 2.0 * audioHigh);
    
    // Base ocean deep color tinted with photo palette
    vec3 deepWater = vec3(0.01, 0.04, 0.12);
    vec3 oceanBase = palTint(deepWater, 0.7, 0.2);
    
    // Dinoflagellate bioluminescence color: Vibrant cyan-emerald identity tinted by photo
    vec3 bioCyan = vec3(0.05, 0.95, 0.85);
    vec3 bioEmerald = vec3(0.1, 1.0, 0.45);
    vec3 bioColor = palTint(mix(bioCyan, bioEmerald, sin(audioCentroid * 3.14) * 0.5 + 0.5), waveHeight * 0.2, 0.28);
    
    // Background photo texturing (refracted through water surface)
    vec2 refrUv = gl_FragCoord.xy / resolution + vec2(dFdx(waveHeight), dFdy(waveHeight)) * 0.05;
    vec3 bgPhoto = img(fract(refrUv)) * 0.25;
    
    vec3 col = oceanBase + bgPhoto * (0.6 + 0.4 * audioSwell);
    col += bioColor * shearActivation * 1.5;
    col += bioColor * crest * (1.5 + 3.0 * audioKick);
    col += mix(bioColor, vec3(0.8, 1.0, 0.95), 0.5) * foam * 1.8;
    col += vec3(0.7, 1.0, 0.9) * sparkFlash * 2.5;
    col += bioColor * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
