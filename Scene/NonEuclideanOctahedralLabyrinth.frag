#version 330 core
out vec4 fragColor;
// NonEuclideanOctahedralLabyrinth.frag
// -----------------------------------------------------------------------
// NON-EUCLIDEAN OCTAHEDRAL LABYRINTH: 100% viewport-filling infinite
// 3D hyperbolic mirror maze constructed from {3,4} octahedral Coxeter
// chambers. Forward flight through recursive non-Euclidean corridors
// reflecting the loaded photo across infinite internal mirror planes.
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

uniform float speedP;
uniform float foldP;
uniform float scaleP;
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

// 3D Octahedral Coxeter fold
vec3 foldOctahedron(vec3 p) {
    p = abs(p);
    if (p.x < p.y) p.xy = p.yx;
    if (p.x < p.z) p.xz = p.zx;
    if (p.y < p.z) p.yz = p.zy;
    return p;
}

void main() {
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float fld = (foldP  > 0.0) ? foldP  : 1.0;
    float scl = (scaleP > 0.0) ? scaleP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.2;

    // Ray setup inside 3D hyperbolic octahedral chamber
    vec3 ro = vec3(0.0, 0.0, -2.2);
    vec3 rd = normalize(vec3(uv, 1.3));

    // Dynamic rotation of mirror chamber
    float yaw = t * 0.4 + audioPhase * 0.2;
    float pitch = sin(t * 0.3) * 0.4;
    float cy = cos(yaw), sy = sin(yaw);
    float cp = cos(pitch), sp = sin(pitch);

    rd.xz = vec2(rd.x * cy - rd.z * sy, rd.x * sy + rd.z * cy);
    rd.yz = vec2(rd.y * cp - rd.z * sp, rd.y * sp + rd.z * cp);

    // Iterative raymarch through octahedral folding space
    vec3 p = ro;
    float totalDist = 0.0;
    float minEdgeDist = 1000.0;
    float totalFolds = 0.0;

    for (int i = 0; i < 40; ++i) {
        vec3 curP = p * scl;
        
        // Non-Euclidean octahedral space folding
        for (int k = 0; k < 4; ++k) {
            curP = foldOctahedron(curP);
            curP -= vec3(0.6, 0.4, 0.2) * fld;
            totalFolds += 0.25;
        }

        // Distance to octahedral face
        float d = (curP.x + curP.y + curP.z - 1.2) * 0.57735;
        minEdgeDist = min(minEdgeDist, abs(d));

        totalDist += max(d * 0.5, 0.02);
        p = ro + rd * totalDist;
        if (totalDist > 8.0) break;
    }

    // Sample photo texture in folded octahedral space
    vec2 photoUV = vec2(p.x + p.y, p.z) * 0.3 + vec2(0.5);
    vec3 photoLabyrinth = img(fract(photoUV));

    // Octahedral mirror edge glow
    float edgeGlow = exp(-minEdgeDist * 25.0);
    vec3 neonEdge = imgPalette((totalFolds * 1.5 + audioPhase) * 0.159);

    // Chamber lighting
    vec3 col = photoLabyrinth * (0.8 + 0.5 * audioLevel) + neonEdge * edgeGlow * (1.5 + 2.0 * audioHigh);
    col += vec3(1.0, 0.9, 0.7) * audioKick * exp(-length(uv) * 3.5) * 1.5; // Central warp flare

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.88));

    fragColor = vec4(col, 1.0);
}
