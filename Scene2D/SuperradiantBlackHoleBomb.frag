#version 330 core
out vec4 fragColor;
/**
 * @file SuperradiantBlackHoleBomb.frag
 * @brief SUPERRADIANT BLACK HOLE BOMB: Massive bosonic field trapped in an artificial reflecting
 * mirror cavity around a rapidly rotating Kerr black hole. Superradiant scattering exponentially
 * extracts rotational energy, creating violent photon amplification and ergosphere detonation rings.
 *   audioAdvance -> accelerates black hole spin & bosonic wavefield superradiant amplification
 *   audioKick    -> triggers runaway superradiant cavity explosion flashes
 *   audioSwell   -> widens mirror cavity radius & bosonic cloud density
 *   audioCentroid-> shifts superradiant resonance frequency colors
 *   audioSubBass -> deepens central event horizon gravitational shadow
 *
 * Per-activation variety:
 *   mirrorRadiusP float spherical reflecting cavity boundary radius (0.6..1.6)
 *   growthRateP   float superradiant instability exponential growth (0.5..2.2)
 *   modeL_P       float bosonic field azimuthal mode number m       (2.0..8.0)
 *   bombGlowP     float runaway explosion luminance gain            (0.8..2.5)
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

uniform float mirrorRadiusP;
uniform float growthRateP;
uniform float modeL_P;
uniform float bombGlowP;

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
    float t = time * 0.45 + audioAdvance * 0.4;
    
    float r = length(uv);
    float theta = atan(uv.y, uv.x);
    
    // Black hole event horizon & ergosphere radius
    float rHorizon = 0.18 * (1.0 + 0.2 * audioSubBass);
    float rErgo = 0.32 * (1.0 + 0.2 * audioBass);
    
    // Spherical reflecting mirror cavity boundary
    float rMirror = 0.85 * (mirrorRadiusP > 0.01 ? mirrorRadiusP : 1.0) * (0.9 + 0.2 * audioSwell);
    
    // Superradiant bosonic wavefield: Psi(r, theta) = R(r) * cos(m * theta - omega * t)
    float modeM = (modeL_P > 1.0 ? modeL_P : 4.0);
    float growth = (growthRateP > 0.01 ? growthRateP : 1.2);
    
    // Radial standing wave trapped between ergosphere and mirror
    float k_rad = 18.0;
    float radialWave = sin((r - rHorizon) * k_rad) * smoothstep(rHorizon, rHorizon + 0.05, r) * smoothstep(rMirror + 0.02, rMirror - 0.02, r);
    float azimuthalWave = cos(modeM * theta - t * 3.5 + audioPhase);
    
    // Superradiant exponential amplification in the ergoregion
    float bosonDensity = radialWave * azimuthalWave * (1.0 + exp((rErgo - r) * 6.0 * growth));
    
    // Runaway explosion flash on kick
    float runawayBomb = pow(clamp(bosonDensity * 0.8 + 0.5, 0.0, 1.0), 3.0) * (1.0 + 4.0 * audioKick) * (bombGlowP > 0.01 ? bombGlowP : 1.5);
    
    // Mirror boundary reflection glow
    float mirrorGlow = exp(-abs(r - rMirror) * 35.0);
    
    // Central black hole gravitational shadow
    float shadowMask = smoothstep(rHorizon - 0.02, rHorizon + 0.02, r);
    
    // Assign photo palette
    vec3 bosonColor = palTint(mix(vec3(0.1, 0.8, 1.0), vec3(1.0, 0.2, 0.5), abs(azimuthalWave)), r * 0.3 + audioCentroid, 0.28);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg * shadowMask;
    col += bosonColor * abs(bosonDensity) * shadowMask * (0.8 + 0.4 * audioSwell);
    col += vec3(1.0, 0.95, 0.85) * runawayBomb * shadowMask * 2.2;
    col += palTint(vec3(0.9, 0.95, 1.0), t * 0.05, 0.2) * mirrorGlow * 1.8;
    col += bosonColor * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
