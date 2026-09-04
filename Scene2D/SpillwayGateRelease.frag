#version 330 core
out vec4 fragColor;
/**
 * @file SpillwayGateRelease.frag
 * @brief SPILLWAY GATE RELEASE: the face of a dam with radial gates.  As
 * the swell rises the gates lift and the water goes over the crest in
 * smooth glassy sheets that break into white further down; spray hangs in
 * front of the face as round droplets and a rainbow stands in it.  Each
 * gate takes one chroma class for the light on its pier.  The kick is a
 * surge in the plunge pool, felt as light on the foam, not as a jolt.
 * Camera fixed downstream.
 *
 * Audio Reactivity:
 *   audioSwell      -> gate opening: how much water goes over (slow)
 *   sceneAdvance    -> the fall, the spray, the plunge pool (continuous)
 *   audioChroma[12] -> the pier lights (light)
 *   audioKick       -> a surge lighting the foam (light)
 *   audioHigh       -> spray sparkle (light)
 *
 * Per-activation variety: gatesP, sprayP, hueP.
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
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float gatesP;
uniform float sprayP;
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
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.02 + 3.9; a *= 0.5; } return v; }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float gates = 3.0 + floor(clamp(gatesP, 0.0, 1.0) * 3.0);           // once per activation
    float sprayAmt = 0.4 + 0.9 * clamp(sprayP, 0.0, 1.0);
    float open = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.8 + sceneTime * 0.16;

    float crest = 0.28;                                                  // the spillway crest
    float pool = -0.3;                                                   // the plunge pool surface

    // Sky over the dam, and the reservoir just visible above the crest.
    vec3 sky = img(vec2(uv.x, 0.7 + uv.y * 0.3)) * mix(vec3(0.7, 0.78, 0.95), imgPalette(hue * 0.159 + 0.6), 0.3);
    vec3 col = sky * (0.7 + 0.4 * open);
    // The concrete face: a curved ogee, darker as it goes down.
    float onFace = step(p.y, crest) * step(pool, p.y);
    vec3 face = img(clamp(vec2(uv.x * 1.4, 0.2 + uv.y * 0.4), 0.0, 1.0))
              * mix(vec3(0.6, 0.6, 0.58), imgPalette(hue * 0.159 + 0.05), 0.2);
    face *= 0.55 + 0.4 * fbm(p * 22.0);
    face *= 0.6 + 0.5 * smoothstep(pool, crest, p.y);
    col = mix(col, face, onFace);

    // The bays: between the piers the water goes over.
    float pitch = aspect * 2.0 / gates;
    float bayI = floor((p.x + aspect) / pitch);
    float bayF = fract((p.x + aspect) / pitch) - 0.5;
    float pier = smoothstep(0.42, 0.46, abs(bayF));                      // 1 on a pier
    int cls = int(mod(bayI * 3.0 + 1.0, 12.0));
    float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
    vec3 lc = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.5 + 0.15;

    // The gate: a radial arm hanging over the bay; it lifts with the swell.
    float lift = 0.05 + 0.18 * open * (0.75 + 0.25 * hash11(bayI * 3.3));
    float gateBottom = crest + lift;
    float gateTop = crest + 0.3;
    float onGate = (1.0 - pier) * step(gateBottom, p.y) * step(p.y, gateTop);
    vec3 gateCol = mix(vec3(0.3, 0.35, 0.32), imgPalette(hue * 0.159 + 0.4), 0.25);
    gateCol *= 0.7 + 0.4 * smoothstep(gateBottom, gateTop, p.y);
    // Radial ribs across the gate.
    gateCol *= 0.85 + 0.3 * smoothstep(0.04, 0.12, abs(fract(bayF * 8.0) - 0.5));
    col = mix(col, gateCol * (0.6 + 0.4 * open), onGate);

    // The sheet: from the crest down the face, in the bays only.
    float flowMask = (1.0 - pier) * step(p.y, crest) * step(pool - 0.02, p.y);
    if (flowMask > 0.01)
    {
        float fall = (crest - p.y);                                      // how far it has fallen
        // The glassy part near the crest: smooth, with the nappe's curve.
        float glassy = smoothstep(0.16, 0.0, fall);
        // The broken part: white water, more and more with the fall.
        float turb = fbm(vec2(bayF * 12.0 + bayI * 3.0, p.y * 14.0 - clock * 2.2));
        float white = smoothstep(0.05, 0.4, fall) * (0.45 + 0.75 * turb);
        // Streaks running down the sheet.
        float streak = 0.5 + 0.5 * sin(bayF * 90.0 + turb * 6.0);
        vec3 waterCol = mix(mix(vec3(0.4, 0.6, 0.72), imgPalette(hue * 0.159 + 0.5), 0.3),
                            vec3(0.95, 0.97, 1.0), clamp(white, 0.0, 1.0));
        waterCol *= 0.6 + 0.5 * streak * glassy + 0.4 * white;
        // How much water there is: the opening.
        float amount = (0.45 + 0.55 * smoothstep(0.02, 0.45, open)) * (0.6 + 0.4 * hash11(bayI * 5.7));
        col = mix(col, waterCol, flowMask * clamp(amount * (0.5 + 0.8 * glassy + 0.7 * white), 0.0, 0.96));
        // The crest line itself catches the light.
        col += vec3(1.0) * smoothstep(0.01, 0.0, abs(p.y - crest)) * flowMask * amount * 0.6;
    }
    // The plunge pool: churning white water, lit by the kick as a surge.
    float onPool = step(p.y, pool + 0.02);
    if (onPool > 0.5)
    {
        float churn = fbm(vec2(p.x * 7.0, p.y * 12.0 + clock * 1.1));
        vec3 poolCol = mix(mix(vec3(0.25, 0.45, 0.55), imgPalette(hue * 0.159 + 0.5), 0.3),
                           vec3(0.92, 0.96, 1.0), smoothstep(0.35, 0.75, churn) * (0.5 + 0.5 * open));
        poolCol *= 0.6 + 0.5 * churn;
        poolCol += vec3(1.0, 0.98, 0.95) * smoothstep(0.6, 0.9, churn) * (0.15 + 0.7 * audioKick);
        col = mix(col, poolCol, onPool);
    }
    // Spray: round droplets hanging in front of the face, densest at the pool.
    for (int layer = 0; layer < 2; ++layer)
    {
        float fl = float(layer);
        float scale = 28.0 + fl * 20.0;
        vec2 g = (p + vec2(sin(clock * 0.5 + fl) * 0.02, -clock * (0.05 + 0.03 * fl))) * scale + fl * 13.0;
        vec2 c = floor(g); vec2 f = fract(g) - 0.5;
        vec2 j = vec2(hash21(c + 1.3), hash21(c + 5.9)) - 0.5;
        float d = length(f - j * 0.7);
        float near = smoothstep(-0.5, 0.15, p.y - pool) * smoothstep(0.45, 0.0, p.y - pool);
        float drop = smoothstep(0.2, 0.06, d) * step(1.0 - 0.16 * sprayAmt * (0.4 + 0.8 * open), hash21(c + fl * 7.7));
        col += vec3(0.95, 0.98, 1.0) * drop * (0.35 + 0.6 * near) * (0.4 + 0.8 * hi) * 0.8;
    }
    // A rainbow standing in the spray, low over the pool.
    float rb = length(p - vec2(-0.15, pool - 0.1));
    float band = smoothstep(0.02, 0.0, abs(rb - 0.42));
    vec3 rainbow = vec3(0.5 + 0.5 * cos((rb - 0.42) * 90.0),
                        0.5 + 0.5 * cos((rb - 0.42) * 90.0 - 2.094),
                        0.5 + 0.5 * cos((rb - 0.42) * 90.0 - 4.188));
    col += rainbow * smoothstep(0.06, 0.0, abs(rb - 0.42)) * step(pool - 0.1, p.y) * open * 0.35;
    // The pier lights, one class each.
    for (int i = 0; i < 6; ++i)
    {
        float fi = float(i);
        if (fi > gates) break;
        float px = (fi / gates) * aspect * 2.0 - aspect;
        int c2 = int(mod(fi * 3.0 + 1.0, 12.0));
        float e2 = clamp(audioChroma[c2] * 1.6, 0.0, 1.0);
        vec3 l2 = imgPalette(hue * 0.159 + float(c2) / 12.0) * 1.5 + 0.15;
        vec2 lp = vec2(px, crest + 0.33);
        col += l2 * (smoothstep(0.018, 0.006, length(p - lp)) * 1.6 + exp(-length(p - lp) * 12.0) * 0.5) * (0.25 + 0.9 * e2);
    }
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
