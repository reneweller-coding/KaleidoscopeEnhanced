#version 330 core
out vec4 fragColor;
/**
 * @file LiesegangPrecipitationRingArray.frag
 * @brief LIESEGANG PRECIPITATION RING ARRAY: Self-organized periodic mineral precipitation rings
 * in porous gel media. Non-linear reaction-diffusion supersaturation nucleation creates geometric
 * ring bands obeying the Jablczynski spacing law with colloidal turbidity and photo texturing.
 *   audioAdvance -> drives chemical precursor ion diffusion front velocity
 *   audioKick    -> flashes supersaturation nucleation threshold precipitate bursts
 *   audioSwell   -> widens colloidal precipitation band thickness & opacity
 *   audioCentroid-> shifts colloidal mineral precipitate absorption spectra
 *   audioPhase   -> modulates concentric ring eccentricities & branching defects
 *
 * Per-activation variety:
 *   spacingRatioP float Liesegang Jablczynski geometric ratio     (1.05..1.35)
 *   ringDensityP  float precipitation band count parameter       (4.0..14.0)
 *   colloidGlowP  float colloidal precipitate luminance gain     (0.8..2.5)
 *   diffusionP    float ion concentration diffusion steepness    (0.6..2.2)
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

uniform float spacingRatioP;
uniform float ringDensityP;
uniform float colloidGlowP;
uniform float diffusionP;

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
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Radius with slight eccentric deformation
    float theta = atan(uv.y, uv.x);
    float deform = sin(theta * 3.0 + audioPhase * 0.5) * 0.04;
    float r = length(uv) + deform;
    
    // Liesegang geometric spacing law: x_{n+1} / x_n = 1 + P (Jablczynski constant)
    // In log-space, rings are evenly spaced: log(r)
    float rParam = (spacingRatioP > 0.01 ? spacingRatioP : 1.18);
    float logR = log(max(r * 3.0, 0.05)) / log(rParam);
    
    float ringPhase = logR * (ringDensityP > 0.01 ? ringDensityP : 6.0) - t * 2.0;
    
    // Sharp precipitate band profile (supersaturation threshold nucleation)
    float localBand = fract(ringPhase) - 0.5;
    float precipBand = exp(-localBand * localBand * 45.0);
    
    // Colloidal diffusion gradient between rings
    float dGrad = (diffusionP > 0.01 ? diffusionP : 1.2);
    float ionDiffusion = exp(-r * dGrad * 2.0);
    
    // Nucleation flash on kick
    float nucFlash = precipBand * (1.0 + 3.5 * audioKick) * (colloidGlowP > 0.01 ? colloidGlowP : 1.3);
    
    // Palette assignment
    float palAngle = fract(logR * 0.15 + r * 0.2 + audioCentroid);
    vec3 colBand = imgPalette(palAngle);
    vec3 colGel  = imgPalette(fract(palAngle + 0.5)) * 0.6;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colGel * ionDiffusion * (0.8 + 0.4 * audioSwell);
    col += colBand * precipBand * 2.2;
    col += vec3(0.95, 0.95, 1.0) * nucFlash * 1.8;
    col += colBand * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
