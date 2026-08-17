#version 330 core
out vec4 fragColor;
// ScherkMinimalSurfaceTower.frag
// -----------------------------------------------------------------------
// SCHERK MINIMAL SURFACE TOWER: Raymarched infinite minimal surface towers
// governed by Scherk's doubly periodic minimal surface equation (e^z cos(x) = cos(y)).
// Intersecting saddle surfaces, glass and titanium reflections, caustic
// light sheets, and continuous non-Euclidean photo mapping.
//   audioAdvance -> navigates camera through the infinite Scherk towers
//   audioKick    -> flashes caustic reflection lines & edge highlights
//   audioBass    -> undulates saddle surface pitch and tower spacing
//   audioChromaHue-> rotates crystal glass dispersion colors
//
// Per-activation variety:
//   saddleP float Scherk saddle curvature scale         (0.5..2.2)
//   towerP  float tower lattice grid density            (0.5..2.0)
//   speedP  float camera traversal velocity             (0.5..2.0)
//   hueP    float structural chromatic hue offset       (0..6.28)
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

uniform float saddleP;
uniform float towerP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
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

// Scherk's Second Minimal Surface distance estimation
float scherkSDF(vec3 p, float scale, float thickness) {
    vec3 q = p * scale;
    // Scherk equation: exp(q.z) * cos(q.x) - cos(q.y) = 0
    float f = exp(sin(q.z)) * cos(q.x) - cos(q.y);
    return (abs(f) - thickness) / (scale * (1.0 + abs(f) * 0.5));
}

vec3 calcNormal(vec3 p, float scale, float thickness) {
    float eps = 0.005;
    vec2 h = vec2(eps, 0.0);
    return normalize(vec3(
        scherkSDF(p + h.xyy, scale, thickness) - scherkSDF(p - h.xyy, scale, thickness),
        scherkSDF(p + h.yxy, scale, thickness) - scherkSDF(p - h.yxy, scale, thickness),
        scherkSDF(p + h.yyx, scale, thickness) - scherkSDF(p - h.yyx, scale, thickness)
    ));
}

void main() {
    float sdl = (saddleP > 0.0) ? saddleP : 1.0;
    float twr = (towerP  > 0.0) ? towerP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Smooth winding camera trajectory
    vec3 ro = vec3(sin(t * 0.4) * 2.5, cos(t * 0.3) * 2.5, t * 2.0);
    vec3 lookTarget = ro + vec3(sin(t * 0.5) * 0.3, cos(t * 0.4) * 0.3, 1.0);

    vec3 ww = normalize(lookTarget - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.2 - 0.25 * audioKick) * ww);

    float scale = 1.2 * twr;
    float thickness = (0.18 + 0.1 * sin(t) + 0.12 * audioBass) * sdl;

    float dO = 0.0;
    float hitDist = -1.0;
    vec3 p;
    for (int i = 0; i < 48; ++i) {
        p = ro + rd * dO;
        float dS = scherkSDF(p, scale, thickness);
        if (dS < 0.003) {
            hitDist = dO;
            break;
        }
        if (dO > 12.0) break;
        dO += dS * 0.65;
    }

    vec3 col = vec3(0.02, 0.03, 0.06);

    if (hitDist > 0.0) {
        vec3 n = calcNormal(p, scale, thickness);
        vec3 lightDir = normalize(vec3(0.4, 0.9, -0.5));
        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0);

        // UV coordinates on saddle surface
        vec2 photoUV = fract(vec2(p.x * 0.2 + p.z * 0.1, p.y * 0.2 + dot(p.xy, n.yx) * 0.1));
        vec3 photo = img(photoUV);

        // Iridescent structural color
        vec3 irid = 0.5 + 0.5 * cos(vec3(0.0, 1.8, 3.6) + dot(p, vec3(0.35)) + audioPhase);

        col = mix(photo * 0.85, irid, 0.45);
        col = col * (0.35 + 0.65 * diff) + spec * vec3(1.0, 0.95, 0.85);

        // Caustic edge glow on kick
        float edge = smoothstep(thickness * 0.7, thickness, abs(exp(sin(p.z * scale)) * cos(p.x * scale) - cos(p.y * scale)));
        col += edge * vec3(0.3, 0.85, 1.0) * (1.0 + audioKick * 2.5);

        // Distance fog
        col = mix(col, vec3(0.02, 0.03, 0.07), 1.0 - exp(-hitDist * 0.18));
    }

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
