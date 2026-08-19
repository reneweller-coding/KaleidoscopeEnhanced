#version 330 core
out vec4 fragColor;
/**
 * @file AnomalousFloquetTopologicalInsulator.frag
 * @brief ANOMALOUS FLOQUET TOPOLOGICAL INSULATOR: Out-of-equilibrium Floquet topological state
 * driven by circularly polarized light. High-frequency time-periodic driving breaks time-reversal
 * symmetry, creating chiral edge states traversing bulk bandgaps with photo-derived quasienergy spectra.
 *   audioAdvance -> drives Floquet drive frequency & quasienergy phase integration
 *   audioKick    -> flashes Floquet band inversion topological transitions
 *   audioSwell   -> widens chiral edge state penetration depth & bandgap luminance
 *   audioCentroid-> shifts Floquet quasienergy Brillouin zone spectra
 *   audioPhase   -> modulates circular polarization driving helicity
 *
 * Per-activation variety:
 *   latticePitchP float hexagonal lattice cell packing density   (2.5..7.0)
 *   driveAmpP     float periodic laser driving field intensity   (0.6..2.2)
 *   gapWidthP     float Floquet topological bandgap width        (0.4..1.8)
 *   edgeGlowP     float chiral boundary current luminance gain   (0.8..2.5)
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
uniform float driveAmpP;
uniform float gapWidthP;
uniform float edgeGlowP;

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
    
    // Hexagonal Honeycomb Floquet lattice
    float pitch = (latticePitchP > 0.01 ? latticePitchP : 4.2);
    vec2 p = uv * pitch;
    
    vec2 r_hex = vec2(p.x * 1.7320508 + p.y, p.y * 2.0) / 3.0;
    vec2 cell = floor(r_hex);
    vec2 f = fract(r_hex) - 0.5;
    
    // Time-periodic circular optical drive: A(t) = A_0 * (cos(Omega*t), sin(Omega*t))
    float a0 = (driveAmpP > 0.01 ? driveAmpP : 1.2);
    float driveAngle = t * 4.0 + audioPhase;
    vec2 driveField = vec2(cos(driveAngle), sin(driveAngle)) * (0.15 * a0);
    
    // Peierls phase substitution on hopping integrals: theta_ij = int A . dr
    float peierls = dot(f, driveField) * 12.0;
    
    // Chiral Floquet edge modes running along sample boundary (r = 0.65)
    float r = length(uv);
    float boundaryDist = abs(r - 0.65);
    float edgeMode = exp(-boundaryDist * 16.0 / max(gapWidthP > 0.01 ? gapWidthP : 1.0, 0.1));
    
    // Quasienergy chiral dispersion wave: epsilon(k) = v_F * k_parallel
    float theta = atan(uv.y, uv.x);
    float chiralWave = sin(theta * 12.0 - t * 6.0 + peierls) * 0.5 + 0.5;
    
    // Band inversion flash on kick
    float topoFlash = exp(-boundaryDist * 25.0) * (1.0 + 4.0 * audioKick) * (edgeGlowP > 0.01 ? edgeGlowP : 1.3);
    
    // Honeycomb node lattice sites
    float nodeSite = exp(-dot(f, f) * 25.0);
    
    // Palette assignment
    float palAngle = fract(theta * 0.159 + r * 0.3 + audioCentroid);
    vec3 colEdge = imgPalette(palAngle);
    vec3 colBulk = imgPalette(fract(palAngle + 0.5)) * 1.4;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colBulk * nodeSite * (0.8 + 0.4 * audioSwell);
    col += colEdge * edgeMode * (0.6 + 0.4 * chiralWave) * 2.2;
    col += vec3(0.95, 0.95, 1.0) * topoFlash * 2.0;
    col += colEdge * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
