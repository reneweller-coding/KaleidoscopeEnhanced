#version 330 core
out vec4 fragColor;
// EscherRelativityMatrix.frag
// -----------------------------------------------------------------------
// ESCHER RELATIVITY MATRIX: Raymarched infinite non-Euclidean 3D architectural
// labyrinth inspired by M.C. Escher's "Relativity" with 3 orthogonal gravity axes,
// intersecting neon staircases, archways, and photo projection on walls.
//   audioPhase   -> shifts spatial gravity perspective & camera traversal
//   audioKick    -> flashes neon architectural balustrades & arches
//   audioBass    -> undulates hallway step displacements
//   audioSwell   -> widens infinite spatial repeating corridors
//
// Per-activation variety:
//   gridP    float architectural chamber repetition scale (0.5..2.0)
//   archP    float archway & pillar complexity             (0.5..1.8)
//   neonP    float glowing neon trim intensity             (0.5..2.2)
//   hueP     float palette base hue rotation               (0..6.28)
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

uniform float gridP;
uniform float archP;
uniform float neonP;
uniform float hueP;
uniform float audioChromaHue;

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

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// 3D Escher maze distance field
float map(vec3 p, float spc, float arc, out int matID, out vec2 texCoord) {
    // 3D periodic cell repetition
    vec3 cell = floor(p / spc);
    vec3 q = mod(p, spc) - 0.5 * spc;

    // Floor and ceiling slabs along 3 orthogonal gravity planes
    float slabX = sdBox(q, vec3(0.08, 0.5 * spc, 0.5 * spc));
    float slabY = sdBox(q, vec3(0.5 * spc, 0.08, 0.5 * spc));
    float slabZ = sdBox(q, vec3(0.5 * spc, 0.5 * spc, 0.08));

    // Archway cutouts in the slabs
    float holeX = length(q.yz) - 0.32 * spc * arc;
    float holeY = length(q.xz) - 0.32 * spc * arc;
    float holeZ = length(q.xy) - 0.32 * spc * arc;

    float archX = max(slabX, -holeX);
    float archY = max(slabY, -holeY);
    float archZ = max(slabZ, -holeZ);

    float walls = min(archX, min(archY, archZ));

    // Staircases traveling along diagonal planes
    vec3 sq = q;
    sq.xy = rot2D(0.785398) * sq.xy; // 45 deg staircase
    float steps = mod(sq.x * 6.0, 1.0) - 0.5;
    float stairs = sdBox(sq, vec3(0.5 * spc, 0.05, 0.15 * spc)) + steps * 0.02;

    float d = min(walls, stairs);

    if (d == stairs) {
        matID = 1; // Neon staircase
        texCoord = q.xy;
    } else {
        matID = 0; // Wall with photo
        texCoord = (archX < archY && archX < archZ) ? q.yz : ((archY < archZ) ? q.xz : q.xy);
    }

    return d;
}

void main() {
    float grd = (gridP > 0.0) ? gridP : 1.0;
    float arc = (archP > 0.0) ? archP : 1.0;
    float neo = (neonP > 0.0) ? neonP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float spc = 2.4 * grd;

    // Moving camera traversing Escher non-Euclidean space
    float travel = time * 0.4 + audioAdvance * 0.3;
    vec3 ro = vec3(sin(travel * 0.3) * 3.0, travel * 0.8, cos(travel * 0.25) * 3.0);
    vec3 ta = ro + vec3(cos(travel * 0.2), sin(travel * 0.15) * 0.5, sin(travel * 0.2));

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(sin(time * 0.1), 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.4 - 0.3 * audioKick) * ww);

    float t = 0.0;
    int hitMat = 0;
    vec2 hitUV = vec2(0.0);
    float glow = 0.0;

    for (int i = 0; i < 64; ++i) {
        vec3 p = ro + rd * t;
        float d = map(p, spc, arc, hitMat, hitUV);

        // Neon edge glow accumulation
        glow += exp(-max(d, 0.0) * 8.0) * (0.015 * neo);

        if (d < 0.002 || t > 25.0) break;
        t += max(d * 0.7, 0.01);
    }

    vec3 col = vec3(0.02, 0.03, 0.06);

    if (t < 25.0) {
        vec3 p = ro + rd * t;

        // Approximate normal
        int dummyID; vec2 dummyUV;
        float eps = 0.005;
        vec3 n = normalize(vec3(
            map(p + vec3(eps, 0.0, 0.0), spc, arc, dummyID, dummyUV) - map(p - vec3(eps, 0.0, 0.0), spc, arc, dummyID, dummyUV),
            map(p + vec3(0.0, eps, 0.0), spc, arc, dummyID, dummyUV) - map(p - vec3(0.0, eps, 0.0), spc, arc, dummyID, dummyUV),
            map(p + vec3(0.0, 0.0, eps), spc, arc, dummyID, dummyUV) - map(p - vec3(0.0, 0.0, eps), spc, arc, dummyID, dummyUV)
        ));

        // Multi-directional gravity lighting
        vec3 light1 = normalize(vec3(1.0, 1.0, 0.5));
        vec3 light2 = normalize(vec3(-0.5, -1.0, -1.0));
        float diff = max(dot(n, light1), 0.0) * 0.7 + max(dot(n, light2), 0.0) * 0.4;

        // Texture projection from photo
        vec2 texP = fract(hitUV * 0.4 + 0.5);
        vec3 texCol = img(texP);

        if (hitMat == 1) {
            // Neon glowing stairs
            vec3 stairNeon = imgPalette((p.y * 2.0 + time * 3.0) * 0.159) * 1.5;
            col = stairNeon * (1.2 + audioKick * 2.5);
        } else {
            // Architecture facade with photo
            col = texCol * diff * (0.8 + 0.4 * audioSwell);
            // Ambient occlusion
            float ao = clamp(t / 20.0, 0.0, 1.0);
            col *= (1.0 - ao * 0.6);
        }

        // Distance fog
        col = mix(col, vec3(0.02, 0.04, 0.08), smoothstep(10.0, 25.0, t));
    }

    // Add volumetric neon glow
    vec3 glowCol = imgPalette(0.5 + 0.2 * sin(time * 2.0)) * 1.4;
    col += glowCol * glow * (1.0 + audioKick * 3.0);

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
