#version 330 core
out vec4 fragColor;
/**
 * @file SupercriticalFluidOpalescence.frag
 * @brief SUPERCRITICAL FLUID OPALESCENCE: Thermodynamic critical point in a supercritical fluid
 * (CO2/Xenon). Diverging correlation length and scale-invariant density fluctuations scatter
 * all wavelengths of visible light, creating milky iridescent opalescent clouds and liquid-gas fog.
 *   audioAdvance -> churns supercritical density fluctuation clusters & thermal diffusion
 *   audioKick    -> flashes critical phase transition condensation & boiling flashes
 *   audioSwell   -> thickens milky opalescent scattering haze & critical point proximity
 *   audioCentroid-> shifts Rayleigh/Mie multi-scale wavelength scattering spectra
 *   audioFlux    -> excites sparkling sub-micron critical nucleus nucleation flashes
 *
 * Per-activation variety:
 *   fractalScaleP float multi-scale density fluctuation depth    (2.0..6.0)
 *   opalescenceP  float milky iridescent scattering brightness   (0.8..2.5)
 *   turbSpeedP    float critical thermal diffusion drift speed   (0.5..2.2)
 *   clusterDensP  float supercritical droplet cluster density    (3.0..8.0)
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

uniform float fractalScaleP;
uniform float opalescenceP;
uniform float turbSpeedP;
uniform float clusterDensP;

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
    
    float vSpeed = (turbSpeedP > 0.01 ? turbSpeedP : 1.0);
    float fScale = (fractalScaleP > 0.01 ? fractalScaleP : 3.5);
    
    // Scale-invariant multi-octave density fluctuations (critical opalescence)
    float density = 0.0;
    float weight = 1.0;
    vec2 p = uv * fScale;
    
    for (int i = 0; i < 4; i++) {
        float wave = sin(p.x * 2.0 + t * vSpeed) * cos(p.y * 2.0 - t * 0.8 * vSpeed);
        wave += sin(p.x * 3.0 - p.y * 2.5 + float(i)) * 0.5;
        density += wave * weight;
        p = vec2(p.x * 1.8 + p.y * 0.6, -p.x * 0.6 + p.y * 1.8);
        weight *= 0.5;
    }
    
    // Critical cluster condensation / droplet formation
    float cDens = (clusterDensP > 0.01 ? clusterDensP : 4.5);
    float dropletClusters = pow(sin(uv.x * cDens + density * 2.0) * cos(uv.y * cDens - density * 2.0) * 0.5 + 0.5, 2.5);
    
    // Opalescent scattering (milky white pearl sheen with subtle dispersion)
    float opalGlow = (opalescenceP > 0.01 ? opalescenceP : 1.3) * (0.85 + 0.35 * audioSwell);
    float pearl = pow(clamp(density * 0.5 + 0.5, 0.0, 1.0), 2.0) * opalGlow;
    
    // Critical transition flash on kick
    float criticalFlash = pow(dropletClusters, 2.0) * (1.0 + 3.5 * audioKick);
    
    // Nucleation sparkling glints
    float nucleateSpark = pow(max(0.0, sin(uv.x * 45.0 + uv.y * 40.0 + t * 5.0 + audioFlux * 3.0)), 16.0) * (0.7 + 1.2 * audioHigh);
    
    // Milky iridescent pearl palette tinted by photo
    vec3 milkyPearl = vec3(0.92, 0.95, 1.0);
    vec3 opalTint   = palTint(milkyPearl, density * 0.3 + audioCentroid, 0.28);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += opalTint * pearl * 1.6;
    col += opalTint * dropletClusters * 1.4;
    col += vec3(0.95, 0.95, 1.0) * criticalFlash * 1.8;
    col += vec3(0.9, 1.0, 0.95) * nucleateSpark * 2.2;
    col += opalTint * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col * 0.90, 0.0, 1.0), 1.0);   // measured luma 0.730: over the white line
}
