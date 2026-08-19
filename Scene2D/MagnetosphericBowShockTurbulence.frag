#version 330 core
out vec4 fragColor;
/**
 * @file MagnetosphericBowShockTurbulence.frag
 * @brief MAGNETOSPHERIC BOW SHOCK TURBULENCE: Planetary magnetosphere collision with supersonic
 * solar wind. Features hyperbolic bow shock compression fronts, turbulent magnetosheath eddies,
 * ion cyclotron whistler wave ripples, and photo-derived auroral particle flux curtains.
 *   audioAdvance -> drives supersonic solar wind plasma inflow & magnetosheath turbulence
 *   audioKick    -> flashes geomagnetic substorm reconnection & auroral particle injections
 *   audioBass    -> undulates planetary magnetic dipole compression standoff distance
 *   audioSwell   -> enriches magnetospheric plasma density & auroral curtain thickness
 *   audioCentroid-> shifts magnetospheric ion excitation & oxygen/nitrogen emission spectra
 *
 * Per-activation variety:
 *   shockCurvP   float hyperbolic bow shock curvature parameter (0.4..1.8)
 *   windSpeedP   float solar wind supersonic drift velocity      (0.6..2.2)
 *   whistlerP    float ion cyclotron whistler wave frequency     (8.0..24.0)
 *   auroraGlowP  float auroral particle curtain luminance gain   (0.8..2.5)
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

uniform float shockCurvP;
uniform float windSpeedP;
uniform float whistlerP;
uniform float auroraGlowP;

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
    
    // Solar wind incoming from left (-x) impacting planetary dipole at (0.35, 0)
    vec2 planetPos = vec2(0.35, 0.0);
    vec2 relP = uv - planetPos;
    
    // Hyperbolic Bow Shock front: x_shock = -standoff + curv * y^2
    float standoff = (0.35 * (1.0 - 0.25 * audioBass));
    float curv = (shockCurvP > 0.01 ? shockCurvP : 0.85);
    float shockX = -standoff + curv * (uv.y * uv.y);
    
    float shockDist = uv.x - shockX;
    float shockFront = exp(-abs(shockDist) * 30.0);
    
    // Turbulent magnetosheath eddies (between bow shock and magnetopause)
    float vSpeed = (windSpeedP > 0.01 ? windSpeedP : 1.2);
    vec2 sheathUv = vec2(uv.x * 6.0 + t * 2.5 * vSpeed, uv.y * 6.0);
    float eddy = sin(sheathUv.x + sin(sheathUv.y)) * cos(sheathUv.y - sin(sheathUv.x));
    
    // Ion cyclotron whistler waves propagating in foreshock region (x < shockX)
    float wFreq = (whistlerP > 0.01 ? whistlerP : 16.0);
    float whistler = sin(uv.x * wFreq - t * 4.0 + audioPhase) * smoothstep(0.0, -0.2, shockDist);
    
    // Auroral particle cusp curtains funneling into planetary magnetic poles
    float rDipole = length(relP);
    float dipoleAngle = atan(relP.y, relP.x);
    float dipoleField = sin(dipoleAngle * 2.0) / max(rDipole * rDipole, 0.01);
    
    float auroraCurtain = exp(-abs(sin(dipoleAngle) * rDipole - 0.15) * 12.0) * smoothstep(0.5, 0.1, rDipole);
    auroraCurtain *= (1.0 + 3.0 * audioKick) * (auroraGlowP > 0.01 ? auroraGlowP : 1.3);
    
    // Color palettes
    vec3 solarWindCol = vec3(1.0, 0.7, 0.2);
    vec3 auroraEmerald= vec3(0.1, 0.95, 0.45);
    vec3 shockCyan    = vec3(0.2, 0.85, 1.0);
    
    vec3 colShock  = palTint(shockCyan, uv.y * 0.2 + audioCentroid, 0.25);
    vec3 colAurora = palTint(auroraEmerald, t * 0.05 + audioCentroid, 0.28);
    vec3 colWind   = palTint(solarWindCol, uv.x * 0.3, 0.22);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colShock * shockFront * 2.4;
    col += colWind * abs(eddy) * smoothstep(-0.2, 0.2, shockDist) * (0.8 + 0.4 * audioSwell);
    col += colShock * abs(whistler) * 0.9;
    col += colAurora * auroraCurtain * 2.5;
    col += colAurora * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
