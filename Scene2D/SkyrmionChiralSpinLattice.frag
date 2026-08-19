#version 330 core
out vec4 fragColor;
/**
 * @file SkyrmionChiralSpinLattice.frag
 * @brief SKYRMION CHIRAL SPIN LATTICE: Dense 2D triangular lattice of topological
 * magnetic skyrmion vortices governed by chiral Dzyaloshinskii-Moriya exchange interactions.
 * Displays swirling out-of-plane magnetization cores, gyrotropic Skyrmion Hall drift,
 * and holographic magneto-optical Faraday rotation patterns.
 *   audioAdvance -> drives gyrotropic Skyrmion Hall angle drift & spin precession
 *   audioKick    -> compresses lattice spacing triggering topological annihilation pulses
 *   audioBass    -> undulates skyrmion core diameter & out-of-plane helicity
 *   audioSwell   -> intensifies background ferromagnetic domain coherence
 *   audioCentroid-> shifts magneto-optical Kerr effect polarization colors
 *
 * Per-activation variety:
 *   latticeP float hexagonal skyrmion packing density         (2.0..6.0)
 *   coreP    float vortex core sharpness & radius             (0.4..1.8)
 *   chiralP  float Dzyaloshinskii-Moriya twisting chirality   (0.5..2.2)
 *   driftP   float gyrotropic Hall current velocity           (0.3..1.5)
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

uniform float latticeP;
uniform float coreP;
uniform float chiralP;
uniform float driftP;

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
    
    // Gyrotropic Skyrmion Hall drift
    float driftVel = (driftP > 0.01 ? driftP : 0.8);
    vec2 drift = vec2(cos(t * driftVel * 0.5), sin(t * driftVel * 0.5 + 0.8)) * 0.15;
    
    // Hexagonal lattice geometry
    float scale = (latticeP > 0.01 ? latticeP : 3.5) * (1.0 + 0.2 * audioKick);
    vec2 p = (uv + drift) * scale;
    
    // Triangular 2D grid coordinates
    vec2 r_hex = vec2(p.x * 1.7320508 + p.y, p.y * 2.0) / 3.0;
    vec2 cell = floor(r_hex);
    vec2 f = fract(r_hex) - 0.5;
    
    // Find closest hexagonal lattice center
    float minDist = 1e5;
    vec2 closestOffset = vec2(0.0);
    
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 center = neighbor + vec2(0.0);
            
            // Hexagonal skew back to Cartesian
            vec2 cartPos = vec2(sqrt(3.0) * (cell.x + neighbor.x + 0.5 * (cell.y + neighbor.y)), 1.5 * (cell.y + neighbor.y));
            vec2 diff = p - cartPos;
            float d = length(diff);
            if (d < minDist) {
                minDist = d;
                closestOffset = diff;
            }
        }
    }
    
    // Skyrmion spin texture: theta(r) rotates from Pi (core) to 0 (outer ferromagnetic domain)
    float coreSharpness = (coreP > 0.01 ? coreP : 1.0) * (0.8 + 0.5 * audioBass);
    float spinTheta = 3.14159265 * exp(-minDist * minDist * 2.2 * coreSharpness);
    
    // Chiral winding angle (Dzyaloshinskii-Moriya helicity)
    float chiralTwist = (chiralP > 0.01 ? chiralP : 1.2);
    float azim = atan(closestOffset.y, closestOffset.x) + spinTheta * chiralTwist + audioPhase;
    
    // 3D magnetization vector m = (sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta))
    vec3 m_spin = vec3(
        sin(spinTheta) * cos(azim),
        sin(spinTheta) * sin(azim),
        cos(spinTheta)
    );
    
    // Topological charge density q = m . (dm/dx x dm/dy) ~ sin(theta)/r * dtheta/dr
    float topCharge = abs(sin(spinTheta) * exp(-minDist * 3.0));
    
    // Faraday rotation & photo palette mapping
    float palAngle = fract(azim * 0.159 + m_spin.z * 0.3 + t * 0.05 + audioCentroid);
    vec3 colSpin = imgPalette(palAngle);
    
    // Core highlight & domain boundary lines
    float coreGlow = exp(-minDist * 12.0) * (1.0 + 3.0 * audioKick);
    float domainWall = exp(-abs(spinTheta - 1.57) * 5.0) * (0.8 + 0.4 * audioHigh);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colSpin * (0.85 + 0.35 * m_spin.z) * (0.8 + 0.4 * audioSwell);
    col += imgPalette(t * 0.1) * coreGlow * 2.0;
    col += imgPalette(palAngle + 0.5) * domainWall * 1.2;
    col += imgPalette(audioAdvance * 0.1) * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
