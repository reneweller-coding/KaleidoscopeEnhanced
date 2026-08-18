#version 330 core
out vec4 fragColor;
// GyroidTriplyPeriodicLabyrinth.frag
// -----------------------------------------------------------------------
// GYROID TRIPLY PERIODIC LABYRINTH: Raymarched infinite non-Euclidean minimal
// surface (TPMS) dividing 3D space into two interpenetrating congruent labyrinths.
// Seamless camera flight through twisting titanium and crystal passages with
// caustic reflections, photo mapping, and audio-reactive wall breathing.
//   audioAdvance -> navigates camera through the infinite gyroid tunnels
//   audioBass    -> modulates gyroid isosurface threshold & wall opening
//   audioKick    -> flashes chromatic neon caustics along the labyrinth walls
//   audioSwell   -> widens corridor volume & specularity
//
// Per-activation variety:
//   scaleP  float gyroid spatial lattice frequency   (0.5..2.2)
//   wallP   float gyroid corridor wall thickness     (0.5..2.0)
//   speedP  float camera traversal velocity          (0.5..2.0)
//   hueP    float structural chromatic hue offset   (0..6.28)
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

// Triply Periodic Minimal Surface (Gyroid) Distance Function
float gyroidSDF(vec3 p, float scale, float thickness) {
    vec3 q = p * scale;
    float g = dot(sin(q), cos(q.zxy));
    return (abs(g) - thickness) / scale;
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

    // Smooth winding camera path through the gyroid labyrinth
    vec3 ro = vec3(
        sin(t * 0.5) * 3.5,
        cos(t * 0.35) * 3.5,
        t * 2.5
    );
    vec3 lookTarget = ro + vec3(sin(t * 0.6) * 0.4, cos(t * 0.4) * 0.4, 1.0);

    vec3 ww = normalize(lookTarget - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.2 - 0.25 * audioKick) * ww);

    // Dynamic wall thickness
    float thickness = (0.22 + 0.12 * sin(t * 1.5) + 0.15 * audioBass) * wll;
    float scale = 1.35 * scl;

    // Raymarching
    float dO = 0.0;
    float hitDist = -1.0;
    vec3 p;
    for (int i = 0; i < 50; ++i) {
        p = ro + rd * dO;
        float dS = gyroidSDF(p, scale, thickness);
        if (dS < 0.003) {
            hitDist = dO;
            break;
        }
        if (dO > 15.0) break;
        dO += dS * 0.65;
    }

    vec3 col = vec3(0.02, 0.03, 0.06);

    if (hitDist > 0.0) {
        vec3 n = calcNormal(p, scale, thickness);
        vec3 lightDir = normalize(vec3(0.5, 0.8, -0.6));
        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 24.0);

        // UV projection for photo texture onto gyroid surface
        vec2 photoUV = fract(vec2(atan(n.z, n.x) * 0.3183, p.z * 0.15 + dot(p.xy, n.yx) * 0.1));
        vec3 photo = img(photoUV);

        // Iridescent structural color
        vec3 iridCol = imgPalette((dot(p, vec3(0.3)) + audioPhase) * 0.159);

        col = mix(photo * 0.8, iridCol, 0.45);
        col = col * (0.3 + 0.7 * diff) + spec * vec3(1.0, 0.95, 0.85);

        // Neon edge caustic glow on kick
        float edge = smoothstep(thickness * 0.8, thickness, abs(dot(sin(p * scale), cos((p * scale).zxy))));
        col += edge * vec3(0.2, 0.8, 1.0) * (1.2 + audioKick * 2.5);

        // Volumetric distance fog
        col = mix(col, vec3(0.02, 0.03, 0.08), 1.0 - exp(-hitDist * 0.15));
    }

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.55;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
