#version 330 core
out vec4 fragColor;
/**
 * @file BelousovZhabotinskyChemicalWave.frag
 * @brief BELOUSOV-ZHABOTINSKY CHEMICAL WAVE: Classic Belousov-Zhabotinsky (BZ) non-equilibrium
 * chemical oscillator. Spontaneous formation of rotating Archimedean spiral waves and concentric
 * target patterns undergoing mutual wave annihilation with photo-derived redox color gradients.
 *   audioAdvance -> drives chemical reaction diffusion phase rotation velocity
 *   audioKick    -> flashes autocatalytic oxidation wave burst fronts
 *   audioSwell   -> broadens chemical diffusion wave thickness & redox contrast
 *   audioCentroid-> shifts ferroin catalyst oxidation-reduction (red-blue) spectra
 *   audioPhase   -> modulates spiral core precession & wave front curvature
 *
 * Per-activation variety:
 *   spiralDensityP float number of active chemical spiral centers (2.0..8.0)
 *   waveSpeedP     float chemical wavefront propagation velocity (0.6..2.2)
 *   curvP          float Archimedean spiral wave curvature       (4.0..16.0)
 *   redoxContrastP float chemical oxidation contrast             (0.8..2.5)
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

uniform float spiralDensityP;
uniform float waveSpeedP;
uniform float curvP;
uniform float redoxContrastP;

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

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.4 + audioAdvance * 0.35;
    
    float numSpirals = (spiralDensityP > 1.0 ? spiralDensityP : 4.0);
    float vSpeed = (waveSpeedP > 0.01 ? waveSpeedP : 1.2);
    float kCurv  = (curvP > 0.01 ? curvP : 8.0);
    
    float totalWave = 0.0;
    float maxWave = -1.0;
    
    // Superimpose multiple BZ spiral waves with mutual annihilation min/max
    for (float i = 0.0; i < 4.0; i += 1.0) {
        if (i >= numSpirals) break;
        
        float ang = i * 1.5707963 + audioPhase * 0.3;
        float rad = 0.45 + 0.15 * sin(t * 0.5 + i);
        vec2 center = vec2(cos(ang), sin(ang)) * rad;
        
        vec2 diff = uv - center;
        float r = length(diff);
        float phi = atan(diff.y, diff.x);
        
        // Archimedean spiral: phase = k * r - phi - omega * t
        float chirality = mod(i, 2.0) == 0.0 ? 1.0 : -1.0;
        float phase = r * kCurv - phi * chirality - t * 3.0 * vSpeed;
        
        // Autocatalytic sharp pulse wave profile
        float wave = pow(sin(phase) * 0.5 + 0.5, 2.5);
        
        // Annihilation: taking maximum wave state simulates non-overlapping reaction fronts
        if (wave > maxWave) {
            maxWave = wave;
        }
        totalWave += wave;
    }
    
    float bzPattern = maxWave * (redoxContrastP > 0.01 ? redoxContrastP : 1.3);
    
    // Wavefront edge flash on kick
    float edgeFlash = pow(maxWave, 4.0) * (1.0 + 3.0 * audioKick);
    
    // Ferroin catalyst redox states mapped to full photo palette
    float palAngle = fract(bzPattern * 0.4 + t * 0.05 + audioCentroid);
    vec3 colRedox = imgPalette(palAngle);
    vec3 colFront = imgPalette(fract(palAngle + 0.5)) * 2.2;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colRedox * bzPattern * (0.8 + 0.4 * audioSwell);
    col += colFront * edgeFlash * 1.5;
    col += colRedox * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
