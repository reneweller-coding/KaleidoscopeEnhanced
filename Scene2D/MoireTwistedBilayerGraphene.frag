#version 330 core
out vec4 fragColor;
/**
 * @file MoireTwistedBilayerGraphene.frag
 * @brief MOIRE TWISTED BILAYER GRAPHENE: Magic-angle (~1.1 deg) twisted bilayer graphene.
 * Creates massive macroscopic Moiré superlattices, localized flat-band electron density
 * islands, Dirac cone topological splitting, and correlated quantum interference fringes.
 *   audioAdvance -> rotates bilayer twist angle smoothly around magic-angle resonance
 *   audioKick    -> discharges correlated Mott insulator electron conduction bursts
 *   audioCentroid-> shifts Fermi surface level & flat-band localized state colors
 *   audioSwell   -> widens quantum tunneling conductance between graphene sheets
 *   audioHigh    -> excites atomic carbon honeycomb sub-lattice lattice ripples
 *
 * Per-activation variety:
 *   twistP   float Moiré superlattice twist angle scale   (0.5..2.0)
 *   flatBandP float localized AA-stacking island sharpness (0.6..2.2)
 *   interfP  float quantum interference fringe contrast    (0.8..2.5)
 *   honeyP   float microscopic honeycomb lattice visibility (0.2..1.2)
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

uniform float twistP;
uniform float flatBandP;
uniform float interfP;
uniform float honeyP;

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

// Hexagonal honeycomb wave generator
float hexGraphene(vec2 p, float scale) {
    vec2 q = p * scale;
    float k1 = sin(q.x) * cos(q.y * 1.7320508);
    float k2 = sin(q.x * 0.5 + q.y * 0.8660254) * cos(q.x * 0.8660254 - q.y * 0.5);
    float k3 = sin(q.x * 0.5 - q.y * 0.8660254) * cos(q.x * 0.8660254 + q.y * 0.5);
    return (k1 + k2 + k3) / 3.0;
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Magic angle modulation
    float baseTheta = 0.019; // ~1.1 degrees in radians
    float twistMod = (twistP > 0.01 ? twistP : 1.0);
    float theta = (baseTheta + 0.008 * sin(t * 0.2 + audioPhase * 0.5)) * twistMod;
    
    // Rotate Layer 1 and Layer 2
    float c1 = cos(theta * 0.5), s1 = sin(theta * 0.5);
    float c2 = cos(-theta * 0.5), s2 = sin(-theta * 0.5);
    
    vec2 p1 = vec2(uv.x * c1 - uv.y * s1, uv.x * s1 + uv.y * c1);
    vec2 p2 = vec2(uv.x * c2 - uv.y * s2, uv.x * s2 + uv.y * c2);
    
    // Graphene atomic lattice waves
    float atomicScale = 45.0;
    float g1 = hexGraphene(p1, atomicScale);
    float g2 = hexGraphene(p2, atomicScale);
    
    // Macroscopic Moiré interference pattern (Difference of wavevectors Delta K)
    float moireScale = atomicScale * theta * 12.0;
    vec2 pMoire = uv * moireScale;
    float moireHex = hexGraphene(pMoire, 1.0);
    
    // AA-stacking flat-band localized electron state islands (peaks of Moiré pattern)
    float flatBandIntensity = pow(clamp(moireHex * 0.5 + 0.5, 0.0, 1.0), 3.0 * (flatBandP > 0.01 ? flatBandP : 1.0));
    
    // Quantum tunneling current & interference contrast
    float contrast = (interfP > 0.01 ? interfP : 1.5);
    float quantumInterf = (g1 * g2) * contrast * (0.8 + 0.5 * audioMid);
    
    // Microscopic honeycomb visibility
    float honeyVis = (honeyP > 0.01 ? honeyP : 0.6) * (0.6 + 0.8 * audioHigh);
    
    // Correlated electron bursts on kick
    float mottFlash = flatBandIntensity * (1.0 + 3.0 * audioKick);
    
    // Assign photo palette
    float palMoire = fract(moireHex * 0.25 + t * 0.05 + audioCentroid);
    vec3 colMoire  = imgPalette(palMoire);
    vec3 colFlat   = imgPalette(fract(palMoire + 0.5)) * 2.2;
    vec3 colInterf = imgPalette(fract(quantumInterf * 0.5 + 0.25));
    
    // Sample background photo
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colMoire * (0.6 + 0.4 * audioSwell);
    col += colFlat * mottFlash * 1.5;
    col += colInterf * abs(quantumInterf) * honeyVis * 1.8;
    col += imgPalette(t * 0.1) * audioKick * 0.35;
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
