#version 330 core
out vec4 fragColor;
/**
 * @file PhotonicCrystalDiracConeDispersion.frag
 * @brief PHOTONIC CRYSTAL DIRAC CONE DISPERSION: Zero-refractive-index (n = 0) photonic crystal.
 * Accidental degeneracy of electric and magnetic dipole modes at the Brillouin zone center (Gamma)
 * forms a linear Dirac cone dispersion, creating infinite phase velocity and spatially uniform fields.
 *   audioAdvance -> navigates zero-index tunneling & Bloch phase dispersion
 *   audioKick    -> flashes accidental degeneracy Dirac point resonance bursts
 *   audioSwell   -> widens photonic bandgap depth & zero-index field coherence
 *   audioCentroid-> shifts Dirac point optical transmission wavelength spectra
 *   audioHigh    -> excites high-order Bloch harmonic diffraction wavelets
 *
 * Per-activation variety:
 *   latticePitchP float dielectric cylinder lattice constant    (3.0..8.0)
 *   diracPurityP  float accidental degeneracy zero-index purity  (0.6..2.2)
 *   tunnelGlowP   float zero-index phase tunneling luminance gain(0.8..2.5)
 *   cylinderRadP  float dielectric pillar radius scale          (0.15..0.45)
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

uniform float latticePitchP;
uniform float diracPurityP;
uniform float tunnelGlowP;
uniform float cylinderRadP;

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
    
    // Square array of high-index dielectric cylinders
    float pitch = (latticePitchP > 0.01 ? latticePitchP : 5.0);
    vec2 p = uv * pitch;
    vec2 cell = floor(p);
    vec2 f = fract(p) - 0.5;
    
    // Dielectric cylinder pillar
    float rCyl = (cylinderRadP > 0.01 ? cylinderRadP : 0.28);
    float dPillar = length(f);
    float inPillar = smoothstep(rCyl + 0.03, rCyl - 0.03, dPillar);
    float pillarEdge = exp(-abs(dPillar - rCyl) * 35.0);
    
    // Zero-index wave tunneling: phase k = 0 implies wavelength -> infty, uniform phase across crystal!
    float zeroIndexPhase = sin(t * 3.0 + audioPhase * 0.5) * 0.5 + 0.5;
    
    // Dirac cone linear dispersion perturbation: omega - omega_D ~ v_D * |k|
    float vPurity = (diracPurityP > 0.01 ? diracPurityP : 1.2);
    float diracCone = sin(length(uv) * 14.0 * (1.0 - 0.7 * vPurity) - t * 4.0);
    
    // Accidental degeneracy flash on kick.  zeroIndexPhase is spatially
    // UNIFORM (that's the k=0 physics), so this term must stay small and
    // mostly ride on the pillar edges below -- at its original gain the
    // whole frame washed to pure white half of the time.
    float diracFlash = zeroIndexPhase * (0.5 + 1.2 * audioKick) * (tunnelGlowP > 0.01 ? tunnelGlowP : 1.3);
    
    // High-order Bloch harmonics
    float blochHarmonics = sin(f.x * 12.0) * cos(f.y * 12.0) * (0.6 + 0.8 * audioHigh);
    
    // Palette assignment
    float palAngle = fract(length(cell) * 0.08 + t * 0.05 + audioCentroid);
    vec3 colDirac  = imgPalette(palAngle);
    vec3 colPillar = imgPalette(fract(palAngle + 0.5)) * 1.5;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colPillar * inPillar * (0.8 + 0.4 * audioSwell);
    col += colDirac * zeroIndexPhase * 0.6;
    col += vec3(0.95, 0.95, 1.0) * diracFlash * (0.3 + 1.2 * pillarEdge);
    col += colPillar * pillarEdge * 1.6;
    col += colDirac * abs(blochHarmonics) * inPillar * 0.8;
    col += colDirac * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
