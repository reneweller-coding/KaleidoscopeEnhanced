#version 330 core
out vec4 fragColor;
// GrapheneDiracPlasmonics.frag
// -----------------------------------------------------------------------
// GRAPHENE DIRAC PLASMONICS: 100% viewport-filling 2D honeycomb carbon
// graphene lattice visualizing Dirac cones, topological quantum Hall edge
// states, localized electronic wavepacket hops, and plasmonic resonances.
// -----------------------------------------------------------------------

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
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;
uniform float audioSpectrum[32];

uniform float latticeP;
uniform float plasmonP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Hexagonal honeycomb distance helper
vec4 hexLattice(vec2 p) {
    vec2 s = vec2(1.0, 1.7320508);
    vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
    return (dot(h.xy, h.xy) < dot(h.zw, h.zw)) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + vec2(0.5, 0.5));
}

void main() {
    float lat = (latticeP > 0.0) ? latticeP : 1.0;
    float pls = (plasmonP > 0.0) ? plasmonP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Honeycomb coordinates
    vec2 p = uv * 14.0 * lat;
    vec4 h = hexLattice(p);
    vec2 localPos = h.xy;
    vec2 cellCenter = h.zw;

    // Carbon-carbon covalent bond lines
    float hexEdge = abs(length(localPos) - 0.5);
    float bondLine = smoothstep(0.08, 0.02, hexEdge);

    // Atomic carbon nuclei at honeycomb vertices
    float nucleus = exp(-dot(localPos, localPos) * 35.0);

    // Dirac cone electronic wave dispersion: E(k) = +/- hbar * v_F * |k - K|
    float kDist = length(cellCenter * 0.2);
    float diracEnergy = abs(sin(kDist * 4.0 - t * 2.0));

    // Spectrum band excitation per carbon ring
    float cellHash = fract(sin(dot(cellCenter, vec2(12.9898, 78.233))) * 43758.5453);
    int bandIdx = int(clamp(cellHash * 31.0, 0.0, 31.0));
    float bandEnergy = audioSpectrum[bandIdx];

    // Plasmonic wavepacket traveling across the sheet
    // USER-FEEDBACK: two CROSSING wavefronts + an expanding kick ring —
    // the plasmons visibly travel and collide instead of one static stripe.
    float w1 = pow(0.5 + 0.5 * sin(dot(p, normalize(vec2(1.0, 0.5))) - time * 6.0), 8.0);
    float w2 = pow(0.5 + 0.5 * sin(dot(p, normalize(vec2(-0.6, 1.0))) - time * 4.6 - audioPhase), 8.0);
    float ringR = fract(time * 0.45 + audioAdvance * 0.2) * 1.5;
    float ring  = pow(max(0.0, 1.0 - abs(length(uv) - ringR) * 6.0), 2.0)
                * (0.4 + 1.6 * audioKick);
    float plasmonWave = (w1 + w2 * 0.8) * (1.0 + 1.2 * audioKick);

    // Photo projection on electronic density of states
    vec2 photoUV = cellCenter * 0.08 + vec2(0.5);
    vec3 photoCol = img(fract(photoUV));

    // Quantum colors: Graphene carbon grey + neon cyan/amber Dirac plasmons
    vec3 carbonBase = vec3(0.06, 0.08, 0.12) * photoCol;
    vec3 bondNeon = vec3(0.0, 0.85, 1.0) * (0.6 + 1.5 * diracEnergy);
    vec3 plasmonCol = imgPalette(0.12) * plasmonWave * 2.6 * pls + imgPalette(0.55) * ring * 2.0;
    vec3 nucleusGlow = vec3(1.0, 0.9, 0.4) * nucleus * (1.0 + 2.0 * bandEnergy);

    vec3 col = carbonBase + bondNeon * bondLine * 1.8 + plasmonCol + nucleusGlow;
    col += vec3(0.3, 0.8, 1.0) * audioKick * exp(-length(uv) * 3.5) * 1.5; // Quantum Hall pulse

    col = hueRot(col, hue);   // chromaHue handled inside imgPalette
    col = pow(col, vec3(0.88));
    col *= 0.8;
    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));

    fragColor = vec4(col, 1.0);
}
