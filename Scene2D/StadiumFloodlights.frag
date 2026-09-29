#version 330 core
out vec4 fragColor;
/**
 * @file StadiumFloodlights.frag
 * @brief STADIUM FLOODLIGHTS: an empty football stadium on a rainy night --
 * the four great floodlight masts at the corners, each a tall lattice
 * tower carrying a banked grid of lamps, their beams cutting down through
 * the drizzle and mist as solid white cones that meet over the pitch; the
 * rain shows up as silver streaks in the light and falls away into dark
 * outside it.  The stands curve round in shadow, rows of empty seats; the
 * wet green pitch shines with the reflections of the lamps.  The camera
 * stands still in the top of the stand.
 *
 * Audio Reactivity:
 *   audioKick   -> the lamp banks brighten (light)
 *   audioSwell  -> the mist in the beams (slow)
 *   audioHigh   -> the glitter of the rain in the beams (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the rain falling, the mist drifting
 *
 * Per-activation variety: rainP (how hard it rains), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float rainP;
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float px = 1.0 / resolution.y;
    float rain = 0.4 + 0.6 * clamp(rainP, 0.0, 1.0);

    // Night sky, low cloud lit faintly by the stadium.
    vec3 col = mix(vec3(0.05, 0.05, 0.07), vec3(0.015, 0.015, 0.025), smoothstep(0.0, 0.5, p.y));
    col += vec3(0.15, 0.15, 0.17) * fbm(vec2(p.x * 2.0 + T * 0.01, p.y * 3.0)) * smoothstep(0.5, 0.1, p.y) * 0.4;

    // The pitch: a rectangle in perspective, seen from the upper stand.
    float yN = -0.46, yF = -0.06;
    float tq = clamp((p.y - yN) / (yF - yN), 0.0, 1.0);
    float halfW = mix(0.66, 0.36, tq);
    float wz = tq / (tq + (1.0 - tq) * 1.9);                  // perspective-corrected depth 0 near .. 1 far
    vec2 pq = vec2(p.x / halfW, wz);
    float inP = smoothstep(1.0 + px * 3.0 / halfW, 1.0 - px * 3.0 / halfW, abs(pq.x)) * step(yN, p.y) * step(p.y, yF);
    float stripes = 0.5 + 0.5 * sign(sin(pq.y * 3.14159 * 12.0));
    vec3 grass = mix(vec3(0.07, 0.28, 0.09), vec3(0.1, 0.35, 0.12), stripes);
    // Pitch markings: halfway line, centre circle, touchlines, the boxes.
    vec2 m = vec2(pq.x * 1.55, (pq.y - 0.5) * 2.2);
    float fwM = fwidth(m.y) * 1.5 + 0.004;
    float lines = smoothstep(fwM, 0.0, abs(m.y)) + smoothstep(fwM * 1.5, 0.0, abs(length(m) - 0.2))
                + smoothstep(0.02, 0.0, abs(abs(pq.x) - 0.97)) + smoothstep(fwM, 0.0, abs(abs(m.y) - 1.08)) * step(abs(pq.x), 0.98)
                + smoothstep(fwM, 0.0, abs(abs(m.y) - 0.85)) * step(abs(m.x), 0.62) + smoothstep(0.012, 0.0, abs(abs(m.x) - 0.62)) * step(0.85, abs(m.y)) * step(abs(m.y), 1.08);
    grass = mix(grass, vec3(0.85), clamp(lines, 0.0, 1.0) * 0.8);
    // The stands all around: rows of seats parallel to the pitch, dark.
    float dS = max(abs(pq.x) - 1.0, max(yN - p.y, p.y - yF) * 3.0);
    float rows = 0.5 + 0.5 * sin(dS * 160.0);
    vec3 stand = mix(vec3(0.03, 0.03, 0.05), vec3(0.08, 0.06, 0.12), rows * 0.6);
    stand = mix(stand, stand * imgPalette(0.7 + hueP * 0.159) * 2.0, 0.2);
    float pitch = inP;
    vec3 ground = mix(stand, grass, pitch);
    // The stand's top edge: the far roof line against the sky.
    float bowl = smoothstep(px * 2.0, -px * 2.0, p.y - (0.02 + 0.06 * p.x * p.x));
    col = mix(col, ground, bowl);
    // The four masts: two at the far corners (small), two at the near ones (tall).
    vec2 lamps[4];
    lamps[0] = vec2(-0.5, 0.26);
    lamps[1] = vec2(0.5, 0.26);
    lamps[2] = vec2(-0.78, 0.42);
    lamps[3] = vec2(0.78, 0.42);
    vec2 foots[4];
    foots[0] = vec2(-0.5, 0.02);
    foots[1] = vec2(0.5, 0.02);
    foots[2] = vec2(-0.8, -0.3);
    foots[3] = vec2(0.8, -0.3);
    float I = 0.9 + 0.8 * kick;
    vec3 lampC = vec3(1.0, 0.98, 0.94);
    vec3 beams = vec3(0.0);
    float lit = 0.0;
    for (int i = 0; i < 4; ++i) {
        vec2 L = lamps[i];
        float s = (i < 2) ? 0.6 : 1.0;
        // The lattice mast.
        float mast = sdSeg(p, foots[i], L) - 0.006 * s;
        float lattice = step(0.5, fract((p.y - foots[i].y) * 60.0 / s)) * 0.5 + 0.5;
        col = mix(col, vec3(0.06, 0.06, 0.07) * lattice, smoothstep(px, -px, mast));
        // The lamp bank: a grid of bright lamps.
        vec2 bq = (p - L) / s;
        float bank = step(abs(bq.x), 0.06) * step(abs(bq.y), 0.03);
        vec2 lg = fract(bq * vec2(50.0, 50.0)) - 0.5;
        float lamp = smoothstep(0.35, 0.2, length(lg)) * bank;
        col = mix(col, vec3(0.05), bank * 0.8);
        col += lampC * lamp * 2.0 * I;
        col += lampC * exp(-length(bq) * 12.0) * 0.3 * I;
        // The beam: a cone from the bank down toward the centre of the pitch.
        vec2 target = vec2(-0.1 * sign(L.x), -0.24);
        vec2 dir = normalize(target - L);
        vec2 rel = p - L;
        float along = dot(rel, dir);
        float across = abs(dot(rel, vec2(-dir.y, dir.x)));
        float spread = 0.04 * s + along * 0.32;
        float cone = smoothstep(spread, spread * 0.3, across) * step(0.0, along);
        float mist = (0.5 + 0.5 * fbm(p * 4.0 + vec2(T * 0.03, -T * 0.02))) * (0.5 + 0.7 * swell);
        beams += lampC * cone * exp(-along * 0.9) * mist * 0.22 * I;
        lit += cone * exp(-along * 1.0);
    }
    col += beams;
    // Reflections of the lamps in the wet pitch.
    col += lampC * 0.08 * pitch * (0.5 + 0.5 * noise2(p * vec2(40.0, 120.0))) * clamp(lit, 0.0, 1.0);
    // Rain: silver streaks visible where the beams light it.
    {
        vec2 rq = vec2(p.x + p.y * 0.08, p.y) * vec2(160.0, 5.0) + vec2(0.0, T * 6.0);
        vec2 ri = floor(rq), rf = fract(rq);
        float streak = step(1.0 - 0.18 * rain, hash21(ri)) * smoothstep(0.14, 0.0, abs(rf.x - 0.5)) * smoothstep(0.0, 0.3, rf.y) * smoothstep(1.0, 0.6, rf.y);
        col += vec3(0.85, 0.88, 0.95) * streak * clamp(lit * 1.5, 0.0, 1.0) * (0.25 + 0.6 * hi);
        col += vec3(0.5) * streak * 0.02;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
