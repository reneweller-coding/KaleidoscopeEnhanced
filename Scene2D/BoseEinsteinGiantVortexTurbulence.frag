#version 330 core
out vec4 fragColor;
/**
 * @file BoseEinsteinGiantVortexTurbulence.frag
 * @brief BOSE-EINSTEIN GIANT VORTEX TURBULENCE: 2D quantum turbulence in a trapped Bose-Einstein
 * condensate. Multiple counter-rotating quantized vortex pairs undergo an inverse energy cascade,
 * clustering into giant macroscopic Onsager vortex storms with photo-derived phase texturing.
 *   audioAdvance -> integrates Gross-Pitaevskii macroscopic wavefunction phase
 *   audioKick    -> excites vortex-antivortex pair annihilation shockwaves
 *   audioBass    -> undulates giant Onsager vortex cluster precession & core size
 *   audioSwell   -> enriches condensate background density & Thomas-Fermi radius
 *   audioCentroid-> shifts quantum vorticity stream colors
 *
 * Per-activation variety:
 *   vortexCountP float number of active quantized vortex cores    (4.0..16.0)
 *   cascadeP     float inverse energy cascade clustering strength (0.5..2.2)
 *   coreRadiusP  float healing length vortex core radius          (0.02..0.12)
 *   soundSpeedP  float Bogoliubov acoustic speed of sound         (0.6..2.2)
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

uniform float vortexCountP;
uniform float cascadeP;
uniform float coreRadiusP;
uniform float soundSpeedP;

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
    
    // Harmonic trap background (Thomas-Fermi density profile: n(r) = max(0, 1 - r^2/R_TF^2))
    float r = length(uv);
    float R_TF = 0.95 * (0.85 + 0.25 * audioSwell);
    float condensateDensity = clamp(1.0 - (r * r) / (R_TF * R_TF), 0.0, 1.0);
    
    float numVortices = (vortexCountP > 1.0 ? vortexCountP : 8.0);
    float cascade = (cascadeP > 0.01 ? cascadeP : 1.2);
    
    float totalPhase = audioPhase * 0.3;
    float coreDips = 1.0;
    
    // Accumulate quantized vortex phases: Psi(r) = sqrt(n) * exp(i * sum(theta_j))
    for (float j = 0.0; j < 8.0; j += 1.0) {
        if (j >= numVortices) break;
        
        // Vortex trajectory (clustered into two giant Onsager storms: positive & negative circulation)
        float sign = mod(j, 2.0) == 0.0 ? 1.0 : -1.0;
        float clusterCenter = sign * (0.35 / max(cascade, 0.5));
        
        float vAngle = j * 0.7854 + t * (0.6 + 0.2 * j) * sign;
        float vRad   = 0.15 + 0.12 * sin(t * 0.8 + j);
        vec2 vPos = vec2(clusterCenter + cos(vAngle) * vRad, sin(vAngle) * vRad);
        
        vec2 diff = uv - vPos;
        float d = length(diff);
        float angle = atan(diff.y, diff.x);
        
        totalPhase += angle * sign;
        
        // Healing length core profile: tanh(r / xi)
        float xi = (coreRadiusP > 0.001 ? coreRadiusP : 0.045) * (1.0 + 0.4 * audioBass);
        coreDips *= clamp(d / xi, 0.0, 1.0);
    }
    
    // Bogoliubov phonon sound ripples
    float cSound = (soundSpeedP > 0.01 ? soundSpeedP : 1.2);
    float phonons = sin(r * 18.0 - t * 4.0 * cSound) * 0.08 * (0.6 + 0.8 * audioMid);
    
    float finalDensity = condensateDensity * coreDips + phonons;
    
    // Annihilation flashes on kick
    float coreFlash = (1.0 - coreDips) * (1.0 + 3.5 * audioKick);
    
    // Palette assignment
    vec3 colPhase = imgPalette(fract(totalPhase * 0.159 + t * 0.05 + audioCentroid));
    vec3 colCore  = imgPalette(fract(totalPhase * 0.159 + 0.5));
    
    // Background photo texture
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colPhase * finalDensity * 1.8;
    col += colCore * coreFlash * 2.0;
    col += imgPalette(audioAdvance * 0.1) * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
