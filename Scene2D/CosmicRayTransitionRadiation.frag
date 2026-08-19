#version 330 core
out vec4 fragColor;
/**
 * @file CosmicRayTransitionRadiation.frag
 * @brief COSMIC RAY TRANSITION RADIATION: Ultra-relativistic charged particles traversing periodic
 * multilayer foil stacks (mylar/polypropylene radiator). Sudden dielectric boundary crossings emit
 * highly collimated forward X-ray transition radiation cones with photo-derived interference fringes.
 *   audioAdvance -> accelerates relativistic particle beam traversing radiator stack
 *   audioKick    -> flashes boundary crossing X-ray photon emission bursts
 *   audioSwell   -> widens foil stack cross-section & forward X-ray cone brightness
 *   audioCentroid-> shifts X-ray transition radiation spectral interference peaks
 *   audioHigh    -> modulates high-frequency formation zone interference ripples
 *
 * Per-activation variety:
 *   foilDensityP float multilayer radiator foil stack density    (4.0..14.0)
 *   coneAngleP   float transition radiation cone opening angle   (0.3..1.2)
 *   xrayGlowP    float X-ray emission peak luminance gain        (0.8..2.5)
 *   gammaLorentzP float particle Lorentz factor gamma parameter   (0.6..2.2)
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

uniform float foilDensityP;
uniform float coneAngleP;
uniform float xrayGlowP;
uniform float gammaLorentzP;

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
    float t = time * 0.45 + audioAdvance * 0.4;
    
    // Multilayer radiator foil interfaces along Y-axis
    float fDens = (foilDensityP > 0.01 ? foilDensityP : 8.0);
    float foilY = fract(uv.y * fDens) - 0.5;
    float foilId = floor(uv.y * fDens);
    
    // Relativistic charged particle tracks along Y-axis
    float pTrack = exp(-abs(uv.x) * 45.0);
    
    // Forward X-ray transition radiation cone: theta_X ~ 1 / gamma
    float r = length(vec2(uv.x, uv.y + 0.3));
    float gamma = (gammaLorentzP > 0.01 ? gammaLorentzP : 1.3);
    float cAngle = (coneAngleP > 0.01 ? coneAngleP : 0.6) / gamma;
    
    float coneRing = exp(-abs(r - cAngle) * 22.0);
    
    // Formation zone interference fringes: sin^2((omega * l_f) / (4 * c * gamma^2))
    float formPhase = r * 30.0 - t * 6.0 + audioPhase;
    float formFringes = sin(formPhase) * 0.5 + 0.5;
    formFringes *= (0.6 + 0.8 * audioHigh);
    
    // Boundary crossing flash on kick
    float boundaryCross = exp(-abs(foilY) * 35.0);
    float xRayBurst = (coneRing * formFringes + pTrack) * (1.0 + 3.5 * audioKick) * (xrayGlowP > 0.01 ? xrayGlowP : 1.3);
    
    // Palette assignment
    float palAngle = fract(r * 0.4 + foilId * 0.1 + audioCentroid);
    vec3 colCone = imgPalette(palAngle);
    vec3 colFoil = imgPalette(fract(palAngle + 0.5)) * 1.5;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colFoil * boundaryCross * (0.8 + 0.4 * audioSwell) * 1.4;
    col += colCone * coneRing * formFringes * 2.0;
    col += vec3(0.95, 0.95, 1.0) * xRayBurst * 2.2;
    col += colCone * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
