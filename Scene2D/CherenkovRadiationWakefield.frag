#version 330 core
out vec4 fragColor;
/**
 * @file CherenkovRadiationWakefield.frag
 * @brief CHERENKOV RADIATION WAKEFIELD: Relativistic charged particle wakefield
 * traversing a dense dielectric medium. Emits superluminal Cherenkov shockwave
 * cones, plasma bubble cavitation cavities, travelling optical Mach fringes,
 * and photo-driven dielectric polarization glow.
 *   audioAdvance -> drives relativistic particle beam & shockwave propagation
 *   audioKick    -> triggers high-gradient plasma cavitation detonations
 *   audioCentroid-> modulates Cherenkov cone opening angle & optical dispersion
 *   audioSwell   -> intensifies background dielectric polarization glow
 *   audioSubBass -> pulses plasma wakefield bubble diameter
 *
 * Per-activation variety:
 *   machP    float Cherenkov Mach angle & dispersion       (0.6..1.8)
 *   bubbleP  float plasma wakefield cavity scale           (0.5..2.0)
 *   fringeP  float optical interference fringe density     (1.0..3.5)
 *   glowP    float dielectric polarization luminance       (0.8..2.5)
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

uniform float machP;
uniform float bubbleP;
uniform float fringeP;
uniform float glowP;

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
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Beam axis & coordinate transformation
    vec2 p = uv;
    p.y += sin(p.x * 2.5 + t * 0.8) * 0.08;
    
    float beamPos = fract(t * 0.3) * 3.0 - 1.5;
    float dx = p.x - beamPos;
    float r = abs(p.y);
    
    // Cherenkov cone geometry (Mach angle)
    float machAngle = (0.75 + 0.25 * sin(audioCentroid * 3.14)) * (machP > 0.01 ? machP : 1.0);
    float coneD = dx * machAngle - r;
    float inCone = smoothstep(0.0, 0.15, coneD);
    
    // Plasma wakefield cavitation bubbles
    float bubbleFreq = 5.0 * (bubbleP > 0.01 ? bubbleP : 1.0);
    float bubblePhase = dx * bubbleFreq + t * 4.0;
    float bubbleCavity = exp(-r * (6.0 - 2.0 * audioSubBass)) * (0.5 + 0.5 * cos(bubblePhase));
    
    // Optical Mach fringes & high-gradient interference
    float fringeDensity = 18.0 * (fringeP > 0.01 ? fringeP : 1.5);
    float fringes = sin(coneD * fringeDensity + audioPhase * 2.0) * 0.5 + 0.5;
    fringes *= inCone * exp(-max(0.0, -dx) * 0.8);
    
    // Core ionization spark
    float spark = exp(-dot(vec2(dx, p.y), vec2(dx, p.y)) * 45.0) * (1.0 + 3.0 * audioKick);
    
    // Dielectric background polarization
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 photoBg = img(bgUv);
    
    // Color synthesis: Deep Cherenkov blue-violet identity tinted with photo palette
    vec3 cherenkovBlue = vec3(0.08, 0.45, 1.0);
    vec3 violetGlow   = vec3(0.55, 0.15, 0.95);
    vec3 shockTint    = palTint(mix(cherenkovBlue, violetGlow, fringes), coneD * 0.2, 0.28);
    
    vec3 col = photoBg * 0.25;
    col += shockTint * (inCone * 0.8 + fringes * 0.6) * (glowP > 0.01 ? glowP : 1.2);
    col += palTint(vec3(0.2, 0.8, 1.0), dx * 0.1, 0.25) * bubbleCavity * (0.8 + 0.6 * audioSwell);
    col += vec3(0.8, 0.95, 1.0) * spark;
    
    // Kick flash
    col += shockTint * audioKick * 0.35;
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
