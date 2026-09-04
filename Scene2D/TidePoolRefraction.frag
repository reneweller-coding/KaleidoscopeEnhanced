#version 330 core
out vec4 fragColor;
/**
 * @file TidePoolRefraction.frag
 * @brief TIDE POOL REFRACTION: a rock pool from directly above.  The
 * floor of the pool -- anemones, urchins, weed, the photo as its rock --
 * is seen through a rippling surface that refracts it, so everything
 * below sways while the rim stays still.  The tide breathes with the
 * swell (the water level rises and the pool widens), sun caustics move
 * across the floor on the scene clock, and the treble is the glitter on
 * the surface.  Camera fixed above the pool.
 *
 * Audio Reactivity:
 *   audioSwell   -> tide level: pool size and depth (slow)
 *   sceneAdvance -> ripples and caustics (continuous)
 *   audioHigh    -> surface glitter (light)
 *   audioChroma[12] -> the anemone colours (light)
 *   audioKick    -> an anemone contracts (light and a gentle pull, smooth)
 *
 * Per-activation variety: lifeP, rippleP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float lifeP;
uniform float rippleP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 4.3; a *= 0.5; } return v; }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float life = 0.4 + 0.9 * clamp(lifeP, 0.0, 1.0);
    float rip = 0.5 + 0.9 * clamp(rippleP, 0.0, 1.0);
    float tide = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The pool outline: a lobed shape that grows a little with the tide.
    float ang = atan(p.y, p.x);
    float rr = length(p);
    float edge = (0.3 + 0.05 * tide) * (1.0 + 0.16 * sin(ang * 3.0 + 0.7) + 0.1 * sin(ang * 5.0 - 1.3));
    float inPool = smoothstep(edge + 0.012, edge - 0.012, rr);
    float depth = smoothstep(edge, 0.0, rr) * (0.55 + 0.45 * tide);      // deeper in the middle

    // The rock around the pool: the photo, dry above the waterline, wet
    // and dark just outside it.
    vec3 rock = img(uv * 1.3) * mix(vec3(0.6, 0.55, 0.5), imgPalette(hue * 0.159 + 0.1), 0.3);
    rock *= 0.7 + 0.5 * fbm(p * 16.0);
    // Barnacles and lichen: fine round speckle on the dry rock.
    vec2 bg = p * 90.0; vec2 bc = floor(bg); vec2 bf = fract(bg) - 0.5;
    vec2 bj = vec2(hash21(bc + 1.9), hash21(bc + 7.3)) - 0.5;
    float barn = smoothstep(0.26, 0.1, length(bf - bj * 0.7)) * step(0.72, hash21(bc));
    rock = mix(rock, vec3(0.82, 0.8, 0.75), barn * 0.55);
    rock *= 0.75 + 0.4 * smoothstep(edge, edge + 0.09, rr);              // wet ring outside the pool
    vec3 col = rock;

    // The floor of the pool, seen through the refracting surface.  The
    // ripple field displaces the sample point; the deeper the water, the
    // stronger the displacement -- which is what makes the middle sway
    // most and the rim stay put.
    vec2 rippleUV = p * 9.0;
    float w1 = fbm(rippleUV + vec2(clock * 0.35, clock * 0.2));
    float w2 = fbm(rippleUV * 1.7 - vec2(clock * 0.28, clock * 0.16));
    vec2 disp = vec2(w1 - 0.5, w2 - 0.5) * (0.05 * rip) * depth;
    vec2 fl = p + disp;
    // The pool floor: sand and rock from the photo, cooler and greener.
    vec3 floorCol = img(clamp(fl * 1.1 + 0.5, 0.0, 1.0)) * mix(vec3(0.35, 0.55, 0.5), imgPalette(hue * 0.159 + 0.45), 0.35);
    floorCol *= 0.7 + 0.5 * fbm(fl * 22.0);
    // Weed: dark fronds waving with the same displacement.
    float weed = smoothstep(0.55, 0.8, fbm(fl * 7.0 + vec2(0.0, clock * 0.1)));
    floorCol = mix(floorCol, mix(vec3(0.1, 0.22, 0.12), imgPalette(hue * 0.159 + 0.32) * 0.3, 0.4), weed * 0.7);
    // Anemones: discs with a ring of round tentacle tips, one chroma class
    // each; the kick pulls them in a little (smooth, never a snap).
    for (int i = 0; i < 9; ++i)
    {
        float fi = float(i);
        if (fi >= 3.0 + floor(life * 6.0)) break;
        vec2 c = vec2((hash11(fi * 3.1) - 0.5) * 0.42, (hash11(fi * 5.7) - 0.5) * 0.42);
        int cls = int(mod(fi * 3.0 + 2.0, 12.0));
        float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
        vec3 ac = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.5 + 0.15;
        float contract = 1.0 - 0.25 * smoothstep(0.05, 0.6, audioKick);
        float baseR = (0.035 + 0.025 * hash11(fi * 7.7)) * contract;
        vec2 q = fl - c;
        float d = length(q);
        float disc = smoothstep(baseR, baseR * 0.6, d);
        floorCol = mix(floorCol, ac * (0.5 + 0.7 * e), disc * 0.9);
        // Tentacles: round tips on a ring, waving with the ripple.
        float ta = atan(q.y, q.x);
        float tips = 0.0;
        for (int k = 0; k < 12; ++k)
        {
            float fk = float(k);
            float a2 = fk / 12.0 * 6.2831853 + hash11(fi) * 6.28;
            float len = baseR * (1.5 + 0.35 * sin(clock * 1.3 + fk + fi));
            vec2 tp = c + vec2(cos(a2), sin(a2)) * len;
            tips = max(tips, smoothstep(baseR * 0.32, baseR * 0.12, length(fl - tp)));
        }
        floorCol += ac * tips * (0.4 + 0.9 * e) * 0.9;
    }
    // Water colour and depth shading over the floor.
    vec3 water = mix(floorCol, mix(vec3(0.1, 0.32, 0.35), imgPalette(hue * 0.159 + 0.5) * 0.35, 0.4), depth * 0.55);
    // Caustics: the sun's net on the floor, moving on the clock.
    float ca = fbm(fl * 13.0 + vec2(clock * 0.4, -clock * 0.3));
    float caustic = pow(smoothstep(0.45, 0.85, ca), 2.0);
    water += mix(vec3(1.0, 0.97, 0.85), imgPalette(hue * 0.159 + 0.1), 0.3) * caustic * (0.35 + 0.3 * depth) * 0.9;
    col = mix(col, water, inPool);
    // The surface: sky reflection near the rim, glitter on the treble.
    float sheen = smoothstep(0.3, 0.9, w1) * inPool;
    col += mix(vec3(0.7, 0.85, 1.0), imgPalette(hue * 0.159 + 0.6), 0.3) * sheen * 0.22;
    vec2 gg = p * 120.0; vec2 gc = floor(gg); vec2 gf = fract(gg) - 0.5;
    vec2 gj = vec2(hash21(gc + 3.3), hash21(gc + 9.7)) - 0.5;
    float glint = smoothstep(0.22, 0.07, length(gf - gj * 0.7)) * step(0.93, hash21(gc + floor(clock * 2.0) * 0.0));
    col += vec3(1.0) * glint * inPool * hi * 0.8;
    // The waterline: a bright meniscus right at the rim.
    col += mix(vec3(0.9, 0.95, 1.0), imgPalette(hue * 0.159 + 0.55), 0.3)
         * smoothstep(0.014, 0.0, abs(rr - edge)) * (0.3 + 0.4 * tide);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
