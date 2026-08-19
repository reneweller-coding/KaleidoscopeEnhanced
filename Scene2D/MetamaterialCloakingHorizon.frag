#version 330 core
out vec4 fragColor;
/**
 * @file MetamaterialCloakingHorizon.frag
 * @brief METAMATERIAL CLOAKING HORIZON: Transformation-optics invisibility cloaking shell.
 * Coordinates are smoothly deformed by an inhomogeneous anisotropic permittivity/permeability
 * tensor, routing light rays around a central hidden core with compressed boundary caustics.
 *   audioAdvance -> navigates through continuous optical transformation coordinates
 *   audioPhase   -> rotates cloaking anisotropy axes
 *   audioKick    -> flashes metamaterial boundary resonance fringe rings
 *   audioSwell   -> widens invisibility cloaking cavity radius
 *   audioCentroid-> shifts transformation dispersion chromatic aberrations
 *
 * Per-activation variety:
 *   cloakRadiusP float invisibility cloak core radius        (0.3..1.2)
 *   transScaleP  float coordinate transformation warp factor  (0.8..2.5)
 *   causticP     float compressed boundary caustic brightness (0.8..2.2)
 *   waveDensityP float optical wavefront fringe frequency     (6.0..20.0)
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

uniform float cloakRadiusP;
uniform float transScaleP;
uniform float causticP;
uniform float waveDensityP;

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
    
    float r = length(uv);
    float theta = atan(uv.y, uv.x) + audioPhase * 0.3;
    
    // Transformation optics cloaking parameters (Pendry-Schurig coordinate map)
    float R1 = 0.25 * (cloakRadiusP > 0.01 ? cloakRadiusP : 1.0) * (1.0 + 0.3 * audioSwell); // Inner hidden core
    float R2 = 0.65 * (transScaleP > 0.01 ? transScaleP : 1.0);                               // Outer cloaking shell
    
    vec2 transformedUv = uv;
    float inCloakShell = 0.0;
    
    if (r < R2) {
        if (r > R1) {
            // Transformation map: r' = R1 + r * (R2 - R1) / R2
            float r_prime = R1 + (r - R1) * (R2 / (R2 - R1));
            transformedUv = vec2(cos(theta), sin(theta)) * r_prime;
            inCloakShell = 1.0;
        } else {
            // Inside the hidden core (isolated region)
            transformedUv = uv * (R2 / max(R1, 0.01));
        }
    }
    
    // Wavefront propagation across transformed space
    float waveFreq = (waveDensityP > 0.01 ? waveDensityP : 12.0);
    float wavefronts = sin(transformedUv.x * waveFreq - t * 4.0) * 0.5 + 0.5;
    
    // Compressed boundary caustics (high gradient of transformation at R1 and R2)
    float causticR1 = exp(-abs(r - R1) * 35.0) * (causticP > 0.01 ? causticP : 1.5) * (1.0 + 3.0 * audioKick);
    float causticR2 = exp(-abs(r - R2) * 25.0) * (0.8 + 0.8 * audioMid);
    
    // Core concealment shadow & inner resonator modes
    float inCore = smoothstep(R1 + 0.02, R1 - 0.02, r);
    float coreMode = sin(theta * 8.0 + t * 2.0) * inCore * (0.4 + 1.2 * audioSubBass);
    
    // Palette assignments
    vec3 colWave = imgPalette(fract(transformedUv.x * 0.2 + t * 0.05 + audioCentroid));
    vec3 colR1   = imgPalette(t * 0.1) * 2.2;
    vec3 colR2   = imgPalette(fract(theta * 0.159 + 0.5)) * 1.5;
    vec3 colCore = imgPalette(fract(r * 2.0 + audioPhase));
    
    // Sample background photo with transformation lensing
    vec2 bgUv = fract(transformedUv * 0.5 + 0.5);
    vec3 bg = img(bgUv);
    
    vec3 col = bg * 0.55;
    col += colWave * wavefronts * (0.6 + 0.4 * inCloakShell);
    col += colR1 * causticR1;
    col += colR2 * causticR2;
    col += colCore * coreMode * 1.5;
    col += imgPalette(audioAdvance * 0.1) * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
