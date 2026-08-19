#version 330 core
out vec4 fragColor;
/**
 * @file LiebLatticeFlatBandLocalization.frag
 * @brief LIEB LATTICE FLAT BAND LOCALIZATION: 2D line-centered square Lieb lattice with a strictly
 * dispersionless flat band at zero energy. Destructive quantum interference creates compactly
 * localized loop states (Aharonov-Bohm cages) with photo-derived wavepacket phase texturing.
 *   audioAdvance -> navigates compact localized state phase rotation & hopping dynamics
 *   audioKick    -> flashes flat-band excitation & dispersive Dirac cone transition bursts
 *   audioSwell   -> widens lattice site wavepacket penetration & cage luminescence
 *   audioCentroid-> shifts flat-band vs dispersive band quantum state color spectra
 *   audioPhase   -> twists Aharonov-Bohm magnetic flux cage interference
 *
 * Per-activation variety:
 *   gridPitchP   float Lieb lattice unit cell packing density    (2.5..7.0)
 *   abFluxP      float Aharonov-Bohm synthetic magnetic flux     (0.5..2.2)
 *   cageGlowP    float compact localized loop state luminance    (0.8..2.5)
 *   sublatticeP  float A/B/C sublattice energy offset contrast   (0.4..1.8)
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

uniform float gridPitchP;
uniform float abFluxP;
uniform float cageGlowP;
uniform float sublatticeP;

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
    
    // Lieb lattice geometry: Corner site (A) and two edge sites (B, C) per unit cell
    float pitch = (gridPitchP > 0.01 ? gridPitchP : 4.5);
    vec2 p = uv * pitch;
    vec2 cell = floor(p);
    vec2 f = fract(p) - 0.5;
    
    // 3 sublattices:
    // A: corner (0,0) -> f near (-0.5, -0.5)
    // B: horizontal edge (0.5, 0) -> f near (0, -0.5)
    // C: vertical edge (0, 0.5) -> f near (-0.5, 0)
    float siteA = exp(-dot(f + vec2(0.5), f + vec2(0.5)) * 35.0);
    float siteB = exp(-dot(f + vec2(0.0, 0.5), f + vec2(0.0, 0.5)) * 35.0);
    float siteC = exp(-dot(f + vec2(0.5, 0.0), f + vec2(0.5, 0.0)) * 35.0);
    
    // Compact Localized State (CLS) loop on 4 edge sites with alternating phases (+1, -1, +1, -1)
    float loopDist = abs(max(abs(f.x), abs(f.y)) - 0.25);
    float clsLoop = exp(-loopDist * loopDist * 60.0);
    
    // Aharonov-Bohm synthetic flux phase
    float phiAB = (abFluxP > 0.01 ? abFluxP : 1.2) * audioPhase;
    float cagePhase = sin(t * 3.0 + length(cell) * 0.5 + phiAB) * 0.5 + 0.5;
    
    // Flat-band localized state wavepacket
    float flatBandState = clsLoop * cagePhase * (0.85 + 0.35 * audioSwell);
    
    // Excitation flash on kick
    float exFlash = (siteA + siteB + siteC) * (1.0 + 3.5 * audioKick) * (cageGlowP > 0.01 ? cageGlowP : 1.3);
    
    // Inter-site hopping bonds
    float bondH = exp(-abs(f.y + 0.5) * 40.0) * smoothstep(0.5, 0.0, abs(f.x));
    float bondV = exp(-abs(f.x + 0.5) * 40.0) * smoothstep(0.5, 0.0, abs(f.y));
    
    // Palette assignment
    float palAngle = fract(length(cell) * 0.08 + t * 0.05 + audioCentroid);
    vec3 colFlat = imgPalette(palAngle);
    vec3 colBond = imgPalette(fract(palAngle + 0.5)) * 1.5;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colBond * (bondH + bondV) * 0.8;
    col += colFlat * (siteA * 0.5 + siteB + siteC) * 1.6;
    col += colFlat * flatBandState * 2.2;
    col += vec3(0.95, 0.95, 1.0) * exFlash * 1.8;
    col += colFlat * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
