#version 330 core
out vec4 fragColor;
/**
 * @file BismuthLabyrinth.frag
 * @brief BISMUTH LABYRINTH: Raymarched infinite 3D hopper crystal labyrinth of metallic
 * elemental bismuth. Stepped 90-degree geometric terraces, thin-film optical
 * interference rainbow oxidation layers, specular metallic reflections, and
 * audio-reactive architectural fractals filling the screen.
 *   audioSwell   -> pulses fractal hopper terrace depth & step density
 *   audioKick    -> flashes chromatic iridescent oxidation reflection
 *   audioCentroid-> shifts thin-film rainbow oxide thickness
 *   audioSubBass -> expands geometric chamber scale & bass vibration
 *
 * Per-activation variety:
 *   iterP         float fractal iteration / step scale    (0.6..1.8)
 *   stepP         float terrace hopper step depth         (0.5..1.6)
 *   iridescenceP  float rainbow oxidation glow intensity  (0.5..2.2)
 *   hueP          float global hue rotation               (0..6.28)
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

uniform float iterP;
uniform float stepP;
uniform float iridescenceP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Thin-film iridescent rainbow color function (Airy/Newton optical rings)
vec3 thinFilmColor(float thickness) {
    vec3 col;
    col.r = sin(thickness * 6.28318 + 0.0) * 0.5 + 0.5;
    col.g = sin(thickness * 6.28318 + 2.094) * 0.5 + 0.5;
    col.b = sin(thickness * 6.28318 + 4.188) * 0.5 + 0.5;
    // Boost vibrancy
    return pow(col, vec3(1.3)) * 1.5;
}

// Bismuth Hopper Crystal Distance Function
// Fold space into orthogonal stepped square concentric terraces
float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float map(vec3 p, out float outLayer, float stpScale) {
    // Spatial repetition for infinite labyrinth
    vec3 c = vec3(4.0, 4.0, 4.0);
    vec3 q = mod(p + 0.5 * c, c) - 0.5 * c;

    // Recursive hopper crystal folding
    float scale = 1.0;
    float layerAcc = 0.0;

    for (int i = 0; i < 4; i++) {
        // Orthogonal 90-degree fold
        q = abs(q) - vec3(0.65, 0.65, 0.65) * stpScale;
        if (q.x < q.y) q.xy = q.yx;
        if (q.x < q.z) q.xz = q.zx;
        if (q.y < q.z) q.yz = q.zy;

        // Step translation
        q.z -= 0.25 * stpScale;
        q = q * 1.45 - vec3(0.3, 0.3, 0.2);
        scale *= 1.45;
        layerAcc += float(i);
    }

    outLayer = layerAcc;
    return sdBox(q, vec3(0.45, 0.45, 0.45)) / scale;
}

vec3 calcNormal(vec3 p, float stpScale) {
    float dummy;
    const float eps = 0.002;
    float d = map(p, dummy, stpScale);
    vec3 n = vec3(
        map(p + vec3(eps, 0.0, 0.0), dummy, stpScale) - d,
        map(p + vec3(0.0, eps, 0.0), dummy, stpScale) - d,
        map(p + vec3(0.0, 0.0, eps), dummy, stpScale) - d
    );
    return normalize(n);
}

void main() {
    float iters = (iterP        > 0.0) ? iterP        : 1.0;
    float stp   = (stepP        > 0.0) ? stepP        : 1.0;
    float irid  = (iridescenceP > 0.0) ? iridescenceP : 1.0;
    float hue   = (hueP         > 0.0) ? hueP         : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    // Flight camera navigating through the hopper crystal labyrinth
    float camZ = time * 0.8 + audioAdvance * 0.4;
    float camX = sin(time * 0.15) * 1.2;
    float camY = cos(time * 0.12) * 1.2;
    vec3 ro = vec3(camX, camY, camZ);

    // Look-at direction with gentle banking
    float lookZ = camZ + 3.0;
    vec3 ta = vec3(camX + sin(time * 0.15 + 0.4) * 0.6, camY + cos(time * 0.12 + 0.4) * 0.6, lookZ);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.2 * ww);

    // Raymarch
    float t = 0.0;
    float maxDist = 20.0;
    float hitDist = -1.0;
    float hitLayer = 0.0;
    float stpScale = stp * (1.0 + 0.15 * audioSwell);

    for (int i = 0; i < 75; i++) {
        vec3 p = ro + rd * t;
        float lyr;
        float d = map(p, lyr, stpScale);
        if (d < 0.002 * t) {
            hitDist = t;
            hitLayer = lyr;
            break;
        }
        t += max(d * 0.7, 0.015);
        if (t > maxDist) break;
    }

    vec3 col = vec3(0.01, 0.01, 0.02);

    if (hitDist > 0.0) {
        vec3 p = ro + rd * hitDist;
        vec3 n = calcNormal(p, stpScale);
        vec3 view = -rd;

        // Thin-film interference thickness based on surface angle, depth & position
        float dotNV = max(dot(n, view), 0.0);
        float filmThickness = dotNV * 2.5 + hitLayer * 0.35 + p.z * 0.15 + audioCentroid * 0.5;
        vec3 rainbowOxide = thinFilmColor(filmThickness);

        // Metallic Bismuth core lighting
        vec3 lightDir = normalize(vec3(0.5, 0.8, -0.6));
        float diff = max(dot(n, lightDir), 0.0);
        vec3 refl = reflect(rd, n);
        float spec = pow(max(dot(refl, lightDir), 0.0), 32.0);

        // Sample input photo texture on hopper mirrors
        vec2 reflUV = refl.xy * 0.5 + 0.5;
        vec3 photoRefl = img(clamp(reflUV, 0.0, 1.0));

        // Ambient occlusion estimate
        float dummy;
        float ao = clamp(map(p + n * 0.15, dummy, stpScale) / 0.15, 0.0, 1.0);

        // Assemble metallic bismuth surface
        vec3 metallicBase = vec3(0.85, 0.88, 0.92); // Silver/white bismuth metal core
        vec3 surfaceCol = mix(metallicBase * diff, rainbowOxide, 0.75 * irid);
        surfaceCol += spec * vec3(1.0, 0.95, 0.9) * (1.5 + audioKick * 1.5);
        surfaceCol += photoRefl * 0.4 * (0.8 + audioLevel * 0.5);
        surfaceCol *= (0.3 + 0.7 * ao);

        // Distance atmospheric crystal fog
        float fog = 1.0 - exp(-hitDist * 0.12);
        vec3 fogCol = mix(vec3(0.05, 0.02, 0.1), vec3(0.2, 0.1, 0.3), dotNV);
        col = mix(surfaceCol, fogCol, fog);
    }

    // Audio-reactive rainbow laser pulse on kick
    if (audioKick > 0.6) {
        col += thinFilmColor(time * 2.0 + audioAdvance) * audioKick * 0.4;
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    vec2 vUV = st * (1.0 - st.yx);
    float vig = vUV.x * vUV.y * 15.0;
    col *= clamp(pow(vig, 0.25), 0.0, 1.0);

    fragColor = vec4(col, 1.0);
}
