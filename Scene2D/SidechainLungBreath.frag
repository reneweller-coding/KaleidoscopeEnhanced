#version 330 core
out vec4 fragColor;
/**
 * @file SidechainLungBreath.frag
 * @brief SIDECHAIN LUNG BREATH: a pair of lungs on a dark ground, the
 * bronchial tree branching into them; the lobes inflate with the swell
 * (a slow, smooth breath -- the scene clock adds a resting rhythm), the
 * alveoli are round cells carrying the photo, lit by the bands from the
 * bottom (bass) to the top (treble); the kick is the sidechain pump: a
 * dip of the light (never of the shape), read off on a gain-reduction
 * meter beside the lungs.  Camera fixed.
 *
 * Audio Reactivity:
 *   audioSwell        -> inflation (slow) and light
 *   audioKick         -> light dip (the duck) and the meter needle (light)
 *   audioSpectrum[32] -> alveoli brightness by height (light)
 *   sceneAdvance      -> the resting breath (continuous)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: depthP, cellP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float depthP;
uniform float cellP;
uniform float hueP;

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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float sdEllipse(vec2 p, vec2 c, vec2 r) { return (length((p - c) / r) - 1.0) * min(r.x, r.y); }

float segDist(vec2 p, vec2 a, vec2 b)
{
    vec2 d = b - a; float t = clamp(dot(p - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    return length(p - (a + d * t));
}

// One lung lobe (side = -1 left, +1 right) as a union of ellipses, scaled
// by the breath about its hilum.
float lungSD(vec2 p, float side, float breath)
{
    vec2 hilum = vec2(side * 0.1, 0.1);
    vec2 q = (p - hilum) / breath + hilum;
    float d = sdEllipse(q, vec2(side * 0.24, 0.05), vec2(0.17, 0.3));
    d = min(d, sdEllipse(q, vec2(side * 0.3, -0.12), vec2(0.15, 0.22)));
    d = min(d, sdEllipse(q, vec2(side * 0.16, 0.22), vec2(0.1, 0.14)));
    // The right lung is a little bigger; the left has the cardiac notch.
    if (side < 0.0) d = max(d, -sdEllipse(q, vec2(-0.05, -0.05), vec2(0.1, 0.12)));
    return d;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float depth = 0.1 + 0.12 * clamp(depthP, 0.0, 1.0);
    float cells = 26.0 + 14.0 * clamp(cellP, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rest = 0.5 + 0.5 * sin(sceneAdvance * 0.5 + sceneTime * 0.12);
    float breath = 1.0 + depth * (0.4 * rest + 0.6 * swell);
    float duck = 1.0 - 0.45 * audioKick;                                // the sidechain dip (light only)
    float light = (0.8 + 0.6 * swell) * duck;

    // The ground: the photo very dark, a cool vignette.
    vec3 col = img(gl_FragCoord.xy / resolution) * 0.2 * vec3(0.7, 0.8, 1.0);
    col *= 0.7 + 0.3 * (1.0 - length(p) * 0.8);
    // The lungs.
    float dL = lungSD(p, -1.0, breath);
    float dR = lungSD(p, 1.0, breath);
    float d = min(dL, dR);
    float body = smoothstep(0.006, 0.0, d);
    // Alveoli: round jittered cells carrying the photo, lit by the band at their height.
    vec2 g = p * cells;
    vec2 c = floor(g);
    vec2 f = fract(g) - 0.5;
    vec2 jit = vec2(hash21(c + 1.3), hash21(c + 5.9)) - 0.5;
    float r = length(f - jit * 0.5);
    float cell = smoothstep(0.42, 0.25, r);
    float hgt = clamp((p.y + 0.4) / 0.8, 0.0, 1.0);
    int b = int(hgt * 31.0);
    float en = clamp(audioSpectrum[b] * 1.6, 0.0, 1.0);
    vec3 tissue = imgPalette(hue * 0.159 + 0.05) * vec3(1.0, 0.55, 0.5) * 0.9;
    vec3 photo = img(clamp((c + 0.5) / cells / vec2(aspect, 1.0) + 0.5, 0.0, 1.0)) * mix(vec3(1.0), imgPalette(hue * 0.159 + hgt * 0.4), 0.5) * 1.3;
    vec3 lung = mix(tissue * 0.8, photo * (0.7 + 0.9 * en), cell);
    lung += tissue * (0.25 + 0.5 * en) * (1.0 - cell) * 0.5;
    // Shading: brighter toward the top and the outer edges.
    lung *= (0.7 + 0.3 * smoothstep(0.0, -0.08, d)) * light;
    lung += tissue * smoothstep(0.02, 0.0, abs(d)) * 0.8 * light;      // pleura rim
    col = mix(col, lung, body);
    // The bronchial tree: trachea down the middle, splitting into the lobes, three levels.
    vec3 tube = vec3(0.85, 0.8, 0.75) * light;
    float tr = segDist(p, vec2(0.0, 0.5), vec2(0.0, 0.14));
    float tube1 = smoothstep(0.022, 0.016, tr);
    col = mix(col, tube * (0.8 + 0.2 * sin(p.y * 200.0)), tube1);
    for (int s = -1; s <= 1; s += 2)
    {
        float side = float(s);
        vec2 hilum = vec2(side * 0.1, 0.1);
        vec2 a = vec2(0.0, 0.14);
        float d1 = segDist(p, a, hilum);
        col = mix(col, tube, smoothstep(0.016, 0.011, d1));
        // Secondary and tertiary bronchi fanning into the lobe, scaled by the breath.
        for (int k = 0; k < 4; ++k)
        {
            float ang = -0.9 + float(k) * 0.6;
            vec2 dir = vec2(side * cos(ang), sin(ang));
            vec2 tip = hilum + dir * 0.16 * breath;
            float d2 = segDist(p, hilum, tip);
            col = mix(col, tube * 0.9, smoothstep(0.009, 0.005, d2));
            for (int m = -1; m <= 1; m += 2)
            {
                vec2 dir3 = vec2(side * cos(ang + float(m) * 0.5), sin(ang + float(m) * 0.5));
                float d3 = segDist(p, tip, tip + dir3 * 0.08 * breath);
                col = mix(col, tube * 0.8, smoothstep(0.005, 0.002, d3));
            }
        }
    }
    // The gain-reduction meter at the right edge: a vertical bar dropping with the kick.
    vec2 mq = p - vec2(aspect * 0.5 - 0.09, 0.0);
    float frame = step(abs(mq.x), 0.03) * step(abs(mq.y), 0.3);
    float fill = step(abs(mq.x), 0.022) * step(mq.y, 0.28) * step(0.28 - 0.56 * audioKick, mq.y);
    vec3 meterCol = mix(vec3(0.2, 0.8, 0.3), vec3(1.0, 0.3, 0.2), clamp((0.28 - mq.y) / 0.56, 0.0, 1.0));
    col = mix(col, vec3(0.06), frame);
    col = mix(col, meterCol * 1.2, fill);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
