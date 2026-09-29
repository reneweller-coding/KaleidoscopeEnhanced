#version 330 core
out vec4 fragColor;
/**
 * @file IcebergWaterline.frag
 * @brief ICEBERG WATERLINE: the split view of an over-under photograph --
 * the camera half in the water.  Above the waterline a white berg under a
 * pale polar sky, its faces lit by a low sun, blue in the crevasses; below
 * it the nine tenths, vast and glowing turquoise, fading into the deep
 * blue, sun rays slanting down through the water, round bubbles rising
 * along the ice.  The waterline itself wobbles as a bright meniscus with
 * the slow swell.  Camera fixed; the sea and the light move.
 *
 * Audio Reactivity:
 *   audioSwell   -> sunlight and rays (slow)
 *   sceneAdvance -> bubbles, waves, rays (continuous)
 *   audioKick    -> light in the ice's cracks (light)
 *   audioBass    -> deep-water glow (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: massP (underwater size), tiltP (berg shape), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;
uniform float massP;
uniform float tiltP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
float ridged(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { float n = 1.0 - abs(2.0 * noise2(p) - 1.0); v += a * n * n; p = mat2(1.6, 1.2, -1.2, 1.6) * p + 5.1; a *= 0.5; }
    return v;
}

// The berg above water: height of its top edge at x (below 0 = no ice).
float bergTop(float x, float tilt)
{
    float w = 0.55;
    float env = 1.0 - pow(abs(x + 0.05 * tilt) / w, 2.0);
    if (env <= 0.0) return -1.0;
    return 0.34 * sqrt(env) * (0.55 + 0.6 * ridged(vec2(x * 3.0, tilt * 4.0))) + 0.04 * (fbm(vec2(x * 12.0, 1.0)) - 0.5);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mass = clamp(massP, 0.0, 1.0);
    float tilt = clamp(tiltP, 0.0, 1.0) * 2.0 - 1.0;
    float T = sceneTime + sceneAdvance * 0.5;

    // The waterline: a slow swell across the lens.
    float wl = 0.08 + 0.012 * sin(p.x * 3.0 - T * 0.9) + 0.006 * sin(p.x * 9.0 + T * 1.4);
    vec3 sunDir = normalize(vec3(-0.6, 0.45, 0.4));
    vec3 col;

    if (p.y > wl) {
        // --- Above: polar sky and the berg ---
        float y = p.y - wl;
        vec3 sky = mix(vec3(0.78, 0.88, 0.98), vec3(0.28, 0.52, 0.9), smoothstep(0.0, 0.45, y));
        sky = mix(sky, imgPalette(0.55 + hue * 0.159) * 1.1, 0.1);
        sky += vec3(1.0, 0.9, 0.75) * exp(-length(p - vec2(-0.75, 0.42)) * 3.5) * (0.35 + 0.3 * swell);
        // Thin high cloud.
        sky = mix(sky, vec3(1.0), smoothstep(0.55, 0.85, fbm(vec2(p.x * 2.0 + T * 0.004, y * 6.0))) * 0.35);
        col = sky;
        float top = bergTop(p.x, tilt);
        if (y < top) {
            // Faces: normal from the ridged relief of the face.
            // Faces: vertical fluting and blocky facets, and the berg's
            // round bulk turning away from the sun on the right.
            vec2 fq = vec2(p.x * 7.0, y * 2.2);
            float h0 = fbm(fq), hx = fbm(fq + vec2(0.03, 0.0)), hy = fbm(fq + vec2(0.0, 0.03));
            vec3 n = normalize(vec3((h0 - hx) * 9.0, (h0 - hy) * 4.0, 1.0));
            float bulk = clamp((p.x + 0.05 * tilt) / 0.55, -1.0, 1.0);
            n = normalize(n + vec3(bulk * 0.9, 0.25, 0.0));
            float dif = max(dot(n, sunDir), 0.0);
            vec3 ice = mix(vec3(0.3, 0.55, 0.8), vec3(1.15, 1.17, 1.2), smoothstep(-0.1, 0.9, dif));
            // Crevasses: deep blue lines.
            float crev = smoothstep(0.9, 1.0, ridged(vec2(p.x * 9.0, y * 1.5) + 7.0));
            ice = mix(ice, vec3(0.1, 0.35, 0.7), crev * 0.7);
            ice += vec3(0.6, 0.9, 1.0) * crev * clamp(audioKick, 0.0, 1.0) * 0.8;
            ice *= 0.85 + 0.3 * swell;
            // Soft edge against the sky.
            col = mix(col, ice, smoothstep(0.0, 0.004, top - y));
        }
    } else {
        // --- Below: the vast glowing mass in blue water ---
        float y = wl - p.y;                                 // depth below the line
        vec3 deep = vec3(0.0, 0.05, 0.14);
        vec3 shallow = mix(vec3(0.05, 0.45, 0.6), imgPalette(0.5 + hue * 0.159) * 0.6, 0.12);
        vec3 water = mix(shallow, deep, smoothstep(0.0, 0.55, y));
        water += vec3(0.0, 0.08, 0.15) * clamp(audioBass, 0.0, 1.0);
        // Sun rays slanting down.
        float rx = p.x + y * 0.5;
        float rays = pow(fbm(vec2(rx * 7.0 + T * 0.05, T * 0.02)), 3.0) * exp(-y * 3.0);
        water += vec3(0.4, 0.8, 0.9) * rays * (0.6 + 0.7 * swell);
        col = water;
        // The submerged ice: much wider and deeper than the top.
        float w = 0.62 + 0.3 * mass;
        float d = 0.38 + 0.35 * mass;
        float nx = p.x + 0.08 * tilt * y;
        float shape = 1.0 - pow(abs(nx) / (w * (1.0 - 0.35 * pow(y / d, 1.5))), 2.2) - pow(y / d, 3.0);
        shape += 0.35 * (fbm(vec2(p.x * 2.5, y * 2.5) + 3.0) - 0.5) + 0.12 * (ridged(vec2(p.x * 6.0, y * 6.0)) - 0.5);
        if (shape > 0.0) {
            // Light comes down through the ice: bright turquoise near the
            // surface, deep glacial blue lower; ripple caustics on it.
            vec3 iceU = mix(vec3(0.4, 0.95, 0.95), vec3(0.08, 0.35, 0.7), smoothstep(0.0, d, y));
            float caus = pow(1.0 - abs(2.0 * fbm(vec2(p.x * 8.0 + T * 0.2, y * 6.0 - T * 0.15)) - 1.0), 8.0);
            iceU += vec3(0.6, 1.0, 1.0) * caus * exp(-y * 4.0) * 0.35 * (0.7 + 0.5 * swell);
            float relief = ridged(vec2(p.x * 4.0, y * 4.0) + 11.0);
            iceU *= 0.75 + 0.35 * relief;
            // Water between the lens and the ice veils it with depth.
            iceU = mix(iceU, water, smoothstep(0.1, 0.7, y) * 0.5);
            col = mix(col, iceU, smoothstep(0.0, 0.02, shape));
        }
        // Bubbles: round, rising along the ice.
        for (int k = 0; k < 14; ++k) {
            float fk = float(k);
            float bx = (hash21(vec2(fk, 1.0)) - 0.5) * aspect * 0.9;
            float period = 7.0 + 5.0 * hash21(vec2(fk, 2.0));
            float ph = fract(T / period + hash21(vec2(fk, 3.0)));
            vec2 bc = vec2(bx + 0.015 * sin(T * 2.0 + fk), -0.5 + ph * (0.5 + wl));
            float br = 0.004 + 0.007 * hash21(vec2(fk, 4.0));
            float bd = length(p - bc);
            float ring = smoothstep(br, br * 0.6, bd) - smoothstep(br * 0.6, br * 0.2, bd) * 0.7;
            col += vec3(0.8, 1.0, 1.0) * ring * 0.6;
        }
        // Looking up at the surface from below: a bright rippled underside.
        col += vec3(0.6, 0.9, 1.0) * exp(-y * 60.0) * 0.5;
    }
    // The meniscus: a bright wobbling line where the lens is half wet.
    col += vec3(0.9, 1.0, 1.0) * exp(-abs(p.y - wl) * 400.0) * 0.6;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
