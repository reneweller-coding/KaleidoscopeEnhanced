#version 330 core
out vec4 fragColor;
// MandelbulbHyperRealm.frag
// -----------------------------------------------------------------------
// MANDELBULB HYPER REALM: Raymarched infinite 3D Mandelbulb fractal realm (z^N + c)
// with audio-reactive power N morphing, internal crystalline cave traversal,
// and thin-film metallic specular iridescence with photo texture blending.
//   audioSwell   -> dynamically morphs fractal power N (2.0 to 8.0)
//   audioKick    -> ignites metallic specular core flare & laser beams
//   audioPhase   -> rotates higher-dimensional 3D slicing planes
//   audioCentroid-> shifts thin-film metallic iridescence palette
//
// Per-activation variety:
//   powerP   float base Mandelbulb power N                 (4.0..8.0)
//   zoomP    float camera flight zoom depth                (0.5..1.8)
//   glowP    float interior crystal glow intensity         (0.5..2.2)
//   hueP     float spectrum base hue rotation              (0..6.28)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float powerP;
uniform float zoomP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard, replaces the generic cos-rainbow): colours
// come from a rotating arc in the CURRENT slideshow image, so every
// activation inherits a fresh palette from the photos, and the arc follows
// the musical key (chromaHue is circular-slewed = jump-free) with a slow
// advance drift.  Valence shapes saturation toward the mood.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
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

// 3D Mandelbulb distance estimator
float mandelbulb(vec3 p, float power, out float trap) {
    vec3 w = p;
    float m = dot(w, w);
    float dz = 1.0;
    float r = 0.0;
    trap = 1e10;

    for (int i = 0; i < 6; ++i) {
        dz = power * pow(m, (power - 1.0) * 0.5) * dz + 1.0;
        r = length(w);
        trap = min(trap, r);

        float b = power * acos(clamp(w.y / max(r, 0.001), -1.0, 1.0));
        float a = power * atan(w.x, w.z);

        w = p + pow(r, power) * vec3(sin(b) * sin(a), cos(b), sin(b) * cos(a));
        m = dot(w, w);
        if (m > 4.0) break;
    }

    return 0.25 * log(m) * sqrt(m) / dz;
}

void main() {
    float pwr = (powerP > 0.0) ? powerP : 6.0;
    float zm  = (zoomP  > 0.0) ? zoomP  : 1.0;
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    // Dynamic Mandelbulb power modulated by audio swell
    float activePower = pwr + 2.0 * sin(audioAdvance * 0.2 + time * 0.3) + 1.5 * audioSwell;

    // Orbiting / diving camera path
    float t = time * 0.25 + audioAdvance * 0.15;
    float camDist = (1.8 - 0.6 * sin(t * 0.5)) / zm;
    vec3 ro = vec3(sin(t) * camDist, 0.5 * cos(t * 0.7), cos(t) * camDist);
    vec3 ta = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.5 - 0.4 * audioKick) * ww);

    float totalDist = 0.0;
    float trap = 0.0;
    float minTrap = 1e10;
    float glowAcc = 0.0;
    bool hit = false;

    for (int i = 0; i < 80; ++i) {
        vec3 p = ro + rd * totalDist;
        float d = mandelbulb(p, activePower, trap);
        minTrap = min(minTrap, trap);

        glowAcc += exp(-max(d, 0.0) * 12.0) * (0.02 * glw);

        if (d < 0.001) {
            hit = true;
            break;
        }
        if (totalDist > 8.0) break;
        totalDist += max(d * 0.65, 0.003);
    }

    vec3 col = vec3(0.01, 0.02, 0.05);

    if (hit) {
        vec3 p = ro + rd * totalDist;

        // Normal computation
        float dummyTrap;
        float eps = 0.002;
        vec3 n = normalize(vec3(
            mandelbulb(p + vec3(eps, 0.0, 0.0), activePower, dummyTrap) - mandelbulb(p - vec3(eps, 0.0, 0.0), activePower, dummyTrap),
            mandelbulb(p + vec3(0.0, eps, 0.0), activePower, dummyTrap) - mandelbulb(p - vec3(0.0, eps, 0.0), activePower, dummyTrap),
            mandelbulb(p + vec3(0.0, 0.0, eps), activePower, dummyTrap) - mandelbulb(p - vec3(0.0, 0.0, eps), activePower, dummyTrap)
        ));

        // Iridescent Thin-Film Specular Shading
        vec3 lightDir = normalize(vec3(0.8, 1.2, -0.6));
        float diff = max(dot(n, lightDir), 0.0);
        vec3 ref = reflect(rd, n);
        float spec = pow(max(dot(ref, lightDir), 0.0), 32.0);

        // Orbit trap color mapping
        vec3 baseCol = imgPalette((minTrap * 8.0 + audioCentroid * 3.0) * 0.159);

        // Photo mapping from triplanar surface
        vec2 photoCoord = fract(p.xy * 0.8 + 0.5);
        vec3 photo = img(photoCoord);

        col = mix(baseCol, photo, 0.4) * (diff * 0.8 + 0.2);
        col += vec3(1.0, 0.9, 0.7) * spec * (1.5 + audioKick * 3.0);

        // Distance fog
        col = mix(col, vec3(0.01, 0.02, 0.06), smoothstep(2.5, 7.0, totalDist));
    }

    // Add interior fractal glow
    vec3 glowColor = mix(vec3(0.9, 0.2, 0.5), vec3(0.2, 0.8, 1.0), sin(audioPhase + time) * 0.5 + 0.5);
    col += glowColor * glowAcc * (1.0 + audioKick * 2.5);

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
