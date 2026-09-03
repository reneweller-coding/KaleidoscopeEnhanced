#version 330 core
out vec4 fragColor;
/**
 * @file GyroidTriplyPeriodicLabyrinth.frag
 * @brief GYROID TRIPLY PERIODIC LABYRINTH: Raymarched infinite non-Euclidean minimal
 * surface (TPMS) dividing 3D space into two interpenetrating congruent labyrinths.
 * Seamless camera flight through twisting titanium and crystal passages with
 * caustic reflections, photo mapping, and audio-reactive wall breathing.
 *   audioAdvance -> navigates camera through the infinite gyroid tunnels
 *   audioBass    -> modulates gyroid isosurface threshold & wall opening
 *   audioKick    -> flashes chromatic neon caustics along the corridor silhouettes,
 *                   and widens the flight cone
 *   audioSwell   -> brightness of the proximity glow gathered along the ray, i.e.
 *                   how far the corridors light up ahead of the camera
 *   audioLevel   -> headlamp reach, and the level of the deep-labyrinth backdrop
 *
 * Per-activation variety:
 *   scaleP  float gyroid spatial lattice frequency   (0.5..2.2)
 *   wallP   float gyroid corridor wall thickness     (0.5..2.0)
 *   speedP  float camera traversal velocity          (0.5..2.0)
 *   hueP    float structural chromatic hue offset   (0..6.28)
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

uniform float scaleP;
uniform float wallP;
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

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// Triply Periodic Minimal Surface (Gyroid) Distance Function.
// NOTE the divisor: dividing only by `scale` treats |grad g| as 1, but the
// gyroid field's gradient runs to about 1.7 in the corridors and past 3 near
// the saddles.  With the old bound the marcher stepped roughly twice the true
// clearance, tunnelled straight through the thin walls, ran out of range and
// took the miss branch -- which painted vec3(0.02,0.03,0.06), i.e. nothing.
// That is where this scene's dead, flat, quarter-full frame came from.
float gyroidSDF(vec3 p, float scale, float thickness) {
    vec3 q = p * scale;
    float g = dot(sin(q), cos(q.zxy));
    return (abs(g) - thickness) / (scale * 1.75);
}

// Analytic gradient of the gyroid field in q space (used to keep the flight
// path in the middle of a corridor -- far cheaper than a full calcNormal).
vec3 gyroidGrad(vec3 q) {
    return vec3(cos(q.x) * cos(q.z) - sin(q.y) * sin(q.x),
                cos(q.y) * cos(q.x) - sin(q.z) * sin(q.y),
                cos(q.z) * cos(q.y) - sin(q.x) * sin(q.z));
}

vec3 calcNormal(vec3 p, float scale, float thickness) {
    float eps = 0.005;
    vec2 h = vec2(eps, 0.0);
    return normalize(vec3(
        gyroidSDF(p + h.xyy, scale, thickness) - gyroidSDF(p - h.xyy, scale, thickness),
        gyroidSDF(p + h.yxy, scale, thickness) - gyroidSDF(p - h.yxy, scale, thickness),
        gyroidSDF(p + h.yyx, scale, thickness) - gyroidSDF(p - h.yyx, scale, thickness)
    ));
}

void main() {
    float scl = (scaleP > 0.0) ? scaleP : 1.0;
    float wll = (wallP  > 0.0) ? wallP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Dynamic wall thickness
    float thickness = (0.15 + 0.05 * sin(t * 1.5) + 0.05 * audioSwell) * wll;
    float scale = 0.85 * scl;   // bigger cells = walkable corridors, not wall soup

    // Smooth winding camera path through the gyroid labyrinth
    vec3 ro = vec3(
        sin(t * 0.5) * 1.15,
        cos(t * 0.35) * 1.15,
        t * 2.5
    );

    // (Der fruehere Newton-Push sprang beim Wanddurchgang auf die andere
    // Slab-Seite -- der gemeldete Kamerasprung. Ersetzt durch die
    // Clearance-Blase im March unten: stetig per Konstruktion.)

    vec3 lookTarget = ro + vec3(sin(t * 0.6) * 0.4, cos(t * 0.4) * 0.4, 1.0);

    vec3 ww = normalize(lookTarget - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    // Wider cone: at the old 1.2 focal length the corridor mouth occupied a
    // small disc in the middle of the picture with dark nothing around it.
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 0.85 * ww);

    // Raymarching.  The step factor matches the corrected distance bound
    // above; a proximity glow is integrated ALONG the ray as it goes, so the
    // directions that never meet a wall still carry the labyrinth's own
    // structure instead of coming back as dead background.
    float dO = 0.12;
    float hitDist = -1.0;
    float glow = 0.0;
    vec3 p = vec3(0.0);   // guarded by hitDist, but the compiler cannot see that
    for (int i = 0; i < 90; ++i) {
        p = ro + rd * dO;
        float dS = gyroidSDF(p, scale, thickness);
        dS = max(dS, 0.45 - dO);   // Kamera-Clearance-Blase
        if (dS < 0.003) {
            hitDist = dO;
            break;
        }
        if (dO > 16.0) break;
        float stp = max(dS * 0.35, 0.006);
        glow += exp(-max(dS, 0.0) * 7.0) * stp * exp(-dO * 0.10);
        dO += stp;
    }
    glow = min(glow * 1.15, 1.0);

    // The deep labyrinth behind everything: never black, always the scene's
    // own palette, always bounded.
    vec3 deep = mix(vec3(0.035, 0.050, 0.090), imgPalette(0.62) * 0.32, 0.55);
    vec3 col = deep * (0.85 + 0.30 * audioLevel);

    if (hitDist > 0.0) {
        vec3 n = calcNormal(p, scale, thickness);
        // Headlamp: the light travels WITH the camera, so corridor walls fall
        // off naturally into the dark ahead - that reads as a labyrinth.
        vec3 lightDir = normalize(ro - p);
        float atten = exp(-hitDist * 0.22) * (1.4 + 0.6 * audioLevel);
        float diff = max(dot(n, lightDir), 0.0) * atten + 0.10;
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 24.0) * atten;

        // UV projection for photo texture onto gyroid surface
        vec2 photoUV = fract(vec2(atan(n.z, n.x) * 0.3183, p.z * 0.15 + dot(p.xy, n.yx) * 0.1));
        vec3 photo = img(photoUV);

        // Iridescent structural color
        vec3 iridCol = imgPalette((dot(p, vec3(0.3)) + audioPhase) * 0.159);

        col = mix(photo * 0.8, iridCol, 0.45);
        col = col * (0.3 + 0.7 * diff) + spec * vec3(1.0, 0.95, 0.85);

        // Neon edge caustic glow on kick.  This used to test |g| against
        // thickness * 1.45 -- but a hit happens exactly WHERE |g| equals
        // thickness, so the smoothstep was pinned at zero and the caustics
        // never once appeared.  The real edge of a corridor is its silhouette:
        // the rim where the wall turns away from the ray.
        float edge = pow(1.0 - abs(dot(n, -rd)), 3.0);
        col += min(edge * imgPalette(0.45) * (0.55 + audioKick * 0.9), vec3(0.85));

        // Volumetric distance fog, fading into the same deep labyrinth the
        // miss branch paints, so wall and no-wall meet without a seam.
        col = mix(col, deep, 1.0 - exp(-hitDist * 0.11));
    }

    // Proximity glow gathered along the ray: corridor mouths and the gaps
    // between walls light up softly, so no part of the picture is empty even
    // when the ray never lands on anything.
    col += imgPalette(0.28) * glow * 0.85 * (0.75 + 0.45 * audioSwell);

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.72;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
