#version 330 core
out vec4 fragColor;
/**
 * @file NonEuclideanOctahedralLabyrinth.frag
 * @brief NON-EUCLIDEAN OCTAHEDRAL LABYRINTH: 100% viewport-filling infinite
 * 3D hyperbolic mirror maze constructed from {3,4} octahedral Coxeter
 * chambers. Forward flight through recursive non-Euclidean corridors
 * reflecting the loaded photo across infinite internal mirror planes.
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

// USER-FEEDBACK-REDESIGN: an actual mirror labyrinth.  The old loop was a
// pseudo-march that mostly stalled near the camera (one big smooth surface).
// Now: hollow octahedral chambers repeated through space, sphere-traced from
// inside — photo-textured walls, glowing edge lines exactly on the mirror
// seams, headlamp falloff into the deeper chambers.
float chamber(vec3 q, float size)
{
    q = mod(q + 2.0, 4.0) - 2.0;                 // infinite chamber lattice
    vec3 a = abs(q);
    return -((a.x + a.y + a.z - size) * 0.57735);  // hollow: inside the room
}

void main() {
    float scl = (scaleP > 0.0) ? scaleP : 1.0;
    float fld = (foldP  > 0.0) ? foldP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float t = time * 0.3 * spd + audioAdvance * 0.2;
    float size = 2.55 + 0.35 * sin(t * 0.4) * fld;

    // Drift through the chamber lattice, gently yawing.
    vec3 ro = vec3(0.35 * sin(t * 0.5), 0.30 * cos(t * 0.4), t * 0.9);
    float yaw = t * 0.35 + audioPhase * 0.2;
    vec3 rd = normalize(vec3(uv, 1.25));
    rd.xz = vec2(rd.x * cos(yaw) - rd.z * sin(yaw), rd.x * sin(yaw) + rd.z * cos(yaw));

    float dO = 0.02;
    float hitDist = -1.0;
    vec3 p = ro;
    for (int i = 0; i < 64; ++i) {
        p = ro + rd * dO;
        float dS = chamber(p * scl, size) / scl;
        // Kamera-Clearance-Blase: der Skriptpfad kreuzt Kammerwaende, und
        // ohne Blase steckte das Auge zeitweise IN der Geometrie
        // ("Eindringen in das Objekt / Kollision mit Kamera").
        dS = max(dS, 0.5 - dO);
        if (dS < 0.004) { hitDist = dO; break; }
        if (dO > 14.0) break;
        dO += dS * 0.85;
    }

    vec3 col = vec3(0.02, 0.03, 0.05);
    if (hitDist > 0.0) {
        vec2 e = vec2(0.006, 0.0);
        vec3 n = normalize(vec3(
            chamber((p + e.xyy) * scl, size) - chamber((p - e.xyy) * scl, size),
            chamber((p + e.yxy) * scl, size) - chamber((p - e.yxy) * scl, size),
            chamber((p + e.yyx) * scl, size) - chamber((p - e.yyx) * scl, size)));

        vec3 q = mod(p * scl + 2.0, 4.0) - 2.0;
        vec3 a = abs(q);

        // Photo on the mirror faces, projected per face orientation.
        vec2 photoUV = fract(vec2(dot(p.xy, n.yx) * 0.22 + 0.5, p.z * 0.22 + 0.5));
        vec3 photo = img(photoUV);

        // Edge seams: octahedron faces meet where one coordinate crosses 0.
        float edge = exp(-min(a.x, min(a.y, a.z)) * (14.0 + 8.0 * audioHigh));
        vec3 neon = imgPalette(0.35 + 0.25 * sin(p.z * 0.7));

        // Headlamp: rooms ahead fall into darkness = labyrinth depth.
        float atten = exp(-hitDist * 0.30) * (1.5 + 0.6 * audioLevel);
        float diff = max(dot(n, normalize(ro - p)), 0.0) * atten + 0.10;

        col = photo * diff * (0.9 + 0.4 * audioLevel);
        col += neon * edge * (0.9 + 1.1 * audioKick) * (0.4 + 0.6 * atten);
    }

    if (hue > 0.001) col = hueRot(col, hue);
    col = pow(col, vec3(0.9));
    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}
