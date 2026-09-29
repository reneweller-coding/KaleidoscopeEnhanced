#version 330 core
out vec4 fragColor;
/**
 * @file PenguinHuddleRotation.frag
 * @brief PENGUIN HUDDLE ROTATION: emperor penguins huddled on the sea ice
 * in the polar twilight.  The huddle is a slowly turning mound of birds --
 * black heads, white fronts, the golden ear patches -- the ones at the
 * front drifting one way, the ones behind the other, so over minutes every
 * bird takes its turn at the cold edge.  The sky glows rose and violet
 * above a sun that never quite rises; blowing snow streams across in round
 * flakes, spindrift snakes over the sastrugi, and the warmth of the huddle
 * rises as a faint vapour lit by the low light.
 *
 * Replaces a Scene3D compute/indirect version (a dark ring of ovals).
 *
 * Audio Reactivity:
 *   audioSwell -> storm density (slow)
 *   audioBass  -> the warmth rising from the huddle (light)
 *   audioKick  -> a gust whitens the air for a moment (light)
 *   audioLevel -> brightness
 *   sceneTime / sceneAdvance -> the huddle's rotation, the snow (continuous)
 *
 * Per-activation variety: colonyP (huddle size), packP (how tight), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
uniform float colonyP;
uniform float packP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.9; a *= 0.5; }
    return v;
}

// One penguin, facing us, feet at the origin, height 1.  Returns colour
// in rgb and coverage in a.
vec4 penguin(vec2 q, float look, vec3 light)
{
    // Body: a tall egg; head: a round top; beak: a small wedge.
    float body = length((q - vec2(0.0, 0.38)) / vec2(0.26, 0.4)) - 1.0;
    float head = length((q - vec2(0.02 * look, 0.82)) / vec2(0.15, 0.14)) - 1.0;
    float shape = min(body * 0.26, head * 0.14);
    float a = smoothstep(0.012, -0.004, shape);
    if (a <= 0.0) return vec4(0.0);
    // White front narrowing to the chin, black back at the sides and head.
    float front = smoothstep(0.17, 0.12, abs(q.x - 0.03 * look) + 0.1 * smoothstep(0.55, 0.75, q.y)) * step(q.y, 0.74);
    vec3 c = mix(vec3(0.04, 0.045, 0.06), vec3(1.05, 1.03, 1.0), front);
    // Golden ear patches and the yellow flush on the upper breast.
    float ear = smoothstep(0.06, 0.03, length((vec2(abs(q.x - 0.02 * look), q.y) - vec2(0.11, 0.74)) * vec2(1.0, 0.6)));
    c = mix(c, vec3(1.0, 0.72, 0.15), ear);
    c = mix(c, vec3(1.0, 0.9, 0.55), smoothstep(0.1, 0.0, abs(q.y - 0.66)) * front * 0.6);
    // Beak: a dark wedge with the orange stripe.
    vec2 bq = q - vec2(0.02 * look + 0.07 * look, 0.79);
    float beak = smoothstep(0.02, 0.0, abs(bq.y + bq.x * 0.2 * look) - 0.012 * (1.0 - clamp(abs(bq.x) / 0.08, 0.0, 1.0))) * step(abs(bq.x), 0.08) * step(0.0, bq.x * look);
    c = mix(c, vec3(0.9, 0.45, 0.2), beak * 0.9);
    // Round shading and the low light from the right; frost on the head.
    float sh = 0.7 + 0.35 * smoothstep(-0.3, 0.3, q.x);
    c *= sh * light;
    c += vec3(0.8, 0.85, 1.0) * smoothstep(0.78, 0.95, q.y) * 0.12;
    return vec4(c, a);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    float colony = clamp(colonyP, 0.0, 1.0);
    float pack = clamp(packP, 0.0, 1.0);
    float horizon = -0.05;

    // Polar twilight: violet above, rose and gold at the horizon.
    vec3 col = mix(vec3(1.0, 0.72, 0.55), vec3(0.62, 0.52, 0.72), smoothstep(horizon, horizon + 0.25, p.y));
    col = mix(col, vec3(0.2, 0.25, 0.5), smoothstep(horizon + 0.2, 0.6, p.y));
    col = mix(col, col * imgPalette(0.9 + hue * 0.159) * 1.4, 0.1);
    col += vec3(1.0, 0.6, 0.35) * exp(-length((p - vec2(0.55, horizon)) * vec2(0.6, 2.0)) * 3.0) * 0.5;
    vec3 light = mix(vec3(0.75, 0.75, 0.9), vec3(1.0, 0.8, 0.7), 0.5) * (0.85 + 0.2 * swell);

    // The ice: blue-white, sastrugi ridges lit on their sunward faces.
    if (p.y < horizon) {
        float d = horizon - p.y;
        float z = 0.1 / d;
        vec2 g = vec2(p.x * z * 3.0, z * 2.0);
        float sas = fbm(vec2(g.x * 0.6 + g.y * 0.3, g.y * 2.0));
        vec3 ice = mix(vec3(0.55, 0.62, 0.8), vec3(0.95, 0.9, 0.92), smoothstep(0.35, 0.7, sas));
        ice = mix(ice, vec3(1.0, 0.8, 0.7), exp(-abs(p.x - 0.55) * 2.0) * exp(-d * 8.0) * 0.4);
        col = mix(ice, col, exp(-d * 30.0) * 0.6);
    }

    // The huddle: rings of birds on a slowly turning ellipse.  The nearest
    // bird covering a pixel wins (z = depth).
    vec2 hc = vec2(-0.05, horizon - 0.12);
    float R0 = 0.28 + 0.18 * colony;
    float bestZ = 1e9;
    vec4 pc = vec4(0.0);
    for (int ring = 0; ring < 4; ++ring) {
        float fr = float(ring);
        float R = R0 * (1.0 - 0.24 * fr);
        int n = 24 - 5 * ring;
        float spin = T * 0.012 * (1.0 + 0.25 * fr);
        for (int k = 0; k < 24; ++k) {
            if (k >= n) break;
            float fk = float(k);
            float th = spin + fk / float(n) * 6.2831853 + hash11(fk + fr * 31.0) * 0.12;
            float depth = sin(th);                               // -1 front .. 1 back
            vec2 foot = hc + vec2(R * cos(th) * 1.25, depth * R * 0.22 + fr * 0.035 * (1.0 - pack * 0.5));
            float sz = (0.16 + 0.02 * hash11(fk * 3.7 + fr)) * (1.0 - 0.18 * depth);
            vec2 q = (p - foot) / sz;
            if (abs(q.x) > 0.35 || q.y < -0.05 || q.y > 1.0) continue;
            float z = R * depth;                                // true depth: inner rings sit behind the front of the outer ones
            if (z > bestZ) continue;
            float look = (hash11(fk * 5.3 + fr) > 0.5) ? 1.0 : -1.0;
            vec4 pg = penguin(q, look, light * (0.9 - 0.25 * max(depth, 0.0)));
            if (pg.a > 0.5) { bestZ = z; pc = pg; }
            else if (pg.a > 0.0 && z < bestZ) { pc = vec4(mix(pc.rgb, pg.rgb, pg.a), max(pc.a, pg.a)); }
        }
    }
    col = mix(col, pc.rgb, pc.a);
    // Soft shadow of the huddle on the ice.
    col *= 1.0 - 0.25 * smoothstep(1.0, 0.6, length((p - hc - vec2(0.06, -0.035)) * vec2(0.8 / (R0 * 1.25), 1.0 / (R0 * 0.3)))) * (1.0 - pc.a);
    // Warmth rising: a faint lit vapour above the huddle.
    float vap = smoothstep(0.4, 0.8, fbm(vec2(p.x * 3.0, p.y * 4.0 - T * 0.1))) * exp(-abs(p.x - hc.x) / R0 * 1.5) * smoothstep(hc.y + 0.1, hc.y + 0.25, p.y) * exp(-(p.y - hc.y) * 3.0);
    col += vec3(1.0, 0.8, 0.65) * vap * (0.1 + 0.3 * clamp(audioBass, 0.0, 1.0));

    // Spindrift snaking low over the ice.
    float drift = smoothstep(0.5, 0.85, fbm(vec2(p.x * 3.0 - T * 0.6, p.y * 25.0))) * smoothstep(horizon - 0.05, horizon - 0.35, p.y) * (0.3 + 0.5 * swell);
    col = mix(col, vec3(0.95, 0.93, 1.0), drift * 0.5);
    // Blowing snow: round flakes streaming across, in three depths.
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        vec2 sq = p * (30.0 - 7.0 * fl) + vec2(-T * (1.6 + 0.8 * fl), T * 0.15 + fl * 13.0);
        vec2 si = floor(sq), sf = fract(sq) - 0.5;
        vec2 off = (vec2(hash21(si + 1.0), hash21(si + 2.0)) - 0.5) * 0.6;
        float fl_ = smoothstep(0.1 + 0.03 * fl, 0.02, length((sf - off) * vec2(0.6, 1.0))) * step(1.0 - (0.08 + 0.3 * swell), hash21(si + fl));
        col = mix(col, vec3(1.0), fl_ * 0.8);
    }
    col = mix(col, vec3(0.95, 0.95, 1.0), clamp(audioKick, 0.0, 1.0) * 0.18);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
