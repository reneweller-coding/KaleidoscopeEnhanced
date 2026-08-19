#version 330 core
out vec4 fragColor;
/**
 * @file SiphonophoreBioluminescentCurtain.frag
 * @brief SIPHONOPHORE BIOLUMINESCENT CURTAIN: Massive colonial siphonophore (Praya dubia / Apolemia)
 * cascading through deep abyssal oceanic trenches. Translucent swimming bells (nectophores),
 * bioluminescent glowing tentilla curtains, and rhythmic contraction light waves.
 *   audioAdvance -> drives oceanic current drift & tentacle undulating waves
 *   audioKick    -> flashes defensive bioluminescent luminescence cascades
 *   audioSwell   -> thickens colonial bell volume & oceanic caustic haze
 *   audioCentroid-> shifts bio-luciferin amber/cyan emission spectra
 *   audioFlux    -> excites sparkling nematocyst battery point flashes
 *
 * Per-activation variety:
 *   nectoCountP  float nectophore swimming bell density         (3.0..8.0)
 *   tentillaP    float tentacle curtain strand density          (8.0..24.0)
 *   bioGlowP     float bioluminescence emission brightness      (0.8..2.5)
 *   waveScaleP   float hydrodynamic tentacle wave amplitude     (0.5..2.2)
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

uniform float nectoCountP;
uniform float tentillaP;
uniform float bioGlowP;
uniform float waveScaleP;

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

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Colonial stem axis curving through abyssal water
    float waveAmp = (waveScaleP > 0.01 ? waveScaleP : 1.2);
    float stemX = sin(uv.y * 2.5 + t * 0.6) * 0.35 * waveAmp;
    float dxStem = uv.x - stemX;
    
    // Nectophore bells arranged along colonial stem
    float nectoFreq = (nectoCountP > 1.0 ? nectoCountP : 5.0);
    float bellPhase = uv.y * nectoFreq + t * 1.5;
    float bellLocalY = fract(bellPhase) - 0.5;
    
    // Dome profile of each nectophore bell
    float bellRadius = 0.22 * (1.0 + 0.3 * audioSwell);
    float bellDist = length(vec2(dxStem, bellLocalY * 0.3));
    float inBell = smoothstep(bellRadius + 0.02, bellRadius - 0.04, bellDist);
    float bellRim = exp(-abs(bellDist - bellRadius) * 35.0);
    
    // Hanging tentilla curtains trailing behind stem
    float tentFreq = (tentillaP > 0.01 ? tentillaP : 14.0);
    float tentWaves = sin(uv.x * tentFreq + sin(uv.y * 8.0 - t * 3.0) * 2.0);
    float tentilla = exp(-abs(dxStem - 0.25) * 4.0) * (tentWaves * 0.5 + 0.5);
    
    // Bioelectric traveling contraction wave along the whole siphonophore
    float travelingWave = sin(uv.y * 6.0 - t * 4.0 + audioPhase) * 0.5 + 0.5;
    float bioPulse = pow(travelingWave, 3.0) * (1.0 + 3.0 * audioKick) * (bioGlowP > 0.01 ? bioGlowP : 1.2);
    
    // Marine snow & sparkling nematocysts
    float spark = pow(max(0.0, sin(uv.x * 45.0 + uv.y * 35.0 + t * 4.0 + audioFlux * 3.0)), 12.0) * (0.8 + 1.5 * audioHigh);
    
    // Siphonophore deep-sea cyan / amber bioluminescent palette
    vec3 deepWater = vec3(0.01, 0.03, 0.08);
    vec3 bioCyan   = vec3(0.1, 0.85, 0.95);
    vec3 bioAmber  = vec3(1.0, 0.65, 0.2);
    
    vec3 bellColor = palTint(mix(bioCyan, bioAmber, travelingWave), uv.y * 0.2 + audioCentroid, 0.27);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.2;
    
    vec3 col = bg + palTint(deepWater, 0.5, 0.15);
    col += bellColor * inBell * (0.6 + 0.4 * travelingWave) * (0.8 + 0.4 * audioSwell);
    col += vec3(0.9, 0.95, 1.0) * bellRim * 1.8;
    col += bellColor * tentilla * bioPulse * 1.6;
    col += vec3(0.85, 1.0, 0.9) * spark * 2.2;
    col += bellColor * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
