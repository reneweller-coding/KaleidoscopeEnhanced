#version 330 core
out vec4 fragColor;
/**
 * @file WhisperingGalleryMicrocavity.frag
 * @brief WHISPERING GALLERY MICROCAVITY: Deformed optical microcavity resonator
 * exhibiting quantum chaos, ray-wave correspondence, and whispering gallery modes.
 * Total internal reflection orbits create rich caustic networks and evanescent
 * boundary tunneling light rays across the whole viewport.
 *   audioAdvance -> rotates chaotic Poincaré ray trajectory phase
 *   audioPhase   -> deforms microcavity boundary quadropole / octupole shape
 *   audioSnare   -> triggers evanescent laser tunneling bursts
 *   audioSwell   -> thickens volumetric caustic interference sheets
 *   audioTreble  -> modulates high-frequency whispering gallery mode fringes
 *
 * Per-activation variety:
 *   deformP  float cavity boundary deformation parameter   (0.05..0.35)
 *   orbitP   float ray-orbit chaos & bounce density        (1.0..3.0)
 *   fringeP  float azimuthal mode wavenumber fringe density (8.0..24.0)
 *   tunnelP  float evanescent tunneling radiation gain     (0.5..2.0)
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

uniform float deformP;
uniform float orbitP;
uniform float fringeP;
uniform float tunnelP;

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
    float t = time * 0.3 + audioAdvance * 0.3;
    
    float r = length(uv);
    float theta = atan(uv.y, uv.x);
    
    // Deformed cavity boundary: R(theta) = R0 * (1 + eps2 * cos(2*theta) + eps3 * cos(3*theta))
    float def = (deformP > 0.001 ? deformP : 0.18);
    float eps2 = def * (0.8 + 0.3 * sin(audioPhase));
    float eps3 = def * 0.5 * cos(audioPhase * 1.3);
    float R_theta = 0.42 * (1.0 + eps2 * cos(2.0 * theta + t * 0.2) + eps3 * cos(3.0 * theta - t * 0.15));
    
    float distToBound = r - R_theta;
    
    // Whispering gallery modes (confined near inner boundary r < R_theta)
    float modeFreq = (fringeP > 0.01 ? fringeP : 16.0) + 4.0 * audioHigh;
    float wgmMode = sin(theta * modeFreq - t * 3.0) * 0.5 + 0.5;
    float radialFalloff = exp(-abs(distToBound) * 22.0);
    float wgmIntensity = wgmMode * radialFalloff * (distToBound < 0.0 ? 1.0 : 0.1);
    
    // Chaotic internal ray bounces & caustic webbing (Poincaré orbits)
    float causticAccum = 0.0;
    float orbitCount = 5.0 * (orbitP > 0.01 ? orbitP : 1.5);
    for (float i = 1.0; i <= 5.0; i += 1.0) {
        float angleOffset = i * 1.2566 + t * 0.1;
        float rayDist = abs(dot(uv, vec2(cos(angleOffset), sin(angleOffset))) - 0.25 * sin(t * 0.5 + i));
        causticAccum += exp(-rayDist * 35.0) * (0.6 + 0.4 * sin(audioAdvance * 0.2 + i));
    }
    causticAccum *= smoothstep(0.08, -0.02, distToBound);
    
    // Evanescent tunneling radiation escaping the cavity
    float tunnelGain = (tunnelP > 0.01 ? tunnelP : 1.0);
    float tunnelRays = 0.0;
    if (distToBound > 0.0) {
        float escapeAngle = theta + 0.5 * distToBound;
        tunnelRays = pow(sin(escapeAngle * 6.0 + t * 2.0) * 0.5 + 0.5, 4.0);
        tunnelRays *= exp(-distToBound * 4.0) * (0.8 + 1.5 * audioMid) * tunnelGain;
    }
    
    // Boundary ring glow
    float boundRing = exp(-abs(distToBound) * 45.0) * (1.0 + 2.0 * audioKick);
    
    // Synthesis with photo palette
    vec3 colWgm    = imgPalette(fract(theta * 0.159 + t * 0.05)) * wgmIntensity * 2.2;
    vec3 colCaust  = imgPalette(fract(causticAccum * 0.3 + 0.33)) * causticAccum * 1.4;
    vec3 colTunnel = imgPalette(fract(theta * 0.159 + 0.66 + distToBound)) * tunnelRays * 2.0;
    vec3 colRing   = imgPalette(t * 0.1) * boundRing * 1.8;
    
    // Base texture backdrop
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 colBg = img(bgUv) * 0.25;
    
    vec3 col = colBg + colWgm + colCaust + colTunnel + colRing;
    col += imgPalette(audioCentroid) * audioKick * 0.25;
    col *= (0.85 + 0.35 * audioSwell);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
