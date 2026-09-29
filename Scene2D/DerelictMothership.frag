#version 330 core
out vec4 fragColor;
/**
 * @file DerelictMothership.frag
 * @brief DERELICT MOTHERSHIP: an enormous dead ship hangs across the sky
 * above a blue-limbed planet.  Its hull runs out of frame on both sides,
 * plated and greebled, lit along its upper edge by the planet's glow; great
 * breaches have torn the plating open, and inside the exposed ribs a few
 * emergency lights still burn orange.  Running lights along the keel pulse
 * slowly, debris tumbles in the foreground.  The ship drifts with glacial
 * slowness; the music is the dying light inside it.
 *
 *   sceneTime/sceneAdvance -> the drift of ship and debris (continuous)
 *   audioKick     -> the surviving lights pulse (light only, smooth)
 *   audioSwell    -> planet glow and haze (slow)
 *   audioChromaHue-> photo tint of the lighting
 *
 * Per-activation variety:
 *   hullP float ship size (0.98..1.5)
 *   glowP float brightness of the lights (0.6..1.38)
 *   debrisP float amount of debris (0.5..1.5)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioValence;
uniform float audioChromaHue;

uniform float hullP;
uniform float glowP;
uniform float debrisP;
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

// Plating: nested rectangular panels (three levels of greebles).
vec2 plating(vec2 s)
{
    float tone = 0.0, seam = 1.0;
    vec2 q = s;
    for (int L = 0; L < 3; ++L) {
        vec2 cell = vec2(1.0, 0.5) * (1.0 + float(L)) * 6.0;
        vec2 g = q * cell;
        vec2 gi = floor(g), gf = fract(g);
        float h = hash21(gi + float(L) * 17.0);
        tone += (h - 0.5) * (0.35 / (1.0 + float(L)));
        float e = min(min(gf.x, 1.0 - gf.x) / cell.x * 60.0, min(gf.y, 1.0 - gf.y) / cell.y * 60.0);
        seam = min(seam, smoothstep(0.0, 0.08 * (1.0 + float(L)), e));
        q += vec2(0.37, 0.19) * float(L + 1);
    }
    return vec2(tone, seam);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hp = (hullP > 0.01) ? hullP : 1.2;
    float gp = (glowP > 0.01) ? glowP : 1.0;
    float dbp = (debrisP > 0.01) ? debrisP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;

    vec3 glowC = mix(vec3(0.35, 0.6, 1.0), imgPalette(0.55 + hue * 0.159), 0.2);
    vec3 emberC = mix(vec3(1.0, 0.5, 0.15), imgPalette(0.1 + hue * 0.159), 0.2);

    // Space, a nebula haze, and the planet below with its blue limb.
    vec3 col = vec3(0.006, 0.006, 0.014);
    col += vec3(0.12, 0.05, 0.14) * smoothstep(0.45, 0.8, fbm(p * 1.5 + 4.0)) * 0.6;
    {
        vec2 g = p * 70.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * vec2(hash21(gi + 1.0), hash21(gi + 2.0));
        col += vec3(0.9, 0.9, 1.0) * smoothstep(0.1, 0.0, length(gf - c)) * step(0.975, hash21(gi)) * 0.6;
    }
    vec2 pc = vec2(-0.25, -2.05);
    float pr = 1.75;
    float pd = length(p - pc);
    if (pd < pr) {
        vec2 pq = (p - pc) / pr;
        float cloud = fbm(pq * 6.0 + vec2(T * 0.003, 0.0));
        vec3 surf = mix(vec3(0.05, 0.14, 0.3), vec3(0.8, 0.85, 0.9), smoothstep(0.5, 0.75, cloud));
        float lit = smoothstep(-0.4, 0.8, pq.x * 0.6 + pq.y);
        col = surf * lit * (0.5 + 0.4 * swell);
    }
    col += glowC * exp(-abs(pd - pr) * 40.0) * (0.6 + 0.4 * swell);
    col += glowC * exp(-max(pd - pr, 0.0) * 6.0) * 0.12;

    // The ship: a long wedge, tilted, drifting very slowly to the right.
    float tilt = -0.12;
    vec2 s = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * (p - vec2(-0.1 + 0.004 * T, 0.14)) / hp;
    float cx = s.x;
    float halfH = 0.13 + 0.05 * smoothstep(0.9, -0.6, cx) + 0.04 * step(0.0, sin(cx * 3.0 + 1.0)) * smoothstep(0.8, -0.2, cx);
    // Superstructure blocks along the top edge.
    float blocks = 0.03 * step(0.55, hash21(vec2(floor(cx * 9.0), 3.0))) + 0.015 * step(0.5, hash21(vec2(floor(cx * 23.0), 5.0)));
    float top = halfH + blocks;
    float bot = -halfH * 0.8 - 0.02 * step(0.6, hash21(vec2(floor(cx * 7.0), 9.0)));
    // Bow taper at the right end, the ship runs out of frame on the left.
    float bow = smoothstep(1.35, 0.95, cx);
    top *= bow; bot *= bow;
    if (s.y < top && s.y > bot) {
        vec2 pl = plating(s * 1.3);
        float edgeTop = top - s.y, edgeBot = s.y - bot;
        vec3 hull = vec3(0.13, 0.14, 0.17) * (1.0 + pl.x) * (0.55 + 0.45 * pl.y);
        // Planet light from below-left catches the lower edge; a rim along the top.
        hull += glowC * exp(-edgeBot * 25.0) * 0.35 * (0.7 + 0.5 * swell);
        hull += vec3(0.6, 0.65, 0.75) * exp(-edgeTop * 60.0) * 0.25;
        // Breaches: torn holes where the plating is gone, ribs inside and
        // the orange glow of emergency lighting.
        float br = fbm(s * vec2(4.0, 7.0) + 11.0);
        float breach = smoothstep(0.66, 0.7, br) * smoothstep(0.02, 0.05, min(edgeTop, edgeBot));
        if (breach > 0.0) {
            float ribs = step(0.65, fract(s.x * 60.0)) + step(0.8, fract(s.y * 30.0)) * 0.6;
            float glowIn = smoothstep(0.66, 0.8, br);
            float flick = 0.7 + 0.3 * sin(T * 0.7 + br * 20.0);
            vec3 inside = vec3(0.02) + emberC * glowIn * 1.7 * flick * gp * (0.8 + 0.6 * kick);
            inside = mix(inside, vec3(0.08, 0.07, 0.07) * (0.6 + glowIn), clamp(ribs, 0.0, 1.0) * 0.8);
            hull = mix(hull, inside, breach);
            // Jagged, hot edge of the tear.
            hull += emberC * exp(-abs(br - 0.68) * 90.0) * 0.4 * gp;
        }
        // Running lights along the keel: round, slowly pulsing.
        float lx = fract(s.x * 7.0) - 0.5;
        float ly = s.y - bot - 0.018;
        float lamp = exp(-(lx * lx * 2500.0 + ly * ly * 25000.0)) * step(0.35, hash21(vec2(floor(s.x * 7.0), 1.0)));
        hull += vec3(1.0, 0.25, 0.2) * lamp * (0.4 + 0.6 * (0.5 + 0.5 * sin(T * 1.2 + floor(s.x * 7.0)))) * gp * (0.7 + 0.8 * kick);
        col = mix(col, hull, smoothstep(0.0, 0.003, min(edgeTop, edgeBot)));
    }

    // Debris tumbling slowly across the foreground: small dark shards.
    for (int k = 0; k < 10; ++k) {
        float fk = float(k);
        if (fk >= 10.0 * dbp * 0.66) break;
        float sp = 0.004 + 0.006 * hash11(fk * 3.1);
        vec2 dc = vec2(mod(hash11(fk) * 3.0 + T * sp, 3.0) - 1.5, hash11(fk * 7.3) - 0.5);
        dc.x *= aspect * 0.7;
        float size = 0.012 + 0.03 * hash11(fk * 5.7);
        float a = T * (0.05 + 0.1 * hash11(fk * 2.2)) + fk;
        vec2 dd = mat2(cos(a), -sin(a), sin(a), cos(a)) * (p - dc);
        float shard = max(abs(dd.x) - size, abs(dd.y) - size * 0.45) + 0.004 * noise2(dd * 200.0);
        float m = smoothstep(0.002, 0.0, shard);
        vec3 dcol = vec3(0.06, 0.06, 0.08) + glowC * 0.25 * smoothstep(-size * 0.45, size * 0.45, -dd.y);
        col = mix(col, dcol, m);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
